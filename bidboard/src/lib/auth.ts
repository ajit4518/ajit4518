import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "./db";

export const SESSION_COOKIE = "bb_session";
const SESSION_DAYS = 30;

export type User = { id: string; email: string | null };

/** Opaque 32-byte token. Nothing is signed into the cookie, so there is no
 *  signing key to leak; the token is meaningless without the sessions row. */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<string> {
  const token = newToken();
  await query(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, userId, String(SESSION_DAYS)],
  );
  return token;
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await query<User>(
    `SELECT u.id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token = $1", [token]);
  jar.delete(SESSION_COOKIE);
}

/** Find or create the local user for an authenticated identity. */
export async function upsertUser(email: string | null): Promise<string> {
  if (email) {
    const found = await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    if (found.length) return found[0].id;
  }
  const rows = await query<{ id: string }>(
    "INSERT INTO users (email) VALUES ($1) RETURNING id",
    [email],
  );
  return rows[0].id;
}
