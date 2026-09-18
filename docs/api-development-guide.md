# API Development — A Practical Guide (for Data Engineers)

A conceptual guide: how to think about building an API, what decisions matter,
and what to keep in mind before, during, and after you ship. No code — just the
reasoning, the trade-offs, and checklists you can work through.

---

## 1. What an API really is

An API is a **contract**. Not code, not a framework — a promise about:

- what a caller may ask for,
- what shape the answer comes back in,
- what happens when things go wrong,
- and how long that promise holds.

If you come from data engineering, the closest thing you already own is a
**table schema published to downstream consumers**. Once someone builds a
dashboard on your table, you cannot silently rename a column. An API is the same
thing, with two extra hard parts: it answers **synchronously**, and it is
**live** — a bad deploy breaks consumers in seconds, not at the next nightly run.

Everything in this guide follows from that one idea: **design the contract
first, implement second.**

---

## 2. First question: should this even be an API?

Data engineers get asked for "an API" when what is actually needed is something
else. Choose deliberately:

| Consumer need | Better fit than an API |
|---|---|
| "Give me the whole table for my model" | Bulk export: Parquet on object storage, or warehouse share |
| "I need last night's aggregates in my BI tool" | Direct warehouse access / semantic layer |
| "Load this into my system daily" | Scheduled file drop + manifest |
| "Tell me when X happens" | Event stream / webhook, not polling |
| "Look up one entity, right now, in a product screen" | **Yes — an API** |
| "Let a partner query a slice they're allowed to see" | **Yes — an API** |

Rules of thumb:

- **An API is for selective, low-latency, per-request access.** Tens to
  thousands of rows per call.
- **Bulk movement is not an API job.** If a consumer paginates through ten
  million rows every morning, you have built a slow, expensive, fragile export.
  Give them a file or a share instead — or add an async export endpoint (§9).
- **Push beats poll** when the consumer cares about change, not state.

Deciding this correctly up front saves more pain than any other choice here.

---

## 3. Pick a style

| Style | Good for | Cost to you |
|---|---|---|
| **REST / HTTP+JSON** | Default. Broad tooling, cacheable, easy to debug | Verbose; over/under-fetching |
| **GraphQL** | Many consumers wanting different field subsets | You own query cost control; caching is harder; easy to let callers write accidental full scans |
| **gRPC / protobuf** | Internal service-to-service, high volume, strict schema | Not browser-friendly without a proxy; harder to curl |
| **Webhooks / events** | "Notify me when" | Delivery guarantees, retries, consumer outages |
| **Async job + file** | Large exports, heavy reports | Job state machine, storage lifecycle |

Default to REST unless you have a specific reason. You can add an async export
path later; you rarely regret boring choices here.

---

## 4. Design the contract

### 4.1 Model resources, not actions

Think in **nouns** (things that exist) rather than **verbs** (things you do).
`/customers/1234/orders` rather than `/getCustomerOrders`. Verbs live in the HTTP
method, not the path.

Conventions worth following because everyone expects them:

- Plural collection names: `/orders`, not `/order`.
- Nesting only one level deep; beyond that, filter instead.
  `/orders?customer_id=1234` beats `/customers/1234/warehouse/7/orders`.
- Lowercase, hyphen-or-underscore consistently, never both.
- No file extensions, no verbs, no internal system names in the path. The path is
  public vocabulary — it should read like your business, not like your database.

### 4.2 Use HTTP methods as intended

- **GET** — read, no side effects, safe to retry, cacheable.
- **POST** — create, or trigger something. Not retry-safe unless you make it so (§8).
- **PUT** — replace the whole resource; retry-safe by nature.
- **PATCH** — partial update.
- **DELETE** — remove; retry-safe (second delete is still "gone").

A GET that changes state is the single most common design bug, and it breaks
caches, retries, and crawlers in ways that are very hard to debug.

### 4.3 Status codes that mean something

