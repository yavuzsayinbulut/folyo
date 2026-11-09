import { IconBrandGithub, IconBrandReddit, IconBrandStrava } from "@tabler/icons-react";
import { relativeTime } from "@/lib/time";
import type { ActivityEvent } from "@/lib/types";

const ICONS = { GITHUB: IconBrandGithub, REDDIT: IconBrandReddit, STRAVA: IconBrandStrava } as const;
const TONES = { GITHUB: "gray", REDDIT: "coral", STRAVA: "amber" } as const;

type Row = ActivityEvent & { count: number };

/** Ardisik ayni olaylar (ornegin ayni repoya art arda push) tek satirda "×N" olarak birlesir. */
function collapse(events: ActivityEvent[]): Row[] {
  const rows: Row[] = [];
  for (const event of events) {
    const previous = rows[rows.length - 1];
    if (previous && previous.provider === event.provider && previous.title === event.title) {
      previous.count++;
    } else {
      rows.push({ ...event, count: 1 });
    }
  }
  return rows.slice(0, 6);
}

/** Tum platformlardaki son olaylar tek zaman cizelgesinde. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return null;
  const rows = collapse(events);
  return (
    <section aria-labelledby="activity" className="rounded-[var(--card-radius)] border border-line bg-surface p-5">
      <h2 id="activity" className="font-medium mb-4">Son aktiviteler</h2>
      <ol className="flex flex-col gap-3">
        {rows.map((event) => {
          const Icon = ICONS[event.provider];
          const content = (
            <>
              <span className={`tone-${TONES[event.provider]} inline-flex size-8 shrink-0 items-center justify-center rounded-lg`} style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}>
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] truncate">
                {event.title}
                {event.count > 1 && <span className="ml-1.5 text-ink-3">×{event.count}</span>}
              </span>
              <time dateTime={event.occurredAt} className="shrink-0 text-sm text-ink-3" suppressHydrationWarning>
                {relativeTime(event.occurredAt)}
              </time>
            </>
          );
          return (
            <li key={event.id}>
              {event.url ? (
                <a href={event.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-3 rounded-lg hover:bg-surface-2 -mx-2 px-2 py-1">
                  {content}
                </a>
              ) : (
                <div className="flex items-center gap-3 py-1">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
