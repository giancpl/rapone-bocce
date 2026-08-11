import bcrypt from "bcryptjs";
import crypto from "crypto";
export const hashPassword=(p:string)=>bcrypt.hash(p,12);
export const verifyPassword=(p:string,h:string)=>bcrypt.compare(p,h);
export const newToken=()=>crypto.randomBytes(32).toString("base64url");
export const hashToken=(t:string)=>crypto.createHash("sha256").update(t).digest("hex");
export const SESSION_COOKIE="rapone_admin";
export const sessionExpiry=()=>new Date(Date.now()+1000*60*60*12);
export const MAX_NAME_LENGTH=80;