- `200` OK · `201` Created · `202` Accepted (work queued) · `204` No content
- `400` Bad request (malformed) · `401` Not authenticated · `403` Authenticated
  but not allowed · `404` Not found · `409` Conflict · `422` Valid syntax but
  semantically wrong · `429` Rate limited
- `500` Your bug · `503` Dependency down / shedding load · `504` Upstream timeout

Two habits: **never return `200` with an error inside the body**, and **keep 4xx
vs 5xx honest** — 4xx is the caller's fault, 5xx is yours. Your alerting depends
on that distinction being true.

### 4.4 Response shape

Decide once and apply everywhere:

- A consistent envelope: `data`, plus `meta` for paging/timing, plus `errors`.
- Collections always return an array, even for zero or one result. Consumers
  should never need to branch on shape.
- Field naming consistent across all endpoints (`created_at` everywhere, not
  `createdAt` in one place and `create_time` in another).
- **Omit vs null**: pick a rule. Most predictable is "always present, `null` when
  unknown" — it keeps downstream schemas stable.
- Don't leak internals: no database column names, no stack traces, no internal
  IDs you can't support forever.

---

## 5. Pagination — the thing data APIs get wrong most often

Any endpoint that returns a list needs pagination **from day one**, including
ones you're sure will stay small. Retrofitting it is a breaking change.

**Offset / page-number** (`?page=3&per_page=100`)

- Easy, allows jumping to page N, familiar to users.
- Breaks under writes: if a row is inserted while a consumer walks pages, rows
  shift and the consumer **silently skips or duplicates records**. For pipeline
  correctness this is a real data bug, not a cosmetic one.
- Deep offsets get slower and slower — the database still has to walk everything
  it skips.

**Cursor / keyset** (`?after=<opaque cursor>&limit=100`)

- Stable under concurrent writes, and stays fast at any depth.
- No jumping to arbitrary pages, and you must sort on something unique and stable
  (a monotonic id, or `(updated_at, id)` as a tiebreaker — timestamps alone are
  not unique).
- Make the cursor **opaque** (encoded) so you can change what's inside it later
  without breaking callers.

Guidance: **cursor pagination for anything a machine consumes**; offset only for
human-facing UI where "page 5" is a feature. Always enforce a maximum page size
server-side — if a caller asks for a million rows, cap it and say so in `meta`.
And always return "is there more" explicitly (a `next_cursor`, present or null)
rather than making consumers guess from a short page.

---

## 6. Filtering, sorting, field selection

- Support filtering on a **documented, indexed** set of fields. Every filter you
  expose is a query pattern you promise to keep fast — so don't expose one you
  can't index.
- Ranges matter for data work: `created_after`, `updated_since`. An
  `updated_since` filter (plus a stable sort) is what makes **incremental
  consumption** possible; without it, every consumer does a full scan forever.
- Never accept raw query fragments, sort expressions, or anything resembling SQL
  from the caller. Map caller-supplied names to columns through an allowlist.
- Sparse fieldsets (`?fields=id,name,total`) are a cheap win for wide rows.
- Declare the default sort. An unsorted list is non-deterministic, and
  non-deterministic order silently breaks pagination.

---

## 7. Versioning and change

Assume the API outlives your current understanding of it.

- Version from the first release: `/v1/...` in the path is the simplest thing
  that works and is easy to route, log, and cache.
- **Additive changes are safe**: new endpoint, new optional field, new optional
  parameter. Consumers that ignore unknown fields keep working — say so in your
  docs, so tolerant parsing is expected behavior.
- **Breaking changes**: removing or renaming a field, changing a type, tightening
  validation, changing default sort or page size, changing the meaning of an
  existing field. These need a new version — or a long, loud deprecation.
- Have a written **deprecation policy** before you need it: announce, mark
  responses with a deprecation header, give a real window (a quarter or more for
  external consumers), monitor who is still calling the old thing, then remove.
  Deprecation without usage metrics is guesswork.
- Silently changing a field's *semantics* while keeping its name is the worst
  break of all, because nothing fails — the numbers just become wrong.

