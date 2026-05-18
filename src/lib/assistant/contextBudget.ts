export type AssistantContextFocus = "freight" | "sales-plan" | "both";

export function contextFocusForPathname(pathname: string): AssistantContextFocus {
  const p = pathname.toLowerCase();
  if (
    p.includes("load-board") ||
    p.includes("/freight") ||
    p.includes("freight-")
  ) {
    return "freight";
  }
  if (p.includes("sales-plan")) {
    return "sales-plan";
  }
  return "both";
}

export function maxCharsForDataset(
  focus: AssistantContextFocus,
  dataset: "freight" | "sales-plan",
): number {
  if (focus === "freight") {
    return dataset === "freight" ? 18_000 : 0;
  }
  if (focus === "sales-plan") {
    return dataset === "sales-plan" ? 18_000 : 0;
  }
  return dataset === "freight" ? 10_000 : 8_000;
}
