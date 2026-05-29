/**
 * Jonathan May 28 gap features — hooks renderers after Blob JSON loads.
 */
(function () {
  "use strict";

  function uniq(arr) {
    return [...new Set(arr.filter(Boolean))].sort();
  }

  function filterBarHtml(id, filters) {
    return (
      '<div class="filter-bar" id="' +
      id +
      '-filters">' +
      filters
        .map(function (f) {
          return (
            "<label>" +
            f.label +
            '</label><select onchange="window.__freightGapApplyFilters(\'' +
            id +
            "')\">" +
            f.options
              .map(function (o) {
                return '<option value="' + o + '">' + o + "</option>";
              })
              .join("") +
            "</select>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  window.__freightOppView = "all";

  window.__freightGapApplyFilters = function (scope) {
    if (scope === "opportunities" && typeof renderOpportunities === "function") {
      renderOpportunities();
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

      html += filterBarHtml("opportunities", [
        {
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
          label: "Month",
          options: ["All"].concat((D.filter_options && D.filter_options.months) || []),
        },
        {
          label: "Week",
          options: ["All"].concat(
            (D.filter_options && D.filter_options.weeks) || [],
          ).map(String),
        },
        {
          label: "Sales Director",
          options: ["All"].concat(
            (D.filter_options && D.filter_options.sales_directors) || [],
          ),
        },
      ]);

      var barEl = document.getElementById("opportunities-filters");
      var regionF = "All",
        monthF = "All",
        weekF = "All",
        dirF = "All";
      if (barEl) {
        var sels = barEl.querySelectorAll("select");
        regionF = sels[0] ? sels[0].value : "All";
        monthF = sels[1] ? sels[1].value : "All";
        weekF = sels[2] ? sels[2].value : "All";
        dirF = sels[3] ? sels[3].value : "All";
      }

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
    patchOpportunities();
    patchSales();
    patchMasterData();
    renderers["internal-freight"] = renderInternalFreight;
  }

  window.__freightGapInstall = install;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
