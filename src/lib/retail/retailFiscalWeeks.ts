/**
 * Everde / HD-LOW retail fiscal weeks — mirrored from teams-claude-bot.
 * Keep WEEK1_MONDAY_BY_FY and Monday–Sunday rule in sync.
 */

export type RetailWeekInfo = {
  fiscalYear: number;
  week: number;
  weekStart: string;
  weekEnd: string;
};

const WEEK1_MONDAY_BY_FY: Record<number, string> = {
  2026: "2026-02-02",
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

export function mondayOnOrBefore(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
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
  const feb1 = new Date(Date.UTC(y, 1, 1));
  const week1 = mondayOnOrBefore(addDaysUtc(feb1, 6));
  return { fy: y, week1 };
}

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

export function buildRetailFiscalWeekPromptBlock(options?: {
  now?: Date;
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
          "- Latest HD/Lowe's YTD as-of not in this prompt — use meta when available.",
        ]
      : uniqueAsOf.map((asOf) => {
          const w = retailWeekForIsoDate(asOf);
          return w
            ? `- Published YTD as-of **${asOf}** = fiscal **week ${w.week}** (${w.weekStart} → ${w.weekEnd}). Prefer this for “the report / this Monday’s file” unless another week is named.`
            : `- Published YTD as-of **${asOf}**.`;
        });

  return [
    "## Retail fiscal weeks (Everde HD / Lowe's)",
    "- Weeks are **Monday–Sunday** (Pacific).",
    "- FY2026 week 1 starts **Monday 2026-02-02**. Anchor: week 25 = Monday 2026-07-20 (Jonathan).",
    `- **Today (Pacific ${formatYmd(pacificDay)}):** fiscal **week ${current.week}** (${current.weekStart} → ${current.weekEnd}), FY${current.fiscalYear}.`,
    ...reportLines,
    "- When the user says “this week” / “latest report” without a week number: use the published YTD as-of week and state the week number.",
  ].join("\n");
}
