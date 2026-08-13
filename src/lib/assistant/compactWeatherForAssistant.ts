import { truncateForContext } from "@/lib/assistant/truncateForContext";

type CityForecast = {
  region?: string;
  forecast?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weathercode?: number[];
  };
};

/** Compact weather Blob/HTML JSON for the portal Analyst (matches published WX shape). */
export function compactWeatherForAssistant(raw: string, maxChars: number): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const weather = (parsed.weather ?? null) as {
      fetched_date?: string;
      today?: string;
      iso_week?: number;
      iso_year?: number;
      forecast?: Record<string, CityForecast>;
    } | null;

    if (weather?.forecast && typeof weather.forecast === "object") {
      const cities = Object.entries(weather.forecast).map(([name, city]) => {
        const f = city.forecast ?? {};
        const n = Math.min(5, (f.time ?? []).length);
        const days = [];
        for (let i = 0; i < n; i++) {
          days.push({
            date: f.time?.[i] ?? null,
            high_f: f.temperature_2m_max?.[i] ?? null,
            low_f: f.temperature_2m_min?.[i] ?? null,
            precip_in: f.precipitation_sum?.[i] ?? null,
            weathercode: f.weathercode?.[i] ?? null,
          });
        }
        return { city: name, region: city.region ?? null, days };
      });
      const payload = {
        as_of: weather.fetched_date ?? weather.today ?? null,
        iso_week: weather.iso_week ?? null,
        iso_year: weather.iso_year ?? null,
        cities,
        crosswalk_meta: parsed.crosswalk_meta ?? null,
        note: "Regional city forecast proxy. Store fulfillment weather is on Teams via get_store_fulfillment_weather (on demand).",
      };
      return truncateForContext(JSON.stringify(payload), maxChars);
    }

    const payload: Record<string, unknown> = {
      meta: parsed.meta ?? null,
      regions: parsed.regions ?? parsed.markets ?? null,
      forecast_summary: parsed.forecast_summary ?? parsed.summary ?? null,
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 8) : null,
    };
    return truncateForContext(JSON.stringify(payload), maxChars);
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
