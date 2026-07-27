import json
from pathlib import Path

src = Path(r"C:\Users\isunderland\everde-ai-operations\src\lib\retail\everdeAccountingCalendar2026.json")
data = json.loads(src.read_text(encoding="utf-8"))
out = Path(
    r"C:\Users\isunderland\everde-ai-operations\teams-claude-bot\src\everde\everdeAccountingCalendar2026.ts"
)
weeks = data["weeks"]
lines = [
    "/** Auto-extracted from Marco 2026 Accounting Calendar workbook. Do not hand-edit. */",
    "export type AccountingWeekRow = {",
    "  week: number;",
    "  accountingMonth: string;",
    "  sunday: string;",
    "  monday: string;",
    "  saturday: string;",
    "};",
    "",
    "export const EVERDE_ACCOUNTING_CALENDAR_2026 = {",
    f"  source: {json.dumps(data['source'])} as const,",
    "  fiscalYearLabel: 2026 as const,",
    '  weekStartsOn: "Sunday" as const,',
    '  weekEndsOn: "Saturday" as const,',
    "  weeks: [",
]
for w in weeks:
    lines.append(
        "    { "
        f"week: {w['week']}, "
        f"accountingMonth: {json.dumps(w['accountingMonth'])}, "
        f"sunday: {json.dumps(w['sunday'])}, "
        f"monday: {json.dumps(w['monday'])}, "
        f"saturday: {json.dumps(w['saturday'])} "
        "},"
    )
lines += [
    "  ] as const satisfies readonly AccountingWeekRow[],",
    "} as const;",
    "",
]
out.write_text("\n".join(lines), encoding="utf-8")
print("wrote", out, "weeks", len(weeks))
