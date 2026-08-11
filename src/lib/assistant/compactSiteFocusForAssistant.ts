export function compactSiteFocusForAssistant(
  raw: string,
  maxChars: number,
): string {
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n…[truncated]`;
}
