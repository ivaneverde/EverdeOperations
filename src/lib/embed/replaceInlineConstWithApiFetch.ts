import { extractInlineConstJson } from "@/lib/embed/extractInlineConstJson";

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

export type InlineApiFetchOptions = {
  constName: string;
  targetVar: string;
  apiPath: string;
  readyFlag: string;
  queueName: string;
  onLoadedCalls: string[];
  stripCalls?: RegExp[];
};

/**
 * Replace `const D = {...}` (or `const WX = {...}`) with a same-origin fetch loader.
 */
export function replaceInlineConstWithApiFetch(
  html: string,
  opts: InlineApiFetchOptions,
): string {
  const needle = `const ${opts.constName} = `;
  const start = html.indexOf(needle);
  if (start < 0) return html;

  let i = start + needle.length;
  while (i < html.length && /[\s\r\n]/.test(html[i]!)) i++;
  if (i >= html.length || html[i] !== "{") return html;

  const closeBrace = findMatchingBrace(html, i);
  if (closeBrace < 0) return html;

  let after = closeBrace + 1;
  while (after < html.length && (html[after] === " " || html[after] === "\t"))
    after++;
  const hadSemicolon = html[after] === ";";
  const replaceEnd = hadSemicolon ? after + 1 : closeBrace + 1;

  const onLoaded = opts.onLoadedCalls
    .map((fn) => `if(typeof ${fn}==='function')${fn}();`)
    .join("");

  const loader = `let ${opts.targetVar} = null;
(function(){
  function fail(msg){
    console.error(msg);
    var m=document.getElementById('main');
    if(m){var d=document.createElement("div");d.className="cover-meta";d.style.cssText="padding:1rem;color:var(--red)";d.textContent=String(msg);m.prepend(d);}
  }
  fetch('${opts.apiPath}',{credentials:'same-origin'})
    .then(function(r){if(!r.ok)throw new Error('${opts.apiPath} '+r.status);return r.json();})
    .then(function(data){
      ${opts.targetVar}=data;
      ${onLoaded}
      window.${opts.readyFlag}=true;
      var q=window.${opts.queueName};
      if(q&&q.length){while(q.length){try{(q.shift())();}catch(e){console.error(e);}}}
    })
    .catch(function(e){fail(e&&e.message?e.message:'Load failed');});
})();`;

  let out = html.slice(0, start) + loader + html.slice(replaceEnd);
  for (const re of opts.stripCalls ?? []) {
    out = out.replace(re, "\n");
  }
  return out;
}

export function extractInlineJsonFromHtml(
  html: string,
  constName: string,
): string | null {
  return extractInlineConstJson(html, constName);
}
