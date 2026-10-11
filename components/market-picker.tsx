"use client";

import { useId } from "react";
import { ALL_MARKETS, MARKET_GROUPS, selectionOptions, estimatedOdds, type PredictionBasis, type MarketGroup } from "@/lib/odds-slip";
import type { Match } from "@/lib/sports";
import type { SlipPick } from "@/lib/selections";

export function samePick(a: SlipPick, b: SlipPick) {
  return a.fixtureId === b.fixtureId && a.market === b.market && a.selection === b.selection && a.line === b.line;
}
export function MarketPicker({ match, selected, onSelect, basis = "auto", markets = ALL_MARKETS }: {
  match: Match; selected?: SlipPick; onSelect: (pick: SlipPick) => void; basis?: PredictionBasis; markets?: MarketGroup[];
}) {
  const id = useId();
  const options = selectionOptions(match, basis, markets);
  const index = selected ? options.findIndex(option => samePick(option, selected)) : -1;
  if (!options.length) return null;
  return <details className="slip-market-picker">
    <summary>Choose a prediction <span>{options.length} options</span></summary>
    <label htmlFor={id}>Market for {match.home.name} vs {match.away.name}</label>
    <select id={id} value={index < 0 ? "" : index} onChange={event => onSelect(options[Number(event.target.value)])}>
      <option value="" disabled>Select a market</option>
      {MARKET_GROUPS.map(group => {
        const available = options.map((option, i) => ({ option, i })).filter(({option}) => group.id === "result" ? ["1x2", "winner"].includes(option.market) : option.market === group.id);
        return available.length ? <optgroup key={group.id} label={group.label}>{available.map(({option, i}) => <option key={i} value={i}>{option.label} · {Math.round(option.probability * 100)}% {option.probabilityBasis === "bookmaker" ? "market" : "model"} · {option.odds ? `odds ${Number(option.odds).toFixed(2)}` : `est. ${estimatedOdds(option).toFixed(2)}`}</option>)}</optgroup> : null;
      })}
    </select>
    <small>Choosing another market replaces this game’s selection.</small>
  </details>;
}
