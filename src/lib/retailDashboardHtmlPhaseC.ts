import { replaceInlineConstWithApiFetch } from "@/lib/embed/replaceInlineConstWithApiFetch";

export function replaceInlineRetailDataWithApiFetch(html: string): string {
  return replaceInlineConstWithApiFetch(html, {
    constName: "D",
    targetVar: "D",
    apiPath: "/api/retail/dashboard-data",
    readyFlag: "__everdeRetailDataReady",
    queueName: "__everdeRetailActivateQueue",
    onLoadedCalls: ["renderExec"],
    stripCalls: [/\nrenderExec\(\);\s*\r?\n/],
  });
}
