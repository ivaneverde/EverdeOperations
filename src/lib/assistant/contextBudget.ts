import type { AssistantProvider } from "@/lib/assistant/types";

export type AssistantDatasetId =
  | "freight"
  | "sales_plan"
  | "nursery_demand"
  | "retail"
  | "weather";

export type AssistantContextFocus = AssistantDatasetId | "retail" | "portal";

/** OpenAI org TPM limits are much tighter than Claude; keep system context small. */
export const OPENAI_CATALOG_MAX_CHARS = 3_500;
export const OPENAI_MAX_CHAT_TURNS = 6;
export const OPENAI_MAX_TURN_CHARS = 3_500;

export function contextFocusForPathname(pathname: string): AssistantContextFocus {
  const p = pathname.toLowerCase();
  if (
    p.includes("production-demand") ||
    p.includes("supply-inventory")
  ) {
    return "nursery_demand";
  }
  if (p.includes("sales-plan")) return "sales_plan";
  if (
    p.includes("load-board") ||
    p.includes("/freight") ||
    p.includes("freight-")
  ) {
    return "freight";
  }
  if (p.includes("retail")) return "retail";
  if (p.includes("weather")) return "weather";
  return "portal";
}

function anthropicBudget(
  focus: AssistantContextFocus,
  dataset: AssistantDatasetId,
  isPrimary: boolean,
): number {
  if (dataset === "freight") {
    return isPrimary ? 26_000 : 14_000;
  }
  if (dataset === "sales_plan") {
    return isPrimary ? 20_000 : 12_000;
  }
  if (dataset === "retail") {
    return isPrimary ? 18_000 : 10_000;
  }
  if (dataset === "weather") {
    return isPrimary ? 12_000 : 6_000;
  }
  return isPrimary ? 16_000 : 10_000;
}

/** OpenAI: page-focused context only (avoids TPM rate limits on gpt-4o). */
function openAiBudget(
  focus: AssistantContextFocus,
  dataset: AssistantDatasetId,
  isPrimary: boolean,
): number {
  if (!isPrimary) {
    if (focus === "portal") {
      if (dataset === "freight") return 8_000;
      if (dataset === "retail") return 5_000;
      if (dataset === "sales_plan") return 5_000;
      if (dataset === "nursery_demand") return 4_000;
      if (dataset === "weather") return 2_500;
    }
    return 0;
  }
  if (dataset === "freight") return 12_000;
  if (dataset === "sales_plan") return 10_000;
  if (dataset === "retail") return 14_000;
  if (dataset === "weather") return 8_000;
  return 10_000;
}

/** Per-dataset character budget (Claude: full compendium; OpenAI: focused to avoid rate limits). */
export function maxCharsForDataset(
  focus: AssistantContextFocus,
  dataset: AssistantDatasetId,
  provider: AssistantProvider = "anthropic",
): number {
  const isPrimary =
    focus === dataset ||
    (focus === "portal" && dataset === "freight") ||
    (focus === "retail" && dataset === "retail") ||
    (focus === "weather" && dataset === "weather");

  if (provider === "openai") {
    return openAiBudget(focus, dataset, isPrimary);
  }
  return anthropicBudget(focus, dataset, isPrimary);
}

export function catalogMaxChars(provider: AssistantProvider): number {
  return provider === "openai"
    ? OPENAI_CATALOG_MAX_CHARS
    : PORTAL_CATALOG_MAX_CHARS;
}

export const PORTAL_CATALOG_MAX_CHARS = 6_000;
