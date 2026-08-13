import { NextResponse } from "next/server";

type ErrorOptions = {
  fallback?: string;
  duplicate?: string;
};

export function apiErrorResponse(error: any, options: ErrorOptions = {}) {
  const raw = String(error?.message || "");
  const code = String(error?.code || "");
  const fallback = options.fallback || "Operazione non riuscita";

  if (raw === "NON_AUTORIZZATO") {
    return NextResponse.json({ error: "Sessione scaduta. Accedi nuovamente." }, { status: 401 });
  }
  if (code === "P2002") {
    return NextResponse.json({ error: options.duplicate || "Questi dati sono già presenti." }, { status: 409 });
  }
  if (code === "P2034") {
    return NextResponse.json({ error: "I dati del torneo sono appena cambiati. Aggiorna e riprova." }, { status: 409 });
  }
  if (code === "P2028" || /expired transaction|Transaction API error/i.test(raw)) {
    return NextResponse.json({ error: "Il database ha impiegato troppo tempo. Riprova l’operazione." }, { status: 503 });
  }
  if (["P1001", "P1002", "P1017"].includes(code)) {
    return NextResponse.json({ error: "Database temporaneamente non raggiungibile. Riprova tra poco." }, { status: 503 });
  }
  if (code.startsWith("P") || /Invalid `prisma|PrismaClient|Transaction API/i.test(raw)) {
    return NextResponse.json({ error: fallback }, { status: 500 });
  }
  return NextResponse.json({ error: raw || fallback }, { status: 400 });
}
