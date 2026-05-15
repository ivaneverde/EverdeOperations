/**
 * Phase C: static freight dashboard HTML embeds inline `const D = { ... };`.
 * At serve time we replace that blob with a fetch to `/api/freight/dashboard-data`
 * so Blob/local JSON is the single source (no stale multi‑MB inline data).
 */

const NEEDLE = "const D = ";

function findMatchingBrace(html: string, openBraceIndex: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = openBraceIndex; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Removes the first top-level `renderCover();` call (runs before D when using API). */
function stripInitialRenderCover(html: string): string {
  return html.replace(/\nrenderCover\(\);\s*\r?\n/, "\n");
}

/**
 * If the handoff HTML contains `const D = { ... };`, replace with API loader.
 * No-op if the pattern is missing or brace match fails.
 */
export function replaceInlineFreightDataWithApiFetch(html: string): string {
  const start = html.indexOf(NEEDLE);
  if (start < 0) return html;

  let i = start + NEEDLE.length;
  while (i < html.length && /[\s\r\n]/.test(html[i]!)) i++;
  if (i >= html.length || html[i] !== "{") return html;

  const closeBrace = findMatchingBrace(html, i);
  if (closeBrace < 0) return html;

  let after = closeBrace + 1;
  while (after < html.length && (html[after] === " " || html[after] === "\t"))
    after++;
  const hadSemicolon = html[after] === ";";
  const replaceEnd = hadSemicolon ? after + 1 : closeBrace + 1;

  const loader = `let D = null;
(function(){
  var el=document.getElementById('cover-kpis');
  if(el)el.innerHTML='<div class="cover-meta" style="padding:1rem;color:var(--text-dim)">Loading dashboard data…</div>';
  function fail(msg){
    console.error(msg);
    if(el)el.innerHTML='<div class="cover-meta" style="padding:1rem;color:var(--negative,crimson)">'+
      String(msg).replace(/</g,'')+'</div>';
  }
  fetch('/api/freight/dashboard-data',{credentials:'same-origin'})
    .then(function(r){if(!r.ok)throw new Error('dashboard-data '+r.status);return r.json();})
    .then(function(data){
      D=data;
      if(typeof renderCover==='function')renderCover();
      window.__everdeFreightDataReady=true;
      var q=window.__everdeFreightActivateQueue;
      if(q&&q.length){while(q.length){try{(q.shift())();}catch(e){console.error(e);}}}
    })
    .catch(function(e){fail(e&&e.message?e.message:'Load failed');});
})();`;

  let out = html.slice(0, start) + loader + html.slice(replaceEnd);
  out = stripInitialRenderCover(out);
  return out;
}
