/** Container for sales plan artifacts (defaults to freight container). */
export function salesPlanBlobContainer(): string {
  return (
    process.env.AZURE_SALES_PLAN_BLOB_CONTAINER?.trim() ||
    process.env.AZURE_FREIGHT_BLOB_CONTAINER?.trim() ||
    "everde-freight"
  );
}

import type { SalesPlanRegion } from "@/lib/salesPlan/regionConfig";
import { SALES_PLAN_REGION_CONFIG } from "@/lib/salesPlan/regionConfig";

/** Blob path for live sales plan JSON (NOR CAL or Oregon). */
export function salesPlanDashboardJsonBlobPath(
  region: SalesPlanRegion = "nor-cal",
): string {
  const cfg = SALES_PLAN_REGION_CONFIG[region];
  const fromEnv = process.env[cfg.blobEnvKey as keyof NodeJS.ProcessEnv]?.trim();
  return fromEnv || cfg.defaultBlobPath;
}
