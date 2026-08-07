import type { WcroFourNumbers } from "@/lib/wcro/types";

function fmtDollar(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtUnits(n: number): string {
  return `${new Intl.NumberFormat("en-US").format(n)} u`;
}

type TileProps = {
  label: string;
  value: string;
  tooltip: string;
  accent: string;
};

function Tile({ label, value, tooltip, accent }: TileProps) {
  return (
    <div
      className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm"
      title={tooltip}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-zinc-900 sm:text-xl">
        {value}
      </p>
    </div>
  );
}

export function WCROHeader({
  four,
  refresh,
  date,
}: {
  four: WcroFourNumbers;
  refresh: string;
  date: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs text-zinc-600">
          West Coast Retail Opportunity — wholesale $ · descriptive only
        </p>
        <span className="rounded-full bg-[var(--everde-forest)] px-2.5 py-1 text-[11px] font-medium text-[var(--everde-gold)]">
          Refresh {refresh} · {date}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile
          label="Ship This Week"
          value={fmtDollar(four.ship_this_week)}
          accent="#2F5233"
          tooltip="In-region orders + FOR-direct only. Cross-region transfers excluded (ship next week)."
        />
        <Tile
          label="To Transfer"
          value={fmtDollar(four.to_transfer)}
          accent="#C49B3F"
          tooltip="Cross-region moves — hit the shelf next week, not this week."
        />
        <Tile
          label="NN Plan"
          value={fmtUnits(four.nn_plan)}
          accent="#1F3A5F"
          tooltip="Plan-driven net need."
        />
        <Tile
          label="NN Cust Store"
          value={fmtUnits(four.nn_cust_store)}
          accent="#1F3A5F"
          tooltip={
            four.note ??
            "Demand-sensed pool-level net need. Different methodology from NN Plan — do not compare directly."
          }
        />
      </div>
      {four.nn_cust_store_gross_u != null && (
        <p className="text-[11px] text-zinc-500">
          Gross NN Cust Store (store-summed):{" "}
          {fmtUnits(four.nn_cust_store_gross_u)} — gap vs pool = maldistribution.
        </p>
      )}
    </div>
  );
}
