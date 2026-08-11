<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Everde AI Operations — deployment context

Ship for **localhost** during design and QA. The roadmap is a **hosted, multi-device web portal** (phones, tablets, desktops) with appropriate auth and hosting; keep layouts responsive and avoid assumptions that only apply to a single desktop on VPN.

## Everde — saved decisions & backlog (handoff)

**Repo / app:** Next.js portal at `C:\Users\isunderland\everde-ai-operations` (package `everde-ai-operations`). Data config: `src/config/portal.ts` (`DATA_ROOT_UNC` = `\\192.168.190.10\Claude Sandbox\DataDrops`).

**Current portal behavior:** Subsections are in-app routes only. They **do not** open Excel over SMB and **do not** recalculate workbooks yet — `ReportPlaceholder` + `ReportShell` show UNC paths for traceability; real metrics require a future **ingest → compute → persist → bind UI** pipeline.

**Data / pipeline (planned):** Weekly import (and optional manual upload). Prefer **deterministic** code or existing Python (`Sales Plan Review` builders, etc.); **do not** depend on Claude tokens for runtime dashboard math. Optional LLM only for narratives/on-demand explanations.

### Product goal — Jonathan (field / quick-answer) — updated 2026-07-27

**Purpose:** Easy on-the-fly answers for **stores, markets, items** (field / quick query) — not a full workbook replacement.

**Current priority scope (Jonathan):**
- Retailers: **HD** and **LOW** only, **California** focus.
- Geography grain: **stores, markets, or districts**.
- Data today: **sales** and **on-hand** from uploads (Brent / Armando feeds via WeeklyDrop → Blob) + **farm / XXTT inventory**.
- Coming next: **grouping**, other feeds, **suggested orders** → enable **recommendations** (e.g. replenishment). Until then bots stay descriptive (“what’s going on”), not invent replenish advice.
- North star: answer from **limited information we provide on the uploads** — do not invent outside those feeds.

**Teams bots (Option A — one App Service, three visual bots):**
| Teams name | Endpoint | Scope |
|------------|----------|--------|
| **Claude** (`@Claude`) | `/api/messages` | Full ops (freight, weather, HD+Lowes, nursery, …) |
| **Everde HD** (`@Everde HD`) | `/api/messages/hd` | HD YTD + farm inventory/demand only |
| **Everde Lowes** (`@Everde Lowes`) | `/api/messages/lowes` | Lowe's YTD + farm inventory/demand only |

Same Blob publish; each profile loads only its datasets/tools (less bandwidth). **Backend provisioned** (Entra + Azure Bots + App Service secrets); `/health` lists `full`/`hd`/`lowes`. **Teams install:** upload packages + assign per tester table — see `teams-claude-bot/docs/MULTI_BOT_PROFILES.md`.

**View rights (Jonathan tester list — code-enforced portal + bots):** Unknown `@everde.com` → **full**. Explicit **full** admins: Ivan (`isunderland@everde.com`), Jonathan (`jsaperstein@everde.com`), Jason (`jcowham@everde.com`), Marco (`mcarrizales@everde.com`), Aaron (`acowan@everde.com`). Key-account roles are retailer-slice only (no freight/weather/farm ops on Claude/portal).

| User | Email | Teams bots | Portal / Claude role | Install (2026-08-11) |
|------|-------|------------|----------------------|----------------------|
| Ivan / Jonathan / Jason / Marco / Aaron | (see above) | Claude + HD + Lowes | `full` | ops / as needed |
| Mark Berchiolli | `mberchiolli@everde.com` | Claude + HD + Lowes | `full` | **live** (all 3) |
| Justin Keeler | `jkeeler@everde.com` | Claude + HD + Lowes | `full` | waiting on meeting |
| Jae Martin | `jmartin@everde.com` | HD only | `hd_rep` | **live** (HD) |
| Brian Wohlberg | `bwohlberg@everde.com` | HD only | `hd_rep` | waiting on meeting |
| John Gorosave | `jgorosave@everde.com` | Lowes only | `lowes_rep` | waiting on meeting |
| Scott Bianucci | `sbianucci@everde.com` | HD + Lowes (not Claude) | `hd_lowes_rep` | waiting on meeting |
| Cory Wible | `cwible@everde.com` | HD + Lowes (not Claude) | `hd_lowes_rep` | **live** (HD + Lowes) |

