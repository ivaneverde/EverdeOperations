/**
 * Everde accounting calendar + retailer (HD/LOW) week guidance.
 * Mirrored with teams-claude-bot/src/everde/retailFiscalWeeks.ts — keep in sync.
 */

import calendarJson from "./everdeAccountingCalendar2026.json";

export type AccountingWeekInfo = {
  fiscalYearLabel: number;
  week: number;
  accountingMonth: string | null;
  weekStart: string;
  weekEnd: string;
  monday: string;
};

type WeekRow = {
  week: number;
  accountingMonth: string;
  sunday: string;
  monday: string;
  saturday: string;
};

const WEEKS = (calendarJson as { weeks: WeekRow[] }).weeks;

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

function rowToInfo(row: WeekRow): AccountingWeekInfo {
  return {
    fiscalYearLabel: 2026,
    week: row.week,
    accountingMonth: row.accountingMonth ?? null,
    weekStart: row.sunday,
    weekEnd: row.saturday,
    monday: row.monday,
  };
}

export function accountingWeekForIsoDate(
  isoDate: string | null | undefined,
): AccountingWeekInfo | null {
  if (!isoDate) return null;
  const m = String(isoDate).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const ymd = `${m[1]}-${m[2]}-${m[3]}`;
  const t = parseYmd(ymd).getTime();
  for (const row of WEEKS) {
    const a = parseYmd(row.sunday).getTime();
    const b = parseYmd(row.saturday).getTime();
    if (t >= a && t <= b) return rowToInfo(row);
  }
  return null;
}

export function accountingWeekForDate(
  date: Date = new Date(),
): AccountingWeekInfo | null {
  return accountingWeekForIsoDate(formatYmd(pacificCalendarDate(date)));
}

/** accounting week 30 on 2026-07-20 → retailer week 25 (Jonathan). */
const RETAILER_WEEK_OFFSET_FROM_ACCOUNTING = 5;

export function retailerWeekFromAccountingWeek(accountingWeek: number): number {
  return accountingWeek - RETAILER_WEEK_OFFSET_FROM_ACCOUNTING;
}

export function buildRetailFiscalWeekPromptBlock(options?: {
  now?: Date;
  ytdAsOfDates?: (string | null | undefined)[];
}): string {
  const now = options?.now ?? new Date();
  const pacificDay = pacificCalendarDate(now);
  const todayYmd = formatYmd(pacificDay);
  const current = accountingWeekForIsoDate(todayYmd);

  const asOfs = [
    ...new Set(
      (options?.ytdAsOfDates ?? [])
        .map((s) => String(s ?? "").trim().slice(0, 10))
        .filter(Boolean),
    ),
  ];

  const reportLines =
    asOfs.length === 0
      ? [
          "- Latest HD/Lowe's YTD as-of not in this prompt — use meta when available.",
        ]
      : asOfs.map((asOf) => {
          const acct = accountingWeekForIsoDate(asOf);
          if (!acct) return `- Published YTD as-of **${asOf}**.`;
          const retailerWk = retailerWeekFromAccountingWeek(acct.week);
          return [
            `- Published YTD as-of **${asOf}**:`,
            `  - Everde **accounting week ${acct.week}** (${acct.weekStart} Sun → ${acct.weekEnd} Sat).`,
            `  - HD/Lowe's **retailer week ~${retailerWk}** (YTD WK${retailerWk} / Week ${retailerWk}).`,
          ].join("\n");
        });

  const todayLines = current
    ? [
        `- **Today (Pacific ${todayYmd}):** Everde accounting **week ${current.week}** (${current.weekStart} → ${current.weekEnd}); retailer week ~${retailerWeekFromAccountingWeek(current.week)}.`,
      ]
    : [`- **Today (Pacific ${todayYmd}):** outside loaded 2026 accounting calendar.`];

  return [
    "## Everde accounting calendar + retailer weeks",
    "- **Everde accounting weeks** (Marco): **Sunday–Saturday**, FY2026 week 1 = Sun 2025-12-28. Source: 2026 Accounting Calendar.",
    "- **HD/Lowe's retailer weeks** (YTD columns): different numbering. Mon 2026-07-20 = accounting **30** / retailer **25**.",
    ...todayLines,
    ...reportLines,
    "- “Fiscal week” alone → Everde accounting. HD/LOW YTD “week 25” → retailer week columns.",
  ].join("\n");
}

export function retailWeekForDate(date?: Date) {
  return accountingWeekForDate(date);
}
