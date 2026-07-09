/**
 * Parse Sales / Inventory / Price List (.xls Sheet2) into nursery supply DATA object.
 */
import fs from "fs";
import XLSX from "xlsx";

const COL = {
  FARM: "FARM",
  REGION: "REGION",
  BOTANICAL: "BOTANICAL",
  COMMON: "COMMON NAME",
  ITEM: "ITEM",
  SIZE: "SIZE",
  GRADE: "GRADE",
  SALEABLE: "SALEABLE QTY BY GRADE",
  GRADED: "GRADED QTY BY GRADE",
  READY: "READY DATE",
  DEMAND: "DEMAND WINDOW",
  CATEGORY: "CATEGORY",
  PRICE: "PRICE",
};

function normHeader(h) {
  return String(h ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDemandWindow(dw) {
  const s = String(dw ?? "").trim().toUpperCase();
  const m = s.match(/^(\d{4})\s+HALF\s+([12])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const half = Number(m[2]);
  const start = new Date(Date.UTC(year, half === 1 ? 0 : 6, 1));
  const end = new Date(Date.UTC(year, half === 1 ? 5 : 11, half === 1 ? 30 : 31));
  return { label: `${year} HALF ${half}`, start, end };
}

function toDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(a, b) {
  return Math.round((toDay(a) - toDay(b)) / 86400000);
}

function fmtMonthKey(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function activeDemand(dw) {
  const s = String(dw ?? "").trim().toUpperCase();
  return s && s !== "NONE" && /^\d{4}\s+HALF\s+[12]$/.test(s);
}

function parseReadyDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && v > 0) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets.Sheet2 || wb.Sheets[wb.SheetNames[1]];
  if (!sheet) throw new Error("Sheet2 not found in workbook");
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  const rows = [];
  for (const r of raw) {
    const row = {};
    for (const [k, v] of Object.entries(r)) {
      row[normHeader(k)] = v;
    }
    const farm = String(row[COL.FARM] ?? "").trim();
    if (!farm) continue;
    rows.push({
      farm,
      region: String(row[COL.REGION] ?? "").trim() || "—",
      botanical: String(row[COL.BOTANICAL] ?? "").trim(),
      common: String(row[COL.COMMON] ?? "").trim(),
      item: String(row[COL.ITEM] ?? "").trim(),
      size: String(row[COL.SIZE] ?? "").trim(),
      grade: String(row[COL.GRADE] ?? "").trim() || "—",
      saleable: num(row[COL.SALEABLE]),
      graded: num(row[COL.GRADED]),
      ready: parseReadyDate(row[COL.READY]),
      demandWindow: String(row[COL.DEMAND] ?? "").trim() || "NONE",
      category: String(row[COL.CATEGORY] ?? "").trim() || "—",
      price: num(row[COL.PRICE]),
    });
  }
  return rows;
}

export function parseSupplyPriceListFile(filePath, opts = {}) {
  const stat = fs.statSync(filePath);
  const reportDate = (opts.reportDate || stat.mtime.toISOString().slice(0, 10));
  const today = opts.today
    ? toDay(new Date(`${opts.today}T12:00:00Z`))
    : toDay(new Date(`${reportDate}T12:00:00Z`));

  const rows = readRows(filePath);
  const sourceName = opts.sourceName || filePath.split(/[/\\]/).pop();

  const farmConsumption = {};
  const regions = {};
  const grades = {};
  const categories = {};
  const readyByMonth = {};
  const farmGradeMatrix = {};
  const demandReadyMatch = {};
  const productMap = new Map();
  const agingStockAll = [];
  const lateReadyAll = [];
  const shortagesAll = [];
  const stockoutsAll = [];
  const oversoldAll = [];

  let totalSaleable = 0;
  let totalGraded = 0;
  let totalConsumed = 0;
  let agingValue = 0;

  const ensureFarm = (farm, region) => {
    if (!farmConsumption[farm]) {
      farmConsumption[farm] = {
        region,
        saleable: 0,
        graded: 0,
        consumed: 0,
        consumptionPct: 0,
        revenuePot: 0,
        shortages: 0,
        zeroStock: 0,
        gradeAPct: 0,
        gradeSSPct: 0,
        _gradeA: 0,
        _gradeSS: 0,
      };
    }
    if (!farmGradeMatrix[farm]) farmGradeMatrix[farm] = {};
    return farmConsumption[farm];
  };

  const ensureDw = (label) => {
    if (!demandReadyMatch[label]) {
      demandReadyMatch[label] = {
        totalSaleable: 0,
        readyOnTime: 0,
        readyEarly: 0,
        readyLate: 0,
        noReadyDate: 0,
      };
    }
    return demandReadyMatch[label];
  };

  const classifyAlignment = (saleable, ready, dwLabel) => {
    const bucket = ensureDw(dwLabel);
    bucket.totalSaleable += saleable;
    const window = parseDemandWindow(dwLabel);
    if (!window) {
      bucket.noReadyDate += saleable;
      return;
    }
    if (!ready) {
      bucket.noReadyDate += saleable;
      return;
    }
    const rd = toDay(ready);
    if (rd < window.start) bucket.readyEarly += saleable;
    else if (rd > window.end) bucket.readyLate += saleable;
    else bucket.readyOnTime += saleable;
  };

  for (const row of rows) {
    const {
      farm,
      region,
      botanical,
      common,
      item,
      size,
      grade,
      saleable,
      graded,
      ready,
      demandWindow,
      category,
      price,
    } = row;

    const consumed = Math.max(0, graded - saleable);
    totalSaleable += saleable;
    totalGraded += graded;
    totalConsumed += consumed;

    const farmRec = ensureFarm(farm, region);
    farmRec.saleable += saleable;
    farmRec.graded += graded;
    farmRec.consumed += consumed;
    farmRec.revenuePot += saleable * price;
    if (grade === "A") farmRec._gradeA += saleable;
    if (grade === "SS") farmRec._gradeSS += saleable;

    if (!regions[region]) regions[region] = { saleable: 0, revenuePot: 0 };
    regions[region].saleable += saleable;
    regions[region].revenuePot += saleable * price;

    if (saleable > 0) {
      if (!grades[grade]) grades[grade] = { saleable: 0 };
      grades[grade].saleable += saleable;
      if (!farmGradeMatrix[farm][grade]) farmGradeMatrix[farm][grade] = 0;
      farmGradeMatrix[farm][grade] += saleable;

      if (!categories[category]) categories[category] = 0;
      categories[category] += saleable;

      if (ready) {
        const mk = fmtMonthKey(toDay(ready));
        readyByMonth[mk] = (readyByMonth[mk] || 0) + saleable;
      }
    }

    if (activeDemand(demandWindow) && saleable > 0) {
      classifyAlignment(saleable, ready, demandWindow);
    }

    if (ready && saleable > 0 && toDay(ready) < today) {
      const value = saleable * price;
      agingValue += value;
      agingStockAll.push({
        item,
        common,
        botanical,
        size,
        grade,
        farm,
        ready: ready.toISOString().slice(0, 10),
        saleable,
        value,
      });
    }

    const window = parseDemandWindow(demandWindow);
    if (window && ready && saleable > 0 && toDay(ready) > window.end) {
      lateReadyAll.push({
        item,
        common,
        botanical,
        size,
        farm,
        dw: window.label,
        ready: ready.toISOString().slice(0, 10),
        daysLate: daysBetween(ready, window.end),
        saleable,
        value: saleable * price,
      });
    }

    if (
      activeDemand(demandWindow) &&
      price >= 25 &&
      saleable > 0 &&
      saleable < 25
    ) {
      farmRec.shortages += 1;
      shortagesAll.push({
        item,
        common,
        botanical,
        size,
        grade,
        demandWindow,
        saleable,
        price,
        revenuePot: saleable * price,
        farms: [farm],
      });
    }

    if (activeDemand(demandWindow) && saleable === 0 && graded > 0) {
      farmRec.zeroStock += 1;
      stockoutsAll.push({
        item,
        common,
        botanical,
        size,
        grade,
        farm,
        demandWindow,
        ready: ready ? ready.toISOString().slice(0, 10) : null,
        price,
      });
    }

    if (saleable < 0) {
      const qtyOver = Math.abs(saleable);
      oversoldAll.push({
        farm,
        item,
        common,
        botanical,
        size,
        grade,
        dw: demandWindow,
        qtyOver,
        valueAtRisk: qtyOver * price,
      });
    }

    if (botanical) {
      const key = botanical.toUpperCase();
      if (!productMap.has(key)) {
        productMap.set(key, {
          common,
          botanical,
          category,
          saleable: 0,
          graded: 0,
          revenuePot: 0,
          priceSum: 0,
          priceCount: 0,
          farms: new Set(),
        });
      }
      const p = productMap.get(key);
      p.saleable += saleable;
      p.graded += graded;
      p.revenuePot += saleable * price;
      if (price > 0) {
        p.priceSum += price;
        p.priceCount += 1;
      }
      p.farms.add(farm);
    }
  }

  for (const f of Object.values(farmConsumption)) {
    f.consumptionPct =
      f.graded > 0 ? round1((f.consumed / f.graded) * 100) : 0;
    f.revenuePot = round2(f.revenuePot);
    f.gradeAPct =
      f.saleable > 0 ? round1((f._gradeA / f.saleable) * 100) : 0;
    f.gradeSSPct =
      f.saleable > 0 ? round1((f._gradeSS / f.saleable) * 100) : 0;
    delete f._gradeA;
    delete f._gradeSS;
  }

  for (const r of Object.values(regions)) {
    r.revenuePot = round2(r.revenuePot);
  }

  const products = [...productMap.values()].map((p) => {
    const sellThroughPct =
      p.graded > 0
        ? round1((Math.max(0, p.graded - p.saleable) / p.graded) * 100)
        : 0;
    const avgPrice =
      p.priceCount > 0 ? round2(p.priceSum / p.priceCount) : 0;
    return {
      common: p.common,
      botanical: p.botanical,
      category: p.category,
      saleable: p.saleable,
      graded: p.graded,
      revenuePot: round2(p.revenuePot),
      avgPrice,
      sellThroughPct,
      farms: [...p.farms].sort(),
    };
  });

  const topByRevenuePot = products
    .filter((p) => p.revenuePot > 0)
    .sort((a, b) => b.revenuePot - a.revenuePot)
    .slice(0, 15)
    .map(({ graded: _g, ...rest }) => rest);

  const hotMovers = products
    .filter((p) => p.graded > 0 && p.saleable <= 0 && p.sellThroughPct >= 99.9)
    .sort((a, b) => b.graded - a.graded)
    .slice(0, 15)
    .map(({ saleable: _s, revenuePot: _r, ...rest }) => rest);

  const slowMovers = products
    .filter((p) => p.saleable >= 1000 && p.sellThroughPct <= 0.1)
    .sort((a, b) => b.saleable - a.saleable)
    .slice(0, 15);

  const agingStock = agingStockAll
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const lateReady = lateReadyAll
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const shortages = shortagesAll
    .sort((a, b) => b.revenuePot - a.revenuePot)
    .slice(0, 20);

  const stockouts = stockoutsAll
    .sort((a, b) => b.price - a.price)
    .slice(0, 15);

  const oversold = oversoldAll
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk)
    .slice(0, 15);

  const lateQty = Object.values(demandReadyMatch).reduce(
    (s, d) => s + d.readyLate,
    0,
  );

  const skuCount = rows.length;
  const productCount = productMap.size;
  const farmCount = Object.keys(farmConsumption).length;
  const regionCount = Object.keys(regions).length;
  const totalRevenuePot = round2(
    Object.values(regions).reduce((s, r) => s + r.revenuePot, 0),
  );

  return {
    meta: {
      sourceName,
      reportDate,
      rowCount: skuCount,
      columnCount: 27,
      skuCount,
      productCount,
      farmCount,
      regionCount,
      totalSaleable: Math.round(totalSaleable),
      totalGraded: Math.round(totalGraded),
      totalConsumed: Math.round(totalConsumed),
      totalRevenuePot,
      agingValue: round2(agingValue),
      agingRowCount: agingStockAll.length,
      lateQty: Math.round(lateQty),
      shortageCount: shortagesAll.length,
      oversoldRowCount: oversoldAll.length,
      oversoldUnits: Math.round(
        oversoldAll.reduce((s, o) => s + o.qtyOver, 0),
      ),
    },
    farmConsumption,
    regions,
    grades,
    categories,
    readyByMonth,
    farmGradeMatrix,
    demandReadyMatch,
    topByRevenuePot,
    hotMovers,
    slowMovers,
    agingStock,
    lateReady,
    shortages,
    stockouts,
    oversold,
  };
}
