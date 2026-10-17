import "server-only";
import { api } from "./api";

export type TemplateSummary = { id: string; slug: string; name: string; style: string };

export async function getTemplates() {
  return (await api.get<{ templates: TemplateSummary[] }>("/templates")).templates;
}
