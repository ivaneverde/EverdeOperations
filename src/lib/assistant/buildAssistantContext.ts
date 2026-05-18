import { getReport, getSection } from "@/config/portal";
import {
  downloadFreightDashboardJsonFromBlob,
  downloadFreightDashboardJsonFromLocal,
} from "@/lib/azure/freightDashboardBlob";
import {
  downloadSalesPlanDashboardJsonFromBlob,
  downloadSalesPlanDashboardJsonFromLocal,
} from "@/lib/azure/salesPlanDashboardBlob";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

export type AssistantRouteContext = {
  pathname: string;
  sectionId?: string;
  reportSlug?: string;
};

export type AssistantDataContext = {
  routeLabel: string;
  datasets: { name: string; bytes: number; excerpt: string }[];
  notes: string[];
};

function parseRoute(pathname: string): {
  sectionId?: string;
  reportSlug?: string;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return {};
  const sectionId = parts[0];
  const reportSlug = parts[1];
  return { sectionId, reportSlug };
}

async function loadFreightJson(): Promise<string | null> {
  return (
    (await downloadFreightDashboardJsonFromBlob()) ??
    (await downloadFreightDashboardJsonFromLocal())
  );
}

async function loadSalesPlanJson(): Promise<string | null> {
  return (
    (await downloadSalesPlanDashboardJsonFromBlob()) ??
    (await downloadSalesPlanDashboardJsonFromLocal())
  );
}

export async function buildAssistantContext(
  input: AssistantRouteContext,
): Promise<AssistantDataContext> {
  const parsed = parseRoute(input.pathname);
  const sectionId = input.sectionId ?? parsed.sectionId;
  const reportSlug = input.reportSlug ?? parsed.reportSlug;

  let routeLabel = input.pathname || "Portal home";
  if (sectionId) {
    const section = getSection(sectionId);
    if (section) {
      routeLabel = section.title;
      if (reportSlug) {
        const hit = getReport(sectionId, reportSlug);
        if (hit) routeLabel = `${section.title} → ${hit.report.title}`;
      }
    }
  }

  const datasets: AssistantDataContext["datasets"] = [];
  const notes = [
    "Answer only from the JSON datasets below. If data is missing, say so clearly.",
    "Do not invent UNC paths or numbers. Retail and Supply Inventory are not in Blob yet unless noted.",
  ];

  const freight = await loadFreightJson();
  if (freight) {
    datasets.push({
      name: "freight_dashboard_data",
      bytes: freight.length,
      excerpt: truncateForContext(freight, 90_000),
    });
  } else {
    notes.push("Freight dashboard_data.json was not available from Blob or local fallback.");
  }

  const salesPlan = await loadSalesPlanJson();
  if (salesPlan) {
    datasets.push({
      name: "sales_plan_data",
      bytes: salesPlan.length,
      excerpt: truncateForContext(salesPlan, 60_000),
    });
  } else {
    notes.push("Sales plan sales_plan_data.json was not available from Blob or local fallback.");
  }

  return { routeLabel, datasets, notes };
}
