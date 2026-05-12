/**
 * Root of the internal share (DataDrops). Override with `PORTAL_DATA_ROOT`.
 * Use forward slashes so Node `fs` can open UNC on Windows (`//host/share/...`).
 */
const DEFAULT_PORTAL_DATA_ROOT =
  "//192.168.190.10/Claude Sandbox/DataDrops";

export function getPortalDataRoot(): string {
  const raw =
    process.env.PORTAL_DATA_ROOT?.trim() || DEFAULT_PORTAL_DATA_ROOT;
  return raw.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Join path segments under the portal data root without using `path.posix.join`,
 * which collapses a leading `//` and breaks UNC (`//server/share/...`) on Windows.
 */
export function joinPortalDataRoot(...relSegments: string[]): string {
  const root = getPortalDataRoot().replace(/\/+$/, "");
  const parts: string[] = [];
  for (const seg of relSegments) {
    for (const piece of seg.replace(/\\/g, "/").split("/")) {
      if (piece.length > 0) parts.push(piece);
    }
  }
  if (parts.length === 0) return root;
  return `${root}/${parts.join("/")}`;
}

export function freightDirectory(): string {
  return joinPortalDataRoot("Freight");
}

export function freightPipelineDirectory(): string {
  return joinPortalDataRoot("Freight", "_pipeline");
}

/**
 * `child_process` on Windows expects `\\host\share\...` for UNC cwd.
 */
export function uncPathForChildProcess(posixStyle: string): string {
  if (process.platform !== "win32") return posixStyle;
  if (posixStyle.startsWith("//")) {
    return `\\\\${posixStyle.slice(2).replace(/\//g, "\\")}`;
  }
  return posixStyle.replace(/\//g, "\\");
}
