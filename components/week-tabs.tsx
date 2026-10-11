import { matchweekLabel, relativeMatchweekStart } from "@/lib/matchweeks";

export function WeekTabs({ value, onChange, now }: { value: string; onChange: (value: string) => void; now: number }) {
  return <div className="matchweek-tabs" role="group" aria-label="Matchweek">
    {(['this', 'next'] as const).map(week => <button type="button" key={week} aria-pressed={value === week} onClick={() => onChange(week)}><span>{week === 'this' ? 'This week' : 'Next week'}</span><small>{now ? matchweekLabel(relativeMatchweekStart(now, week === 'next' ? 1 : 0)) : 'Monday – Sunday'}</small></button>)}
  </div>;
}
