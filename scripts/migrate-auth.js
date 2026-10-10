import { Pool } from 'pg'
const password=process.env.POSTGRES_PASSWORD
const connectionString=process.env.DATABASE_URL||(password?`postgresql://signal:${password}@127.0.0.1:5432/signal_studio`:null)
if(!connectionString)throw new Error('Set DATABASE_URL or POSTGRES_PASSWORD in .env')
const pool=new Pool({connectionString})
try{
 await pool.query(`CREATE EXTENSION IF NOT EXISTS citext;
 CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email citext NOT NULL UNIQUE, display_name text NOT NULL, password_hash text, role member_role NOT NULL DEFAULT 'viewer', created_at timestamptz NOT NULL DEFAULT now());
 ALTER TABLE users ADD COLUMN IF NOT EXISTS role member_role NOT NULL DEFAULT 'viewer';
 CREATE TABLE IF NOT EXISTS auth_sessions (token_hash char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
 UPDATE users SET role='owner' WHERE id=(SELECT id FROM users ORDER BY created_at ASC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM users WHERE role IN ('owner','admin'));`)
 console.log('Authentication tables are ready.')
}finally{await pool.end()}
