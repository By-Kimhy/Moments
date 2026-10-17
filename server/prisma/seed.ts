// Three invitation templates, plus (outside production) one demo wedding with 50 guests.
// Safe to run again: templates are upserted and the demo wedding is rebuilt.
import { PrismaClient, type Currency, type GiftMethod, type RsvpStatus, type Side } from "@prisma/client";
import sharp from "sharp";
import { newInviteToken } from "../src/lib/codes.js";
import { storage } from "../src/providers/storage.js";

const prisma = new PrismaClient();

const templates = [
  {
    slug: "traditional",
    name: "Traditional / ប្រពៃណី",
    style: "TRADITIONAL" as const,
    config: { background: "#7a1f1f", accent: "#d4a73c", text: "#fff8e7", headingFont: "Moul", bodyFont: "Battambang" },
  },
  {
    slug: "modern",
    name: "Modern / ទំនើប",
    style: "MODERN" as const,
    config: { background: "#fdf6f0", accent: "#b5838d", text: "#3d2c2e", headingFont: "Kantumruy Pro", bodyFont: "Kantumruy Pro" },
  },
  {
    slug: "minimal",
    name: "Minimal / សាមញ្ញ",
    style: "MINIMAL" as const,
    config: { background: "#ffffff", accent: "#1f2937", text: "#111827", headingFont: "Kantumruy Pro", bodyFont: "Kantumruy Pro" },
  },
];

const DEMO_PHONE = "+85512345678";
const DEMO_COHOST_PHONE = "+85598765432";
const DEMO_HELPER_CODE = "123456";
const DEMO_DOOR_CODE = "654321";
const DEMO_SLUG = "khmer-music-night";

const families = [
  ["សុខ", "Sok"], ["ចាន់", "Chan"], ["លី", "Ly"], ["ហេង", "Heng"], ["គឹម", "Kim"],
  ["ស៊ុន", "Sun"], ["ម៉ៅ", "Mao"], ["ពៅ", "Pov"], ["ឈឹម", "Chhim"], ["ទេព", "Tep"],
];
const givens = [
  ["ដារ៉ា", "Dara"], ["សុភា", "Sophea"], ["វិចិត្រ", "Vichet"], ["ស្រីនាង", "Sreyneang"], ["បូរ៉ា", "Bora"],
];
const groups = ["គ្រួសារ", "មិត្តភក្តិ", "មិត្តរួមការងារ", "អ្នកជិតខាង"];

