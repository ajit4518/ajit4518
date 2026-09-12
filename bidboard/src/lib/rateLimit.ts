import { createHash } from "node:crypto";
import { query } from "./db";

/**
 * Fixed-window counter, coarse on purpose.
 *
 * The IP is hashed before it is stored, so the table holds no directly
 * identifying data while still stopping one source from flooding the
 * directory. Good enough for a submit form; not a substitute for a real
 * edge rate limiter under load.
 */
export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowMinutes: number;
}): Promise<{ ok: boolean; remaining: number }> {
  const bucket = createHash("sha256").update(opts.key).digest("hex").slice(0, 32);

  const rows = await query<{ count: number }>(
    `INSERT INTO rate_limits (bucket, window_start, count)
     VALUES ($1, date_trunc('hour', now()) +
       (floor(extract(minute from now()) / $2) * $2 || ' minutes')::interval, 1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [bucket, opts.windowMinutes],
  );

  const count = rows[0]?.count ?? 0;
  return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count) };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
