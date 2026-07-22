/** Static map of Everde AI Operations portal sections (no portal code dependency). */
export function buildPortalCatalogSummary(): string {
  return [
    "## Everde AI Operations Portal",
    "",
    "- **Freight / Load Board** — YTD freight KPIs, carriers, regions, lanes, build health",
    "- **Sales Plan Review** — NOR CAL plan vs actual; **HD Sales YTD w/ Following Week Sales**; **Lowe's Sales YTD w/ Following Week Sales** (store×SKU grids)",
    "- **Production & Demand Plan** — nursery inventory and demand (when published)",
    "- **West Coast Retail Opportunity** — HD / Lowe's retail performance and action buckets",
    "- **Weather** — regional weather dashboard snapshot (when published)",
    "",
    "Prefer Everde JSON tools and the snapshot below for internal metrics. Use web search only for live public/external facts.",
    "For HD/Lowe's Following Week store detail, use get_hd_ytd_following_week / get_lowes_ytd_following_week (summary, sample, or query with q=).",
  ].join("\n");
}
