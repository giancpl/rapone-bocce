"use client";

import { useEffect, useMemo, useState } from "react";

type Match = { id: string; round: number; position: number; field: number | null; a: string | null; b: string | null; scoreA: number; scoreB: number; status: "SCHEDULED" | "LIVE" | "FINISHED"; winner: string | null };
type Tournament = { name: string; edition: string; status: "SETUP" | "READY" | "LIVE" | "FINISHED"; teams: number; updatedAt: string; matches: Match[] };

export default function Public({ initial }: { initial: Tournament | null }) {
  const [tournament, setTournament] = useState<Tournament | null>(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Aggiornamento non disponibile");
        setTournament(data);
        setError("");
      } catch (reason: any) {
        setError(reason.message || "Aggiornamento non disponibile");
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, []);

  if (!tournament) return <main className="landing"><div className="landingCard"><p className="kicker">RAPONE BOCCE</p><h1>Il torneo<br />è in preparazione.</h1><p>Il tabellone, i campi e i risultati compariranno qui in tempo reale.</p>{error && <p className="softError">{error}</p>}</div></main>;

  if (tournament.status === "SETUP") return <main className="landing"><div className="landingCard"><p className="kicker">{tournament.edition}</p><h1>{tournament.name}<br />sta per iniziare.</h1><p>Le coppie sono in fase di registrazione. Torna qui per seguire sorteggio e incontri.</p></div></main>;

  const live = tournament.matches.filter(match => match.status === "LIVE");
  const next = tournament.matches.filter(match => match.status === "SCHEDULED" && match.a && match.b);
  const completed = tournament.matches.filter(match => match.status === "FINISHED" && match.a && match.b).slice().reverse();
  const champion = tournament.status === "FINISHED" ? completed[0]?.winner : null;
  const status = tournament.status === "READY" ? "Sorteggio pronto" : tournament.status === "FINISHED" ? "Torneo concluso" : "In diretta";

  return <main className="publicApp"><header className="siteHeader"><div><p className="kicker">{tournament.edition}</p><h1>{tournament.name}</h1></div><span className={`statusPill ${tournament.status.toLowerCase()}`}>{tournament.status === "LIVE" && <i />} {status}</span></header>{champion && <section className="champion"><span>🏆</span><div><p className="kicker">Vincitori</p><strong>{champion}</strong></div></section>}<section className="scoreboard"><div><span>In corso</span><strong>{live.length}</strong></div><div><span>In attesa</span><strong>{next.length}</strong></div><div><span>Coppie</span><strong>{tournament.teams}</strong></div></section>{error && <p className="softError">Connessione aggiornata al prossimo tentativo: {error}</p>}<section className="boardSection"><div className="sectionHeading"><div><p className="kicker">Bacheca</p><h2>{live.length ? "In campo ora" : tournament.status === "READY" ? "Pronti al via" : "Nessun incontro in corso"}</h2></div><span className="muted">Aggiornamento automatico</span></div><div className="matchGrid">{live.length ? live.map(match => <MatchCard key={match.id} match={match} prominent />) : next.slice(0, 3).map(match => <MatchCard key={match.id} match={match} />)}{!live.length && !next.length && <Empty text="Gli incontri saranno visualizzati qui." />}</div></section><section className="boardSection"><div className="sectionHeading"><div><p className="kicker">Tabellone</p><h2>Cammino verso la finale</h2></div><span className="muted">Scorri orizzontalmente</span></div><Bracket matches={tournament.matches} /></section>{completed.length > 0 && <section className="boardSection"><div className="sectionHeading"><div><p className="kicker">Ultimi risultati</p><h2>Partite concluse</h2></div></div><div className="resultList">{completed.slice(0, 6).map(match => <MatchCard key={match.id} match={match} compact />)}</div></section>}<footer className="siteFooter">Aggiornato alle {new Date(tournament.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</footer></main>;
}

function roundName(round: number, total: number) { const remaining = 2 ** (total - round + 1); return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finale"; }

function Bracket({ matches }: { matches: Match[] }) {
  const rounds = useMemo(() => [...new Set(matches.map(match => match.round))].sort((a, b) => a - b), [matches]);
  return <div className="bracketScroll"><div className="bracket">{rounds.map((round, index) => <div className="bracketRound" key={round}><div className="roundLabel"><span>{roundName(round, rounds.length)}</span><small>{matches.filter(match => match.round === round).length} incontri</small></div><div className="roundMatches">{matches.filter(match => match.round === round).map(match => <MatchCard key={match.id} match={match} bracket />)}</div></div>)}</div></div>;
}

function MatchCard({ match, prominent = false, compact = false, bracket = false }: { match: Match; prominent?: boolean; compact?: boolean; bracket?: boolean }) {
  const labels = match.status === "LIVE" ? `Campo ${match.field || "—"}` : match.status === "SCHEDULED" ? "In attesa" : "Conclusa";
  return <article className={`matchCard ${prominent ? "prominent" : ""} ${compact ? "compact" : ""} ${bracket ? "bracketCard" : ""} ${match.status.toLowerCase()}`}><header><span className="matchMeta">{labels}</span>{match.status === "LIVE" && <span className="liveDot">Live</span>}</header><div className={`teamLine ${match.winner === match.a ? "winner" : ""}`}><b>{match.a || "Da definire"}</b><strong>{match.status === "SCHEDULED" ? "—" : match.scoreA}</strong></div><div className={`teamLine ${match.winner === match.b ? "winner" : ""}`}><b>{match.b || "Da definire"}</b><strong>{match.status === "SCHEDULED" ? "—" : match.scoreB}</strong></div></article>;
}

function Empty({ text }: { text: string }) { return <div className="emptyState">{text}</div>; }
