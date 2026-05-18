/**
 * Phase C: NOR CAL sales plan HTML embeds inline `const D = { ... };`.
 * At serve time replace with fetch to `/api/sales-plan/dashboard-data`.
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

function stripInitialRenderExec(html: string): string {
  return html.replace(/\nrenderExec\(\);\s*\r?\n/, "\n");
}

export function replaceInlineSalesPlanDataWithApiFetch(html: string): string {
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
  var el=document.getElementById('page-exec');
  if(el){var n=document.createElement('p');n.style.cssText='padding:1rem;color:var(--text-dim)';n.textContent='Loading dashboard data…';el.prepend(n);}
  function fail(msg){
    console.error(msg);
    var m=document.getElementById('main');
    if(m){var d=document.createElement('div');d.className='cover-meta';d.style.cssText='padding:1rem;color:var(--red)';d.textContent=String(msg);m.prepend(d);}
  }
  fetch('/api/sales-plan/dashboard-data',{credentials:'same-origin'})
    .then(function(r){if(!r.ok)throw new Error('dashboard-data '+r.status);return r.json();})
    .then(function(data){
      D=data;
      if(typeof renderExec==='function')renderExec();
      window.__everdeSalesPlanDataReady=true;
      var q=window.__everdeSalesPlanActivateQueue;
      if(q&&q.length){while(q.length){try{(q.shift())();}catch(e){console.error(e);}}}
    })
    .catch(function(e){fail(e&&e.message?e.message:'Load failed');});
})();`;

  let out = html.slice(0, start) + loader + html.slice(replaceEnd);
  out = stripInitialRenderExec(out);
  return out;
}
