"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import logo from "../logo-hd.png";

const OFFICIAL_START = new Date("2026-08-13T16:00:00+02:00");
type Match = { id: string; round: number; position: number; field: number | null; a: string | null; b: string | null; scoreA: number; scoreB: number; status: "SCHEDULED" | "READY" | "WAITING" | "LIVE" | "FINISHED"; winner: string | null };
type Tournament = { name: string; edition: string; status: "SETUP" | "READY" | "LIVE" | "FINISHED"; drawMode?: "PRELIMINARIES" | "REPECHAGE"; teams: number; updatedAt: string; matches: Match[] };

type RegistrationFormProps = {
  playerOne: string;
  playerTwo: string;
  setPlayerOne: (value: string) => void;
  setPlayerTwo: (value: string) => void;
  submit: (event: React.FormEvent) => void;
  sending: boolean;
  message: string;
};

export default function Public({ initial, preview = false }: { initial: Tournament | null; preview?: boolean }) {
  const [tournament, setTournament] = useState(initial);
  const [error, setError] = useState("");
  const [playerOne, setPlayerOne] = useState("");
  const [playerTwo, setPlayerTwo] = useState("");
  const [registrationMessage, setRegistrationMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (preview) return;
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
    const timer = window.setInterval(refresh, 12000);
    return () => window.clearInterval(timer);
  }, []);

  const requestRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSending(true);
      setRegistrationMessage("");
      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerOne, playerTwo })
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Impossibile inviare la richiesta");
      setPlayerOne("");
      setPlayerTwo("");
      setRegistrationMessage("Richiesta inviata. L'organizzazione la confermerà a breve.");
    } catch (reason: any) {
      setRegistrationMessage(reason.message || "Impossibile inviare la richiesta");
    } finally {
      setSending(false);
    }
  };

  if (!tournament) {
    return <main className="landing"><div className="landingCard"><LandingTop /><p className="kicker">51° edizione</p><h1>Torneo di Bocce</h1><p>Le iscrizioni e il tabellone saranno disponibili qui a breve.</p>{error && <p className="softError">{error}</p>}</div></main>;
  }

  if (tournament.status === "SETUP") {
    return <main className="landing"><div className="landingCard registrationLanding"><LandingTop /><p className="kicker">51° edizione</p><h1>Torneo di Bocce</h1><p>Iscrivi la tua coppia: la richiesta sarà verificata dall'organizzazione prima del sorteggio.</p><RegistrationForm playerOne={playerOne} playerTwo={playerTwo} setPlayerOne={setPlayerOne} setPlayerTwo={setPlayerTwo} submit={requestRegistration} sending={sending} message={registrationMessage} />{error && <p className="softError">{error}</p>}</div></main>;
  }

  const live = tournament.matches.filter(match => match.status === "LIVE");
  const active = tournament.matches.filter(match => match.status === "LIVE" && match.a && match.b);
  const next = tournament.matches.filter(match => ["READY", "WAITING", "SCHEDULED"].includes(match.status) && match.a && match.b);
  const completed = tournament.matches.filter(match => match.status === "FINISHED" && match.a && match.b);
  const totalRounds = [...new Set(tournament.matches.map(match => match.round))].length;
  const champion = tournament.status === "FINISHED" && completed.length ? completed.find(match => match.round === Math.max(...completed.map(item => item.round)))?.winner : null;

  return <main className="publicApp"><PublicHero tournament={tournament} live={live.length} next={next.length} completed={completed.length} totalRounds={totalRounds} />{champion && <section className="champion"><span className="championBadge">1</span><div><p className="kicker">Coppia vincitrice</p><strong>{champion}</strong></div></section>}<nav className="sectionNav" aria-label="Navigazione torneo"><a href="#incontri">Incontri{live.length ? <b>{live.length}</b> : null}</a><a href="#tabellone">Tabellone</a><a href="#risultati">Risultati{completed.length ? <b>{completed.length}</b> : null}</a></nav>{error && <p className="softError">Aggiornamento al prossimo tentativo: {error}</p>}<MatchHighlights active={active} next={next} /><section className="boardSection bracketSection" id="tabellone"><div className="sectionHeading"><div><p className="kicker">Tabellone</p><h2>Verso la finale</h2></div><span className="muted">Scorri orizzontalmente per vedere tutti i turni</span></div><BracketGuide drawMode={tournament.drawMode} matches={tournament.matches} /><Bracket matches={tournament.matches} /></section><section className="boardSection" id="risultati"><div className="sectionHeading"><div><p className="kicker">Archivio</p><h2>Risultati</h2></div><span className="muted">{completed.length} incontri conclusi</span></div><ResultArchive matches={completed} totalRounds={totalRounds} /></section><footer className="siteFooter">Aggiornato alle {new Date(tournament.updatedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</footer></main>;
}

function Brand() {
  return <Image className="brandLogo" src={logo} alt="Logo Pro Loco Rapone" priority />;
}

function LandingTop() {
  return <div className="landingTop"><Brand /><Countdown compact /></div>;
}

function PublicHero({ tournament, live, next, completed, totalRounds }: { tournament: Tournament; live: number; next: number; completed: number; totalRounds: number }) {
  const statusLabel = tournament.status === "READY" ? "Pronti al via" : tournament.status === "LIVE" ? "In diretta" : "Concluso";
  const copy = tournament.status === "READY" ? "Il tabellone è pronto: conto alla rovescia verso la prima bocciata." : tournament.status === "LIVE" ? "Risultati e tabellone aggiornati durante il torneo." : "Il percorso completo della 51° edizione, dai primi turni alla finale.";
  return <header className={"siteHeader heroHeader " + tournament.status.toLowerCase()}><div className="heroIdentity"><Brand /><div><p className="kicker">{tournament.edition}</p><h1>Torneo di Bocce</h1><p className="heroCopy">{copy}</p></div></div><div className="heroPanel"><span className={"statusPill " + tournament.status.toLowerCase()}>{tournament.status === "LIVE" && <i />} {statusLabel}</span>{tournament.status === "READY" ? <Countdown compact /> : <TournamentStats teams={tournament.teams} live={live} next={next} completed={completed} totalRounds={totalRounds} />}</div></header>;
}

function MatchHighlights({ active, next }: { active: Match[]; next: Match[] }) {
  return <section className="boardSection matchHighlights" id="incontri"><div className="sectionHeading"><div><p className="kicker">Incontri</p><h2>Segui il torneo</h2></div><span className={active.some(match => match.status === "LIVE") ? "liveDot" : "muted"}>{active.some(match => match.status === "LIVE") ? "Aggiornamento live" : "Calendario aggiornato"}</span></div><div className="matchHub"><section className="matchLane activeLane"><div className="laneHeading"><div><span className="laneStatus">Adesso</span><h3>In corso</h3></div><b>{active.length}</b></div><div className="matchGrid">{active.map(match => <MatchCard key={match.id} match={match} prominent={match.status === "LIVE"} />)}{!active.length && <Empty text="Nessun incontro è attivo in questo momento." />}</div></section><section className="matchLane nextLane"><div className="laneHeading"><div><span className="laneStatus">In coda</span><h3>In attesa</h3></div><b>{next.length}</b></div><div className="matchGrid">{next.slice(0, 4).map(match => <MatchCard key={match.id} match={match} />)}{!next.length && <Empty text="Gli incontri in attesa compariranno qui." />}</div></section></div></section>;
}

function TournamentStats({ teams, live, next, completed, totalRounds }: { teams: number; live: number; next: number; completed: number; totalRounds: number }) {
  return <div className="tournamentStats" aria-label="Riepilogo torneo"><span><b>{teams}</b><small>coppie</small></span><span><b>{live}</b><small>live</small></span><span><b>{next}</b><small>in attesa</small></span><span><b>{completed}</b><small>risultati</small></span>{totalRounds > 0 && <span><b>{totalRounds}</b><small>turni</small></span>}</div>;
}

function RegistrationForm({ playerOne, playerTwo, setPlayerOne, setPlayerTwo, submit, sending, message }: RegistrationFormProps) {
  return <form className="registrationForm" onSubmit={submit}><label>Primo giocatore<input required placeholder="Nome e cognome" value={playerOne} onChange={event => setPlayerOne(event.target.value)} /></label><label>Secondo giocatore<input required placeholder="Nome e cognome" value={playerTwo} onChange={event => setPlayerTwo(event.target.value)} /></label><button className="primaryButton" disabled={sending}>{sending ? "Invio…" : "Richiedi iscrizione"}</button>{message && <p className={message.startsWith("Richiesta") ? "formSuccess" : "softError"}>{message}</p>}</form>;
}

function Countdown({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const remaining = Math.max(0, OFFICIAL_START.getTime() - now);
  const parts = [{ label: "giorni", value: Math.floor(remaining / 86400000) }, { label: "ore", value: Math.floor(remaining / 3600000) % 24 }, { label: "min", value: Math.floor(remaining / 60000) % 60 }, { label: "sec", value: Math.floor(remaining / 1000) % 60 }];
  return <section className={["countdown", compact ? "compact" : ""].join(" ")}><div><p className="kicker">Inizio ufficiale</p><strong>{remaining ? "13 agosto · ore 16:00" : "Il torneo è iniziato"}</strong></div>{remaining > 0 && <div className="countdownUnits">{parts.map(part => <span key={part.label}><b>{String(part.value).padStart(2, "0")}</b><small>{part.label}</small></span>)}</div>}</section>;
}

function roundName(round: number, total: number) {
  const remaining = 2 ** (total - round + 1);
  return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finale";
}

function BracketGuide({ drawMode, matches }: { drawMode?: Tournament["drawMode"]; matches: Match[] }) { const active = matches.filter(match => match.status === "LIVE").length; const ready = matches.filter(match => ["READY", "WAITING"].includes(match.status)).length; return <div className="bracketGuide"><b>{drawMode === "REPECHAGE" ? "Formula con ripescaggi" : "Formula con preliminari"}</b><span>{drawMode === "REPECHAGE" ? "I preliminari producono la classifica delle migliori sconfitte; l’organizzazione completa poi gli abbinamenti." : "Le coppie senza avversario avanzano automaticamente al turno successivo."}</span><small>{active} in corso · {ready} in attesa</small></div>; }

function Bracket({ matches }: { matches: Match[] }) {
  const rounds = useMemo(() => [...new Set(matches.map(match => match.round))].sort((a, b) => a - b), [matches]);
  const currentRound = useMemo(() => {
    const live = matches.find(match => match.status === "LIVE")?.round;
    const next = matches.find(match => ["LIVE", "WAITING", "READY", "SCHEDULED"].includes(match.status) && match.a && match.b)?.round;
    return live ?? next ?? rounds.at(-1) ?? rounds[0];
  }, [matches, rounds]);
  return <div className="bracketExplorer"><div className="bracketCurrent"><span>Turno attuale</span><b>{currentRound ? roundName(currentRound, rounds.length) : "Tabellone"}</b><small>Scorri con il dito o il trackpad</small></div><div className="bracketScroll" tabIndex={0} aria-label="Tabellone a eliminazione diretta"><div className="bracket">{rounds.map(round => <div className={"bracketRound " + (round === currentRound ? "current" : "")} data-round={round} key={round}><div className="roundLabel"><span>{roundName(round, rounds.length)}</span><small>{matches.filter(match => match.round === round).length} incontri</small></div><div className="roundMatches">{matches.filter(match => match.round === round).map(match => <MatchCard key={match.id} match={match} bracket totalRounds={rounds.length} />)}</div></div>)}</div></div></div>;
}

function ResultArchive({ matches, totalRounds }: { matches: Match[]; totalRounds: number }) {
  const rounds = [...new Set(matches.map(match => match.round))].sort((a, b) => a - b);
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? matches : matches.filter(match => match.round === Number(filter));
  return <>{rounds.length > 1 && <div className="resultFilters" role="group" aria-label="Filtra risultati per turno"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tutti</button>{rounds.map(round => <button key={round} className={filter === String(round) ? "active" : ""} onClick={() => setFilter(String(round))}>{roundName(round, totalRounds)}</button>)}</div>}<div className="resultList">{visible.map(match => <MatchCard key={match.id} match={match} compact />)}{!visible.length && <Empty text="Nessun risultato per questo turno." />}</div></>;
}

function MatchCard({ match, prominent = false, compact = false, bracket = false, totalRounds = 0 }: { match: Match; prominent?: boolean; compact?: boolean; bracket?: boolean; totalRounds?: number }) {
  const isBye = match.status === "FINISHED" && Boolean(match.a) !== Boolean(match.b);
  const label = isBye ? "Passaggio automatico" : match.status === "LIVE" ? "In corso" : ["WAITING", "READY", "SCHEDULED"].includes(match.status) ? "In attesa" : "Finita";
  const scoreA = match.status === "FINISHED" && !isBye ? match.scoreA : "-";
  const scoreB = match.status === "FINISHED" && !isBye ? match.scoreB : "-";
  const destination = bracket && totalRounds ? match.round === totalRounds ? "La coppia vincente diventa campione" : <>Coppia vincente → <b>{roundName(match.round + 1, totalRounds)}</b><em>slot {match.position % 2 === 0 ? "A" : "B"}</em></> : null;
  return <article className={["matchCard", prominent ? "prominent" : "", compact ? "compact" : "", bracket ? "bracketCard" : "", isBye ? "bye" : "", match.status.toLowerCase()].join(" ")}><header><span>{label}</span><span className="matchRound">T{match.round}</span>{match.status === "LIVE" && <span className="liveDot">Live</span>}</header><div className={"teamLine " + (match.winner === match.a ? "winner" : "")}><b>{match.a || "Da definire"}</b><strong>{scoreA}</strong></div><div className={"teamLine " + (match.winner === match.b ? "winner" : "")}><b>{match.b || "Da definire"}</b><strong>{scoreB}</strong></div>{destination && <footer className="bracketPath">{destination}</footer>}</article>;
}

function Empty({ text }: { text: string }) {
  return <div className="emptyState">{text}</div>;
}
