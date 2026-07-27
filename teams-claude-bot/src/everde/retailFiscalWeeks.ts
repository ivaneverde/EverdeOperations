/**
 * Everde / HD-LOW retail fiscal weeks (field + YTD uploads).
 *
 * Anchor (Jonathan Saperstein, 2026-07-24): report week 25 = Monday 2026-07-20
 * (the Monday the YTD / Following Week files were run). Weeks are Monday–Sunday.
 *
 * Derived: FY2026 week 1 Monday = 2026-02-02.
 * Revisit if retailers publish an official week map that disagrees.
 */

export type RetailWeekInfo = {
  fiscalYear: number;
  week: number;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
};

/** Monday that starts retail fiscal week 1 for the given fiscal year. */
const WEEK1_MONDAY_BY_FY: Record<number, string> = {
  2026: "2026-02-02",
  // 2027: confirm with Jonathan / NRF when needed
  2027: "2027-02-01",
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Monday on or before the given UTC calendar date. */
export function mondayOnOrBefore(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay: 0=Sun … 1=Mon … 6=Sat
  const dow = d.getUTCDay();
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysUtc(d, -back);
}

function week1MondayForDate(date: Date): { fy: number; week1: Date } {
  const y = date.getUTCFullYear();
  const candidates = [y + 1, y, y - 1];
  let best: { fy: number; week1: Date } | null = null;
  for (const fy of candidates) {
    const ymd = WEEK1_MONDAY_BY_FY[fy];
    if (!ymd) continue;
    const week1 = parseYmd(ymd);
    if (date.getTime() >= week1.getTime()) {
      if (!best || week1.getTime() > best.week1.getTime()) {
        best = { fy, week1 };
      }
    }
  }
  if (best) return best;
  // Fallback: first Monday on/after Feb 1 of calendar year
  const feb1 = new Date(Date.UTC(y, 1, 1));
  const week1 = mondayOnOrBefore(addDaysUtc(feb1, 6));
  return { fy: y, week1 };
}

/** Calendar date in America/Los_Angeles as UTC midnight Date for week math. */
export function pacificCalendarDate(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Week for a known calendar day (already YYYY-MM-DD intent, UTC midnight). */
export function retailWeekForUtcDay(day: Date): RetailWeekInfo {
  const { fy, week1 } = week1MondayForDate(day);
  const weekStart = mondayOnOrBefore(day);
  const days = Math.floor(
    (weekStart.getTime() - week1.getTime()) / (24 * 60 * 60 * 1000),
  );
  const week = Math.floor(days / 7) + 1;
  const weekEnd = addDaysUtc(weekStart, 6);
  return {
    fiscalYear: fy,
    week,
    weekStart: formatYmd(weekStart),
    weekEnd: formatYmd(weekEnd),
  };
}

/** Current retail week using Pacific calendar date. */
export function retailWeekForDate(date: Date = new Date()): RetailWeekInfo {
  return retailWeekForUtcDay(pacificCalendarDate(date));
}

export function retailWeekForIsoDate(
  isoDate: string | null | undefined,
): RetailWeekInfo | null {
  if (!isoDate) return null;
  const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return retailWeekForUtcDay(d);
}

/**
 * Prompt block: live calendar week + how to use YTD week columns / report as-of.
 */
export function buildRetailFiscalWeekPromptBlock(options?: {
  now?: Date;
  /** ISO dates from HD / Lowe's YTD meta.asOf when known */
  ytdAsOfDates?: (string | null | undefined)[];
}): string {
  const now = options?.now ?? new Date();
  const pacificDay = pacificCalendarDate(now);
  const current = retailWeekForUtcDay(pacificDay);
  const asOfs = (options?.ytdAsOfDates ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  const uniqueAsOf = [...new Set(asOfs)];
  const reportLines =
    uniqueAsOf.length === 0
      ? [
          "- Latest HD/Lowe's YTD as-of not in this prompt — use meta.asOf from YTD tools when answering week questions.",
        ]
      : uniqueAsOf.map((asOf) => {
          const w = retailWeekForIsoDate(asOf);
          return w
            ? `- Published YTD as-of **${asOf}** = fiscal **week ${w.week}** (${w.weekStart} → ${w.weekEnd}). Prefer this week for “the report / this Monday’s file” unless the user names another week.`
            : `- Published YTD as-of **${asOf}**.`;
        });

  return [
    "## Retail fiscal weeks (Everde HD / Lowe's)",
    "- Weeks are **Monday–Sunday** (Pacific calendar; not Sunday-start NRF unless Jonathan updates this).",
    "- FY2026 week 1 starts **Monday 2026-02-02**. Anchor: week 25 = Monday 2026-07-20 (Jonathan).",
    `- **Today (Pacific ${formatYmd(pacificDay)}):** fiscal **week ${current.week}** (${current.weekStart} → ${current.weekEnd}), FY${current.fiscalYear}.`,
    ...reportLines,
    "- When the user says “this week,” “latest report,” or does not specify a week: use the **published YTD as-of week** for HD/Lowe's OH/sales week columns; mention the week number in the answer.",
    "- Week columns (WK25, Week 25 On Hands, etc.) map to these fiscal weeks. If a requested week’s LY OH column is missing, say so briefly and use LY On Hand Units / nearest week — still answer.",
    "- Do not make the user restate the week number when as-of already implies it.",
  ].join("\n");
}
