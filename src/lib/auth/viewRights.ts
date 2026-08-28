/**
 * Portal / Teams view rights — who can see which retailer analytics.
 * Unknown @everde.com users default to full (Ivan, Jonathan, etc.).
 */
export type ViewRole = "full" | "hd_rep" | "lowes_rep" | "hd_lowes_rep";

/** Teams bot profiles (Option A). */
export type BotProfileId = "full" | "hd" | "lowes";

export type ViewCapabilities = {
  role: ViewRole;
  hdYtd: boolean;
  lowesYtd: boolean;
  /** Retail opportunity "Lowes Detail" tab / report */
  lowesRetail: boolean;
  farmInventory: boolean;
  freight: boolean;
  weather: boolean;
  /** NOR CAL / OR sales-plan dashboards (non-retailer YTD grids) */
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
  /** HD key-account — retailer HD slice only */
  hd_rep: {
    hdYtd: true,
    lowesYtd: false,
    lowesRetail: false,
    farmInventory: false,
    freight: false,
    weather: false,
    salesPlanOps: false,
  },
  /** Lowe's key-account — retailer Lowes slice only */
  lowes_rep: {
    hdYtd: false,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: false,
    freight: false,
    weather: false,
    salesPlanOps: false,
  },
  /** HD + Lowe's key-account — both retailers; no ops dashboards */
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

/** Lowercase emails → role. Everyone else → full. */
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

export function capabilitiesForRole(role: ViewRole): ViewCapabilities {
  return { role, ...ROLE_CAPS[role] };
}

export function capabilitiesForEmail(
  email: string | null | undefined,
): ViewCapabilities {
  return capabilitiesForRole(roleForEmail(email));
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

/** Portal report slugs / paths that are Lowe's-only. */
export function isLowesRestrictedPath(
  sectionId: string,
  reportSlug: string,
): boolean {
  if (reportSlug === "lowes-sales-ytd-following-week") return true;
  if (reportSlug === "retail-lowes-detail") return true;
  if (sectionId === "sales-plan-review" && /lowes/i.test(reportSlug)) {
    return true;
  }
  if (sectionId === "west-coast-retail" && /lowes/i.test(reportSlug)) {
    return true;
  }
  return false;
}

/** Portal report slugs / paths that are HD-only. */
export function isHdRestrictedPath(
  sectionId: string,
  reportSlug: string,
): boolean {
  if (reportSlug === "hd-sales-ytd-following-week") return true;
  if (reportSlug === "retail-hd-detail") return true;
  if (sectionId === "sales-plan-review" && /^hd-/i.test(reportSlug)) {
    return true;
  }
  if (sectionId === "west-coast-retail" && /hd/i.test(reportSlug)) {
    return true;
  }
  return false;
}

/**
 * Whether a nav report is allowed for the signed-in capabilities.
 * Key-account roles only see retailer YTD + matching retail detail (and shared
 * retail dashboards that aren't freight/ops).
 */
export function isReportAllowedForCapabilities(
  sectionId: string,
  reportSlug: string,
  caps: ViewCapabilities,
): boolean {
  if (sectionId === "load-board-freight" || sectionId === "main") {
    return caps.freight;
  }
  if (sectionId === "weather") {
    return caps.weather;
  }
  if (
    sectionId === "supply-inventory" ||
    sectionId === "production-demand-plan"
  ) {
    return caps.farmInventory;
  }
  if (sectionId === "communication") {
    return caps.role === "full";
  }

  if (isLowesRestrictedPath(sectionId, reportSlug) || /lowes/i.test(reportSlug)) {
    if (!caps.lowesYtd && !caps.lowesRetail) return false;
  }
  if (isHdRestrictedPath(sectionId, reportSlug)) {
    if (!caps.hdYtd) return false;
  }

  if (sectionId === "sales-plan-review") {
    if (
      reportSlug === "hd-sales-ytd-following-week" ||
      reportSlug === "lowes-sales-ytd-following-week"
    ) {
      if (reportSlug.startsWith("hd-") && !caps.hdYtd) return false;
      if (reportSlug.startsWith("lowes-") && !caps.lowesYtd) return false;
      return true;
    }
    return caps.salesPlanOps;
  }

  if (sectionId === "wcro") {
    // Key-account retailer slice + full ops
    return caps.hdYtd || caps.lowesYtd;
  }

  if (sectionId === "retail-sales-opportunity") {
    if (/freight/i.test(reportSlug)) return caps.freight;
    if (/lowes/i.test(reportSlug)) return caps.lowesRetail || caps.lowesYtd;
    if (/hd/i.test(reportSlug) && reportSlug !== "west-coast-retail-dashboard") {
      return caps.hdYtd;
    }
    // Shared retail dashboards (exec, region, top stores, etc.) — either retailer
    return caps.hdYtd || caps.lowesYtd;
  }

  return caps.role === "full";
}

export function lowesDeniedMessage(): string {
  return "Lowe's analytics are not included in your portal view. Contact Ivan or Jonathan if you need access.";
}

export function hdDeniedMessage(): string {
  return "Home Depot analytics are not included in your portal view. Contact Ivan or Jonathan if you need access.";
}

export function botProfileDeniedMessage(profile: BotProfileId): string {
  const names: Record<BotProfileId, string> = {
    full: "Claude",
    hd: "Everde HD",
    lowes: "Everde Lowes",
  };
  return `This chat (${names[profile]}) is outside your assigned access. Contact Ivan or Jonathan if you need a different bot.`;
}
