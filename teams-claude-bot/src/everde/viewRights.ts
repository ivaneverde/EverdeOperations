/**
 * View rights — mirrored from portal src/lib/auth/viewRights.ts
 * Keep email → role maps in sync when changing access.
 */
export type ViewRole = "full" | "hd_rep" | "lowes_rep" | "hd_lowes_rep";

export type BotProfileId = "full" | "hd" | "lowes";

export type ViewCapabilities = {
  role: ViewRole;
  hdYtd: boolean;
  lowesYtd: boolean;
  lowesRetail: boolean;
  farmInventory: boolean;
  freight: boolean;
  weather: boolean;
  salesPlanOps: boolean;
};

const ROLE_CAPS: Record<ViewRole, Omit<ViewCapabilities, "role">> = {
  full: {
    hdYtd: true,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: true,
    freight: true,
    weather: true,
    salesPlanOps: true,
  },
  hd_rep: {
    hdYtd: true,
    lowesYtd: false,
    lowesRetail: false,
    farmInventory: false,
    freight: false,
    weather: false,
    salesPlanOps: false,
  },
  lowes_rep: {
    hdYtd: false,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: false,
    freight: false,
    weather: false,
    salesPlanOps: false,
  },
  hd_lowes_rep: {
    hdYtd: true,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: false,
    freight: false,
    weather: false,
    salesPlanOps: false,
  },
};

const EMAIL_ROLES: Record<string, ViewRole> = {
  // Ops / admin — full portal + all three bots
  "isunderland@everde.com": "full",
  "jsaperstein@everde.com": "full",
  "jcowham@everde.com": "full",
  "mcarrizales@everde.com": "full",
  "acowan@everde.com": "full",
  // Jonathan tester list
  "mberchiolli@everde.com": "full",
  "jkeeler@everde.com": "full",
  "mmcleod@everde.com": "full",
  // IGC / Leadership (Meredith 2026-08-28) — portal + @Claude
  "smitchell@everde.com": "full",
  "hshomper@everde.com": "full",
  "mdornak@everde.com": "full",
  "rfranek@everde.com": "full",
  "dwright@everde.com": "full",
  "jmartin@everde.com": "hd_rep",
  "bwohlberg@everde.com": "hd_rep",
  "jgorosave@everde.com": "lowes_rep",
  "sbianucci@everde.com": "hd_lowes_rep",
  "cwible@everde.com": "hd_lowes_rep",
};

export function roleForEmail(email: string | null | undefined): ViewRole {
  const key = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!key) return "full";
  return EMAIL_ROLES[key] ?? "full";
}

export function capabilitiesForEmail(
  email: string | null | undefined,
): ViewCapabilities {
  const role = roleForEmail(email);
  return { role, ...ROLE_CAPS[role] };
}

export function canAccessLowesAnalytics(
  email: string | null | undefined,
): boolean {
  return capabilitiesForEmail(email).lowesYtd;
}

export function canAccessHdAnalytics(
  email: string | null | undefined,
): boolean {
  return capabilitiesForEmail(email).hdYtd;
}

export function allowedBotProfiles(
  email: string | null | undefined,
): BotProfileId[] {
  const role = roleForEmail(email);
  switch (role) {
    case "hd_rep":
      return ["hd"];
    case "lowes_rep":
      return ["lowes"];
    case "hd_lowes_rep":
      return ["hd", "lowes"];
    case "full":
    default:
      return ["full", "hd", "lowes"];
  }
}

export function canAccessBotProfile(
  email: string | null | undefined,
  profile: BotProfileId,
): boolean {
  return allowedBotProfiles(email).includes(profile);
}

export function lowesDeniedMessage(): string {
  return "Lowe's analytics are not included in your view. Contact Ivan or Jonathan if you need Lowe's access.";
}

export function hdDeniedMessage(): string {
  return "Home Depot analytics are not included in your view. Contact Ivan or Jonathan if you need HD access.";
}

export function botProfileDeniedMessage(profile: BotProfileId): string {
  const names: Record<BotProfileId, string> = {
    full: "Claude",
    hd: "Everde HD",
    lowes: "Everde Lowes",
  };
  return `This chat (${names[profile]}) is outside your assigned access. Contact Ivan or Jonathan if you need a different bot.`;
}