async function main() {
  for (const t of templates) {
    await prisma.template.upsert({ where: { slug: t.slug }, update: { name: t.name, style: t.style, config: t.config }, create: t });
  }
  console.log(`Templates: ${templates.length}`);

  if (process.env.NODE_ENV === "production") return;

  const host = await prisma.user.upsert({
    where: { phone: DEMO_PHONE },
    update: {},
    create: { phone: DEMO_PHONE, name: "សុខ ដារ៉ា" },
  });
  const cohost = await prisma.user.upsert({
    where: { phone: DEMO_COHOST_PHONE },
    update: {},
    create: { phone: DEMO_COHOST_PHONE, name: "ចាន់ សុភា" },
  });
  await prisma.event.deleteMany({ where: { ownerId: host.id } });
  await prisma.event.deleteMany({ where: { helperCode: { in: [DEMO_HELPER_CODE, DEMO_DOOR_CODE] } } });
  await prisma.event.deleteMany({ where: { slug: DEMO_SLUG } });

  const template = await prisma.template.findUniqueOrThrow({ where: { slug: "traditional" } });
  const event = await prisma.event.create({
    data: {
      ownerId: host.id,
      status: "PUBLISHED",
      titleKm: "ពិធីមង្គលការ ដារ៉ា និង សុភា",
      titleEn: "The wedding of Dara & Sophea",
      groomNameKm: "សុខ ដារ៉ា",
      groomNameEn: "Sok Dara",
      brideNameKm: "ចាន់ សុភា",
      brideNameEn: "Chan Sophea",
      startsAt: new Date("2026-12-20T00:00:00Z"), // 07:00 in Phnom Penh
      venueKm: "សណ្ឋាគារ សុខា ភ្នំពេញ",
      venueEn: "Sokha Phnom Penh Hotel",
      mapUrl: "https://maps.google.com/?q=Sokha+Phnom+Penh+Hotel",
      schedule: [
        { time: "07:00", titleKm: "ពិធីហែជំនូន", titleEn: "Procession of gifts" },
        { time: "09:00", titleKm: "ពិធីកាត់សក់", titleEn: "Hair-cutting ceremony" },
        { time: "11:00", titleKm: "ពិធីសំពះផ្ទឹម", titleEn: "Sompeah Ptem" },
        { time: "17:00", titleKm: "ពិធីជប់លៀង", titleEn: "Wedding reception" },
      ],
      khqrAccountName: "SOK DARA",
      templateId: template.id,
      helperCode: DEMO_HELPER_CODE,
      members: {
        create: [
          { userId: host.id, role: "OWNER", displayName: host.name },
          { userId: cohost.id, role: "OWNER", displayName: cohost.name },
          { role: "HELPER", displayName: "បងស្រី នារី" },
        ],
      },
    },
    include: { members: true },
  });
  const helper = event.members.find((m) => m.role === "HELPER")!;

  for (let i = 0; i < 50; i++) {
    const [familyKm, familyEn] = families[i % families.length];
    const [givenKm, givenEn] = givens[Math.floor(i / families.length) % givens.length];
    const side: Side = i % 2 === 0 ? "GROOM" : "BRIDE";
    const invitedCount = 1 + (i % 3);
    const rsvpStatus: RsvpStatus = i < 30 ? "ATTENDING" : i < 36 ? "DECLINED" : "PENDING";
    const guest = await prisma.guest.create({
      data: {
        eventId: event.id,
        name: `${familyKm} ${givenKm}`,
        nameAlt: `${familyEn} ${givenEn}`,
        phone: `+8551${String(2000000 + i * 137).padStart(7, "0")}`,
        side,
        group: groups[i % groups.length],
        invitedCount,
        inviteToken: newInviteToken(),
        rsvpStatus,
        rsvpCount: rsvpStatus === "ATTENDING" ? invitedCount : rsvpStatus === "DECLINED" ? 0 : null,
        rsvpAt: rsvpStatus === "PENDING" ? null : new Date(),
        openedAt: i < 42 ? new Date() : null,
      },
    });
    if (i < 20) {
      const currency: Currency = i % 4 === 0 ? "KHR" : "USD";
      const method: GiftMethod = i % 5 === 0 ? "KHQR" : "CASH";
      await prisma.gift.create({
        data: {
          eventId: event.id,
          guestId: guest.id,
          amount: currency === "USD" ? (30 + (i % 4) * 20) * 100 : 200_000,
          currency,
          method,
          source: "DESK",
          recordedById: helper.id,
        },
      });
      await prisma.checkin.create({
        data: { eventId: event.id, guestId: guest.id, peopleCount: invitedCount, checkedInById: helper.id },
      });
    }
  }
  // A ticketed concert, with a stand-in KHQR image (replace it with a real one to test payments).
  const khqr = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#111111" } }).png().toBuffer();
  const khqrKey = `demo-khqr-${Date.now()}.png`;
  await storage.put(khqrKey, khqr, "image/png");
  const concert = await prisma.event.create({
    data: {
      ownerId: host.id,
      type: "TICKETED",
      status: "PUBLISHED",
      slug: DEMO_SLUG,
      titleKm: "រាត្រីតន្ត្រីខ្មែរ",
      titleEn: "Khmer Music Night",
      descriptionKm: "តន្ត្រីបុរាណ និងសម័យថ្មី ពីតារាចម្រៀងល្បីៗ។",
      descriptionEn: "Classic and modern Khmer music from well-known singers.",
      startsAt: new Date("2026-12-31T12:00:00Z"), // 19:00 in Phnom Penh
      venueKm: "មជ្ឈមណ្ឌលកោះពេជ្រ",
      venueEn: "Koh Pich Center",
      khqrImageKey: khqrKey,
      khqrAccountName: "SOK DARA",
      helperCode: DEMO_DOOR_CODE,
      members: { create: { userId: host.id, role: "OWNER", displayName: host.name } },
      ticketTypes: {
        create: [
          { name: "VIP", description: "កៅអីជួរមុខ · Front rows", price: 2500, currency: "USD", quantity: 50, maxPerOrder: 4, sortOrder: 1 },
          { name: "ធម្មតា · Standard", price: 1000, currency: "USD", quantity: 300, sortOrder: 2 },
          { name: "សិស្ស · Student", price: 20000, currency: "KHR", quantity: 100, sortOrder: 3 },
        ],
      },
    },
  });
  console.log(`Demo concert: /e/${concert.slug} (door helper code ${DEMO_DOOR_CODE})`);

  console.log(`Demo wedding: ${event.titleEn} (host ${DEMO_PHONE}, co-host ${DEMO_COHOST_PHONE}, helper code ${DEMO_HELPER_CODE})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
