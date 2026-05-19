import { replaceInlineConstWithApiFetch } from "@/lib/embed/replaceInlineConstWithApiFetch";

export function replaceInlineWeatherDataWithApiFetch(html: string): string {
  return replaceInlineConstWithApiFetch(html, {
    constName: "WX",
    targetVar: "WX",
    apiPath: "/api/weather/dashboard-data",
    readyFlag: "__everdeWeatherDataReady",
    queueName: "__everdeWeatherActivateQueue",
    onLoadedCalls: ["init"],
    stripCalls: [/\ninit\(\);\s*\r?\n/],
  });
}
