import { matchweekLabel, relativeMatchweekStart } from "@/lib/matchweeks";

export function WeekTabs({ value, onChange, now }: { value: string; onChange: (value: 'this' | 'next' | 'all') => void; now: number }) {
  return <div className="matchweek-tabs" role="group" aria-label="Matchweek">
    {(['this', 'next', 'all'] as const).map(week => <button type="button" key={week} aria-pressed={value === week} onClick={() => onChange(week)}><span>{week === 'this' ? 'This week' : week === 'next' ? 'Next week' : 'All weeks'}</span><small>{week === 'all' ? 'Upcoming' : now ? matchweekLabel(relativeMatchweekStart(now, week === 'next' ? 1 : 0)) : 'Monday – Sunday'}</small></button>)}
  </div>;
}
