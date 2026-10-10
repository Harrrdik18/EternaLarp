-- PostgreSQL MVP schema. Every workspace-owned row is scoped by organization_id.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE member_role AS ENUM ('owner','admin','editor','viewer');
CREATE TYPE trend_status AS ENUM ('HOT','RISING','PEAKING','COOLING','DEAD');
CREATE TYPE content_status AS ENUM ('DRAFT','REVIEW','APPROVED','SCHEDULED','PUBLISHED','FAILED');

CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, plan text NOT NULL DEFAULT 'studio', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE, display_name text NOT NULL, password_hash text, role member_role NOT NULL DEFAULT 'viewer', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_sessions (token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE organization_members (organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, role member_role NOT NULL DEFAULT 'editor', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (organization_id,user_id));
CREATE TABLE brand_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES organizations ON DELETE CASCADE, name text NOT NULL, description text NOT NULL DEFAULT '', website text, industry text, audience text NOT NULL DEFAULT '', tone text NOT NULL DEFAULT '', products text[] NOT NULL DEFAULT '{}', competitors text[] NOT NULL DEFAULT '{}', keywords text[] NOT NULL DEFAULT '{}', banned_topics text[] NOT NULL DEFAULT '{}', preferred_platforms text[] NOT NULL DEFAULT '{}', logo_asset_id uuid, brand_colors text[] NOT NULL DEFAULT '{}', fonts text[] NOT NULL DEFAULT '{}', visual_style text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE social_accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, platform text NOT NULL, account_name text NOT NULL, external_account_id text, credential_ref text, token_expires_at timestamptz, enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,platform,external_account_id));

-- Curated trend intelligence is global editorial data; child relations remain normalized.
CREATE TABLE trends (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL, category text NOT NULL, source text NOT NULL, source_url text, audience text NOT NULL DEFAULT '', keywords text[] NOT NULL DEFAULT '{}', status trend_status NOT NULL, popularity smallint NOT NULL CHECK(popularity BETWEEN 0 AND 100), momentum smallint NOT NULL CHECK(momentum BETWEEN 0 AND 100), estimated_lifespan_hours integer NOT NULL, starts_at timestamptz, expires_at timestamptz, brand_safe boolean NOT NULL DEFAULT true, example_usage text, reference_asset_id uuid, editorial_notes text, created_by uuid REFERENCES users, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE trend_platforms (trend_id uuid NOT NULL REFERENCES trends ON DELETE CASCADE, platform text NOT NULL, PRIMARY KEY(trend_id,platform));
CREATE TABLE trend_industries (trend_id uuid NOT NULL REFERENCES trends ON DELETE CASCADE, industry text NOT NULL, fit boolean NOT NULL, PRIMARY KEY(trend_id,industry,fit));
CREATE TABLE trend_examples (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trend_id uuid NOT NULL REFERENCES trends ON DELETE CASCADE, platform text, body text NOT NULL, reference_url text, sort_order smallint NOT NULL DEFAULT 0);
CREATE TABLE trend_saves (organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, trend_id uuid NOT NULL REFERENCES trends ON DELETE CASCADE, saved_by uuid NOT NULL REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,trend_id));
CREATE INDEX trends_active_momentum ON trends(status,momentum DESC,expires_at) WHERE status <> 'DEAD';

-- Curated meme catalog. Add one row per reusable meme / engagement format.
CREATE TABLE memes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trend_id uuid REFERENCES trends ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  format text NOT NULL,
  category text NOT NULL DEFAULT 'Meme',
  description text NOT NULL DEFAULT '',
  origin text,
  source_url text,
  platforms text[] NOT NULL DEFAULT '{}',
  audience text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  engagement_prompt text NOT NULL DEFAULT '',
  example_caption text,
  industries_good text[] NOT NULL DEFAULT '{}',
  industries_avoid text[] NOT NULL DEFAULT '{}',
  brand_safe boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'RISING' CHECK (status IN ('HOT','RISING','PEAKING','COOLING','DEAD')),
  popularity smallint NOT NULL DEFAULT 0 CHECK (popularity BETWEEN 0 AND 100),
  momentum smallint NOT NULL DEFAULT 0 CHECK (momentum BETWEEN 0 AND 100),
  estimated_lifespan_hours integer,
  starts_at timestamptz,
  expires_at timestamptz,
  reference_image_url text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memes_active_momentum ON memes(status,momentum DESC,expires_at) WHERE status <> 'DEAD';