---

## 8. Idempotency, retries, and exactly-once wishes

Networks fail after the work is done but before the response arrives. Your caller
cannot tell "didn't happen" from "happened, answer lost", so they will retry.

- GET, PUT, DELETE are naturally retry-safe. Keep them that way.
- For POST that creates something, accept an **idempotency key** supplied by the
  caller: same key, same result, no second side effect. Store keys with the
  outcome for a sensible window.
- Use `409 Conflict` plus optimistic concurrency (a version or ETag the caller
  echoes back) rather than last-write-wins, when concurrent writes are possible.
- Be explicit about **at-least-once** reality. Consumers building pipelines need
  to know whether they must deduplicate, and on what key. Publish the dedup key.
- Tell callers how to retry: which statuses are retryable (`429`, `503`, `504`),
  expect exponential backoff **with jitter**, and honor `Retry-After`. Without
  jitter, every client retries in lockstep and you get a thundering herd.

---

## 9. Long-running and large work

Never let a request block for minutes while you build a report.

The standard pattern: accept the request, return `202` with a job id, expose a
status endpoint, and hand back a **pre-signed download URL** to object storage
when it's done (or call a webhook). Keep jobs idempotent by request fingerprint
so a retry doesn't build the same 40 GB extract twice, and give the artifacts a
lifecycle policy so storage doesn't grow forever.

For moderately large synchronous responses, streaming line-delimited JSON (NDJSON)
lets a consumer process rows without holding everything in memory. Compress
responses. Set an explicit max response size and a request timeout, and document
both — an undocumented limit is discovered in production.

---

## 10. Errors

- One error shape everywhere: a stable machine-readable `code`, a human `message`,
  optional `details` (per-field validation errors), and the `request_id`.
- **The `code` is part of your contract.** Consumers branch on it; the `message`
  is for humans and may be reworded. Don't make people regex your prose.
- Validate at the boundary and reject early with all the problems at once, not
  just the first.
- Never put secrets, SQL, internal hostnames, or stack traces in an error body.
  Log those internally, keyed by `request_id`, and tell the caller the id.
- Decide how partial failures behave in batch endpoints: all-or-nothing, or
  per-item statuses. Either is fine; undocumented is not.

---

## 11. Security — the non-negotiable list

**Transport**: TLS only, no exceptions, no downgrades.

**Authentication** — who are you?

- API keys: simple, fine for server-to-server. Must be revocable and rotatable,
  and must never live in a URL (URLs land in logs, proxies, and browser history).
- OAuth2 / OIDC with short-lived tokens: right answer for user-facing and
  third-party access.
- mTLS: internal, high-trust service meshes.

**Authorization** — what may *this* caller see? This is where data APIs leak.
Authentication alone is not enough: every query must be scoped to the caller's
tenant, region, or row-level entitlements **in the query itself**, not filtered
after the fact in application code, and never by trusting an id in the request
body. Test the "caller asks for someone else's id" case explicitly — it is the
single most common real-world API breach.

**Input validation**: allowlist everything — fields, sort keys, filter operators,
enum values, page sizes, date ranges. Parameterize every query. Treat all input
as hostile, including input from your own internal services.

**Sensitive data**: know what PII/PHI/financial data flows through, minimize what
you return by default, mask or tokenize where possible, and keep it out of logs
(including out of URLs, which get logged everywhere). Know which regulation
applies (GDPR, HIPAA, DPDP, PCI) before launch, not after.

**Abuse control**: rate limits and quotas per key (return `429` plus
`Retry-After` and remaining-quota headers), payload size caps, query complexity
or cost limits, and timeouts on everything. Without per-caller limits, one
consumer's retry loop is an outage for everyone.

**Operational hygiene**: secrets from a manager or environment, never in code or
config files in git; credential rotation that doesn't require downtime;
authentication and authorization failures logged and alerted; an audit trail for
who read what, if your data warrants it.

---

## 12. Performance

- **Index for the access patterns you exposed.** Every documented filter and sort
  needs an index, or it is a future incident.
