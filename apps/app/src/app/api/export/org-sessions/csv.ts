/** Wraps a CSV field in quotes only when it needs escaping. */
export function csvField(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  // Neutralize spreadsheet formula injection, including whitespace prefixes.
  const hasUnsafePrefix = /^[=+\-@\t\r\n]/.test(text);
  if (hasUnsafePrefix) text = `'${text}`;
  if (!hasUnsafePrefix && !/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsvRow(values: (string | number | null)[]): string {
  return `${values.map(csvField).join(",")}\r\n`;
}
