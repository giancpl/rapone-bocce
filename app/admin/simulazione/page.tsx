"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Public from "../../../components/Public";
import { assertBocceScore, bracketSize, firstRoundSlots, MAX_CONCURRENT_MATCHES, MAX_SCORE, MAX_TEAMS, MIN_WINNING_SCORE, nextMatchCoordinate, repechageCutoff, repechagePlan, repechagePlayoffWave, shuffleItems } from "../../../lib/bracket";

type Mode = "PRELIMINARIES" | "REPECHAGE";
type Match = { id: string; round: number; position: number; a: string | null; b: string | null; scoreA?: number; scoreB?: number; winner?: string; bye?: boolean };
type Score = { a: string; b: string };
const roundName = (round: number, total: number) => { if (round === 0) return "Spareggi"; const remaining = 2 ** (total - round + 1); return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finali"; };
const copy = (matches: Match[]) => matches.map(match => ({ ...match }));
const teamNames = (count: number) => Array.from({ length: count }, (_, index) => "Coppia " + (index + 1));
const target = (matches: Match[], match: Match) => {
  const next = nextMatchCoordinate(match.round, match.position);
  return matches.find(item => item.round === next.round && item.position === next.position);
};
const totalRound = (matches: Match[]) => Math.max(0, ...matches.filter(match => match.round > 0).map(match => match.round));
function outgoing(matches: Match[], match: Match) {
  if (match.round <= 0 || match.round >= totalRound(matches)) return [] as Array<{ match: Match; slot: "a" | "b"; outcome: "winner" | "loser" }>;
  const coordinate = nextMatchCoordinate(match.round, match.position);
  const next = target(matches, match);
  const edges: Array<{ match: Match; slot: "a" | "b"; outcome: "winner" | "loser" }> = [];
  if (next) edges.push({ match: next, slot: coordinate.slot, outcome: "winner" });
  if (match.round === totalRound(matches) - 1) {
    const third = matches.find(item => item.round === totalRound(matches) && item.position === 1);
    if (third) edges.push({ match: third, slot: coordinate.slot, outcome: "loser" });
  }
  return edges;
}
function place(matches: Match[], match: Match, winner: string) {
  const loser = winner === match.a ? match.b : match.a;
  for (const edge of outgoing(matches, match)) {
    const participant = edge.outcome === "winner" ? winner : loser;
    if (participant) edge.match[edge.slot] = participant;
  }
}
function settle(input: Match[], withByes: boolean) {
  const matches = copy(input);
  if (!withByes) return matches;
  let changed = true;
  while (changed) {
    changed = false;
    const lastRound = totalRound(matches);
    for (const match of matches) {
      if (match.winner !== undefined || match.round === lastRound && match.position === 1) continue;
      const previous = [matches.find(item => item.round === match.round - 1 && item.position === match.position * 2), matches.find(item => item.round === match.round - 1 && item.position === match.position * 2 + 1)];
      if (match.round > 1 && !previous.every(item => item?.winner !== undefined)) continue;
      const winner = match.a || match.b;
      if (winner && !(match.a && match.b)) {
        Object.assign(match, { winner, bye: true });
        place(matches, match, winner);
        changed = true;
      }
    }
  }
  return matches;
}
function build(count: number, mode: Mode) {
  const size = bracketSize(count), slots = firstRoundSlots(shuffleItems(teamNames(count))), matches: Match[] = [];
  const rounds = Math.log2(size);
  for (let round = 1; round <= rounds; round++) for (let position = 0; position < size / 2 ** round; position++) matches.push({ id: round + "-" + position, round, position, a: round === 1 ? slots[position * 2] : null, b: round === 1 ? slots[position * 2 + 1] : null });
  if (count >= 4) matches.push({ id: rounds + "-third", round: rounds, position: 1, a: null, b: null });
  return settle(matches, mode === "PRELIMINARIES");
}
function clearDescendants(input: Match[], source: Match) {
  const matches = copy(input);
  const start = matches.find(item => item.id === source.id);
  if (!start) return matches;
  const queue = [start], visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of outgoing(matches, current)) {
      edge.match[edge.slot] = null;
      Object.assign(edge.match, { winner: undefined, scoreA: undefined, scoreB: undefined, bye: false });
      if (!visited.has(edge.match.id)) {
        visited.add(edge.match.id);
        queue.push(edge.match);
      }
    }
  }
  return matches;
}
function candidates(matches: Match[], preliminaryIds?: Set<string>) { return matches.filter(match => match.round === 1 && (!preliminaryIds || preliminaryIds.has(match.id)) && match.winner && !match.bye && match.a && match.b).map(match => { const loser = match.winner === match.a ? match.b! : match.a!; const scored = match.winner === match.a ? match.scoreB! : match.scoreA!; const conceded = match.winner === match.a ? match.scoreA! : match.scoreB!; return { id: loser, name: loser, scored, conceded, difference: scored - conceded }; }).sort((a, b) => b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name)); }
function progressSimulatedRepechage(input: Match[], count: number, preliminaryIds: Set<string>) {
  const plan = repechagePlan(count), ranked = candidates(input, preliminaryIds);
  if (!plan.selections || ranked.length !== plan.preliminaryMatches) return { matches: input, finalized: !plan.selections, message: "" };
  const cutoff = repechageCutoff(ranked, plan.selections), playoffs = input.filter(match => match.round === 0);
  let qualifiers: typeof ranked;
  if (cutoff.needsPlayoff) {
    const eliminated = new Set(playoffs.filter(match => match.winner).map(match => match.winner === match.a ? match.b : match.a));
    const survivors = cutoff.tied.filter(team => !eliminated.has(team.name));
    if (playoffs.some(match => !match.winner)) return { matches: input, finalized: false, message: "Completa gli spareggi automatici in corso." };
    if (survivors.length > cutoff.remaining) {
      const position = playoffs.reduce((max, match) => Math.max(max, match.position + 1), 0);
      const wave = repechagePlayoffWave(survivors, cutoff.remaining).map((pair, index) => ({ id: "spareggio-" + (position + index), round: 0, position: position + index, a: pair[0].name, b: pair[1].name }));
      return { matches: [...input, ...wave], finalized: false, message: "Parità sulla soglia: creati " + wave.length + (wave.length === 1 ? " spareggio." : " spareggi.") };
    }
    qualifiers = [...cutoff.guaranteed, ...survivors];
  } else qualifiers = cutoff.ranked.slice(0, plan.selections);
  const names = new Set(ranked.map(team => team.name)), matches = copy(input);
  const targets = matches.filter(match => match.round === 1 && !match.winner && [match.a, match.b].filter(name => name && !names.has(name)).length === 1).sort((a, b) => a.position - b.position);
  if (targets.length < qualifiers.length) return { matches: input, finalized: false, message: "Posti di ripescaggio non disponibili." };
  for (const target of targets) { if (target.a && names.has(target.a)) target.a = null; if (target.b && names.has(target.b)) target.b = null; }
  qualifiers.forEach((team, index) => { const target = targets[index]; if (target.a) target.b = team.name; else target.a = team.name; });
  return { matches: settle(matches, true), finalized: true, message: "Ripescaggi completati automaticamente." };
}