- Watch for **N+1 queries** — one query for the list, then one per row to enrich
  it. It's the most common reason an API is slow, and it gets worse as data grows.
- Use connection pooling, and size the pool against your database's real limits.
  An API that opens a connection per request will take the database down before
  it takes itself down.
- Push work down to the database (filter, aggregate, limit there) rather than
  pulling rows into the service to process. Same instinct you already have.
- Cache deliberately: HTTP caching (`ETag`, `Cache-Control`) for read-heavy
  endpoints, a cache layer for expensive aggregates. Always have an answer for
  "how stale can this be?" — and expose the answer, so consumers can reason about
  freshness.
- Pre-compute what's expensive and queried often. A materialized rollup refreshed
  on a schedule beats a heroic query on every call.
- Measure percentiles, not averages. p50 tells you nothing about the consumer
  whose job times out; p95 and p99 do.

---

## 13. Reliability

- Timeouts on every outbound call, always shorter than your own inbound timeout.
- Retries with backoff and jitter — and a retry budget, so retries can't
  amplify an outage.
- Circuit breakers on flaky dependencies; fail fast rather than pile up.
- **Graceful degradation**: decide in advance what a partial answer looks like
  when an enrichment source is down — stale-but-served, or an honest error. Both
  are defensible; hanging is not.
- Health endpoints: **liveness** (am I running?) separate from **readiness** (can
  I serve — dependencies reachable, pool warm?). Don't let a readiness probe do
  expensive work.
- Load shedding: reject with `503` when saturated instead of queueing until
  everything times out.
- Know your blast radius: one noisy consumer should not be able to exhaust the
  resources of all the others.

---

## 14. Data-specific concerns (the part generic API guides skip)

This is where your background is an advantage — and where the traps are.

- **Time**: store and return UTC, ISO-8601, with explicit offsets. Say whether a
  timestamp is event time, ingestion time, or update time. Half of all data bugs
  are a timezone or a time-semantics ambiguity.
- **Numbers**: never return money or exact decimals as a JSON float — binary
  floating point will lose cents. Use a string or integer minor units, and
  document the scale. Also document units (bytes vs MB, seconds vs ms) in the
  field name itself where you can.
- **Nulls**: distinguish "no value", "not yet known", and "not permitted to see".
  Collapsing all three into `null` destroys information downstream.
- **Enums**: consumers will hard-code them. Adding a new value is a breaking
  change in practice, so document the closed/open nature up front and tell
  consumers how to handle unknown values.
- **Freshness**: expose `as_of` / `data_updated_at` in `meta`. A consumer must be
  able to tell "no rows because nothing happened" from "no rows because the
  pipeline hasn't run". Without this, silent staleness looks like real zeros.
- **Late-arriving and restated data**: if yesterday's numbers can change, an
  `updated_since` incremental consumer must be able to see the restatement — so
  filter on update time, not event time, and say so loudly.
- **Point-in-time queries**: if consumers need "what did this look like on
  date X", that's a design decision (versioned/temporal storage), not something
  you can add to the API later.
- **Aggregation semantics**: define exactly how a metric is computed, what's
  excluded, what the grain is, and what a null in the denominator does. Two
  endpoints returning slightly different definitions of "active user" is how
  trust dies.
- **Backfills**: when you reload history, consumers need to know. A version or
  generation marker in `meta` helps.
- **Schema as contract**: publish the schema, validate your own responses against
  it in CI, and treat a schema diff as a review-worthy change.

---

## 15. Observability

You cannot operate what you can't see. Minimum viable:

- **Structured logs** (one JSON object per request): method, route template — not
  the raw path with ids in it — status, duration, caller/key id, `request_id`,
  bytes out. No secrets, no PII.
- **Correlation**: accept an incoming request id, generate one if absent, return
  it in the response, and propagate it to every downstream call and log line.
  This is what turns a consumer's "it was slow at 14:03" into a trace.
