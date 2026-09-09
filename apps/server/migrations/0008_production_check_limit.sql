-- Free-tier cap on production checks (3 lifetime, until an admin resets it).
ALTER TABLE users ADD COLUMN production_checks_used INTEGER NOT NULL DEFAULT 0;
