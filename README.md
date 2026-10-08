# Signal Studio

Trend-to-content workspace MVP. Start it with `npm install` and `npm run dev`; `npm run build` produces the static production bundle.

The current UI is intentionally runnable without API credentials or infrastructure. Editorial trends, brand settings, and content persist in browser storage, and generated copy and mock publishing are local preview behavior. It is not wired to a real AI provider or social network.

## Production boundaries

- `server/schema.sql` defines the PostgreSQL multi-tenant relational model. Organization-owned resources carry `organization_id`; editorial trend intelligence is shared and normalized through platform, industry, and example tables.
- `server/publisher.ts` defines platform adapters, idempotent mock publishing, retry classification, and a worker/repository boundary intended for a BullMQ queue with PostgreSQL row claiming. A service can implement `ScheduledPostRepository` with transactions and `FOR UPDATE SKIP LOCKED`.
- Replace browser storage with organization-scoped API routes, put social credentials in a secrets store, and store media in object storage before enabling real publishing.

The application seeds 18 curated trend records and example scheduled/published content on first use. Admin → Trends provides create and edit flows. Signal, brand, and content edits are saved to browser storage for this local MVP.
