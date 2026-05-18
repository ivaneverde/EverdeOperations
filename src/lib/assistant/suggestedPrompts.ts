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
  if (p.includes("production-demand") || p.includes("demand")) {
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
    "What stands out in freight spend this year?",
    "Which farm is having the most success on production metrics?",
    "What should we prioritize this week for profitability?",
  ];
}
