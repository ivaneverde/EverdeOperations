/**
 * View rights — mirrored from portal src/lib/auth/viewRights.ts
 * Keep email → role maps in sync when changing access.
 */
export type ViewRole = "full" | "hd_rep" | "hd_lowes_rep";

export type ViewCapabilities = {
  role: ViewRole;
  hdYtd: boolean;
  lowesYtd: boolean;
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
  hd_rep: {
    hdYtd: true,
    lowesYtd: false,
    lowesRetail: false,
    farmInventory: true,
    freight: true,
    weather: true,
  },
  hd_lowes_rep: {
    hdYtd: true,
    lowesYtd: true,
    lowesRetail: true,
    farmInventory: true,
    freight: true,
    weather: true,
  },
};

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

export function lowesDeniedMessage(): string {
  return "Lowe's analytics are not included in your view. You have Home Depot, farm inventory, freight, and weather. Contact Ivan or Jonathan if you need Lowe's access.";
}

export function buildViewRightsPromptBlock(
  email: string | null | undefined,
): string {
  const caps = capabilitiesForEmail(email);
  if (caps.lowesYtd) {
    return [
      "## User view rights",
      `Signed-in view: **${caps.role}** (${email || "unknown"}). Full retailer access including Lowe's and HD.`,
    ].join("\n");
  }
  return [
    "## User view rights",
    `Signed-in view: **${caps.role}** (${email || "unknown"}).`,
    "- ALLOWED: Home Depot YTD, farm/nursery inventory, freight, weather, sales plan (non-Lowe's).",
    "- NOT ALLOWED: Lowe's YTD, Lowe's retail detail, or any Lowe's-only metrics.",
    "- If the user asks about Lowe's, politely say it is outside their view and offer HD / farm / freight / weather instead.",
    "- Do not invent Lowe's numbers. Do not call get_lowes_ytd_following_week.",
  ].join("\n");
}

/** Tools that must not be offered or executed for Lowe's-restricted users. */
export const LOWES_RESTRICTED_TOOLS = new Set([
  "get_lowes_ytd_following_week",
]);

export function isLowesRestrictedTool(name: string): boolean {
  return LOWES_RESTRICTED_TOOLS.has(name);
}

