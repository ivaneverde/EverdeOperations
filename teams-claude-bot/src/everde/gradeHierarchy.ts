/**
 * Everde nursery grade hierarchy (from Grade Definitions index).
 * A/B are top shippable retail grades; SS/GS/SN/etc. move up over time.
 */
export const NURSERY_GRADE_HIERARCHY = {
  top_shippable: ["A", "B"],
  pipeline_to_ab: ["SS", "GS", "SN", "S2N", "S3N", "GN", "PN", "P2N", "P3N", "T"],
  exclude_unless_asked: ["C", "D"],
  definitions: {
    A: "Meets Everde Standard Spec — all-around good quality (top grade).",
    B: "Retail/Independents when shipping below A spec (an approved SS). Still a top sellable grade.",
    SS: "Sales/Shippable — looks good but small; ≥75% rooted and ~2/3 of standard spec. Young crop on the path to A. Landscape can reserve. Include in 'coming ready' when asking about future A/B supply.",
    SN: "Sales/Non-shippable — assigned to Sales but too small/not rooted; holding for future demand window.",
    S2N: "Same as SN with a different demand window/ready date when SN already on the pad.",
    S3N: "Same as SN with yet another demand window when SN and S2N already on the pad.",
    GS: "Grower Hold/Shippable — previously A, pruned/maintained; shippable for landscape; will move back toward A.",
    GN: "Grower Hold/Non-shippable — pest/disease/root loss; uncertain return to A.",
    C: "Discounted / clearance (#2) — scarring, irregular, overgrown, or rooting issues.",
    D: "Dead / unsaleable / expired — scrap.",
    PN: "Production crop only — projected grade-A quality.",
    P2N: "Production crop — alternate demand window when PN already on pad.",
    P3N: "Cuttings/divisions or third production window on same pad.",
    T: "Transfer material between sites/regions.",
  },
  answering_rules: [
    "When user asks on-hand for A and B, report A/B graded_on_hand only.",
    "When user asks 'coming ready' / ready dates and says not including C, D, or P grades, INCLUDE SS (and GS/SN/etc.) — SS is the pipeline into A/B and often has READY DATE populated.",
    "Do not apply the A/B on-hand filter to the coming-ready section unless the user explicitly says ready dates for A/B only.",
    "Never say no ready dates exist if SS (or other included grades) have readyDate values for that item/size/region.",
  ],
} as const;

export function buildGradeHierarchyBlock(): string {
  const d = NURSERY_GRADE_HIERARCHY.definitions;
  return [
    "## Nursery grade hierarchy (Everde)",
    "Top sellable: **A**, **B**. Below them, crop moves up over time:",
    `- **SS** — ${d.SS}`,
    `- **SN / S2N / S3N** — ${d.SN}`,
    `- **GS / GN** — grower hold (shippable / non-shippable)`,
    `- **PN / P2N / P3N** — production-only projected A`,
    `- **C** — discounted clearance; **D** — dead/scrap; **T** — transfer`,
    "",
    ...NURSERY_GRADE_HIERARCHY.answering_rules.map((r) => `- ${r}`),
  ].join("\n");
}
