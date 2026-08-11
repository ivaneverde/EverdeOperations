export type SiteFocusTone = "ok" | "watch" | "alert";

export type SiteFocusItem = {
  topic: string;
  text: string;
  tone: SiteFocusTone;
};

export type SiteFocusFarm = {
  code: string;
  market: string;
  items: SiteFocusItem[];
};

export type SiteFocusRegion = {
  name: string;
  farms: SiteFocusFarm[];
};

export type SiteFocusMeta = {
  title: string;
  week: number | null;
  reportDate: string | null;
  intro: string | null;
  sourceName: string;
  farmCount: number;
  regionCount: number;
  alertCount: number;
  extractedAt: string;
};

export type SiteFocusData = {
  meta: SiteFocusMeta;
  regions: SiteFocusRegion[];
  closing: string | null;
};