- **Metrics** — the RED triad per endpoint: **R**ate, **E**rrors, **D**uration
  (as percentiles). Add saturation signals: pool usage, queue depth, memory.
- **Tracing** once more than two services are involved.
- **Alerts on symptoms, not causes**: error rate and latency against an SLO,
  not CPU. And write the SLO down — "99.9% of reads under 300 ms" is a decision,
  not a wish.
- **Usage analytics per consumer and per endpoint.** You need this to deprecate
  anything safely, to spot abuse, and to know what's actually load-bearing.

---

## 16. Testing

- **Unit tests** for validation, mapping, and business rules.
- **Contract tests** against the published schema, in CI, failing the build on an
  unintended break. This is the highest-value test an API can have.
- **Integration tests** against a real database with realistic data — not three
  hand-written rows. Volume changes behavior.
- **Authorization tests**: caller A must not be able to read caller B's data.
  Write one per entitlement rule.
- **Edge cases**: empty result, one row, max page size, deep pagination, bad
  cursor, expired token, huge date range, unicode, nulls, duplicate submission
  with the same idempotency key.
- **Load tests** before launch, at the volume you promised, with the query mix
  you expect. Note where it breaks — you'll want that number during an incident.
- **Migration/backward-compat tests**: old client, new server, still fine.

---

## 17. Documentation

An undocumented API does not exist. Write the **OpenAPI (or protobuf) spec
first** — it forces the contract decisions before code, and generates clients,
validators, and reference docs for free.

Ship with it:

- Auth: how to get a credential, how to send it, how to rotate it.
- Every endpoint: parameters, types, required/optional, defaults, limits.
- Realistic request and response examples, including an error example.
- Pagination instructions, and a worked "how to consume incrementally" recipe —
  this one page saves you more support time than anything else.
- Rate limits, quotas, and expected retry behavior.
- Error code table with what the caller should *do* about each one.
- Freshness/SLA statement and support contact.
- A changelog and the deprecation policy.

---

## 18. Operating it

- Config and secrets from the environment; identical artifact across
  dev/staging/prod.
- Migrations that are backward-compatible for at least one deploy (expand →
  migrate → contract), so a rollback doesn't take data with it.
- Rollout you can undo: canary or blue-green, health-gated, rollback rehearsed.
- Ownership: a named owner, an on-call path, and a runbook for the top three
  failure modes.
- Cost awareness: egress, compute per call, storage for exports. An API that's
  cheap at a thousand calls a day can be surprising at a million.
- A sunset process you've actually used at least once.

---

## 19. Checklists

### Before writing anything

- [ ] Who are the consumers, and is this genuinely a per-request access pattern?
- [ ] What are the top 5 questions they will ask, in their words?
- [ ] Expected volume: calls/sec, rows/call, peak vs average?
- [ ] Latency target and acceptable staleness, as numbers?
- [ ] Source of truth, and how fresh is it actually?
- [ ] Who may see which rows/columns? Any PII?
- [ ] Is a file export or event stream the better answer?
- [ ] Who owns this in a year?

### Design review

- [ ] Resources and field names read like the business, not the database
- [ ] Methods and status codes used correctly; no state-changing GETs
- [ ] Consistent envelope, field naming, and null policy
- [ ] Pagination chosen and justified; max page size enforced; stable sort
- [ ] Filters documented and indexed; `updated_since` available for incrementals
- [ ] Versioning and deprecation policy written down
- [ ] Idempotency for writes; retry guidance for callers
- [ ] Error codes enumerated and stable
- [ ] Authz scoped inside the query, tested per entitlement
- [ ] Rate limits, quotas, payload caps, timeouts
- [ ] Time, decimal, unit, and freshness semantics documented
- [ ] OpenAPI spec exists and is the source of truth

### Pre-launch

