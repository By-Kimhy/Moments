// Fills {placeholders} in a message.
export function fill(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** "តុ {table}" filled with a table's name, unless the name already says "តុ…" / "Table…". */
export function tableLabel(template: string, name: string) {
  return /^(តុ|table)/i.test(name) ? name : fill(template, { table: name });
}
