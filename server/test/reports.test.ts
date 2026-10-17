import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { chromiumPath } from "../src/reports/pdf.js";
import { hostWithEvent, joinDesk } from "./helpers.js";

async function weddingWithGifts() {
  const host = await hostWithEvent();
  const base = `/api/events/${host.event.id}`;
  const add = async (name: string, side: string, group: string) =>
    (await host.agent.post(`${base}/guests`).send({ name, side, group, invitedCount: 2 }).expect(201)).body.guest.id as string;
  const dara = await add("សុខ ដារ៉ា", "GROOM", "គ្រួសារ");
  const sophea = await add("ចាន់ សុភា", "BRIDE", "មិត្តភក្តិ");
  const helper = await joinDesk(host.event.helperCode, "Helper");
  const gift = (body: object) => helper.agent.post(`${base}/gifts`).send({ method: "CASH", clientId: randomUUID(), ...body }).expect(201);
  await gift({ guestId: dara, amount: 5000, currency: "USD" });
  await gift({ guestId: dara, amount: 100000, currency: "KHR", method: "KHQR" });
  await gift({ guestId: sophea, amount: 3000, currency: "USD", note: "សូមជូនពរ" });
  await gift({ giverName: "ភ្ញៀវខាងក្រៅ", amount: 2000, currency: "USD" });
  const voided = (await gift({ guestId: sophea, amount: 99900, currency: "USD" })).body.gift.id;
  await helper.agent.post(`${base}/gifts/${voided}/void`).send({ reason: "typo" }).expect(200);
  await helper.agent.post(`${base}/checkins`).send({ guestId: dara, peopleCount: 2 }).expect(201);
  return { ...host, base, helper };
}

describe("reports", () => {
  it("summarises gifts per giver and attendance, for both sides or one", async () => {
    const { agent, base } = await weddingWithGifts();
    const all = (await agent.get(`${base}/reports/summary`).expect(200)).body.report;
    expect(all.totals.total).toEqual({ USD: 10000, KHR: 100000 });
    expect(all.byGiver.map((r: { name: string; usd: number; khr: number }) => [r.name, r.usd, r.khr])).toEqual([
      ["សុខ ដារ៉ា", 5000, 100000], // groom's side first
      ["ចាន់ សុភា", 3000, 0], // the cancelled $999 is not counted
      ["ភ្ញៀវខាងក្រៅ", 2000, 0], // not on the list: last
    ]);
    expect(all.byGiver[0]).toMatchObject({ count: 2, methods: ["CASH", "KHQR"], checkedInPeople: 2 });
    expect(all.attendance).toMatchObject({ invitedGuests: 2, invitedPeople: 4, checkedInPeople: 2 });

    const bride = (await agent.get(`${base}/reports/summary?side=BRIDE`).expect(200)).body.report;
    expect(bride.totals.total).toEqual({ USD: 3000, KHR: 0 });
    expect(bride.byGiver.map((r: { name: string }) => r.name)).toEqual(["ចាន់ សុភា"]);
    expect(bride.attendance.invitedGuests).toBe(1);
  });

  it("exports an Excel workbook with a summary, givers, every gift and the guest list", async () => {
    const { agent, base } = await weddingWithGifts();
    const res = await agent.get(`${base}/reports/gift-book.xlsx`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/gift-book-\d{4}-\d{2}-\d{2}\.xlsx/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    expect(book.worksheets.map((w) => w.name)).toEqual(["សេចក្តីសង្ខេប", "ចំណងដៃតាមភ្ញៀវ", "ចំណងដៃទាំងអស់", "ភ្ញៀវ"]);
    const givers = book.getWorksheet("ចំណងដៃតាមភ្ញៀវ")!;
    expect(givers.getRow(2).getCell(2).value).toBe("សុខ ដារ៉ា");
    expect(givers.getRow(2).getCell(7).value).toBe(50); // dollars, as a number
    expect(givers.getRow(2).getCell(8).value).toBe(100000);
    const all = book.getWorksheet("ចំណងដៃទាំងអស់")!;
    expect(all.rowCount).toBe(6); // header + 5 gifts, the cancelled one included
  });

  it("exports in English and for one side", async () => {
    const { agent, base } = await weddingWithGifts();
    const res = await agent.get(`${base}/reports/gift-book.xlsx?side=GROOM&lang=en`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers["content-disposition"]).toContain("gift-book-groom-");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    expect(book.worksheets[1].name).toBe("Gifts by guest");
    expect(book.worksheets[1].rowCount).toBe(3); // header, one giver, total
  });

  it.skipIf(!chromiumPath())("prints a PDF", async () => {
    const { agent, base } = await weddingWithGifts();
    const res = await agent.get(`${base}/reports/gift-book.pdf`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on("data", (c: Buffer) => chunks.push(c));
      r.on("end", () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("is for owners only", async () => {
    const { helper, base } = await weddingWithGifts();
    await helper.agent.get(`${base}/reports/summary`).expect(403);
    await helper.agent.get(`${base}/reports/gift-book.xlsx`).expect(403);
  });
});
