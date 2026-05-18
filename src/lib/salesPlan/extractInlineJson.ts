function findMatchingBrace(html: string, openBraceIndex: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = openBraceIndex; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Extract inline `const D = { ... };` JSON from NOR CAL sales plan HTML. */
export function extractSalesPlanInlineJson(html: string): string | null {
  const needle = "const D = ";
  const start = html.indexOf(needle);
  if (start < 0) return null;

  let i = start + needle.length;
  while (i < html.length && /[\s\r\n]/.test(html[i]!)) i++;
  if (i >= html.length || html[i] !== "{") return null;

  const closeBrace = findMatchingBrace(html, i);
  if (closeBrace < 0) return null;

  const json = html.slice(i, closeBrace + 1);
  try {
    JSON.parse(json);
    return json;
  } catch {
    return null;
  }
}