CREATE INDEX memes_platforms_gin ON memes USING gin(platforms);
-- Optional editorial knowledge used by MemeMatcher; existing catalog rows remain valid.
ALTER TABLE memes ADD COLUMN IF NOT EXISTS emotions text[] NOT NULL DEFAULT '{}';
ALTER TABLE memes ADD COLUMN IF NOT EXISTS tones text[] NOT NULL DEFAULT '{}';
ALTER TABLE memes ADD COLUMN IF NOT EXISTS use_cases text[] NOT NULL DEFAULT '{}';
ALTER TABLE memes ADD COLUMN IF NOT EXISTS avoid_situations text[] NOT NULL DEFAULT '{}';
ALTER TABLE memes ADD COLUMN IF NOT EXISTS content_formats text[] NOT NULL DEFAULT '{}';
ALTER TABLE memes ADD COLUMN IF NOT EXISTS communities text[] NOT NULL DEFAULT '{}';

CREATE TABLE content_opportunities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, trend_id uuid NOT NULL REFERENCES trends, angle text NOT NULL, platform text NOT NULL, reasoning text NOT NULL, engagement_potential smallint NOT NULL CHECK(engagement_potential BETWEEN 0 AND 100), risk_level text NOT NULL, suggested_format text NOT NULL, score smallint NOT NULL CHECK(score BETWEEN 0 AND 100), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE media_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, created_by uuid REFERENCES users, storage_key text NOT NULL, mime_type text NOT NULL, width integer, height integer, alt_text text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE brand_profiles ADD CONSTRAINT brand_logo_asset_fk FOREIGN KEY (logo_asset_id) REFERENCES media_assets ON DELETE SET NULL;
ALTER TABLE trends ADD CONSTRAINT trend_reference_asset_fk FOREIGN KEY (reference_asset_id) REFERENCES media_assets ON DELETE SET NULL;
CREATE TABLE content (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, trend_id uuid REFERENCES trends ON DELETE SET NULL, opportunity_id uuid REFERENCES content_opportunities ON DELETE SET NULL, author_id uuid NOT NULL REFERENCES users, title text NOT NULL, status content_status NOT NULL DEFAULT 'DRAFT', angle text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE content_variants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_id uuid NOT NULL REFERENCES content ON DELETE CASCADE, platform text NOT NULL, format text NOT NULL, body text NOT NULL, title text, description text, media_asset_id uuid REFERENCES media_assets ON DELETE SET NULL, version integer NOT NULL DEFAULT 1, UNIQUE(content_id,platform,version));
CREATE TABLE ai_generations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, user_id uuid REFERENCES users, trend_id uuid REFERENCES trends ON DELETE SET NULL, content_id uuid REFERENCES content ON DELETE SET NULL, task text NOT NULL, model text, prompt_version text NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE scheduled_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, content_id uuid NOT NULL REFERENCES content ON DELETE CASCADE, variant_id uuid NOT NULL REFERENCES content_variants ON DELETE CASCADE, social_account_id uuid NOT NULL REFERENCES social_accounts ON DELETE RESTRICT, scheduled_at timestamptz NOT NULL, status content_status NOT NULL DEFAULT 'SCHEDULED', idempotency_key text NOT NULL UNIQUE, attempts smallint NOT NULL DEFAULT 0, max_attempts smallint NOT NULL DEFAULT 5, locked_at timestamptz, last_error text, next_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX scheduled_posts_due ON scheduled_posts(scheduled_at) WHERE status='SCHEDULED';
CREATE TABLE published_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, scheduled_post_id uuid UNIQUE REFERENCES scheduled_posts ON DELETE SET NULL, content_id uuid NOT NULL REFERENCES content ON DELETE CASCADE, platform text NOT NULL, external_post_id text, permalink text, published_at timestamptz NOT NULL, raw_result jsonb NOT NULL DEFAULT '{}');
CREATE TABLE analytics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE, published_post_id uuid NOT NULL REFERENCES published_posts ON DELETE CASCADE, collected_at timestamptz NOT NULL, impressions bigint NOT NULL DEFAULT 0, reach bigint NOT NULL DEFAULT 0, likes bigint NOT NULL DEFAULT 0, comments bigint NOT NULL DEFAULT 0, shares bigint NOT NULL DEFAULT 0, saves bigint NOT NULL DEFAULT 0, clicks bigint NOT NULL DEFAULT 0, follower_growth integer NOT NULL DEFAULT 0, engagement_rate numeric(7,4) NOT NULL DEFAULT 0, UNIQUE(published_post_id,collected_at));
CREATE INDEX analytics_org_collected ON analytics(organization_id,collected_at DESC);
