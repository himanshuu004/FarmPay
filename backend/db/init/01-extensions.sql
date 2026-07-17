-- Allied KCC — Postgres extensions bootstrapped on first container start.
-- pgvector: muzzle-print + RAG embeddings (identity/, assistant/).
-- postgis:  evidence GPS geo-checks (claims/, evidence conventions).
-- pgcrypto/uuid: UUID generation for external ids.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
