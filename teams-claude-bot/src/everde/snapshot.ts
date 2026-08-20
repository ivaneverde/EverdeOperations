import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  hdYtdMetaJsonPath,
  lowesYtdMetaJsonPath,
  nurseryDemandJsonPath,
  nurserySupplyJsonPath,
  siteFocusJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  salesByItemMetaJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactNurserySupplyJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
  compactSiteFocusJson,
  compactWcroJson,
  compactYtdFollowingWeekMeta,
  compactSalesByItemMeta,
} from "./compact.js";
import { loadWcroJsonRaw } from "./loadWcroJson.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";
import { buildGradeHierarchyBlock } from "./gradeHierarchy.js";
import {
  BOT_PROFILES,
  type BotProfile,
} from "./botProfile.js";

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
  ytdAsOfDates: string[];
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
  allowHd?: boolean;
  allowFreight?: boolean;
  allowWeather?: boolean;
  allowFarm?: boolean;
  allowSalesPlan?: boolean;
  allowSalesByItem?: boolean;
  allowRetail?: boolean;
  allowWcro?: boolean;
  profile?: BotProfile;
}): Promise<EverdeSnapshot> {
  const profile = options?.profile ?? "full";
  const caps = BOT_PROFILES[profile].datasets;
  const allowLowes = caps.lowesYtd && options?.allowLowes !== false;
  const allowHd = caps.hdYtd && options?.allowHd !== false;
  const allowFreight = caps.freight && options?.allowFreight !== false;
  const allowWeather = caps.weather && options?.allowWeather !== false;
  const allowFarm =
    (caps.nurserySupply || caps.nurseryDemand) &&
    options?.allowFarm !== false;
  const allowSalesPlan = caps.salesPlan && options?.allowSalesPlan !== false;
  const allowSalesByItem =
    caps.salesByItem && options?.allowSalesByItem !== false;
  const allowRetail = caps.retail && options?.allowRetail !== false;
  const allowWcro = caps.wcro && options?.allowWcro !== false;
  const container = freightBlobContainer();
  const catalog = `${buildPortalCatalogSummary(profile)}\n\n${buildGradeHierarchyBlock()}`;

  const loaders: Promise<EverdeDatasetSnapshot>[] = [];

  if (allowFreight) {
    loaders.push(
      loadDataset(
        "freight_dashboard",
        () => downloadJsonFromBlob(container, freightDashboardJsonPath()),
        compactFreightJson,
        "Freight JSON not in Blob — run freight extract/publish.",
      ),
    );
  }
  if (allowSalesPlan) {
    loaders.push(
      loadDataset(
        "sales_plan",
        () => downloadJsonFromBlob(container, salesPlanDashboardJsonPath()),
        compactSalesPlanJson,
        "Sales plan JSON not in Blob.",
      ),
    );
  }
  if (allowSalesByItem) {
    loaders.push(
      loadDataset(
        "sales_by_item",
        () => downloadJsonFromBlob(container, salesByItemMetaJsonPath()),
        compactSalesByItemMeta,
        "Sales by Item meta not in Blob — run npm run sales-plan:sales-by-item-extract-publish.",
      ),
    );
  }
  if (allowHd) {
    loaders.push(
      loadDataset(
        "hd_ytd_following_week",
        () => downloadJsonFromBlob(container, hdYtdMetaJsonPath()),
        compactYtdFollowingWeekMeta,
        "HD Sales YTD Following Week meta not in Blob — run npm run sales-plan:hd-ytd-extract-publish.",
      ),
    );
  }
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
  if (allowRetail) {
    loaders.push(
      loadDataset(
        "retail_opportunity",
        () => downloadJsonFromBlob(container, retailDashboardJsonPath()),
        compactRetailJson,
        "Retail opportunity JSON not in Blob.",
      ),
    );
  }
  if (allowWcro) {
    const channel: "HD" | "LOW" | "ALL" =
      profile === "hd" ? "HD" : profile === "lowes" ? "LOW" : "ALL";
    loaders.push(
      loadDataset(
        "wcro",
        () => loadWcroJsonRaw(),
        (raw, max) => compactWcroJson(raw, max, channel),
        "WCRO JSON not available — run extract_wcro.py / publish wcro/latest/wcro_data.json.",
      ),
    );
  }
  if (allowWeather) {
    loaders.push(
      loadDataset(
        "weather",
        () => downloadJsonFromBlob(container, weatherDashboardJsonPath()),
        compactWeatherJson,
        "Weather JSON not in Blob.",
      ),
    );
  }
  if (allowFarm && caps.nurserySupply) {
    loaders.push(
      loadDataset(
        "nursery_supply",
        () => downloadJsonFromBlob(container, nurserySupplyJsonPath()),
        compactNurserySupplyJson,
        "Nursery supply not on Blob — run npm run nursery:publish-blob.",
      ),
    );
  }
  if (allowFarm && caps.nurseryDemand) {
    loaders.push(
      loadDataset(
        "nursery_demand",
        () => downloadJsonFromBlob(container, nurseryDemandJsonPath()),
        compactNurseryJson,
        "Nursery demand not on Blob — run npm run nursery:publish-blob.",
      ),
    );
    loaders.push(
      loadDataset(
        "site_focus",
        () => downloadJsonFromBlob(container, siteFocusJsonPath()),
        compactSiteFocusJson,
        "Site Focus Summary not on Blob — drop WkNN_Site_Focus*.docx in Inventory Metrics.",
      ),
    );
  }

  const datasets = await Promise.all(loaders);

  const ytdAsOfDates: string[] = [];
  for (const name of ["hd_ytd_following_week", "lowes_ytd_following_week"]) {
    const d = datasets.find((x) => x.name === name);
    if (!d?.available || !d.excerpt) continue;
    try {
      const parsed = JSON.parse(d.excerpt) as { asOf?: string };
      if (parsed.asOf) ytdAsOfDates.push(String(parsed.asOf).slice(0, 10));
    } catch {
      const m = d.excerpt.match(/"asOf"\s*:\s*"([^"]+)"/);
      if (m?.[1]) ytdAsOfDates.push(m[1].slice(0, 10));
    }
  }

  const lines = [
    catalog,
    "",
    `## Everde data snapshot (profile=${profile})`,
    "If a dataset below is present, call tools for drill-down — do not tell users the data is missing.",
    "Datasets not listed are out of scope for this bot — do not invent them.",
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

  return {
    catalog,
    datasets,
    systemBlock: lines.join("\n"),
    ytdAsOfDates: [...new Set(ytdAsOfDates)],
  };
}
