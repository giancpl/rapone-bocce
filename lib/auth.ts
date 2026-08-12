import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashToken, newToken, SESSION_COOKIE, sessionExpiry, verifyPassword } from "./security";

export async function login(tournamentId:string,password:string){
  const t=await prisma.tournament.findUnique({where:{id:tournamentId}});
  if(!t || !(await verifyPassword(password,t.adminPasswordHash))) return false;
  const raw=newToken(), expires=sessionExpiry();
  await prisma.adminSession.deleteMany({where:{expiresAt:{lte:new Date()}}});
  await prisma.adminSession.create({data:{tournamentId,tokenHash:hashToken(raw),expiresAt:expires}});
  (await cookies()).set(SESSION_COOKIE,raw,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",expires});
  return true;
}
export async function requireAdmin(tournamentId:string){
  const raw=(await cookies()).get(SESSION_COOKIE)?.value;
  if(!raw) throw new Error("NON_AUTORIZZATO");
  const s=await prisma.adminSession.findUnique({where:{tokenHash:hashToken(raw)}});
  if(!s || s.tournamentId!==tournamentId || s.expiresAt<=new Date()) throw new Error("NON_AUTORIZZATO");
  return s;
}
export async function confirmAdminPassword(tournamentId:string,password:string){
  const tournament=await prisma.tournament.findUnique({where:{id:tournamentId},select:{adminPasswordHash:true}});
  return Boolean(tournament && typeof password==="string" && await verifyPassword(password,tournament.adminPasswordHash));
}
export async function logout(){
  const raw=(await cookies()).get(SESSION_COOKIE)?.value;
  if(raw) await prisma.adminSession.deleteMany({where:{tokenHash:hashToken(raw)}});
  (await cookies()).delete(SESSION_COOKIE);
}
