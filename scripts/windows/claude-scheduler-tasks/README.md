# Claude ToDo package — scheduler tasks (VRD-8FQJYW3)

Source: `Everde_ToDo_Package.zip` (also under `_incoming/everde-todo-package/`).

## Two ways to run the agent

| Approach | Register | Weather | Retail Monday | Blob → Vercel |
|----------|----------|---------|---------------|---------------|
| **A. Claude XML** (this folder) | Import `*.xml` in Task Scheduler | 4 scripts on share only | Separate 9:00 build + 10:00 extract (you configure extract) | Manual / separate |
| **B. Repo tasks** (recommended) | `npm run weekly:register-tasks` | `run-scheduled-weather.ps1` → share scripts + **Azure publish** | `run-scheduled-retail-build.ps1` (build + extract in one job) | Yes |

Use **B on the dev laptop** today. On **VRD-8FQJYW3**, either B alone or **A + B** (A for share logs/crosswalk, B for portal Blob).

## Claude XML files

- `Everde-Weather-DailyCheck.xml` — daily 9:30 AM: `fetch_weather_v2` → `build_sales_state_v2` → `build_sales_report_v2` → `build_shared_crosswalk`
- `Everde-Retail-WorkbookBuild.xml` — Monday 9:00 AM: `build_retail_workbooks.py` on share

Import:

```cmd
schtasks /Create /XML "Everde-Weather-DailyCheck.xml" /TN "Everde-Weather-DailyCheck" /F
schtasks /Create /XML "Everde-Retail-WorkbookBuild.xml" /TN "Everde-Retail-WorkbookBuild" /F
```

## Repo alignment (already done)

- `scripts/weather/build_shared_crosswalk.py` — copy; auto-installed to share on first `weather:share-pipeline` run
- `npm run weather:share-pipeline` — same 4-script daily chain **plus** HTML bootstrap + Azure Blob
- `Everde-Retail-WeeklyCheck` via repo — **includes** workbook build before extract (no separate XML required unless you want 9:00/10:00 split)

## Share paths to verify (VPN)

```
\\192.168.190.10\Claude Sandbox\JS Files\shared\Sales_Weather_Crosswalk_latest.json
\\192.168.190.10\Claude Sandbox\JS Files\logs\weather_daily.log
\\192.168.190.10\Claude Sandbox\JS Files\Weather Data\output\weather_sales_data.json
```

## DEPLOY_GUIDE.md — portal status

Claude’s deploy guide describes **pre-portal** steps. In this repo **already live**:

- Sales Plan, Retail, Weather — portal routes + iframe embeds + Blob JSON APIs
- Assistant compendium includes retail + weather JSON

**Still backlog:** serve `Sales_Weather_Crosswalk_latest.json` from Blob/API for live crosswalk tab (crosswalk is built on share daily; portal HTML still uses inline snapshot until wired).

See `DEPLOY_GUIDE.md` in `_incoming/everde-todo-package/` for reference only.
