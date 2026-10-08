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

Run `npm run db:seed` to add or refresh the curated meme knowledge examples. The seed is repeatable and only upserts its own slugs. The **Find a meme** workspace matches a communication context against the catalog, explains its leading matches, and creates a format-aware concept that can be opened in Visual Studio. Admin → Memes stores editorial use cases, emotions, tones, content formats, communities, and avoid guidance alongside each existing record.

The database is `signal_studio`, the local user is `signal`, and Postgres listens only on `127.0.0.1:5432`. `server/schema.sql` initializes the SaaS schema and meme catalog the first time the database volume is created. `npm run db:psql` opens a SQL prompt, and `npm run db:down` stops the database while preserving its data volume.
## Vercel serverless deployment

The Vite frontend builds to `dist/`; Vercel Functions in `api/` serve the PostgreSQL meme API, while local `npm run dev` continues to use the Node API server. For a Vercel deployment:

- Configure `DATABASE_URL` to a hosted PostgreSQL connection-pooler URL.
- Create a Vercel Blob store; `api/uploads/` issues direct browser-upload tokens, so image bytes do not pass through a function body or get written to ephemeral disk.
- Configure the Blob token in Vercel project settings. Uploaded image URLs are saved in the meme row.
- Apply `server/schema.sql` to the hosted database before using the admin panel.

The current app and API do not yet implement user authentication or tenant authorization. Keep a deployment private until access control is added; the serverless conversion by itself does not secure the admin endpoints.
## Production boundaries

- `server/schema.sql` defines the PostgreSQL multi-tenant relational model and meme catalog. Organization-owned resources carry `organization_id`; editorial trend and meme intelligence is shared.
- `server/publisher.ts` defines platform adapters, idempotent mock publishing, retry classification, and a worker/repository boundary intended for a BullMQ queue with PostgreSQL row claiming.
- Trend signals, brand settings, and content currently use browser storage. The **Admin · Memes** panel uses the local API to create, read, update, and delete rows in PostgreSQL.

The application seeds 18 curated trend records and example scheduled/published content on first use. Admin → Trends provides local create and edit flows. The mock generator and publisher do not call external services.
