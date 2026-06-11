/**
 * Jonathan May 28 gap features — hooks renderers after Blob JSON loads.
 */
(function () {
  "use strict";

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))].sort();
  }

  function filterBarHtml(id, filters, selected) {
    selected = selected || {};
    return (
      '<div class="filter-bar" id="' +
      id +
      '-filters">' +
      filters
        .map(function (f) {
          var cur = selected[f.key] || "All";
          return (
            "<label>" +
            f.label +
            '</label><select data-filter-key="' +
            f.key +
            '" onchange="window.__freightGapApplyFilters(\'' +
            id +
            "')\">" +
            f.options
              .map(function (o) {
                var val = String(o);
                return (
                  '<option value="' +
                  val +
                  '"' +
                  (val === String(cur) ? " selected" : "") +
                  ">" +
                  val +
                  "</option>"
                );
              })
              .join("") +
            "</select>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function readFilterBar(id) {
    var barEl = document.getElementById(id + "-filters");
    var out = {};
    if (!barEl) return out;
    barEl.querySelectorAll("select[data-filter-key]").forEach(function (sel) {
      out[sel.getAttribute("data-filter-key")] = sel.value;
    });
    return out;
  }

  var REGION_CONTAINER_IDS = {
    "N. CA": "nca-content",
    "S. CA": "sca-content",
    TX: "tx-content",
    FL: "fl-content",
    FOR: "for-content",
  };

  function sumDrillRows(rows) {
    var t = {
      loads: 0,
      drops: 0,
      eus: 0,
      miles: 0,
      revenue: 0,
      recovery: 0,
      cost: 0,
      net: 0,
    };
    rows.forEach(function (r) {
      t.loads += r.loads || 0;
      t.drops += r.drops || 0;
      t.eus += r.eus || 0;
      t.miles += r.miles || 0;
      t.revenue += r.revenue || 0;
      t.recovery += r.recovery || 0;
      t.cost += r.cost || 0;
      t.net += r.net || 0;
    });
    t.recov_pct = t.revenue ? t.recovery / t.revenue : 0;
    t.cost_per_eu = t.eus ? t.cost / t.eus : 0;
    t.cost_per_mile = t.miles ? t.cost / t.miles : 0;
    t.cost_per_load = t.loads ? t.cost / t.loads : 0;
    t.cost_per_drop = t.drops ? t.cost / t.drops : 0;
    return t;
  }

  function regionDrillFor(region, filters) {
    if (!D || !D.region_drill) return [];
    return D.region_drill.filter(function (r) {
      if (r.Region !== region) return false;
      if (filters.month !== "All" && r.Month !== filters.month) return false;
      if (filters.cust_type !== "All" && r["Cust Type"] !== filters.cust_type) return false;
      if (filters.ship_type !== "All" && r["Ship Type"] !== filters.ship_type) return false;
      if (filters.trailer_type !== "All" && r["Trailer Type"] !== filters.trailer_type)
        return false;
      if (filters.site !== "All" && r.Site !== filters.site) return false;
      if (filters.week !== "All" && String(r.Week) !== filters.week) return false;
      if (filters.sales_director !== "All" && r["Sales Director"] !== filters.sales_director)
        return false;
      return true;
    });
  }

  function regionFilterIsActive(filters) {
    return Object.keys(filters).some(function (k) {
      return filters[k] !== "All";
    });
  }

  function regionFilterOptions(region, key, field) {
    var rows = (D.region_drill || []).filter(function (r) {
      return r.Region === region;
    });
    return uniq(
      rows
        .map(function (r) {
          return r[field];
        })
        .filter(function (v) {
          return v != null && String(v).trim() !== "";
        })
        .map(String),
    );
  }

  function renderRegionDashWithFilters(region, containerId, origBuild) {
    if (!D || !D.region_drill || !D.region_drill.length) {
      return origBuild(region, containerId);
    }

    var scope = "region-" + containerId;
    var filters = readFilterBar(scope);
    if (!Object.keys(filters).length) {
      filters = {
        month: "All",
        cust_type: "All",
        ship_type: "All",
        trailer_type: "All",
        site: "All",
        week: "All",
        sales_director: "All",
      };
    }

    var filtered = regionFilterIsActive(filters);
    var sites = D.region_sites[region] || [];
    var k25 = D.region_kpis[region]["2025"];
    var k26 = filtered
      ? sumDrillRows(regionDrillFor(region, filters))
      : D.region_kpis[region]["2026"];

    var html = filterBarHtml(
      scope,
      [
        {
          key: "month",
          label: "Month",
          options: ["All"].concat((D.filter_options && D.filter_options.months) || []),
        },
        {
          key: "cust_type",
          label: "Customer Type",
          options: ["All"].concat(regionFilterOptions(region, "cust_type", "Cust Type")),
        },
        {
          key: "ship_type",
          label: "Ship Type",
          options: ["All"].concat(regionFilterOptions(region, "ship_type", "Ship Type")),
        },
        {
          key: "trailer_type",
          label: "Trailer Type",
          options: ["All"].concat(regionFilterOptions(region, "trailer_type", "Trailer Type")),
        },
        {
          key: "site",
          label: "Site",
          options: ["All"].concat(sites),
        },
        {
          key: "week",
          label: "Week",
          options: ["All"].concat(
            ((D.filter_options && D.filter_options.weeks) || []).map(String),
          ),
        },
        {
          key: "sales_director",
          label: "Sales Director",
          options: ["All"].concat(
            (D.filter_options && D.filter_options.sales_directors) || [],
          ),
        },
      ],
      filters,
    );

    if (filtered) {
      html +=
        '<p style="font-size:11px;color:var(--text-muted);margin:8px 0 12px">Filtered 2026 YTD subset — 5-year tables and chart below are unfiltered.</p>';
    }

    var kpis = [
      { label: "Loads", val: fmt.int(k26.loads), d: fmt.delta(k26.loads, k25.loads), color: "green" },
      { label: "Drops", val: fmt.int(k26.drops), d: fmt.delta(k26.drops, k25.drops), color: "green" },
      { label: "EUs", val: fmt.int(k26.eus), d: fmt.delta(k26.eus, k25.eus), color: "navy" },
      {
        label: "Revenue",
        val: fmt.dollarM(k26.revenue),
        d: fmt.delta(k26.revenue, k25.revenue),
        color: "gold",
      },
      {
        label: "Recovery $",
        val: fmt.dollarM(k26.recovery),
        d: fmt.pct(k26.recov_pct),
        color: "gold",
      },
      {
        label: "Frt Cost",
        val: fmt.dollarM(k26.cost),
        d: fmt.delta(k26.cost, k25.cost),
        color: "red",
      },
      {
        label: "Net Recovery",
        val: fmt.dollarM(k26.net),
        d: fmt.delta(k26.net, k25.net),
        color: k26.net >= 0 ? "green" : "red",
      },
      {
        label: "Cost / Mile",
        val: fmt.cpm(k26.cost_per_mile),
        d: fmt.delta(k26.cost_per_mile, k25.cost_per_mile),
        color: "grey",
      },
    ];

    html +=
      '<div class="kpi-grid kpi-grid-8">' +
      kpis
        .map(function (c) {
          return (
            '<div class="kpi-card ' +
            c.color +
            '"><div class="kpi-label">' +
            c.label +
            '</div><div class="kpi-value">' +
            c.val +
            "</div>" +
            (c.d.cls !== undefined
              ? '<div class="kpi-delta ' + c.d.cls + '">vs 2025: ' + c.d.val + "</div>"
              : '<div class="kpi-sub">' + c.d + "</div>") +
            "</div>"
          );
        })
        .join("") +
      "</div>";

    var metrics = [
      { label: "Cost / EU", key: "cost_per_eu", fn: function (v) { return "$" + v.toFixed(4); } },
      { label: "Cost / Mile", key: "cost_per_mile", fn: fmt.cpm },
      { label: "Cost / Load", key: "cost_per_load", fn: fmt.dollar },
      { label: "Cost / Drop", key: "cost_per_drop", fn: fmt.dollar },
      { label: "Recovery %", key: "recov_pct", fn: fmt.pct },
      { label: "Net Recovery", key: "net", fn: fmt.dollarM },
    ];

    html +=
      '<div class="section-title">Transportation Efficiency Metrics — 5-Yr YTD Trend</div><div class="table-wrap"><table class="trend-table"><thead><tr><th>Metric</th>' +
      YEARS.map(function (y) {
        return "<th>" + y + " YTD</th>";
      }).join("") +
      "<th>'25→'26 Δ</th></tr></thead><tbody>";
    metrics.forEach(function (m) {
      var vals = YEARS.map(function (y) {
        return D.region_kpis[region][y] ? D.region_kpis[region][y][m.key] : null;
      });
      var d = fmt.delta(vals[4], vals[3]);
      html +=
        "<tr><td>" +
        m.label +
        "</td>" +
        vals
          .map(function (v) {
            var cls = m.key === "net" ? (v >= 0 ? "td-pos" : "td-neg") : "";
            return '<td class="' + cls + '">' + (v != null ? m.fn(v) : "—") + "</td>";
          })
          .join("") +
        '<td class="kpi-delta ' +
        d.cls +
        '">' +
        d.val +
        "</td></tr>";
    });
    html += "</tbody></table></div>";

    html +=
      '<div class="section-title">Monthly Loads Trend — 2024 vs 2025 vs 2026</div><div class="chart-wrap"><svg id="chart-' +
      containerId +
      '" width="100%" height="180"></svg></div>';

    if (sites.length > 0) {
      html +=
        '<div class="section-title">Site Breakdown — YTD 2026' +
        (filtered ? " (filtered)" : "") +
        '</div><div class="table-wrap"><table><thead><tr><th>Site</th><th>Loads</th><th>Drops</th><th>EUs</th><th>Revenue</th><th>Recovery</th><th>Recov %</th><th>Cost</th><th>Net</th><th>C/EU</th><th>C/Mile</th></tr></thead><tbody>';

      var siteRows = {};
      if (filtered) {
        regionDrillFor(region, filters).forEach(function (r) {
          if (!siteRows[r.Site]) siteRows[r.Site] = [];
          siteRows[r.Site].push(r);
        });
      }

      sites.forEach(function (site) {
        var s = filtered
          ? sumDrillRows(siteRows[site] || [])
          : D.site_kpis[site] && D.site_kpis[site]["2026"];
        if (!s || !s.loads) return;
        html +=
          "<tr><td><strong>" +
          site +
          "</strong></td><td>" +
          fmt.int(s.loads) +
          "</td><td>" +
          fmt.int(s.drops) +
          "</td><td>" +
          fmt.int(s.eus) +
          "</td><td>" +
          fmt.dollarM(s.revenue) +
          "</td><td>" +
          fmt.dollarM(s.recovery) +
          "</td><td>" +
          fmt.pct(s.recov_pct) +
          "</td><td>" +
          fmt.dollarM(s.cost) +
          '</td><td class="' +
          (s.net >= 0 ? "td-pos" : "td-neg") +
          '">' +
          fmt.dollarM(s.net) +
          "</td><td>$" +
          s.cost_per_eu.toFixed(4) +
          "</td><td>" +
          fmt.cpm(s.cost_per_mile) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";

      html +=
        '<div class="section-title">Site History — 5-Year YTD Net Recovery</div><div class="table-wrap"><table class="trend-table"><thead><tr><th>Site</th>' +
        YEARS.map(function (y) {
          return "<th>" + y + " Net</th>";
        }).join("") +
        "<th>'25→'26 Δ</th></tr></thead><tbody>";
      sites.forEach(function (site) {
        var vals = YEARS.map(function (y) {
          return D.site_kpis[site] && D.site_kpis[site][y] ? D.site_kpis[site][y].net : null;
        });
        var d = fmt.delta(vals[4], vals[3]);
        html +=
          "<tr><td><strong>" +
          site +
          "</strong></td>" +
          vals
            .map(function (v) {
              return (
                '<td class="' +
                (v == null ? "" : v >= 0 ? "td-pos" : "td-neg") +
                '">' +
                (v != null ? fmt.dollarM(v) : "—") +
                "</td>"
              );
            })
            .join("") +
          '<td class="kpi-delta ' +
          d.cls +
          '">' +
          d.val +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
    }

    document.getElementById(containerId).innerHTML = html;
    setTimeout(function () {
      drawRegionChart("chart-" + containerId, region);
    }, 50);
  }

  function patchRegionDash() {
    if (typeof buildRegionDash !== "function" || buildRegionDash.__gapPatched) return;
    var origBuild = buildRegionDash;
    buildRegionDash = function (region, containerId) {
      renderRegionDashWithFilters(region, containerId, origBuild);
    };
    buildRegionDash.__gapPatched = true;
  }

  window.__freightOppView = "all";

  window.__freightGapApplyFilters = function (scope) {
    if (scope === "opportunities" && typeof renderOpportunities === "function") {
      renderOpportunities();
      return;
    }
    if (scope.indexOf("region-") === 0 && typeof buildRegionDash === "function") {
      var containerId = scope.slice(7);
      var region = Object.keys(REGION_CONTAINER_IDS).find(function (r) {
        return REGION_CONTAINER_IDS[r] === containerId;
      });
      if (region) buildRegionDash(region, containerId);
    }
  };

  function patchOpportunities() {
    if (typeof renderOpportunities !== "function" || renderOpportunities.__gapPatched)
      return;
    var orig = renderOpportunities;
    renderOpportunities = function () {
      var container = document.getElementById("opp-content");
      if (!container || !D || !D.top_opps) return orig();

      var view = window.__freightOppView || "all";
      var opps =
        view === "last-week" && D.opps_last_week ? D.opps_last_week : D.top_opps;
      var meta = D.opps_last_week_meta || {};

      var html =
        '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
        '<button type="button" style="padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:' +
        (view === "all" ? "rgba(196,155,63,0.2)" : "transparent") +
        '" onclick="window.__freightOppView=\'all\';renderOpportunities()">All Flagged (' +
        D.top_opps.length +
        ")</button>" +
        '<button type="button" style="padding:6px 12px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:' +
        (view === "last-week" ? "rgba(196,155,63,0.2)" : "transparent") +
        '" onclick="window.__freightOppView=\'last-week\';renderOpportunities()">Recent window (' +
        (D.opps_last_week ? D.opps_last_week.length : 0) +
        ")</button></div>";

      if (view === "last-week" && meta.flagged_count != null) {
        html +=
          '<div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:12px">' +
          [
            ["Flagged", fmt.int(meta.flagged_count)],
            ["Cost", fmt.dollarM(meta.total_cost)],
            ["Net", fmt.dollarM(meta.total_net)],
            ["Low Fill $", fmt.dollarM(meta.low_fill_cost)],
            ["3P/Int $", fmt.dollarM(meta.threep_int_cost)],
          ]
            .map(function (p) {
              return (
                '<div class="kpi-card red"><div class="kpi-label">' +
                p[0] +
                '</div><div class="kpi-value">' +
                p[1] +
                "</div></div>"
              );
            })
            .join("") +
          "</div>";
      }

      var oppFilters = readFilterBar("opportunities");
      if (!Object.keys(oppFilters).length) {
        oppFilters = { region: "All", month: "All", week: "All", sales_director: "All" };
      }

      html += filterBarHtml(
        "opportunities",
        [
          {
            key: "region",
            label: "Region",
            options: ["All"].concat(
              uniq(
                D.top_opps.map(function (r) {
                  return r.Region;
                }),
              ),
            ),
          },
          {
            key: "month",
            label: "Month",
            options: ["All"].concat((D.filter_options && D.filter_options.months) || []),
          },
          {
            key: "week",
            label: "Week",
            options: ["All"].concat(
              ((D.filter_options && D.filter_options.weeks) || []).map(String),
            ),
          },
          {
            key: "sales_director",
            label: "Sales Director",
            options: ["All"].concat(
              (D.filter_options && D.filter_options.sales_directors) || [],
            ),
          },
        ],
        oppFilters,
      );

      var regionF = oppFilters.region || "All";
      var monthF = oppFilters.month || "All";
      var weekF = oppFilters.week || "All";
      var dirF = oppFilters.sales_director || "All";

      if (view === "last-week" && meta.subtitle) {
        html +=
          '<p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">' +
          meta.subtitle +
          "</p>";
      }

      var cols =
        view === "last-week"
          ? "<th>Tracking</th><th>Region</th><th>Site</th><th>Ship Date</th><th>Week</th><th>Customer</th><th>Cost</th><th>Net</th><th>Fill</th>"
          : "<th>Tracking</th><th>Region</th><th>Site</th><th>Month</th><th>Week</th><th>Director</th><th>Cost</th><th>Net</th><th>Fill</th><th>Site '25 $/Ld</th><th>Δ vs '25</th>";

      html +=
        '<div class="table-wrap"><table><thead><tr>' +
        cols +
        "</tr></thead><tbody>";

      opps
        .filter(function (r) {
          if (regionF !== "All" && r.Region !== regionF) return false;
          if (monthF !== "All" && r.Month !== monthF) return false;
          if (weekF !== "All" && String(r.Week) !== weekF) return false;
          if (dirF !== "All" && r["Sales Director"] !== dirF) return false;
          return true;
        })
        .slice(0, 200)
        .forEach(function (r) {
          var fill = r.fill_rate;
          var fillPct = fill == null ? "?" : (Number(fill) * 100).toFixed(0) + "%";
          var cost = r.Cost != null ? r.Cost : 0;
          var net = r.Net != null ? r.Net : 0;
          if (view === "last-week") {
            html +=
              "<tr><td>" +
              (r["Tracking #"] || "") +
              "</td><td>" +
              r.Region +
              "</td><td>" +
              r.Site +
              "</td><td>" +
              (r["Ship Date"] || "") +
              "</td><td>" +
              (r.Week || "") +
              "</td><td>" +
              (r.Customer || "") +
              "</td><td>" +
              fmt.dollarM(cost) +
              '</td><td class="' +
              (net >= 0 ? "td-pos" : "td-neg") +
              '">' +
              fmt.dollarM(net) +
              "</td><td>" +
              fillPct +
              "</td></tr>";
          } else {
            var delta = r.delta_vs_site_25 || 0;
            html +=
              "<tr><td>" +
              (r["Tracking #"] || "") +
              "</td><td>" +
              r.Region +
              "</td><td>" +
              r.Site +
              "</td><td>" +
              r.Month +
              "</td><td>" +
              (r.Week || "") +
              "</td><td>" +
              (r["Sales Director"] || "") +
              "</td><td>" +
              fmt.dollarM(cost) +
              '</td><td class="' +
              (net >= 0 ? "td-pos" : "td-neg") +
              '">' +
              fmt.dollarM(net) +
              "</td><td>" +
              fillPct +
              "</td><td>" +
              fmt.dollar(r.site_25_cost_per_load || 0) +
              "</td><td>" +
              (delta ? Number(delta).toFixed(2) + "×" : "—") +
              "</td></tr>";
          }
        });

      html += "</tbody></table></div>";
      container.innerHTML = html;
    };
    renderOpportunities.__gapPatched = true;
  }

  function renderInternalFreight() {
    var container = document.getElementById("internal-content");
    if (!container || !D) return;
    var html = "";

    if (D.internal_5yr && D.internal_5yr.length) {
      html +=
        '<div class="section-title">Internal Freight — 5-Year YTD</div><div class="table-wrap"><table class="trend-table"><thead><tr><th>Year</th><th>Loads</th><th>Cost</th><th>$/Mile</th></tr></thead><tbody>';
      D.internal_5yr.forEach(function (r) {
        html +=
          "<tr><td>" +
          r.year +
          "</td><td>" +
          fmt.int(r.loads) +
          "</td><td>" +
          fmt.dollarM(r.cost) +
          "</td><td>" +
          fmt.cpm(r.cost_per_mile) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
    }

    if (D.internal_top_lanes && D.internal_top_lanes.length) {
      html +=
        '<div class="section-title">Top Lanes by Cost</div><div class="table-wrap"><table><thead><tr><th>Site</th><th>Ring</th><th>Cost</th></tr></thead><tbody>';
      D.internal_top_lanes.forEach(function (r) {
        html +=
          "<tr><td>" +
          r.site +
          "</td><td>" +
          r.freight_ring +
          "</td><td>" +
          fmt.dollarM(r.cost) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
    }

    container.innerHTML =
      html ||
      '<p style="color:var(--text-muted)">Run freight:extract-publish after pipeline rebuild.</p>';
  }

  function patchSales() {
    if (typeof renderSales !== "function" || renderSales.__gapPatched) return;
    var orig = renderSales;
    renderSales = function () {
      if (!D || !D.sales_by_channel) return orig();
      var container = document.getElementById("sales-content");
      if (!container) return orig();
      var html =
        '<div class="section-title">By Channel — 2026 YTD</div><div class="table-wrap"><table><thead><tr><th>Channel</th><th>Loads</th><th>Net</th><th>Recov %</th></tr></thead><tbody>';
      D.sales_by_channel.forEach(function (r) {
        html +=
          "<tr><td>" +
          r.channel +
          "</td><td>" +
          fmt.int(r.loads) +
          '</td><td class="' +
          (r.net >= 0 ? "td-pos" : "td-neg") +
          '">' +
          fmt.dollarM(r.net) +
          "</td><td>" +
          fmt.pct(r.recov_pct) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
      html +=
        '<div class="section-title">By Rep</div><div class="table-wrap"><table><thead><tr><th>Rep</th><th>Director</th><th>Net</th></tr></thead><tbody>';
      (D.sales_by_rep || []).slice(0, 40).forEach(function (r) {
        html +=
          "<tr><td>" +
          r.rep +
          "</td><td>" +
          r.sales_director +
          '</td><td class="' +
          (r.net >= 0 ? "td-pos" : "td-neg") +
          '">' +
          fmt.dollarM(r.net) +
          "</td></tr>";
      });
      html += "</tbody></table></div>";
      container.innerHTML = html;
    };
    renderSales.__gapPatched = true;
  }

  var CL_TYPE_COLORS = {
    FEATURE: "#1F3A5F",
    FIX: "#C49B3F",
    DATA: "#2F5233",
    RULE: "#5B4F8A",
  };

  function ensurePipelineTabStyles() {
    if (document.getElementById("freight-pipeline-tab-styles")) return;
    var style = document.createElement("style");
    style.id = "freight-pipeline-tab-styles";
    style.textContent =
      ".bh-banner{padding:12px 16px;border-radius:6px;margin-bottom:16px;font-weight:600;font-size:13px}" +
      ".bh-banner.pass{background:rgba(47,82,51,0.25);color:#4caf7d;border:1px solid rgba(76,175,125,0.35)}" +
      ".bh-banner.fail{background:rgba(192,57,43,0.2);color:#e07b70;border:1px solid rgba(224,123,112,0.35)}" +
      ".bh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}" +
      ".bh-section{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:12px 14px}" +
      ".bh-section h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold)}" +
      ".bh-row{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px}" +
      ".bh-row:last-child{border-bottom:none}" +
      ".bh-label{color:var(--text-muted)}" +
      ".bh-val{text-align:right;font-family:var(--mono)}" +
      ".cl-header{font-size:12px;color:var(--text-muted);margin-bottom:12px}" +
      ".cl-entry{padding:10px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:8px;background:var(--card)}" +
      ".cl-meta{display:flex;gap:8px;align-items:center;margin-bottom:4px}" +
      ".cl-date{font-family:var(--mono);font-size:11px;color:var(--text-muted)}" +
      ".cl-type{font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;color:#fff;letter-spacing:.04em}" +
      ".cl-summary{font-size:13px;font-weight:600}" +
      ".cl-detail{font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.45}";
    document.head.appendChild(style);
  }

  function bhRow(label, value, color) {
    var cls = color === "red" ? "td-neg" : color === "green" ? "td-pos" : "";
    return (
      '<div class="bh-row"><span class="bh-label">' +
      label +
      '</span><span class="bh-val ' +
      cls +
      '">' +
      (value == null ? "—" : value) +
      "</span></div>"
    );
  }

  function ensurePipelineTabs() {
    ensurePipelineTabStyles();
    if (document.getElementById("tab-build-health")) return;
    var main = document.getElementById("main");
    if (!main) return;
    main.insertAdjacentHTML(
      "beforeend",
      '<div id="tab-build-health" class="page">' +
        '<div class="page-header"><h1>Build Health</h1>' +
        '<div class="subtitle">Data source, pipeline status, and YTD headline KPIs</div></div>' +
        '<div id="build-health-content"></div></div>' +
        '<div id="tab-change-log" class="page">' +
        '<div class="page-header"><h1>Change Log</h1>' +
        '<div class="subtitle">Newest-first history of data refreshes, features, and fixes</div></div>' +
        '<div id="change-log-content"></div></div>',
    );
    if (typeof renderers !== "undefined") {
      renderers["build-health"] = renderBuildHealth;
      renderers["change-log"] = renderChangeLog;
    }
  }

  function renderBuildHealth() {
    var container = document.getElementById("build-health-content");
    if (!container || !D) return;
    var bh = D.build_health;
    if (!bh) {
      container.innerHTML =
        '<p style="color:var(--text-muted)">Build Health data not available — run freight:extract-publish.</p>';
      return;
    }
    var passed = String(bh.verify_gate || "").indexOf("PASSED") >= 0;
    var html =
      '<div class="bh-banner ' +
      (passed ? "pass" : "fail") +
      '">Verify Gate: ' +
      (bh.verify_gate || "Unknown") +
      "</div><div class=\"bh-grid\">";

    html +=
      '<div class="bh-section"><h3>Data Source &amp; Extent</h3>' +
      bhRow("Source file", bh.source_file) +
      bhRow("Source size", bh.source_size_mb ? bh.source_size_mb + " MB" : "—") +
      bhRow("Dashboard workbook", bh.dashboard_workbook) +
      bhRow("Master rows (drops)", fmt.int(bh.master_rows)) +
      bhRow(
        "Ship dates",
        bh.ship_date_min && bh.ship_date_max
          ? bh.ship_date_min + " → " + bh.ship_date_max
          : "—",
      ) +
      bhRow("Loads", fmt.int(bh.loads)) +
      bhRow("Drops", fmt.int(bh.drops)) +
      "</div>";

    html +=
      '<div class="bh-section"><h3>Build Status</h3>' +
      bhRow("Built", bh.generated_at) +
      bhRow("Pipeline steps", String(bh.pipeline_steps || "—")) +
      bhRow("Verify gate", bh.verify_gate, passed ? "green" : "red") +
      bhRow("Static tables", bh.static_tables_note || "—") +
      "</div>";

    html += '<div class="bh-section"><h3>2026 Internal BUD $/Mile Rates</h3>';
    Object.keys(bh.bud_mile || {})
      .sort()
      .forEach(function (site) {
        html += bhRow(site, "$" + Number(bh.bud_mile[site]).toFixed(2));
      });
    html += bhRow("FOR-region sites", "actual (not budget)") + "</div>";

    var k = bh.kpis || {};
    html +=
      '<div class="bh-section"><h3>YTD Headline KPIs</h3>' +
      bhRow("Total Frt Cost", fmt.dollar(k.total_cost)) +
      bhRow("Total Frt Recovery", fmt.dollar(k.total_recovery)) +
      bhRow("Net Recovery", fmt.dollar(k.net_recovery), k.net_recovery < 0 ? "red" : "green") +
      bhRow("Recovery % of Cost", fmt.pct(k.recovery_pct)) +
      bhRow("Total Miles", fmt.int(k.total_miles)) +
      bhRow("Avg $/Mile", fmt.dollar(k.avg_cost_per_mile)) +
      bhRow("Avg $/Load", fmt.dollar(k.avg_cost_per_load)) +
      bhRow("3P $/Mile YTD", fmt.dollar(k.threep_cost_per_mile)) +
      bhRow("Internal $/Mile YTD", fmt.dollar(k.internal_cost_per_mile)) +
      "</div></div>";

    container.innerHTML = html;
  }

  function renderChangeLog() {
    var container = document.getElementById("change-log-content");
    if (!container || !D) return;
    var log = D.change_log || [];
    if (!log.length) {
      container.innerHTML =
        '<p style="color:var(--text-muted)">No change history available.</p>';
      return;
    }
    var html =
      '<div class="cl-header">Change Log — ' +
      log.length +
      " entries, newest first</div>";
    log.forEach(function (entry) {
      var type = entry.type || "DATA";
      var color = CL_TYPE_COLORS[type] || "#556070";
      html +=
        '<div class="cl-entry"><div class="cl-meta">' +
        '<span class="cl-date">' +
        (entry.date || "") +
        '</span><span class="cl-type" style="background:' +
        color +
        '">' +
        type +
        "</span></div>" +
        '<div class="cl-summary">' +
        (entry.summary || "") +
        "</div>";
      if (entry.detail) {
        html += '<div class="cl-detail">' + entry.detail + "</div>";
      }
      html += "</div>";
    });
    container.innerHTML = html;
  }

  function patchMasterData() {
    if (typeof renderMasterData !== "function" || renderMasterData.__gapPatched) return;
    var orig = renderMasterData;
    renderMasterData = function () {
      orig();
      if (!D || !D.bud_mile) return;
      var container = document.getElementById("masterdata-content");
      if (!container) return;
      var rows = Object.keys(D.bud_mile)
        .sort()
        .map(function (site) {
          return (
            "<tr><td><strong>" +
            site +
            "</strong></td><td>$" +
            Number(D.bud_mile[site]).toFixed(2) +
            "</td></tr>"
          );
        })
        .join("");
      container.insertAdjacentHTML(
        "beforeend",
        '<div class="section-title">Budget $/Mile</div><div class="table-wrap"><table><thead><tr><th>Site</th><th>BUD $/Mile</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></div>",
      );
    };
    renderMasterData.__gapPatched = true;
  }

  function install() {
    if (typeof renderers === "undefined") return;
    ensurePipelineTabs();
    patchRegionDash();
    patchOpportunities();
    patchSales();
    patchMasterData();
    renderers["internal-freight"] = renderInternalFreight;
    renderers["build-health"] = renderBuildHealth;
    renderers["change-log"] = renderChangeLog;
  }

  window.__freightGapInstall = install;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
