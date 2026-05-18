export function suggestedPromptsForPath(pathname: string): string[] {
  const p = pathname.toLowerCase();
  if (p.includes("load-board") || p.includes("freight")) {
    return [
      "Which freight carrier is the most expensive?",
      "What is the best way we can save money on freight?",
      "Summarize YTD freight spend by region.",
    ];
  }
  if (p.includes("sales-plan")) {
    return [
      "Which key items are missing plan coverage?",
      "Where is the largest excess inventory at farm?",
      "Summarize channel performance vs plan.",
    ];
  }
  if (
    p.includes("production-demand") ||
    p.includes("supply-inventory") ||
    p.includes("demand")
  ) {
    return [
      "Which farm has the most backorders YTD?",
      "Which farms are beating their BO+CR goals?",
      "Summarize demand-window readiness issues.",
    ];
  }
  if (p.includes("retail")) {
    return [
      "What is the #1 Home Depot store we sell to?",
      "Where was the best sales opportunity recently?",
      "Which item looks most profitable in the data you have?",
    ];
  }
  return [
    "Across the portal, what are the top 3 issues we should act on this week?",
    "Which freight carrier is the most expensive, and which farm has the most backorders?",
    "Summarize sales plan misses and freight cost trends together.",
  ];
}