Maps live in `src/lib/auth/viewRights.ts` and `teams-claude-bot/src/everde/viewRights.ts` (keep in sync).

**Keep existing work:** Freight, nursery, weather, sales-plan dashboards, retail opportunity, CEO briefing, full ops portal sections, etc. stay implemented and maintained. Jonathan’s note is the **priority product lens** for field-facing HD/LOW Q&A (especially Teams + mobile), not a mandate to remove other features. Ops/admin users may still use the broader portal / Claude bot.

**Anti false data-denial:** Teams bot + portal Analyst must **not** say data is missing when Blob/snapshot shows it published. Zero filter matches = refine the query; only deny when a feed is truly unpublished. Prefer tool calls over “I can’t find it.”

**Retail / accounting weeks:**
- **Everde accounting calendar** (Marco, `docs/reference/2026-Accounting-Calendar-10.14.2025.xlsx` → JSON in `src/lib/retail/`): **Sunday–Saturday**; FY2026 week 1 = Sun **2025-12-28**.
- **HD/Lowe's retailer weeks** (YTD column labels WK25 / Week 25 On Hands): **different numbering**. Jonathan: report Mon **2026-07-20** = retailer **week 25** = Everde accounting **week 30**.
- Bot/Analyst inject both; “fiscal week” → accounting; YTD “week 25” → retailer columns.

**In-portal AI assistant:** Portal **compendium** analyst — header + drawer; **OpenAI / Claude toggle**. Context: catalog + **freight** + **sales plan** + **nursery DEMAND** + **retail** + **weather** Blob JSON (compacted). **Backlog:** live weather API fetch; rate limits; optional page-only mode.

**Snapshot 9.0.2 (portal app):** Teams WCRO spread-prep UX — `get_wcro_dashboard` compact payload includes `top_pools_by_market` + NN glossary; softer anti-deny prompts so bots lead with published pools instead of false “no pool data.” Production portal: https://everde-operations.vercel.app . Teams App Service: `everde-claude-teams-bot`.

**Last session (2026-08-11):** Production & Demand now has **Site Focus Summary** subsection (Wk32 Word drop in `Inventory Metrics\`). Extract: `npm run nursery:extract-site-focus`. HD SoCal roster still live on Teams. Field installs: Mark B (all 3), Jae (HD), Cory W (HD + Lowes) live; Justin K, Brian W, John G, Scott B waiting on a meeting.

**Share layout — `Shared` folder:** Treat as primary **feeds & reference** hub: `Sales Data` (large `Sales by Item` / dated 2026 snapshots), `Sales Plan` (`Sales Plan by Item`), `INV` (`Inventory Transform` dated), `Housing Data` (e.g. permits), `Allocation Files` (allocation templates), `Inventory Cross References` (xref `.xlsb`, large Key Item extracts), `Misc Look Ups` (pricing/product lookups). **Section folders** (`Freight`, `Sales Plan Review`, …) hold **dashboard deliverables** and sometimes generators (`.py`, `changes_history.json`, docs). **Retail:** `scripts/retail-opportunity/build_retail_workbooks.py` builds five workbooks from share feeds → `DataDrops\SalesOpportunity\`; `extract_retail_opp.py` → Blob JSON for the portal embed. Monday agent task: build (if sources changed) + extract/publish.

**Centralized file drop:** `DataDrops\Weather\WeeklyDrop\` (weather + retail weekly feeds); `Sales Plan Review\WeeklyDrop\` (inventory + sales by item); `Freight\WeeklyDrop\` (raw freight). See `scripts/windows/WEEKLY_DROP_AGENT.md`.

**Inventory script (TODO — user requested):** Walk `DataDrops` tree, emit CSV/MD with columns like `path, size, lastWrite, guessed_role` (`feed` | `reference` | `output` | `code`) using heuristics (naming, size, folder).

**Online / VPN:** Production should not rely on each user mounting UNC; use **sync/ETL** from share (agent on VPN/LAN) into **cloud storage + DB** the hosted app reads. Git for **source code** is separate from where Excel binaries live.

**Windows / build:** `next.config.ts` includes a small webpack plugin normalizing `Everde-AI-Operations` vs `everde-ai-operations` path casing; keep a single canonical project path. Custom `src/pages/_app.tsx` + `_error.tsx` + root `dynamic = 'force-dynamic'` were needed for stable `next build` on this setup.

**Home copy:** Portal home includes a **phase note** (local dev now; hosted multi-device later).
