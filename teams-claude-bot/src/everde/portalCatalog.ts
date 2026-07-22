/** Static map of Everde AI Operations portal sections (no portal code dependency). */
export function buildPortalCatalogSummary(): string {
  return [
    "## Everde AI Operations Portal",
    "",
    "- **Freight / Load Board** — YTD freight KPIs, carriers, regions, lanes, build health",
    "- **Sales Plan Review** — NOR CAL plan vs actual; **HD Sales YTD w/ Following Week Sales**; **Lowe's Sales YTD w/ Following Week Sales** (store×SKU grids)",
    "- **Supply Inventory** — XXTT nursery saleable price list (Grade A/B by farm/region/size) via get_nursery_supply",
    "- **Production & Demand Plan** — Inventory Metrics BO/CR via get_nursery_demand",
    "- **West Coast Retail Opportunity** — HD / Lowe's retail performance and action buckets",
    "- **Weather** — regional weather dashboard snapshot (when published)",
    "",
    "Prefer Everde JSON tools and the snapshot below for internal metrics. Use web search only for live public/external facts.",
    "Farm Grade A/B inventory is **get_nursery_supply** (not HD YTD retail). Example q: japanese boxwood 1g",
    "For HD/Lowe's Following Week store detail, use get_hd_ytd_following_week / get_lowes_ytd_following_week (summary, sample, or query with q=).",
  ].join("\n");
}
