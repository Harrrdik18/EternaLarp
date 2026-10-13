# Signal Studio

Trend-to-content workspace MVP. Start it with `npm install` and `npm run dev`; `npm run build` produces the static production bundle.

## Local PostgreSQL meme database

Docker Desktop must be installed and running. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, then start the local database and app:

```powershell
Copy-Item .env.example .env
# Set POSTGRES_PASSWORD in .env to a password you choose.
npm install
npm run db:up
npm run dev
```

Open the app at the Vite URL shown in the terminal. Use **Admin · Memes** in the sidebar to add, edit, search, filter, or delete meme records. Meme fields are saved directly to the PostgreSQL `memes` table. Reference images can be uploaded (PNG, JPEG, WebP, or GIF; up to 8 MB); the database stores the image URL and the local API stores image files in the ignored `uploads/` directory. `Admin · Trends` remains the separate browser-based editorial trend workspace. The API and Vite development server bind to localhost.

Email/password accounts use persistent, HTTP-only cookies and PostgreSQL-backed sessions. Run `npm run db:migrate:auth` against the target database before deploying the auth UI/API. The first registered account is the workspace owner; later signups are viewers. Sign-in does not yet include email verification or self-serve password reset because no mail provider is configured.

Run `npm run db:seed` to add or refresh the curated meme knowledge examples. The seed is repeatable and only upserts its own slugs. The **Find a meme** workspace matches a communication context against the catalog, explains its leading matches, and creates a format-aware concept that can be opened in Visual Studio. Admin → Memes stores editorial use cases, emotions, tones, content formats, communities, and avoid guidance alongside each existing record.

Run `npm test` for deterministic matcher and concept tests. With a populated PostgreSQL catalog, `npm run eval:memes` evaluates the fixed 36-brief set and writes `reports/meme-evaluation.json`. Suitability labels are manually curated against the requested platform; two briefs currently have no labeled suitable catalog candidate. The report records the catalog SHA-256, each candidate's score components, excluded candidates and reasons, metadata gaps, per-audience/industry metrics, and controlled baseline experiments. Use `--failed-top1`, `--low-p3`, `--missing-metadata`, `--compatibility-errors`, `--industry=Gaming`, `--audience=Developers`, or `--json=path` to filter/export a report. Precision@3 uses a fixed denominator of three; the legacy returned-results definition is also reported for comparison. The production matcher currently uses the measured choice-intent alias plus context-gated freshness profile; the original scorer remains available as `matchMemes` for baseline comparisons. Apply the existing `server/schema.sql` or run the repeatable meme seed on databases that predate the editorial metadata columns; no new table or migration is required.

## Optional AI assistance

AI is server-side and disabled by default. It interprets a brief into optional topic and communication-pattern metadata, then the existing PostgreSQL retrieval, compatibility checks, weighted scoring, and ranking remain authoritative. If AI is disabled, limited, malformed, or unavailable, matching and concept generation continue with deterministic logic. The current profile and scoring weights are unchanged.

Set `AI_ENABLED=true`, choose one configured primary provider, and set both that provider's API key and model ID. Optional provider variables are `GEMINI_API_KEY` + `GEMINI_MODEL`, `GROQ_API_KEY` + `GROQ_MODEL`, and `OPENROUTER_API_KEY` + `OPENROUTER_MODEL`. Model IDs are intentionally not embedded in the application: select a currently available model supported by the account and task. `AI_PRIMARY_PROVIDER` accepts `gemini`, `groq`, or `openrouter`; `AI_FALLBACK_PROVIDERS` controls the remaining order. Only configured key/model pairs are tried. OpenRouter models must use the `:free` route suffix unless `AI_ALLOW_PAID_MODELS=true` is deliberately set. Gemini and Groq pricing/quotas depend on current model and account configuration; the application does not change model IDs when a configured model fails. Provider capabilities differ: Gemini uses its native JSON schema output, Groq uses JSON mode plus local schema validation, and OpenRouter uses schema output only on models that support it.

Operational limits are configurable with `AI_REQUEST_TIMEOUT_MS` (default 5 seconds per attempt), `AI_TOTAL_TIMEOUT_MS` (default 12 seconds across provider attempts), `AI_MAX_RETRIES` (default 1, capped at 2), `AI_CACHE_TTL_SECONDS` (default 300), and `AI_MAX_REQUESTS_PER_WINDOW` (default 20 per process-local user/session per ten minutes). The cache is in-memory and user-scoped; quota and concurrency guards are per Node/Vercel instance, not global. No shared quota database or paid infrastructure is added. Logs contain provider/model/task, latency, result category, retry count, and cache status, but not prompts or keys.

For a live, quota-consuming comparison on the same manually labeled briefs, run `npm run eval:memes -- --with-ai`. Without the flag the evaluation uses no provider calls. If no provider is configured or every call fails, the JSON report marks AI evaluation unavailable instead of presenting fallback-only results as AI metrics. For local development, add the provider settings to `.env`; for Vercel, configure the same server-only variables in the project's Preview and Production environment settings, then redeploy. Never use `VITE_` prefixes for provider keys. See the [Gemini structured output docs](https://ai.google.dev/gemini-api/docs/structured-output), [Groq JSON mode docs](https://console.groq.com/docs/structured-outputs), and [OpenRouter structured output docs](https://openrouter.ai/docs/guides/features/structured-outputs); model availability, free eligibility, and quotas can change, so verify the model and account before enabling a provider.

The database is `signal_studio`, the local user is `signal`, and Postgres listens only on `127.0.0.1:5432`. `server/schema.sql` initializes the SaaS schema and meme catalog the first time the database volume is created. `npm run db:psql` opens a SQL prompt, and `npm run db:down` stops the database while preserving its data volume.
## Vercel serverless deployment

The Vite frontend builds to `dist/`; Vercel Functions in `api/` serve the PostgreSQL meme API, while local `npm run dev` continues to use the Node API server. For a Vercel deployment:

- Configure `DATABASE_URL` to a hosted PostgreSQL connection-pooler URL.
- Create a Vercel Blob store; `api/uploads/` issues direct browser-upload tokens, so image bytes do not pass through a function body or get written to ephemeral disk.
- Configure the Blob token in Vercel project settings. Uploaded image URLs are saved in the meme row.
- Apply `server/schema.sql` to the hosted database before using the admin panel.
- Set `DATABASE_URL` for Preview and Production, run `npm run db:migrate:auth` against that same database, then redeploy. Sign-in uses the `api/auth/[action].js` Vercel function and a `Secure`, `HttpOnly`, `SameSite=Lax` cookie.

The API uses the existing HTTP-only session cookie for authenticated routes; keep `DATABASE_URL` and provider keys in server-side Vercel environment settings only. AI provider variables must be configured separately for Preview and Production.
## Production boundaries

- `server/schema.sql` defines the PostgreSQL multi-tenant relational model and meme catalog. Organization-owned resources carry `organization_id`; editorial trend and meme intelligence is shared.
- `server/publisher.ts` defines platform adapters, idempotent mock publishing, retry classification, and a worker/repository boundary intended for a BullMQ queue with PostgreSQL row claiming.
- Trend signals, brand settings, and content currently use browser storage. The **Admin · Memes** panel uses the local API to create, read, update, and delete rows in PostgreSQL.

The application seeds 18 curated trend records and example scheduled/published content on first use. Admin → Trends provides local create and edit flows. The mock generator and publisher do not call external services.
