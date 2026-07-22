import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  hdYtdMetaJsonPath,
  lowesYtdMetaJsonPath,
  nurseryDemandJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
  compactYtdFollowingWeekMeta,
} from "./compact.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";

export type EverdeDatasetSnapshot = {
  name: string;
  available: boolean;
  excerpt: string;
  note?: string;
};

export type EverdeSnapshot = {
  catalog: string;
  datasets: EverdeDatasetSnapshot[];
  systemBlock: string;
};

const PER_DATASET_CHARS = 2800;

async function loadDataset(
  name: string,
  loader: () => Promise<string | null>,
  compact: (raw: string, max: number) => string,
  missingNote: string,
): Promise<EverdeDatasetSnapshot> {
  const raw = await loader();
  if (!raw) {
    return { name, available: false, excerpt: "", note: missingNote };
  }
  return {
    name,
    available: true,
    excerpt: compact(raw, PER_DATASET_CHARS),
  };
}

export async function buildEverdeSnapshot(): Promise<EverdeSnapshot> {
  const container = freightBlobContainer();
  const catalog = buildPortalCatalogSummary();

  const datasets = await Promise.all([
    loadDataset(
      "freight_dashboard",
      () => downloadJsonFromBlob(container, freightDashboardJsonPath()),
      compactFreightJson,
      "Freight JSON not in Blob — run freight extract/publish.",
    ),
    loadDataset(
      "sales_plan",
      () => downloadJsonFromBlob(container, salesPlanDashboardJsonPath()),
      compactSalesPlanJson,
      "Sales plan JSON not in Blob.",
    ),
    loadDataset(
      "hd_ytd_following_week",
      () => downloadJsonFromBlob(container, hdYtdMetaJsonPath()),
      compactYtdFollowingWeekMeta,
      "HD Sales YTD Following Week meta not in Blob — run npm run sales-plan:hd-ytd-extract-publish.",
    ),
    loadDataset(
      "lowes_ytd_following_week",
      () => downloadJsonFromBlob(container, lowesYtdMetaJsonPath()),
      compactYtdFollowingWeekMeta,
      "Lowe's Sales YTD Following Week meta not in Blob — run npm run sales-plan:lowes-ytd-extract-publish.",
    ),
    loadDataset(
      "retail_opportunity",
      () => downloadJsonFromBlob(container, retailDashboardJsonPath()),
      compactRetailJson,
      "Retail opportunity JSON not in Blob.",
    ),
    loadDataset(
      "weather",
      () => downloadJsonFromBlob(container, weatherDashboardJsonPath()),
      compactWeatherJson,
      "Weather JSON not in Blob.",
    ),
    loadDataset(
      "nursery_demand",
      async () => {
        const path = nurseryDemandJsonPath();
        if (!path) return null;
        return downloadJsonFromBlob(container, path);
      },
      compactNurseryJson,
      "Nursery demand not on Blob yet (optional AZURE_NURSERY_DEMAND_JSON_BLOB).",
    ),
  ]);

  const lines = [
    catalog,
    "",
    "## Everde data snapshot (always available — prefer over web for internal metrics)",
    "",
  ];

  for (const d of datasets) {
    lines.push(`### ${d.name}`);
    if (!d.available) {
      lines.push(`_Unavailable: ${d.note}_`);
    } else {
      lines.push(d.excerpt);
    }
    lines.push("");
  }

  return { catalog, datasets, systemBlock: lines.join("\n") };
}
