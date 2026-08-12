"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Team = { id: string; name: string };
type Score = { a: string; b: string };

export default function Admin() {
  const [state, setState] = useState<any | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [edition, setEdition] = useState("51ª Edizione");
  const [team, setTeam] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [message, setMessage] = useState("");
  const [scores, setScores] = useState<Record<string, Score>>({});

  const refresh = async () => {
    try {
      setMessage("");
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error("Impossibile collegarsi al database");
      setState(data);
    } catch (error: any) {
      setMessage(error.message || "Impossibile aggiornare la pagina");
      setState(null);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function call(url: string, body: any = {}, method = "POST") {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || "Operazione non riuscita");
    return data;
  }

  if (state === undefined) return <main className="auth">Caricamento…</main>;
  if (state === null) return <Auth title="Crea torneo" password={password} setPassword={setPassword} name={name} setName={setName} edition={edition} setEdition={setEdition} message={message} submit={async () => { try { await call("/api/setup", { name, edition, password }); setAuthenticated(true); await refresh(); } catch (error: any) { setMessage(error.message); } }} />;
  if (!authenticated) return <Auth title="Accedi" password={password} setPassword={setPassword} message={message} submit={async () => { try { await call("/api/login", { password }); setAuthenticated(true); setMessage(""); } catch (error: any) { setMessage(error.message); } }} />;

  const saveSettings = async () => { try { await call("/api/setup", { name, edition }, "PATCH"); await refresh(); } catch (error: any) { setMessage(error.message); } };
  const addTeam = async () => { try { await call("/api/teams", { name: team }); setTeam(""); await refresh(); } catch (error: any) { setMessage(error.message); } };
  const removeTeam = async (id: string) => { try { await call("/api/teams", { id }, "DELETE"); await refresh(); } catch (error: any) { setMessage(error.message); } };
  const action = async (url: string) => { try { await call(url); await refresh(); } catch (error: any) { setMessage(error.message); } };
  const saveScore = async (match: any) => { try { const score = scores[match.id] || { a: "", b: "" }; await call("/api/match", { id: match.id, a: score.a, b: score.b }); setScores({ ...scores, [match.id]: { a: "", b: "" } }); await refresh(); } catch (error: any) { setMessage(error.message); } };

  return <main className="admin"><header><b>{state.name.toUpperCase()}</b><div><Link href="/">Pubblico</Link><button className="logout" onClick={() => call("/api/logout").then(() => setAuthenticated(false)).catch((error: any) => setMessage(error.message))}>Esci</button></div></header><div className="bar"><strong>{state.status === "SETUP" ? "Configurazione" : state.status === "READY" ? "Sorteggio pronto" : state.status === "LIVE" ? "Partite" : "Torneo terminato"}</strong><span>{state.teams} coppie · 2 campi</span></div>{message && <div className="msg" role="alert">{message}</div>}{state.status === "SETUP" && <><section><h1>Impostazioni torneo</h1><div className="add"><input aria-label="Nome torneo" value={name || state.name} onChange={event => setName(event.target.value)} /><input aria-label="Edizione" value={edition || state.edition} onChange={event => setEdition(event.target.value)} /><button onClick={saveSettings}>Salva</button></div></section><section><h1>Coppie</h1><div className="add"><input maxLength={80} placeholder="Nome coppia" value={team} onChange={event => setTeam(event.target.value)} onKeyDown={event => event.key === "Enter" && void addTeam()} /><button onClick={addTeam}>Aggiungi</button></div><div className="teamList">{(state.teamList as Team[]).map(item => <div className="teamRow" key={item.id}><span>{item.name}</span><button onClick={() => removeTeam(item.id)}>Rimuovi</button></div>)}</div><button className="mainBtn" disabled={state.teams < 2} onClick={() => action("/api/draw")}>Genera sorteggio definitivo</button></section></>}{state.status === "READY" && <section><h1>Sorteggio pronto</h1><p>Il tabellone è definitivo. Le bye sono già state avanzate automaticamente.</p><button className="mainBtn" onClick={() => action("/api/start")}>Avvia torneo</button></section>}{(state.status === "LIVE" || state.status === "FINISHED") && <section><h1>{state.status === "FINISHED" ? "Torneo terminato" : "Partite"}</h1>{state.matches.filter((match: any) => match.a && match.b).map((match: any) => { const score = scores[match.id] || { a: "", b: "" }; return <div className="adminMatch" key={match.id}><small>Turno {match.round}<br />Campo {match.field || "—"}</small><b>{match.a}</b><strong>{match.scoreA} — {match.scoreB}</strong><b>{match.b}</b>{match.status === "LIVE" && <div className="scoreForm"><input aria-label={`Punteggio ${match.a}`} inputMode="numeric" type="number" min="0" max="11" value={score.a} onChange={event => setScores({ ...scores, [match.id]: { ...score, a: event.target.value } })} /><input aria-label={`Punteggio ${match.b}`} inputMode="numeric" type="number" min="0" max="11" value={score.b} onChange={event => setScores({ ...scores, [match.id]: { ...score, b: event.target.value } })} /><button onClick={() => saveScore(match)}>Conferma</button></div>}{match.status === "FINISHED" && state.status !== "FINISHED" && <button onClick={() => { const a = window.prompt(`Punteggio ${match.a}`, String(match.scoreA)); const b = window.prompt(`Punteggio ${match.b}`, String(match.scoreB)); if (a !== null && b !== null) void call("/api/match", { id: match.id, a, b }, "PATCH").then(refresh).catch((error: any) => setMessage(error.message)); }}>Correggi</button>}</div>; })}</section>}</main>;
}

function Auth({ title, password, setPassword, name, setName, edition, setEdition, message, submit }: any) {
  const creating = title === "Crea torneo";
  return <main className="auth"><form onSubmit={event => { event.preventDefault(); void submit(); }}><div className="mark">51</div><h1>{title}</h1><p>{creating ? "Personalizza il torneo e imposta la password amministratore." : "Inserisci la password del torneo."}</p>{creating && <><input placeholder="Nome torneo" value={name} onChange={event => setName(event.target.value)} /><input placeholder="Edizione (es. 51ª Edizione)" value={edition} onChange={event => setEdition(event.target.value)} /></>}<input autoFocus type="password" minLength={creating ? 10 : 1} placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required /><button className="mainBtn">{title}</button>{message && <div className="msg">{message}</div>}<Link href="/">Pubblico</Link></form></main>;
}
