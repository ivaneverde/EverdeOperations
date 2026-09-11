# Cursor handoff — WCRO suggested qty → Oracle mass-upload Excel

**Purpose:** Give another Cursor agent enough context to rebuild the **same Excel upload tool** we already built for Preliminary Orders, but feed it **WCRO suggested amounts** (store × SKU quantities) instead of a cart.

**Do not invent store×SKU write-orders.** WCRO’s published portal JSON is mostly **pool / market / dollar** aggregates. Line-level quantities must come from Jonathan’s published workbooks (or a new extract of those tabs), not from guessing units from pool dollars.

---

## 0. Prompt you can paste into the other agent

```
You are implementing: take WCRO suggested ship quantities and compile them into Everde’s existing Oracle OrderTemplate.xlsm mass-upload workbook (same layout and macros as Preliminary Order), then email or download that file.

Read this entire file first:
  C:\Users\isunderland\everde-ai-operations\docs\CURSOR_HANDOFF_WCRO_Oracle_MassUpload.md

Then study the working implementation (do not reinvent the cell map):
  C:\Users\isunderland\Documents\sales-ai-agent\src\lib\oracleTemplateWorkbook.ts
  C:\Users\isunderland\Documents\sales-ai-agent\src\lib\oracleOrderCsv.ts
  C:\Users\isunderland\Documents\sales-ai-agent\src\lib\webAdiOrderCsv.ts
  C:\Users\isunderland\Documents\sales-ai-agent\src\lib\emailOrder.ts
  C:\Users\isunderland\Documents\sales-ai-agent\docs\WEB_ADI_EBS.md

Template file (macros live here — copy, do not recreate from scratch):
  ORACLE_ORDER_TEMPLATE_PATH or C:\Users\isunderland\Desktop\OrderTemplate.xlsm

WCRO data lives in everde-ai-operations:
  public/wcro_data.json (aggregates only — not store×SKU)
  scripts/wcro/extract_wcro.py  (currently SKIPS tabs named *Oracle*, *Order, *FOR)
  DataDrops\WCRO\_HANDOFF_WCRO_*\reports\Store Driven Sales Recommendation\

Rules:
- One Oracle workbook = one customer / one store / one ship-to (template is single-order wide).
- SKUs go ACROSS columns starting at H, not down rows.
- Prefer Excel COM prefill on Windows (preserves VBA). SheetJS is fallback only.
- Never invent SKUs or quantities. If store×SKU lines are missing, extract them from Store Driven “Oracle Order” tabs (or Rep Orders) first.
- Match Everde inventory SKUs if you persist through preliminary-order APIs (unknown SKUs fail createPreliminaryOrder).
```

---

## 1. What we already built (Preliminary Order)

Repo: **`C:\Users\isunderland\Documents\sales-ai-agent`** (shortcut: *Everde Sales AI — Preliminary Order*).

Flow today:

1. User builds a **cart** (`sku` + `quantity`).
2. Checkout creates a **PreliminaryOrder** in Postgres (Prisma).
3. Server compiles exports:
   - **`OrderTemplate.xlsm`** — the real Oracle mass-upload workbook (macros / `Button2_Click`).
   - **Oracle-style CSV** — tall interface-table layout.
   - **Web ADI CSV** — Excel-friendly paste file (UTF-8 BOM).
   - **PDF** — acknowledgement only (not an upload).
4. Email (`src/lib/emailOrder.ts`) attaches the `.xlsm` (default) and optionally CSV/PDF.

We did **not** generate Oracle’s upload sheet from a blank workbook. We **copy Everde’s existing macro template** and write values into known cells.

---

## 2. The mass-upload Excel — how it is compiled

### 2.1 Source of truth: `OrderTemplate.xlsm`

Resolved in `oracleTemplateWorkbook.ts`:

1. Env `ORACLE_ORDER_TEMPLATE_PATH` (absolute path on the machine that compiles).
2. Else local fallback: `C:\Users\isunderland\Desktop\OrderTemplate.xlsm`.

If the path is missing, compile returns `null` (email still can send CSV/PDF).

### 2.2 Two compile modes

