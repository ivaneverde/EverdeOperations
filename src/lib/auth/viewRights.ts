/**
 * Portal / Teams view rights — who can see which retailer analytics.
 * Unknown @everde.com users default to full (Ivan, Jonathan, etc.).
 */
export type ViewRole = "full" | "hd_rep" | "hd_lowes_rep";

export type ViewCapabilities = {
  role: ViewRole;
  hdYtd: boolean;
  lowesYtd: boolean;
  /** Retail opportunity "Lowes Detail" tab / report */
  lowesRetail: boolean;
  farmInventory: boolean;
  freight: boolean;
  weather: boolean;
};

const ROLE_CAPS: Record<ViewRole, Omit<ViewCapabilities, "role">> = {
  full: {
    hdYtd: true,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: true,
    freight: true,
    weather: true,
  },
  /** Jae Martin — HD key accounts; no Lowe's */
  hd_rep: {
    hdYtd: true,
    lowesYtd: false,
    lowesRetail: false,
    farmInventory: true,
    freight: true,
    weather: true,
  },
  /** Cory Wible — HD + Lowe's in-store / market */
  hd_lowes_rep: {
    hdYtd: true,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: true,
    freight: true,
    weather: true,
  },
};

/** Lowercase emails → role. Everyone else → full. */
const EMAIL_ROLES: Record<string, ViewRole> = {
  "jmartin@everde.com": "hd_rep",
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

export function lowesDeniedMessage(): string {
  return "Lowe's analytics are not included in your portal view. Contact Ivan or Jonathan if you need access.";
}
