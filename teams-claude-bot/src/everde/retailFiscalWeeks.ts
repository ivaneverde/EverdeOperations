/**
 * Everde accounting calendar + retailer (HD/LOW) fiscal week guidance.
 *
 * Source of truth for Everde weeks: Marco’s “2026 Accounting Calendar - 10.14.2025.xlsx”
 * (Sunday–Saturday) → everdeAccountingCalendar2026.json.
 *
 * HD/Lowe’s YTD “WK25” / “Week 25 On Hands” use **retailer** week numbers — not the same
 * as Everde accounting week. Jonathan (2026-07-24): report run Monday 2026-07-20 → retailer
 * week 25. That same day is Everde accounting **week 30**.
 */

import {
  EVERDE_ACCOUNTING_CALENDAR_2026,
  type AccountingWeekRow,
} from "./everdeAccountingCalendar2026.js";

export type AccountingWeekInfo = {
  fiscalYearLabel: number;
  week: number;
  accountingMonth: string | null;
  weekStart: string;
  weekEnd: string;
  monday: string;
};

const WEEKS: readonly AccountingWeekRow[] =
  EVERDE_ACCOUNTING_CALENDAR_2026.weeks;

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

function rowToInfo(row: AccountingWeekRow): AccountingWeekInfo {
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

/** accounting 30 on 2026-07-20 → retailer 25 (Jonathan). */
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
          "- Latest HD/Lowe's YTD as-of not in this prompt — use meta.asOf from YTD tools.",
        ]
      : asOfs.map((asOf) => {
          const acct = accountingWeekForIsoDate(asOf);
          if (!acct) return `- Published YTD as-of **${asOf}**.`;
          const retailerWk = retailerWeekFromAccountingWeek(acct.week);
          return [
            `- Published YTD as-of **${asOf}**:`,
            `  - Everde **accounting week ${acct.week}** (${acct.weekStart} Sun → ${acct.weekEnd} Sat, ${acct.accountingMonth}).`,
            `  - HD/Lowe's **retailer week ~${retailerWk}** (YTD columns WK${retailerWk} / Week ${retailerWk}; Jonathan: 2026-07-20 report = retailer week 25).`,
            `  - For “latest report / this Monday’s file” without a week #: prefer **retailer week ${retailerWk}** for HD/LOW column picks; state both numbers if helpful.`,
          ].join("\n");
        });

  const todayLines = current
    ? [
        `- **Today (Pacific ${todayYmd}):** Everde accounting **week ${current.week}** (${current.weekStart} → ${current.weekEnd}, ${current.accountingMonth}); retailer week ~${retailerWeekFromAccountingWeek(current.week)}.`,
      ]
    : [
        `- **Today (Pacific ${todayYmd}):** outside loaded 2026 accounting calendar range.`,
      ];

  return [
    "## Everde accounting calendar + retailer weeks",
    "- **Everde accounting weeks** (Marco / Finance): **Sunday–Saturday**, FY2026 week 1 = Sun 2025-12-28 → Sat 2026-01-03. Source: 2026 Accounting Calendar workbook.",
    "- **HD/Lowe's retailer weeks** (YTD Following Week uploads): column labels like WK25 / Week 25 On Hands. **Not the same number** as Everde accounting week.",
    "- Example: Mon 2026-07-20 = Everde accounting **week 30**, retailer **week 25** (Jonathan + YTD as-of).",
    ...todayLines,
    ...reportLines,
    "- When the user says “fiscal week” without context: prefer **Everde accounting week**. When they mean HD/LOW report columns or “week 25 on the YTD file”: use **retailer week**.",
    "- If a retailer week’s LY OH column is missing, say so briefly and use LY On Hand Units / nearest week — still answer.",
  ].join("\n");
}

/** @deprecated prefer accountingWeekForDate */
export function retailWeekForDate(date?: Date) {
  return accountingWeekForDate(date);
}