export function buildViewRightsPromptBlock(
  email: string | null | undefined,
): string {
  const caps = capabilitiesForEmail(email);
  const who = email || "unknown";

  if (caps.role === "full") {
    return [
      "## User view rights",
      `Signed-in view: **full** (${who}). Full retailer and ops access including HD, Lowe's, freight, weather, and farm inventory.`,
    ].join("\n");
  }

  if (caps.role === "hd_rep") {
    return [
      "## User view rights",
      `Signed-in view: **hd_rep** (${who}).`,
      "- ALLOWED: Home Depot YTD sales & on-hand, plus invoiced store sales from Sales by Item (Ship To / store #).",
      "- NOT ALLOWED: Lowe's, freight, weather, farm inventory ops, or other retailers.",
      "- If asked about out-of-scope topics: briefly say you only cover Home Depot here, then offer a useful HD follow-up. Do not suggest other bots.",
      "- Do not invent Lowe's numbers. Do not call get_lowes_ytd_following_week or freight/weather tools.",
    ].join("\n");
  }

  if (caps.role === "lowes_rep") {
    return [
      "## User view rights",
      `Signed-in view: **lowes_rep** (${who}).`,
      "- ALLOWED: Lowe's YTD sales & on-hand, plus invoiced store sales from Sales by Item (Ship To / store #).",
      "- NOT ALLOWED: Home Depot, freight, weather, farm inventory ops, or other retailers.",
      "- If asked about out-of-scope topics: briefly say you only cover Lowe's here, then offer a useful Lowe's follow-up. Do not suggest other bots.",
      "- Do not invent HD numbers. Do not call get_hd_ytd_following_week or freight/weather tools.",
    ].join("\n");
  }

  return [
    "## User view rights",
    `Signed-in view: **hd_lowes_rep** (${who}).`,
    "- ALLOWED: Home Depot and Lowe's YTD sales & on-hand, plus invoiced store sales from Sales by Item.",
    "- NOT ALLOWED: freight, weather, farm inventory ops dashboards.",
    "- Stay on retailer questions. Do not suggest other bots.",
    "- Do not call freight/weather/nursery tools.",
  ].join("\n");
}

/** Tools that must not be offered or executed for Lowe's-restricted users. */
export const LOWES_RESTRICTED_TOOLS = new Set([
  "get_lowes_ytd_following_week",
]);

export const HD_RESTRICTED_TOOLS = new Set(["get_hd_ytd_following_week"]);

export const FREIGHT_TOOLS = new Set(["get_freight_dashboard"]);
export const WEATHER_TOOLS = new Set(["get_weather_dashboard"]);
export const FARM_TOOLS = new Set([
  "get_nursery_supply",
  "get_nursery_demand",
  "get_site_focus_summary",
  "get_grade_definitions",
]);
export const SALES_PLAN_OPS_TOOLS = new Set([
  "get_sales_plan_dashboard",
]);
/** get_sales_by_item is separate: HD/Lowes field bots need Ship To store sales. */

export function isLowesRestrictedTool(name: string): boolean {
  return LOWES_RESTRICTED_TOOLS.has(name);
}

export function isHdRestrictedTool(name: string): boolean {
  return HD_RESTRICTED_TOOLS.has(name);
}

/** Whether a tool is allowed for this user's capabilities (and bot profile datasets). */
export function isToolAllowedForCapabilities(
  name: string,
  caps: ViewCapabilities,
): boolean {
  if (LOWES_RESTRICTED_TOOLS.has(name) && !caps.lowesYtd) return false;
  if (HD_RESTRICTED_TOOLS.has(name) && !caps.hdYtd) return false;
  if (FREIGHT_TOOLS.has(name) && !caps.freight) return false;
  if (WEATHER_TOOLS.has(name) && !caps.weather) return false;
  if (FARM_TOOLS.has(name) && !caps.farmInventory) return false;
  if (SALES_PLAN_OPS_TOOLS.has(name) && !caps.salesPlanOps) return false;
  if (
    name === "get_sales_by_item" &&
    !caps.salesPlanOps &&
    !caps.hdYtd &&
    !caps.lowesYtd
  ) {
    return false;
  }
  if (name === "get_retail_opportunity" && !caps.hdYtd && !caps.lowesYtd) {
    return false;
  }
  if (name === "get_wcro_dashboard" && !caps.hdYtd && !caps.lowesYtd) {
    return false;
  }
  return true;
}
