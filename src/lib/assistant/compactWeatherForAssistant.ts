import { truncateForContext } from "@/lib/assistant/truncateForContext";

export function compactWeatherForAssistant(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      meta: parsed.meta ?? null,
      regions: parsed.regions ?? parsed.markets ?? null,
      forecast_summary: parsed.forecast_summary ?? parsed.summary ?? null,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 8) : null,
      by_region: parsed.by_region ?? parsed.regional ?? null,
    };

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    delete payload.by_region;
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      meta: payload.meta,
      forecast_summary: payload.forecast_summary,
      alerts: payload.alerts,
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
