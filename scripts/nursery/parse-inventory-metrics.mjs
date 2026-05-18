/**
 * Parse Inventory Metrics xlsb → DEMAND JSON (Production & Demand Plan).
 * Contract matches nursery-inventory-dashboard.html / DASHBOARD_HANDOFF.md §5b.
 */
import XLSX from "xlsx";
import path from "path";

const FARMS = [
  "BNL",
  "BRA",
  "ESC",
  "FAL",
  "FOR",
  "GFL",
  "HOM",
  "HUN",
  "MCR",
  "MIR",
  "MLC",
  "OAS",
  "PAU",
  "PIR",
  "STE",
  "WIN",
];

export function num(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function roundDeep(o) {
  if (Array.isArray(o)) {
    o.forEach(roundDeep);
    return;
  }
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === "number" && !Number.isInteger(o[k])) {
        o[k] = Math.round(o[k] * 1e6) / 1e6;
      } else roundDeep(o[k]);
    }
  }
}

function sheetRows(wb, name) {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", header: 1 });
}

function parseWeeks(headerRow) {
  const weeks = [];
  for (let c = 3; c < headerRow.length; c++) {
    const w = headerRow[c];
    if (typeof w === "number" && w >= 1 && w <= 53) weeks.push(w);
    if (String(w).toLowerCase() === "total") break;
  }
  return weeks;
}

function gradeCounts7(row) {
  return {
    SS: num(row[4]),
    SN: num(row[5]),
    S2N: num(row[6]),
    GS: num(row[7]),
    GN: num(row[8]),
    PN: num(row[9]),
    P2N: num(row[10]),
  };
}

function gradeCountsDemand(row) {
  return {
    A: num(row[4]),
    B: num(row[5]),
    SS: num(row[6]),
    SN: num(row[7]),
    S2N: num(row[8]),
    GS: num(row[9]),
    GN: num(row[10]),
  };
}

function gradeCountsPhoto(row) {
  return {
    A: num(row[4]),
    B: num(row[5]),
    C: num(row[6]),
    GS: num(row[7]),
    SS: num(row[8]),
  };
}

function sumCounts(counts) {
  return Object.values(counts).reduce((s, v) => s + num(v), 0);
}

