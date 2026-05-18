/** Keep LLM context under a character budget (UTF-16 safe enough for ASCII JSON). */
export function truncateForContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated for context limit]`;
}