| Mode | Env | How | When it works |
|------|-----|-----|----------------|
| **Attach original** | `ORACLE_TEMPLATE_PREFILL` unset/false | Read template bytes, no cell writes | Always; smallest file; macros intact; **empty of this order’s lines** |
| **Prefill via Excel COM** | `ORACLE_TEMPLATE_PREFILL=true` | PowerShell `Excel.Application` opens `.xlsm`, writes `Template` sheet, Save | **Windows + Excel installed** (office / VPN agent). This is the **full-functionality** path. |
| **Prefill via SheetJS** | Prefill true, COM failed | `xlsx` `read`/`write` with `bookVBA: true` | Linux/Vercel often **breaks macros**. Do not treat as production upload. |

Vercel/Linux: COM does not exist. Production compile for a real upload should run on a **Windows agent** that can see the template file (same idea as weekly DataDrops agents).

### 2.3 Sheet `Template` — cell map (must match macros)

Header block (consumed by `Button2_Click`):

| Cell | Field | Preliminary Order source | WCRO suggested mapping |
|------|--------|--------------------------|------------------------|
| **B1** | Customer name | `order.customerName` | Retailer + store name (e.g. `HOME DEPOT #0614`) — use Customer Master, not a pool label |
| **B2** | Request / delivery date | `preferredDeliveryDate` | Ship week Saturday or Everde accounting week end you agree with ops |
| **B3** | Ship-to | `order.shipTo` | Store ship-to address string |
| **B4** | Order type | `ORACLE_TEMPLATE_ORDER_TYPE` | Defaults differ: SheetJS `"STE LANDSCAPE NORTH"`; COM `"SO CA STE IND/LANDSCAPE"`. Confirm with Oracle team per org (STE / WIN / FOR…). |
| **B5** | Line count | `order.lines.length` | Number of SKU columns written |
| **B6** | Address category | `ORACLE_TEMPLATE_ADDRESS_CATEGORY` | Default `"COSUS"` |

Fixed labels (rewrite so leftover template junk does not survive):

- `A11` = `Sku #`
- `A12` = `Item`
- `A13` = `Rep`
- `B13` = `Store #`
- `C13` = `City`
- `D13` = `PO#`
- `G13` = `Internal #`

**First (and typically only) store row = row 14:**

| Cell | Field |
|------|--------|
| **A14** | Sales rep name |
| **B14** | Store number (`ORACLE_TEMPLATE_STORE_NUMBER` today — **must become per-store for WCRO**) |
| **C14** | City (parsed from ship-to: second comma-separated part) |
| **D14** | PO number |
| **G14** | Internal # (COM: first line’s SKU; SheetJS: `"1"`) |

COM prefill **clears** `A15:IV300` and `H8:ZZ8` / `H11:ZZ14` so historical demo rows do not upload.

### 2.4 SKUs are **wide**, not tall

Starting column **H** (column index **8**), **each SKU is one column**:

| Row | Content |
|-----|---------|
| **8** | COM writes `=SUM(<col>14:<col>15)` (template totals style) |
| **11** | SKU |
| **12** | Item description |
| **13** | SKU again (template convention) |
| **14** | **Quantity** (the suggested units) |

If you write one row per SKU (like a normal CSV), **Oracle upload will be wrong**.

One workbook = **one store / one ship-to**. Multiple WCRO stores ⇒ **multiple workbooks** (or multiple emails), not one giant row-14 dump of unrelated stores.

### 2.5 Intermediate payload (what COM receives)

`oracleTemplateWorkbook.ts` writes `payload.json` then PowerShell:

```json
{
  "customerName": "",
  "preferredDeliveryDate": "YYYY-MM-DD",
  "shipTo": "",
  "orderType": "",
  "addressCategory": "",
  "storeNumber": "",
  "salesRepName": "",
  "poNumber": "",
  "city": "",
  "lines": [
    { "sku": "", "itemName": "", "quantity": 0, "internalNo": "" }
  ]
}
```

`internalNo` is set only on the first line (SKU) in COM mode.

You can reuse this payload shape for WCRO without Prisma if you only need the Excel. If you also want checkout / email / order numbers, map into `PreliminaryOrder` + `PreliminaryOrderLine` (`sku`, `itemName`, `quantity`, prices in cents).

