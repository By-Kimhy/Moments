import ExcelJS from "exceljs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { parseCsv } from "../src/lib/csv.js";
import { rowsToGuests } from "../src/lib/guests.js";
import { app, hostWithEvent, joinDesk } from "./helpers.js";

type GuestBody = { id: string; name: string; phone: string | null; side: string; inviteUrl: string; inviteToken: string };

describe("parseCsv", () => {
  it("handles quotes, commas, new lines inside quotes, CRLF and the Excel BOM", () => {
    const text = '﻿Name,Note\r\n"Sok, Dara","He said ""hi""\nthen left"\r\nChan,\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Note"],
      ["Sok, Dara", 'He said "hi"\nthen left'],
      ["Chan", ""],
    ]);
  });
});

describe("rowsToGuests", () => {
  it("reads Khmer and English headings, Khmer digits and side names", () => {
    const result = rowsToGuests([
      ["ឈ្មោះ", "លេខទូរស័ព្ទ", "ខាង", "ក្រុម", "ចំនួន"],
      ["សុខ ដារ៉ា", "០១២ ៣៤៥ ៦៧៨", "កូនកំលោះ", "គ្រួសារ", "៣"],
      ["Chan Sophea", "", "bride", "", ""],
      ["", "012", "nowhere", "", "x"],
    ]);
    if ("headingError" in result) throw new Error("heading");
    expect(result.rows.map((r) => r.guest)).toEqual([
      { name: "សុខ ដារ៉ា", nameAlt: null, phone: "+85512345678", side: "GROOM", group: "គ្រួសារ", invitedCount: 3, tableNo: null },
      { name: "Chan Sophea", nameAlt: null, phone: null, side: "BRIDE", group: null, invitedCount: 1, tableNo: null },
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4);
    expect(result.errors[0].messages).toEqual(
      expect.arrayContaining(["Enter the guest's name.", "Enter a valid phone number.", "Choose the bride's or groom's side."]),
    );
  });

  it("needs a name column", () => {
    expect(rowsToGuests([["Phone"], ["012345678"]])).toEqual({ headingError: true });
  });
});

describe("guest list", () => {
  it("adds, lists, filters, edits and deletes guests, with audit entries", async () => {
    const { agent, event } = await hostWithEvent();
    const base = `/api/events/${event.id}/guests`;
    const a = await agent.post(base).send({ name: "សុខ ដារ៉ា", nameAlt: "Sok Dara", phone: "012 345 678", side: "GROOM", group: "គ្រួសារ", invitedCount: 2 }).expect(201);
    await agent.post(base).send({ name: "ចាន់ សុភា", side: "BRIDE" }).expect(201);
    const guest = a.body.guest as GuestBody;
    expect(guest).toMatchObject({ phone: "+85512345678", side: "GROOM" });
    expect(guest.inviteUrl).toBe(`http://localhost:3000/i/${guest.inviteToken}`);

    const list = await agent.get(base).expect(200);
    expect(list.body.summary).toMatchObject({ guests: 2, invitedPeople: 3, pending: 2 });
    expect(list.body.groups).toEqual(["គ្រួសារ"]);
    expect((await agent.get(`${base}/groups`)).body.groups).toEqual(["គ្រួសារ"]);
    expect((await agent.get(`${base}?side=BRIDE`)).body.guests).toHaveLength(1);
    expect((await agent.get(`${base}?q=sok`)).body.guests[0].id).toBe(guest.id);
    expect((await agent.get(`${base}?q=${encodeURIComponent("012 345")}`)).body.guests[0].id).toBe(guest.id);
    expect((await agent.get(`${base}?q=${encodeURIComponent("សុភា")}`)).body.guests).toHaveLength(1);

    const edited = await agent.patch(`${base}/${guest.id}`).send({ invitedCount: 4, tableNo: "12" }).expect(200);
    expect(edited.body.guest).toMatchObject({ invitedCount: 4, tableNo: "12", name: "សុខ ដារ៉ា" });

    const relinked = await agent.post(`${base}/${guest.id}/new-link`).expect(200);
    expect(relinked.body.guest.inviteToken).not.toBe(guest.inviteToken);

    await agent.delete(`${base}/${guest.id}`).expect(204);
    await agent.get(`${base}/${guest.id}`).expect(404);
    const actions = (await prisma.auditLog.findMany({ where: { entityId: guest.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["create", "update", "new_link", "delete"]);
  });

  it("validates guests", async () => {
    const { agent, event } = await hostWithEvent();
    const res = await agent.post(`/api/events/${event.id}/guests`).send({ name: " ", phone: "12", side: "LEFT", invitedCount: 0 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fieldErrors)).toEqual(expect.arrayContaining(["name", "phone", "side", "invitedCount"]));
  });

  it("won't delete a guest who has a gift recorded", async () => {
    const { agent, event } = await hostWithEvent();
    const { body } = await agent.post(`/api/events/${event.id}/guests`).send({ name: "Giver" }).expect(201);
    await prisma.gift.create({ data: { eventId: event.id, guestId: body.guest.id, amount: 5000, currency: "USD", method: "CASH", source: "HOST" } });
    await agent.delete(`/api/events/${event.id}/guests/${body.guest.id}`).expect(409);
  });

  it("is for owners only, and only for their own event", async () => {
    const { agent, event } = await hostWithEvent();
    const { body } = await agent.post(`/api/events/${event.id}/guests`).send({ name: "Guest" }).expect(201);
    const helper = await joinDesk(event.helperCode);
    await helper.agent.get(`/api/events/${event.id}/guests`).expect(403);
    await helper.agent.post(`/api/events/${event.id}/guests`).send({ name: "x" }).expect(403);

    const other = await hostWithEvent();
    await other.agent.get(`/api/events/${event.id}/guests`).expect(404);
    // Their own event can't reach this guest either.
    await other.agent.get(`/api/events/${other.event.id}/guests/${body.guest.id}`).expect(404);
    await other.agent.patch(`/api/events/${other.event.id}/guests/${body.guest.id}`).send({ name: "x" }).expect(404);
    await other.agent.delete(`/api/events/${other.event.id}/guests/${body.guest.id}`).expect(404);
  });

  it("exports a CSV with invitation links that Excel opens as UTF-8", async () => {
    const { agent, event } = await hostWithEvent();
    await agent.post(`/api/events/${event.id}/guests`).send({ name: "សុខ, ដារ៉ា", side: "GROOM" }).expect(201);
    const res = await agent.get(`/api/events/${event.id}/guests/export.csv`).buffer(true).expect(200);
    const text = res.text;
    expect(text.startsWith("﻿")).toBe(true);
    const rows = parseCsv(text);
    expect(rows[0][0]).toBe("Name");
    expect(rows[1][0]).toBe("សុខ, ដារ៉ា");
    expect(rows[1][9]).toMatch(/^http:\/\/localhost:3000\/i\/.+/);
  });
});

describe("guest import", () => {
  it("previews a CSV, flags duplicates and bad rows, then adds the guests", async () => {
    const { agent, event } = await hostWithEvent();
    const base = `/api/events/${event.id}/guests`;
    await agent.post(base).send({ name: "Already here", phone: "012 111 222" }).expect(201);

    const csv = "Name,Phone,Side,Group,People\nSok Dara,012 111 222,groom,Family,2\nChan Sophea,097 777 7777,bride,Friends,1\n,abc,,,\nLy Bora,097 777 7777,,,1\n";
    const preview = await agent.post(`${base}/import/parse`).set("Accept-Language", "km").attach("file", Buffer.from(csv), "guests.csv").expect(200);
    expect(preview.body.rows).toHaveLength(3);
    expect(preview.body.errors).toEqual([{ line: 4, messages: expect.arrayContaining(["សូមបញ្ចូលឈ្មោះភ្ញៀវ។"]) }]);
    // Line 2 is already on the list; line 5 repeats line 3's number.
    expect(preview.body.duplicates).toEqual([2, 5]);
    expect((await agent.get(base)).body.guests).toHaveLength(1); // nothing saved yet

    const added = await agent.post(`${base}/bulk`).send({ guests: preview.body.rows.map((r: { guest: unknown }) => r.guest) }).expect(201);
    expect(added.body).toEqual({ created: 1, skipped: 2 });
    const names = (await agent.get(base)).body.guests.map((g: GuestBody) => g.name).sort();
    expect(names).toEqual(["Already here", "Chan Sophea"]);
    const log = await prisma.auditLog.findFirst({ where: { eventId: event.id, action: "import_guests" } });
    expect(log?.after).toMatchObject({ created: 1, skipped: 2 });
  });

  it("reads Excel files, Khmer headings included", async () => {
    const { agent, event } = await hostWithEvent();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("ភ្ញៀវ");
    sheet.addRow(["ឈ្មោះ", "លេខទូរស័ព្ទ", "ខាង", "ចំនួន"]);
    sheet.addRow(["សុខ ដារ៉ា", 12345678, "ខាងប្រុស", 2]); // Excel drops the leading 0 of numbers
    sheet.addRow(["ចាន់ សុភា", "098 765 432", "ខាងស្រី", 1]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());
    const preview = await agent.post(`/api/events/${event.id}/guests/import/parse`).attach("file", file, "guests.xlsx").expect(200);
    expect(preview.body.errors).toEqual([]);
    expect(preview.body.rows.map((r: { guest: { phone: string; side: string; invitedCount: number } }) => r.guest)).toEqual([
      expect.objectContaining({ phone: "+85512345678", side: "GROOM", invitedCount: 2 }),
      expect.objectContaining({ phone: "+85598765432", side: "BRIDE", invitedCount: 1 }),
    ]);
  });

  it("rejects other files and bad bulk rows", async () => {
    const { agent, event } = await hostWithEvent();
    const base = `/api/events/${event.id}/guests`;
    await agent.post(`${base}/import/parse`).attach("file", Buffer.from("x"), "guests.pdf").expect(400);
    await agent.post(`${base}/import/parse`).attach("file", Buffer.from("not a zip"), "guests.xlsx").expect(400);
    const noName = await agent.post(`${base}/import/parse`).attach("file", Buffer.from("Phone\n012345678\n"), "g.csv").expect(400);
    expect(noName.body.fieldErrors.file).toBeDefined();

    const bad = await agent.post(`${base}/bulk`).send({ guests: [{ name: "ok" }, { name: "" }] }).expect(400);
    expect(bad.body.rows).toEqual([{ index: 1, messages: ["Enter the guest's name."] }]);
    expect((await agent.get(base)).body.guests).toHaveLength(0);
    await agent.post(`${base}/bulk`).send({ guests: [] }).expect(400);
  });
});

it("serves guests only through the event (no global guest routes)", async () => {
  await request(app).get("/api/guests").expect(404);
});
