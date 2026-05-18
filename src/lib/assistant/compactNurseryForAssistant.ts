import { buildNurseryAssistantFacts } from "@/lib/assistant/nurseryAssistantFacts";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

const NURSERY_INCLUDE_KEYS = [
  "meta",
  "farmYTD",
  "boReasons",
  "crReasons",
  "variance",
  "readiness",
] as const;

function slimFarmYtd(farmYTD: unknown, maxFarms: number): unknown {
  if (!farmYTD || typeof farmYTD !== "object") return farmYTD;
  const entries = Object.entries(farmYTD as Record<string, unknown>).filter(
    ([, v]) =>
      v &&
      typeof v === "object" &&
      ((v as { ytdRevenue?: number }).ytdRevenue ?? 0) > 0,
  );
  entries.sort(
    (a, b) =>
      ((b[1] as { ytdRevenue?: number }).ytdRevenue ?? 0) -
      ((a[1] as { ytdRevenue?: number }).ytdRevenue ?? 0),
  );
  return Object.fromEntries(entries.slice(0, maxFarms));
}

export function compactNurseryForAssistant(
  raw: string,
  maxChars: number,
): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      assistant_facts: buildNurseryAssistantFacts(parsed),
    };

    for (const key of NURSERY_INCLUDE_KEYS) {
      if (!(key in parsed)) continue;
      payload[key] =
        key === "farmYTD" ? slimFarmYtd(parsed[key], 16) : parsed[key];
    }

    let json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    delete payload.variance;
    payload.farmYTD = slimFarmYtd(parsed.farmYTD, 10);
    json = JSON.stringify(payload);
    if (json.length <= maxChars) return json;

    return JSON.stringify({
      assistant_facts: payload.assistant_facts,
      meta: parsed.meta ?? null,
      farmYTD: slimFarmYtd(parsed.farmYTD, 8),
    });
  } catch {
    return truncateForContext(raw, maxChars);
  }
}