---

## 3. Sister formats (not the macro template)

Use these if someone cannot open `.xlsm`, or for Web ADI paste. They are **tall** (one row per line).

### 3.1 Oracle import CSV — `buildOraclePreliminaryOrderCsv`

Headers: `SOURCE_SYSTEM`, `ORIG_SYS_DOCUMENT_REF`, `PRELIM_ORDER_NUMBER`, `ORDERED_DATE`, `CUSTOMER_NAME`, `CONTACT`, `SHIP_TO_ADDRESS`, `PO_NUMBER`, `REQUEST_SHIP_DATE`, `SALES_REP_NAME`, `SALES_REP_EMAIL`, `LINE_NUMBER`, `ORDERED_ITEM`, `ITEM_DESCRIPTION`, `ORDERED_QUANTITY`, `UNIT_SELLING_PRICE`, `CURRENCY_CODE`, `LINE_AMOUNT`, `ORDER_STATUS`.

`SOURCE_SYSTEM` = `EVERDE_PRELIM`. Filename: `PreliminaryOrder_<n>_OracleImport.csv`.

### 3.2 Web ADI CSV — `buildWebAdiFriendlyCsv`

Human headers (`SKU`, `Quantity`, …), UTF-8 BOM, `\r\n`. See `docs/WEB_ADI_EBS.md` in sales-ai-agent.

User still opens Oracle’s **Web ADI Excel** from EBS and pastes columns. We do not embed the Oracle add-in.

Download: `GET /api/orders/<orderNumber>/export?format=webadi|csv|dat|pdf`.

---

## 4. Email path (already working)

`src/lib/emailOrder.ts`:

- Needs `EMAIL_SMTP_HOST` + `EMAIL_FROM` (Resend / M365 / Gmail / internal relay).
- `ORACLE_EMAIL_ATTACHMENT_MODE`: `xlsm` (default) | `csv` | `both`.
- `ORACLE_ATTACH_TEMPLATE_EMAIL` (default true in current code).
- Size cap: `ORACLE_ATTACH_TEMPLATE_MAX_BYTES` (default 10 MB).

For WCRO: same transporter; subject/body should say **WCRO refresh + store + week**, not “preliminary cart.”

---

## 5. WCRO — what data you actually have

### 5.1 Published JSON (`wcro_data.json`) — **not enough for upload**

Location: `everde-ai-operations/public/wcro_data.json` (also Blob `wcro/latest/`).

Useful for **which markets / pools** matter:

- `four_numbers` — Ship / Transfer / NN Plan / NN Cust (units or $ depending on field).
- `store_recommendation[].markets[].top_pools_by_nn_cust_store[]` — genus, form, size, `everde_item_codes`, optional `retailer_pool_sku`, `ship_$`, `nn_cust_store_gross_$`.
- **No store number × Everde SKU × order qty** in this extract.

Teams/portal policy: **do not invent Write Orders** from pool dollars.

### 5.2 Where suggested **units** live

Jonathan’s weekly pack:

`\\192.168.190.10\Claude Sandbox\DataDrops\WCRO\_HANDOFF_WCRO_<ver>_<date>\reports\`

| Set | Folder | Use for this job |
|-----|--------|------------------|
| 2 | `Store Driven Sales Recommendation` | Engine output. Extractor **skips** sheets whose name contains `Oracle`, or ends with `Order` / `FOR`. Those skipped tabs are the most likely **Oracle-shaped** qty grids — **inspect them first**. |
| 5 | `Rep Orders` | Per-rep workbooks (`<REP> - Orders (...).xlsx`) — store counts + ship $; may have line tabs. |

`extract_wcro.py` `extract_store_driven()` comment: *“Skip Oracle Order/FOR tabs.”* For this feature, **do the opposite**: open those tabs, document headers, emit `store + sku + qty`.

### 5.3 SKU identity

WCRO pools use **retailer pool SKU** and **Everde item codes** (comma groups). Oracle upload needs the **Everde / Oracle ordered item** (same as inventory `sku` in sales-ai-agent).

Resolve: pool → `everde_item_codes` / `top_items` → inventory SKU. If a pool has multiple items, **do not split units arbitrarily** unless Jonathan’s Order tab already has the split.

### 5.4 Quantity field to use

Agree with ops before coding. Candidates (do not mix):

- **Ship this week (u)** — what goes on the truck this week.
- **NN Cust Store / NN Pool (u)** — need, not necessarily the write-order.
- **To Transfer (u)** — next-week shelf; usually **not** this week’s sales order.

Default for “suggested amount into the upload tool”: **Ship this week units** from Store Driven / Oracle Order tabs, not NN dollars.

---

## 6. Suggested rebuild architecture

```
WCRO pack (xlsx)
    → extract store×sku×qty (new Python or extend extract_wcro.py)
    → JSON lines: { store, customerName, shipTo, city, sku, itemName, quantity, salesRep, requestDate, orderType }
    → group by store
    → for each store: build payload.json → OrderTemplate.xlsm (COM)
    → email to that store’s rep  OR  zip of workbooks for ops
