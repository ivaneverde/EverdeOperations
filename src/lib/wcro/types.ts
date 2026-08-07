/** Types for data/wcro_data.json from scripts/wcro/extract_wcro.py */

export type WcroViewId =
  | "exec"
  | "store-rec"
  | "onhand"
  | "transfers"
  | "rep-orders"
  | "build";

export type WcroFourNumbers = {
  ship_this_week: number;
  to_transfer: number;
  nn_plan: number;
  nn_cust_store: number;
  nn_cust_store_gross_u?: number;
  nn_cust_pool_u?: number;
  note?: string;
};

export type WcroRepOrder = {
  rep_name: string;
  channel: string | null;
  region: string | null;
  channels?: string[];
  regions?: string[];
  filename: string;
  unc_path: string;
  store_count: number;
  total_ship: number;
  total_transfer: number;
  total_for?: number;
  tabs?: {
    tab: string;
    channel: string;
    region: string;
    source: string;
    materials: number;
    store_count: number;
    total_ship_$: number;
  }[];
  note?: string | null;
};

export type WcroBuildHealthCheck = {
  check: string;
  detail: string;
  result: string;
};

export type WcroData = {
  snapshot: {
    refresh: string;
    date: string;
    generated_at?: string;
    reports_root?: string;
  };
  four_numbers: WcroFourNumbers;
  exec_summary?: {
    combined_summary?: {
      segments?: Record<string, unknown>[];
      plan_var_summary?: Record<string, unknown>[];
      plan_var_net_combined_summary_$?: number | null;
      notes?: string[];
    };
    sales_manager_summary?: Record<string, unknown> | null;
    set1_files?: Record<string, unknown>[];
    stub_note?: string;
  };
  store_recommendation?: {
    channel: string;
    file: string;
    unc_path: string;
    markets?: Record<
      string,
      {
        pool_count: number;
        totals: Record<string, number>;
        top_pools_by_nn_cust_store?: Record<string, unknown>[];
      }
    >;
  }[];
  on_hand_register?: {
    weekly?: Record<string, WcroOhrMarket>;
    ytd?: Record<string, WcroOhrMarket>;
  };
  transfers?: {
    channel: string;
    file: string;
    unc_path: string;
    total_transfer_u: number;
    total_transfer_$: number;
    tabs?: Record<
      string,
      {
        line_count: number;
        transfer_qty_u: number;
        wholesale_$: number;
        lines?: Record<string, unknown>[];
      }
    >;
  }[];
  rep_orders: WcroRepOrder[];
  build_health: {
    refresh?: string;
    date?: string;
    file_counts?: Record<string, number>;
    expected_file_counts?: Record<string, number>;
    store_driven?: {
      channel: string;
      file: string;
      status: string;
      checks: WcroBuildHealthCheck[];
    }[];
    supply_filter?: {
      result?: string;
      tx_fl_org_leaks?: string[];
      note?: string;
      wcro_orgs?: string[];
      excluded_tx_fl_orgs?: string[];
    };
    fiscal_calendar_note?: string;
    known_flags?: string[];
    validation?: {
      targets?: Record<string, number>;
      passed?: boolean;
      errors?: string[];
    };
  };
  change_log?: Record<string, unknown>[];
};

export type WcroOhrMarket = {
  channel?: string;
  region?: string;
  edition?: string;
  file?: string;
  unc_path?: string;
  kpis?: Record<string, { ty?: number | null; ly?: number | null; var_$?: number | null }>;
  net_need_block?: Record<string, unknown>;
  genus_master_row_count?: number;
};
