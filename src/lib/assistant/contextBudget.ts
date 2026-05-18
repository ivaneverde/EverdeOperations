export type AssistantDatasetId =
  | "freight"
  | "sales_plan"
  | "nursery_demand";

export type AssistantContextFocus = AssistantDatasetId | "retail" | "portal";

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
  return "portal";
}

/** Per-dataset character budget — always load all published datasets (portal compendium). */
export function maxCharsForDataset(
  focus: AssistantContextFocus,
  dataset: AssistantDatasetId,
): number {
  const isPrimary =
    focus === dataset ||
    (focus === "portal" && dataset === "freight") ||
    (focus === "retail" && dataset === "freight");

  if (dataset === "freight") {
    return isPrimary ? 26_000 : 14_000;
  }
  if (dataset === "sales_plan") {
    return isPrimary ? 20_000 : 12_000;
  }
  return isPrimary ? 16_000 : 10_000;
}

export const PORTAL_CATALOG_MAX_CHARS = 6_000;
