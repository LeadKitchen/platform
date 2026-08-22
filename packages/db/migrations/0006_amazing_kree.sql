-- Add issuer column as nullable first
ALTER TABLE "accounts" ADD COLUMN "issuer" text;

-- Backfill existing credential accounts with 'local:credential'
UPDATE "accounts" SET "issuer" = 'local:credential' WHERE "provider_id" = 'credential';

-- Backfill existing OAuth accounts with their provider issuer
-- For OAuth providers, the issuer is typically the provider_id
UPDATE "accounts" SET "issuer" = "provider_id" WHERE "provider_id" != 'credential';

-- Now set NOT NULL constraint and default value
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET DEFAULT 'local:credential';