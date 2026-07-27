import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  hdYtdMetaJsonPath,
  lowesYtdMetaJsonPath,
  nurseryDemandJsonPath,
  nurserySupplyJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactNurserySupplyJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
  compactYtdFollowingWeekMeta,
} from "./compact.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";
import { buildGradeHierarchyBlock } from "./gradeHierarchy.js";

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

export async function buildEverdeSnapshot(options?: {
  allowLowes?: boolean;
}): Promise<EverdeSnapshot> {
  const allowLowes = options?.allowLowes !== false;
  const container = freightBlobContainer();
  const catalog = `${buildPortalCatalogSummary()}\n\n${buildGradeHierarchyBlock()}`;

  const loaders: Promise<EverdeDatasetSnapshot>[] = [
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
  ];

  if (allowLowes) {
    loaders.push(
      loadDataset(
        "lowes_ytd_following_week",
        () => downloadJsonFromBlob(container, lowesYtdMetaJsonPath()),
        compactYtdFollowingWeekMeta,
        "Lowe's Sales YTD Following Week meta not in Blob — run npm run sales-plan:lowes-ytd-extract-publish.",
      ),
    );
  }

  loaders.push(
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
      "nursery_supply",
      () => downloadJsonFromBlob(container, nurserySupplyJsonPath()),
      compactNurserySupplyJson,
      "Nursery supply not on Blob — run npm run nursery:publish-blob.",
    ),
    loadDataset(
      "nursery_demand",
      () => downloadJsonFromBlob(container, nurseryDemandJsonPath()),
      compactNurseryJson,
      "Nursery demand not on Blob — run npm run nursery:publish-blob.",
    ),
  );

  const datasets = await Promise.all(loaders);

  const lines = [
    catalog,
    "",
    "## Everde data snapshot (always available — prefer over web for internal metrics)",
    "If a dataset below is present, call tools for drill-down — do not tell users the data is missing.",
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
