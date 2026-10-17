import { Router } from "express";
import { prisma } from "../db.js";

export const templatesRouter = Router();

templatesRouter.get("/", async (_req, res) => {
  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true, style: true, previewUrl: true, config: true },
  });
  res.json({ templates });
});
