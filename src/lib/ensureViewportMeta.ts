/** If the static HTML has no viewport meta, add one so iframe layouts respect device width. */
export function ensureViewportMeta(html: string): string {
  if (/name=["']viewport["']/i.test(html)) return html;
  const m = /<head[^>]*>/i.exec(html);
  if (m && m.index >= 0) {
    const insertAt = m.index + m[0].length;
    return (
      html.slice(0, insertAt) +
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
      html.slice(insertAt)
    );
  }
  return html;
}
