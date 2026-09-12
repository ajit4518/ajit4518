import { Pool } from "pg";

const globalForDb = globalThis as unknown as { __pool?: Pool };

export const pool =
  globalForDb.__pool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function withTransaction<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
