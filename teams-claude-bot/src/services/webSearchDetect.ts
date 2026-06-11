const WEB_TRIGGERS = [
  /\b(search the web|search online|look up online|on the internet|browse the web)\b/i,
  /\b(weather|forecast|temperature)\b/i,
  /\b(news|headlines|breaking)\b/i,
  /\b(stock price|share price|exchange rate)\b/i,
  /\bwhat(?:'s| is) the (?:date|time|day)\b/i,
  /\b(latest|current|right now|today)\b/i,
  /\bhttps?:\/\//i,
  /^\/web\b/i,
];

/** True when the user likely wants live public web data (not Everde internal JSON). */
export function shouldEnableWebSearch(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return WEB_TRIGGERS.some((re) => re.test(t));
}
