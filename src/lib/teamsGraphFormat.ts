/** Turn Graph chat message body (html or text) into plain text for display. */
export function chatMessageBodyToPlainText(
  body: { contentType?: string; content?: string } | undefined,
): string {
  if (!body?.content) return "";
  const raw = body.content;
  if (body.contentType === "text") return raw.trim();
  if (typeof document === "undefined") {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = raw;
  return (el.textContent ?? el.innerText ?? "").replace(/\s+/g, " ").trim();
}