- [ ] Contract tests and authz tests green in CI
- [ ] Load tested at promised volume; breaking point known
- [ ] Logs structured, `request_id` propagated end to end
- [ ] Dashboards for rate/errors/latency percentiles; alerts on SLO
- [ ] Secrets managed and rotatable; nothing sensitive in URLs or logs
- [ ] Docs published with examples and an incremental-consumption recipe
- [ ] Runbook, owner, on-call
- [ ] Rollback path tested

---

## 20. Common mistakes

1. No pagination, or offset pagination on a table that receives writes.
2. No `updated_since`, forcing every consumer into full scans forever.
3. Authorization enforced in application code instead of in the query.
4. Returning money or precise decimals as floats.
5. Ambiguous timestamps — no timezone, no stated time semantics.
6. `200 OK` with an error message inside the body.
7. Renaming or re-meaning a field without a version bump.
8. N+1 queries discovered only after data volume grew.
9. Unbounded queries: no max page size, no max date range, no timeout.
10. No `request_id`, so no way to investigate a consumer's complaint.
11. Exposing a filter that has no index.
12. No freshness signal, so stale data is indistinguishable from real zeros.
13. Building a synchronous API for what was always a bulk export.
14. Documentation that drifts from behavior because the spec isn't the source
    of truth.

---

## 21. The other half of the job: consuming someone else's API

Most data engineers integrate APIs more often than they publish them. The same
concerns, mirrored:

- **Respect limits**: read the rate limit docs, honor `Retry-After`, back off
  exponentially with jitter, and cap total attempts.
- **Land the raw response first.** Persist the untransformed payload (with the
  request parameters and fetch timestamp) before parsing. When the schema
  changes or a number looks wrong, that raw landing zone is the only way to
  reconstruct the truth — and you can replay without re-hitting the source.
- **Bookmark for incrementals**: track a high-watermark (`updated_since` cursor)
  durably, commit it only after a successful load, and allow a deliberate
  overlap window for late data.
- **Make loads idempotent**: upsert on a natural key so a replay doesn't
  duplicate. Assume at-least-once delivery from everyone.
- **Detect schema drift**: validate against an expected schema and alert on new,
  missing, or retyped fields instead of letting them pass through silently.
- **Beware pagination drift**: if the source paginates by offset, a long walk
  will skip or duplicate rows. Prefer cursors, or snapshot by a stable filter.
- **Handle partial failure**: know exactly which pages succeeded so a resume
  doesn't restart from zero or skip a gap.
- **Pin the version** you integrated against, and subscribe to the provider's
  changelog.
- **Secrets**: from a manager, rotated, never in the repo or the URL.
- **Monitor the integration itself**: rows fetched, pages walked, error rate,
  watermark lag. A source that quietly returns zero rows is the failure mode you
  will otherwise find a week late.

---

## 22. Glossary

- **Idempotent** — doing it twice has the same effect as doing it once.
- **Cursor / keyset pagination** — paging by "everything after this key" rather
  than "skip N rows".
- **ETag** — a fingerprint of a response, used for caching and for optimistic
  concurrency control.
- **Backoff with jitter** — waiting longer between retries, plus randomness, so
  clients don't retry in lockstep.
- **Circuit breaker** — stop calling a failing dependency for a while instead of
  piling up timeouts.
- **Rate limit vs quota** — requests per second vs requests per billing period.
- **SLO** — the reliability/latency target you publish and alert against.
- **Expand / contract migration** — add the new shape, move readers and writers,
  then remove the old shape, so every step is rollback-safe.
- **Watermark** — the point in time up to which you have consumed data.
- **Data contract** — schema plus semantics plus freshness plus ownership,
  agreed with consumers.

---

## 23. If you remember five things

1. **The contract comes first.** Spec before code; changes to the contract are
   the expensive kind.
2. **Cursor pagination, a max page size, and an `updated_since` filter.** These
   three make an API safe for pipelines.
3. **Authorization belongs in the query**, and the "someone else's id" case gets
   an explicit test.
4. **Data semantics are part of the API**: UTC, no float money, stated units,
   published freshness.
5. **`request_id` + structured logs + percentile latency.** Without them you're
   debugging by anecdote.
