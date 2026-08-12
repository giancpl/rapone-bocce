import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const connectionString = process.env.DATABASE_URL ?? process.env.garadiboccerapone_DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL mancante");
  const adapter = new PrismaPg({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  return new PrismaClient({ adapter });
}
export function getPrisma() { const client = globalForPrisma.prisma ?? makeClient(); if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client; return client; }
export const prisma = new Proxy({} as PrismaClient, { get(_target, property) { const value = (getPrisma() as any)[property]; return typeof value === "function" ? value.bind(getPrisma()) : value; } });
