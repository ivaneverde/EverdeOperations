/** Short leadership notes shown on the portal home page. */

export const CEO_BRIEFING_TITLE = "Leadership overview";

export const CEO_BRIEFING_INTRO =
  "One secure site for operations dashboards and an AI analyst. Numbers refresh from weekly files on the internal share.";

export type CeoBriefingBlock = {
  title: string;
  items: string[];
};

export const CEO_BRIEFING_BLOCKS: CeoBriefingBlock[] = [
  {
    title: "Live today",
    items: [
      "Freight — YTD costs, regions, 3rd party, lanes, fuel, opportunities.",
      "Retail — West Coast ship-now, behind plan, HD/Lowes, miss analysis.",
      "Sales plan — NOR CAL forward inventory vs plan (exec, farms, channels).",
      "Nursery — supply inventory and production vs demand.",
      "Weather — regional forecast and sales crosswalk.",
    ],
  },
  {
    title: "How it works",
    items: [
      "Weekly Excel drops on DataDrops → automated extract → cloud JSON.",
      "Portal reads live JSON (no VPN mount required for viewers).",
      "Use Reload view on a dashboard after a new weekly publish.",
    ],
  },
  {
    title: "AI assistant",
    items: [
      "Ask questions in plain English from any page (header or side panel).",
      "Uses Claude with portal freight, retail, sales plan, and nursery data.",
      "Best for summaries and rankings; space rapid questions ~30s apart.",
    ],
  },
  {
    title: "Access & security",
    items: [
      "Sign in with @everde.com (Microsoft Entra).",
      "Hosted on Vercel; data files in Azure Blob, not on user laptops.",
    ],
  },
  {
    title: "Coming next",
    items: [
      "Oregon sales plan dashboard (NOR CAL pattern).",
      "Teams messaging in-portal (Graph API).",
      "Fully hosted multi-device polish and optional rate-limit tuning.",
    ],
  },
];
