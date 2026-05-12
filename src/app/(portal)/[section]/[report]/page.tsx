import { notFound } from "next/navigation";
import { ReportPlaceholder } from "@/components/ReportPlaceholder";
import { ReportShell } from "@/components/ReportShell";
import { getReport } from "@/config/portal";

export default async function ReportPage(
  props: PageProps<"/[section]/[report]">,
) {
  const { section, report } = await props.params;
  const found = getReport(section, report);
  if (!found) notFound();

  const { section: sec, report: rep } = found;

  const isTeams = sec.id === "communication" && rep.slug === "teams";

  return (
    <ReportShell section={sec} report={rep}>
      {isTeams ? <TeamsPlaceholder /> : <ReportPlaceholder report={rep} />}
    </ReportShell>
  );
}

function TeamsPlaceholder() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-zinc-700">
      <p>
        This section will host Microsoft Teams capabilities (channel read,
        targeted posts, deep links) via{" "}
        <span className="font-medium">Microsoft Graph</span>, not by embedding
        the full Teams client. Typical building blocks:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Entra ID (Azure AD) app registration with admin consent for
          organization-scoped permissions.
        </li>
        <li>
          Delegated auth for interactive users (e.g.{" "}
          <code className="rounded bg-zinc-100 px-1">ChannelMessage.Send</code>
          , <code className="rounded bg-zinc-100 px-1">Chat.ReadWrite</code>
          ) — exact set depends on whether you post as the user or as a bot.
        </li>
        <li>
          A small API route / backend service to hold client secrets, refresh
          tokens, and throttle Graph calls (never ship secrets to the browser).
        </li>
      </ul>
      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        When you are ready, share whether you prefer a{" "}
        <span className="font-medium">bot</span> posting to a leadership
        channel, <span className="font-medium">user-delegated</span> send, or
        both; that choice drives the permission model and hosting layout.
      </p>
    </div>
  );
}