export default function Simulation() {
  const [countInput, setCountInput] = useState("8"), [mode, setMode] = useState<Mode>("PRELIMINARIES"), [matches, setMatches] = useState<Match[]>([]), [scores, setScores] = useState<Record<string, Score>>({}), [message, setMessage] = useState(""), [view, setView] = useState<"control" | "public">("control"), [repechageFinalized, setRepechageFinalized] = useState(false), [preliminaryIds, setPreliminaryIds] = useState<Set<string>>(new Set());
  const parsedCount = Number(countInput);
  const count = Number.isInteger(parsedCount) ? Math.min(MAX_TEAMS, Math.max(2, parsedCount)) : 2;
  const setCount = (value: number) => setCountInput(String(Math.min(MAX_TEAMS, Math.max(2, Math.floor(value)))));
  const generate = () => { const safe = count, generated = build(safe, mode); setCount(safe); setMatches(generated); setPreliminaryIds(new Set(generated.filter(match => match.round === 1 && match.a && match.b).map(match => match.id))); setScores({}); setMessage(""); setRepechageFinalized(mode === "PRELIMINARIES" || !repechagePlan(safe).selections); setView("control"); };
  const reset = () => { setMatches([]); setPreliminaryIds(new Set()); setScores({}); setMessage("Simulazione azzerata. I dati ufficiali non sono stati toccati."); setRepechageFinalized(false); setView("control"); };
  const updateMatch = (id: string, key: "a" | "b", value: string) => setMatches(current => { const matches = clearDescendants(current, current.find(match => match.id === id)!); const match = matches.find(item => item.id === id)!; Object.assign(match, { [key]: value.trim() || null, winner: undefined, scoreA: undefined, scoreB: undefined, bye: false }); return settle(matches, mode === "PRELIMINARIES" || repechageFinalized); });
  const finish = (match: Match, a: number, b: number) => { try { if (!match.a || !match.b) throw Error("Completa entrambe le coppie prima di registrare il risultato"); assertBocceScore(a, b); setMessage(""); const next = match.round === 0 ? copy(matches) : clearDescendants(matches, match); const item = next.find(value => value.id === match.id)!; Object.assign(item, { scoreA: a, scoreB: b, winner: a > b ? item.a! : item.b!, bye: false }); if (item.round > 0) place(next, item, item.winner!); let updated = settle(next, mode === "PRELIMINARIES" || repechageFinalized); if (mode === "REPECHAGE" && (!repechageFinalized || item.round === 0)) { const progress = progressSimulatedRepechage(updated, count, preliminaryIds); updated = progress.matches; setRepechageFinalized(progress.finalized); setMessage(progress.message); } setMatches(updated); setScores(current => ({ ...current, [match.id]: { a: "", b: "" } })); } catch (error: any) { setMessage(error.message || "Risultato non valido"); } };
  const reopenResult = (match: Match) => {
    if (mode === "REPECHAGE" && (preliminaryIds.has(match.id) || match.round === 0)) {
      const oldCandidates = new Set(candidates(matches, preliminaryIds).map(team => team.name));
      const originalResults = matches.filter(item => preliminaryIds.has(item.id));
      const next = copy(matches).filter(item => item.round !== 0 || match.round === 0 && item.position <= match.position);
      for (const item of next.filter(value => value.round === 1 && !preliminaryIds.has(value.id))) {
        if (item.a && oldCandidates.has(item.a)) item.a = null;
        if (item.b && oldCandidates.has(item.b)) item.b = null;
        Object.assign(item, { winner: undefined, scoreA: undefined, scoreB: undefined, bye: false });
      }
      for (const item of next.filter(value => value.round > 1)) Object.assign(item, { a: null, b: null, winner: undefined, scoreA: undefined, scoreB: undefined, bye: false });
      const source = next.find(item => item.id === match.id);
      if (source) Object.assign(source, { winner: undefined, scoreA: undefined, scoreB: undefined, bye: false });
      for (const original of originalResults) {
        const current = next.find(item => item.id === original.id);
        if (current?.winner) place(next, current, current.winner);
      }
      setMatches(settle(next, false));
      setScores(current => ({ ...current, [match.id]: { a: "", b: "" } }));
      setRepechageFinalized(false);
      setMessage(match.round === 0 ? "Spareggio riaperto: gli abbinamenti successivi saranno ricalcolati." : "Preliminare riaperto: classifica e ripescaggi saranno ricalcolati.");
      return;
    }
    const next = clearDescendants(matches, match);
    const source = next.find(item => item.id === match.id)!;
    Object.assign(source, { winner: undefined, scoreA: undefined, scoreB: undefined, bye: false });
    setMatches(settle(next, mode === "PRELIMINARIES" || repechageFinalized));
    setScores(current => ({ ...current, [match.id]: { a: "", b: "" } }));
  };
  const simulate = (match: Match) => finish(match, MIN_WINNING_SCORE + (match.position + match.round) % (MAX_SCORE - MIN_WINNING_SCORE + 1), (match.position * 3 + match.round) % MIN_WINNING_SCORE);
  const rounds = [...new Set(matches.map(match => match.round))];
  const ready = useMemo(() => matches.filter(match => !match.winner && match.a && match.b).sort((a, b) => a.round - b.round || a.position - b.position), [matches]);
  const liveIds = new Set(ready.slice(0, MAX_CONCURRENT_MATCHES).map(match => match.id));
  const plan = repechagePlan(count), rankedLosers = candidates(matches, preliminaryIds), playoffMatches = matches.filter(match => match.round === 0), completedPreliminaries = matches.filter(match => match.round === 1 && match.winner && !match.bye).length;
  const publicState = matches.length ? { name: "Torneo di Bocce", edition: "51° edizione · PROVA", status: matches.every(match => match.winner) ? "FINISHED" as const : "LIVE" as const, teams: count, updatedAt: new Date().toISOString(), matches: matches.map(match => ({ id: match.id, round: match.round, position: match.position, field: null, a: match.a, b: match.b, scoreA: match.scoreA || 0, scoreB: match.scoreB || 0, status: match.winner ? "FINISHED" as const : liveIds.has(match.id) ? "LIVE" as const : "SCHEDULED" as const, winner: match.winner || null })) } : null;
  if (view === "public" && publicState) return <><div className="previewDock"><b>Anteprima pubblica · dati isolati</b><button className="minorButton" onClick={() => setView("control")}>Torna ai controlli</button></div><Public key={JSON.stringify(matches)} initial={publicState} preview /></>;
  return <main className="simulation"><header className="adminHeader"><div><p className="kicker">Ambiente isolato</p><h1>Simulatore torneo</h1></div><Link className="minorButton" href="/admin">← Torna alla regia</Link></header><section className="simulationHero"><div><p className="kicker">Stesse regole, nessun dato reale</p><h2>Prova un torneo completo</h2><p>Bye, risultati e ripescaggi seguono le regole del torneo ufficiale.</p></div><div className="simControls"><label className="teamStepper">Coppie<div><button type="button" aria-label="Diminuisci coppie" onClick={() => setCount(count - 1)}>−</button><input type="number" min="2" max={MAX_TEAMS} step="1" inputMode="numeric" value={countInput} onChange={event => setCountInput(event.target.value)} onBlur={() => setCount(count)} /><button type="button" aria-label="Aumenta coppie" onClick={() => setCount(count + 1)}>+</button></div></label><label>Formula<select value={mode} onChange={event => setMode(event.target.value as Mode)}><option value="PRELIMINARIES">Preliminari</option><option value="REPECHAGE">Ripescaggi</option></select></label><button className="primaryButton" onClick={generate}>Genera prova</button>{matches.length > 0 && <button className="minorButton" onClick={() => setView("public")}>Vista pubblica</button>}{matches.length > 0 && <button className="textButton testReset" onClick={reset}>Azzera</button>}</div></section>{message && <p className="notice">{message}</p>}{mode === "REPECHAGE" && plan.selections > 0 && matches.length > 0 && !repechageFinalized && <section className="adminPanel simulationRepechage"><div className="sectionHeading"><div><p className="kicker">Ripescaggi automatici</p><h2>{playoffMatches.length ? "Spareggi per la parità" : completedPreliminaries === plan.preliminaryMatches ? "Calcolo della classifica" : "In attesa dei preliminari"}</h2></div><span className="muted">{completedPreliminaries + " di " + plan.preliminaryMatches + " preliminari conclusi"}</span></div><p className="muted">Differenza punti e punti segnati determinano i ripescati. Solo la parità sulla soglia genera spareggi.</p>{rankedLosers.length > 0 && <div className="repechageRanking">{rankedLosers.map((team, index) => <div key={team.name}><span>#{index + 1}</span><b>{team.name}</b><small>{team.scored}–{team.conceded} · diff. {team.difference}</small></div>)}</div>}{playoffMatches.length > 0 && <div className="playoffSummary">{playoffMatches.map(match => <div key={match.id}><span>{match.winner ? "Finita" : liveIds.has(match.id) ? "In corso" : "In attesa"}</span><b>{match.a} – {match.b}</b>{match.winner && <small>Vince {match.winner}</small>}</div>)}</div>}</section>}{!matches.length ? <div className="emptyState">Scegli numero di coppie e formula per generare una prova.</div> : <section className="adminPanel"><div className="sectionHeading"><div><p className="kicker">Tabellone di prova</p><h2>Regia incontri</h2></div><span className="muted">Gli incontri pronti compaiono automaticamente qui.</span></div><div className="simulationBoard">{rounds.map(round => <div className="simRound" key={round}><h3>{roundName(round, Math.max(0, ...rounds))}</h3>{matches.filter(match => match.round === round).map(match => { const score = scores[match.id] || { a: "", b: "" }; return <article className="simMatch manual" key={match.id}>{round === Math.max(0, ...rounds) && <small className="simPlacement">{match.position === 0 ? "Finale 1°/2° posto" : "Finale 3°/4° posto"}</small>}<input aria-label="Prima coppia" readOnly={match.round === 0} value={match.a || ""} placeholder="Da definire" onChange={event => updateMatch(match.id, "a", event.target.value)} /><strong>{match.winner ? (match.bye ? "Bye" : match.scoreA + " – " + match.scoreB) : liveIds.has(match.id) ? "In corso" : "—"}</strong><input aria-label="Seconda coppia" readOnly={match.round === 0} value={match.b || ""} placeholder="Da definire" onChange={event => updateMatch(match.id, "b", event.target.value)} />{match.a && match.b && !match.winner && <div className="simResult"><input aria-label="Punteggio prima coppia" type="number" min="0" max={MAX_SCORE} placeholder="0" value={score.a} onChange={event => setScores(current => ({ ...current, [match.id]: { ...score, a: event.target.value } }))} /><span>–</span><input aria-label="Punteggio seconda coppia" type="number" min="0" max={MAX_SCORE} placeholder="0" value={score.b} onChange={event => setScores(current => ({ ...current, [match.id]: { ...score, b: event.target.value } }))} /><button className="minorButton" onClick={() => finish(match, Number(score.a), Number(score.b))}>Registra</button><button className="textButton" onClick={() => simulate(match)}>Simula</button></div>}{match.winner && !match.bye && <button className="textButton simEdit" onClick={() => reopenResult(match)}>Modifica risultato</button>}</article>; })}</div>)}</div></section>}</main>;
}