```

Reuse as much as possible:

- Copy **`oracleTemplateWorkbook.ts`** (cell map + COM script) into the operations repo or a shared package. Do not change H/11–14 layout unless someone re-maps the macro.
- Optional: create `PreliminaryOrder` rows so existing `/export` and checkout email work. Then you must **upsert inventory SKUs** first (`createPreliminaryOrder` rejects unknown SKUs; max **100 lines** per order).

Windows compile agent (same class as `scripts/windows/WEEKLY_DROP_AGENT.md`): VPN, Excel, path to `OrderTemplate.xlsm`.

---

## 7. Acceptance checks

1. Open compiled `.xlsm` in Excel — **macros still run** (`Button2_Click` / Oracle upload).
2. B1–B6 and A14–G14 match the store header.
3. H11+ show SKUs; H14+ show **integer quantities** matching the WCRO extract (spot-check 3 stores).
4. Row 15+ empty (COM clear).
5. Two stores never share one Template row-14 block.
6. Email attachment opens and is under size cap (wide SKU columns grow the file).
7. No quantities invented from `ship_$` or pool $ when unit columns are missing — fail the job and list the tab/file gap.

---

## 8. Env cheat sheet (sales-ai-agent)

| Variable | Role |
|----------|------|
| `ORACLE_ORDER_TEMPLATE_PATH` | Path to `.xlsm` |
| `ORACLE_TEMPLATE_PREFILL` | `true` to write cells |
| `ORACLE_TEMPLATE_ORDER_TYPE` | B4 |
| `ORACLE_TEMPLATE_ADDRESS_CATEGORY` | B6 |
| `ORACLE_TEMPLATE_STORE_NUMBER` | B14 today (replace with WCRO store) |
| `ORACLE_ATTACH_TEMPLATE_EMAIL` | Attach xlsm |
| `ORACLE_EMAIL_ATTACHMENT_MODE` | `xlsm` / `csv` / `both` |
| `EMAIL_*` | SMTP |

---

## 9. File index

| Path | Why |
|------|-----|
| `sales-ai-agent/src/lib/oracleTemplateWorkbook.ts` | Excel compile + COM |
| `sales-ai-agent/src/lib/emailOrder.ts` | SMTP + attachments |
| `sales-ai-agent/src/lib/oracleOrderCsv.ts` | Tall Oracle CSV |
| `sales-ai-agent/src/lib/webAdiOrderCsv.ts` | Tall Web ADI CSV |
| `sales-ai-agent/src/lib/order.ts` | Cart → DB (SKU must exist) |
| `sales-ai-agent/prisma/schema.prisma` | `PreliminaryOrder` / lines |
| `sales-ai-agent/docs/WEB_ADI_EBS.md` | Human upload-to-EBS steps |
| `everde-ai-operations/scripts/wcro/extract_wcro.py` | WCRO extract; skips Order tabs |
| `everde-ai-operations/src/lib/wcro/types.ts` | JSON types |
| `everde-ai-operations/public/wcro_data.json` | Latest published aggregates |

---

*Written for handoff 2026-09-03. Implementation source of truth remains `sales-ai-agent`; WCRO source of truth remains Jonathan’s `_HANDOFF_WCRO_*` packs.*
