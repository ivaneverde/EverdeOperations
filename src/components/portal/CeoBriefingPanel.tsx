import {
  CEO_BRIEFING_BLOCKS,
  CEO_BRIEFING_INTRO,
  CEO_BRIEFING_TITLE,
} from "@/config/ceoBriefing";

export function CeoBriefingPanel() {
  return (
    <section
      className="rounded-lg border border-[var(--everde-forest)]/20 bg-white p-6 shadow-sm"
      aria-labelledby="ceo-briefing-heading"
    >
      <h2
        id="ceo-briefing-heading"
        className="text-lg font-semibold text-[var(--everde-forest)]"
      >
        {CEO_BRIEFING_TITLE}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
        {CEO_BRIEFING_INTRO}
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CEO_BRIEFING_BLOCKS.map((block) => (
          <div key={block.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {block.title}
            </h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-snug text-zinc-700">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
