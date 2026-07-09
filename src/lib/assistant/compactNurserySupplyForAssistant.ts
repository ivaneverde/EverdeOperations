import { truncateForContext } from "@/lib/assistant/truncateForContext";

export function compactNurserySupplyForAssistant(
  raw: string,
  maxChars: number,
): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const meta = (parsed.meta ?? {}) as Record<string, unknown>;

    const payload: Record<string, unknown> = {
      assistant_facts: {
        data_note:
          "Supply Inventory (price-list / landscape xls — saleable units, oversold, aging).",
        source: meta.sourceName ?? null,
        report_date: meta.reportDate ?? null,
        row_count: meta.rowCount ?? null,
        total_saleable: meta.totalSaleable ?? null,
        revenue_potential: meta.totalRevenuePot ?? null,
        aging_value: meta.agingValue ?? null,
        oversold_row_count: meta.oversoldRowCount ?? null,
        oversold_units: meta.oversoldUnits ?? null,
        reconcile_note:
          typeof meta.oversoldRowCount === "number" && meta.oversoldRowCount > 0
            ? `Reconcile ${meta.oversoldRowCount} oversold rows (${meta.oversoldUnits ?? "?"} units over-committed as of ${meta.reportDate ?? "unknown date"}). See Over-committed tab.`
            : null,
      },
      meta,
      oversold: Array.isArray(parsed.oversold)
        ? (parsed.oversold as unknown[]).slice(0, 30)
        : null,
      agingStock: Array.isArray(parsed.agingStock)
        ? (parsed.agingStock as unknown[]).slice(0, 12)
        : null,
      lateReady: Array.isArray(parsed.lateReady)
        ? (parsed.lateReady as unknown[]).slice(0, 12)
        : null,
    };

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    delete payload.agingStock;
    delete payload.lateReady;
    payload.oversold = Array.isArray(parsed.oversold)
      ? (parsed.oversold as unknown[]).slice(0, 12)
      : null;
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      assistant_facts: payload.assistant_facts,
      meta,
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
