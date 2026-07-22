import { truncateForContext } from "@/lib/assistant/truncateForContext";

/** Compact HD / Lowe's Following Week YTD meta for portal assistant (no full grids). */
export function compactYtdFollowingWeekForAssistant(
  raw: string,
  maxChars: number,
): string {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    const columns = Array.isArray(p.columns) ? (p.columns as string[]) : [];
    const totals = Array.isArray(p.totals) ? (p.totals as unknown[]) : [];
    const totalsByCol: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      const t = totals[i];
      if (t != null && t !== "") totalsByCol[columns[i]] = t;
    }
    const payload = {
      assistant_facts: {
        sourceFile: p.sourceFile,
        asOf: p.asOf,
        retailer: p.retailer ?? null,
        rowCount: p.rowCount,
        columnCount: p.columnCount,
      },
      columns: columns.slice(0, 40),
      totals_by_column: totalsByCol,
      note: "Open HD/Lowe's Sales YTD Following Week grids in Sales Plan Review for full store×SKU detail; Teams bot can query filtered rows via tools.",
    };
    return truncateForContext(JSON.stringify(payload), maxChars);
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
