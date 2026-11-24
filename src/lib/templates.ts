import "server-only";
import { api } from "./api";

import type { TemplateOption } from "@/components/template-picker";

export type TemplateSummary = TemplateOption & { style: string };

export async function getTemplates() {
  return (await api.get<{ templates: TemplateSummary[] }>("/templates")).templates;
}