export function parseInventoryMetricsWorkbook(wb, opts = {}) {
  const reportDate =
    opts.reportDate ||
    (() => {
      const m = String(opts.sourceName || "").match(/(\d{2})\s+(\d{2})\s+(\d{2})/);
      if (m) return `20${m[3]}-${m[1]}-${m[2]}`;
      return new Date().toISOString().slice(0, 10);
    })();

  const bo = sheetRows(wb, "Backorders & Credit Summary");
  const sys = sheetRows(wb, "System V Graded Summary");
  const cyc = sheetRows(wb, "Cycle Count Summary");
  const rd = sheetRows(wb, "Ready Date Summary");
  const dw = sheetRows(wb, "DMND Window Summary");
  const ph = sheetRows(wb, "Photo Summary");

  const weeks = parseWeeks(bo[3] || []);
  const weekStart = weeks[0] ?? 9;
  const weekEnd = weeks[weeks.length - 1] ?? 21;

  // --- variance ---
  const variance = {};
  for (let i = 6; i < sys.length; i++) {
    const farm = String(sys[i][2] || "").trim();
    if (!FARMS.includes(farm)) continue;
    const systemEU = num(sys[i][3]);
    const gradedEU = num(sys[i][4]);
    const eVar = num(sys[i][5]);
    variance[farm] = {
      region: String(sys[i][1] || "").trim() || "—",
      systemEU,
      gradedEU,
      eVar,
      absVar: num(sys[i][7]),
      absVarPct: num(sys[i][8]),
      pctNotGraded: num(sys[i][6]),
    };
  }

  // --- farmBO, farmYTD, regionWeekly ---
  const farmBO = {};
  const farmYTD = {};
  const regionWeekly = [];

  for (let i = 4; i < bo.length; i += 4) {
    const farm = String(bo[i][1] || "").trim();
    if (!FARMS.includes(farm)) continue;

    const region = String(bo[i][0] || "").trim();
    const boRow = bo[i];
    const crRow = bo[i + 1];
    const revRow = bo[i + 2];
    const pctRow = bo[i + 3];

    const wStart = 3;
    const wEnd = wStart + weeks.length;
    farmBO[farm] = {
      region,
      weeks: [...weeks],
      boWeekly: boRow.slice(wStart, wEnd).map(num),
      crWeekly: crRow.slice(wStart, wEnd).map(num),
      revWeekly: revRow.slice(wStart, wEnd).map(num),
      pctWeekly: pctRow.slice(wStart, wEnd).map(num),
      boTotal: num(boRow[16]),
      crTotal: num(crRow[16]),
      revTotal: num(revRow[16]),
      pctTotal: num(pctRow[16]),
    };

    // Region weekly graph on first farm block (BNL) % row
    if (farm === "BNL" && regionWeekly.length === 0) {
      for (let r = i; r < i + 20; r++) {
        const wk = num(bo[r][58]);
        if (wk >= weekStart && wk <= weekEnd) {
          regionWeekly.push({
            week: wk,
            OR: num(bo[r][59]),
            NORCAL: num(bo[r][60]),
            SOCAL: num(bo[r][61]),
            TX: num(bo[r][62]),
            FL: num(bo[r][63]),
            GOAL: num(bo[r][64]),
          });
        }
      }
    }

    const y = boRow;
    farmYTD[farm] = {
      boValue: num(y[20]),
      crValue: num(y[21]),
      customer: num(y[22]),
      distribution: num(y[23]),
      farmCredits: num(y[24]),
      sales: num(y[25]),
      rebate: num(y[26]),
      ytdRevenue: num(y[27]),
      boPct: num(y[28]),
      crPct: num(y[29]),
      boCrPct: num(y[30]),
      boGoal: num(y[31]),
      crGoal: num(y[32]),
      boCrGoal: num(y[33]),
      boPctVar: num(y[34]),
      crPctVar: num(y[35]),
      boCrPctVar: num(y[36]),
      boDollarVar: num(y[37]),
      crDollarVar: num(y[38]),
      boCrDollarVar: num(y[39]),
    };
  }

  const gtIdx = bo.findIndex((r) => r[1] === "Grand Total");
  const gtBo = gtIdx >= 0 ? bo[gtIdx] : null;
  const gtRev = gtIdx >= 0 ? bo[gtIdx + 2] : null;

  const weeklyTotals = {
    revenue: weeks.map((_, i) => num(gtRev?.[3 + i])),
    bo: weeks.map((_, i) => num(gtBo?.[3 + i])),
    cr: weeks.map((_, i) => num(bo[gtIdx + 1]?.[3 + i])),
  };

  let totalRevenue = 0;
  let totalBO = 0;
  let totalCR = 0;
  for (const f of FARMS) {
    if (farmYTD[f]) {
      totalRevenue += farmYTD[f].ytdRevenue;
      totalBO += farmYTD[f].boValue;
      totalCR += farmYTD[f].crValue;
    }
  }

  // --- reasons ---
  const boReasons = [];
  const crReasons = [];
  for (let i = 0; i < bo.length; i++) {
    const bf = String(bo[i][42] || "").trim();
    const br = String(bo[i][43] || "").trim();
    const bv = num(bo[i][44]);
    if (FARMS.includes(bf) && br && bv > 0) {
      boReasons.push({ farm: bf, reason: br, value: bv });
    }
    const cf = String(bo[i][47] || "").trim();
    const cr = String(bo[i][48] || "").trim();
    const cv = Math.abs(num(bo[i][49]));
    const farmCr = FARMS.includes(cf) ? cf : FARMS.includes(String(bo[i - 1]?.[47] || "").trim()) ? String(bo[i - 1][47]).trim() : "";
    if (farmCr && cr && cv > 0) {
      crReasons.push({ farm: farmCr, reason: cr, value: cv });
    }
  }

  const topReasons = [...boReasons]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const crAgg = {};
  for (const r of crReasons) {
    crAgg[r.reason] = (crAgg[r.reason] || 0) + r.value;
  }
  const topCrReasons = Object.entries(crAgg)
    .map(([reason, value]) => ({ reason, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // --- cycle ---
  const cycle = {};
  for (let i = 8; i < cyc.length; i++) {
    const org = String(cyc[i][0] || "").trim();
    if (!FARMS.includes(org)) continue;
    const startQty = num(cyc[i][1]);
    const counted = Math.max(
      num(cyc[i][3]),
      num(cyc[i][4]),
      num(cyc[i][5]),
      num(cyc[i][6]),
      num(cyc[i][7]),
    );
    cycle[org] = {
      startQty,
      counted,
      pct: startQty > 0 ? counted / startQty : 0,
      mtdPacing: 0,
    };
  }

  // --- ready date (3 rows per farm) ---
  const readyDate = {};
  for (let i = 0; i < rd.length; i++) {
    const farm = String(rd[i][2] || "").trim();
    if (!FARMS.includes(farm)) continue;
    const type = String(rd[i][3] || "").toLowerCase();
    const counts = gradeCounts7(rd[i]);
    const total = num(rd[i][18]) || sumCounts(counts);
    if (!readyDate[farm]) readyDate[farm] = {};
    if (type.includes("no date")) readyDate[farm].noDate = { counts, total };
    else if (type.includes("past")) readyDate[farm].past = { counts, total };
    else if (type.includes("future")) readyDate[farm].future = { counts, total };
  }

  // --- demand window (4 rows per farm) ---
  const demandWin = {};
  for (let i = 0; i < dw.length; i++) {
    const farm = String(dw[i][2] || "").trim();
    if (!FARMS.includes(farm)) continue;
    const win = String(dw[i][3] || "").toLowerCase();
    const counts = gradeCountsDemand(dw[i]);
    const total = num(dw[i][18]) || sumCounts(counts);
    if (!demandWin[farm]) demandWin[farm] = {};
    if (win.includes("missing")) demandWin[farm].missing = { counts, total };
    else if (win === "past") demandWin[farm].past = { counts, total };
    else if (win.includes("sellable")) demandWin[farm].sellable = { counts, total };
    else if (win.includes("ready after")) demandWin[farm].readyAfter = { counts, total };
  }

  // --- photos (3 rows per farm) ---
  const photos = {};
  for (let i = 0; i < ph.length; i++) {
    const farm = String(ph[i][2] || "").trim();
    if (!FARMS.includes(farm)) continue;
    const timing = String(ph[i][3] || "").toLowerCase();
    const counts = gradeCountsPhoto(ph[i]);
    const total = num(ph[i][14]) || sumCounts(counts);
    if (!photos[farm]) photos[farm] = {};
    if (timing.includes("current")) photos[farm].current = { counts, total };
    else if (timing.includes("late")) photos[farm].late = { counts, total };
    else if (timing.includes("no")) photos[farm].no = { counts, total };
  }

  // --- aggregates ---
  const dwAgg = { missing: 0, past: 0, sellable: 0, readyAfter: 0 };
  let dwTotal = 0;
  for (const f of Object.values(demandWin)) {
    for (const k of ["missing", "past", "sellable", "readyAfter"]) {
      const t = f[k]?.total || 0;
      dwAgg[k] += t;
      dwTotal += t;
    }
  }

  const rdAgg = { noDate: 0, past: 0, future: 0 };
  let rdTotal = 0;
  for (const f of Object.values(readyDate)) {
    for (const k of ["noDate", "past", "future"]) {
      const t = f[k]?.total || 0;
      rdAgg[k] += t;
      rdTotal += t;
    }
  }

  const phAgg = { current: 0, late: 0, no: 0 };
  let phTotal = 0;
  for (const f of Object.values(photos)) {
    for (const k of ["current", "late", "no"]) {
      const t = f[k]?.total || 0;
      phAgg[k] += t;
      phTotal += t;
    }
  }

  const cycleAgg = { startQty: 0, counted: 0, pct: 0 };
  for (const c of Object.values(cycle)) {
    cycleAgg.startQty += c.startQty;
    cycleAgg.counted += c.counted;
  }
  cycleAgg.pct =
    cycleAgg.startQty > 0 ? cycleAgg.counted / cycleAgg.startQty : 0;

  const meta = {
    totalRevenue,
    totalBO,
    totalCR,
    farmCount: FARMS.filter((f) => farmYTD[f]).length,
    weeks,
    weekStart,
    weekEnd,
    reportPeriod: `2026 weeks ${weekStart}–${weekEnd}`,
    reportDate,
    boPct: totalRevenue > 0 ? totalBO / totalRevenue : 0,
    crPct: totalRevenue > 0 ? totalCR / totalRevenue : 0,
    boCrPct: totalRevenue > 0 ? (totalBO + totalCR) / totalRevenue : 0,
  };

  const demand = {
    meta,
    variance,
    farmBO,
    farmYTD,
    boReasons,
    crReasons,
    regionWeekly,
    readyDate,
    demandWin,
    photos,
    cycle,
    weeklyTotals,
    topReasons,
    topCrReasons,
    dwAgg,
    dwTotal,
    rdAgg,
    rdTotal,
    phAgg,
    phTotal,
    cycleAgg,
  };

  roundDeep(demand);
  return demand;
}

export function parseInventoryMetricsFile(filePath, opts = {}) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  return parseInventoryMetricsWorkbook(wb, {
    ...opts,
    sourceName: opts.sourceName || path.basename(filePath),
  });
}
