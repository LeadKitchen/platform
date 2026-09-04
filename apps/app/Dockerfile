# syntax=docker/dockerfile:1
#
# Build from the repo root, e.g.:
#   docker build -f apps/app/Dockerfile -t app .
#
# Uses `turbo prune` to trim the monorepo down to what @acme/app actually
# needs, then builds it with Next.js standalone output.

FROM oven/bun:1.4.0 AS base
WORKDIR /app

# ---- Prune the monorepo down to @acme/app's dependency graph ----
FROM base AS pruner
COPY . .
RUN bunx turbo prune @acme/app --docker

# ---- Install pruned deps and build ----
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN cp .env.example .env

ENV CI=true
RUN bunx turbo run build --filter=@acme/app

# ---- Minimal runtime image ----
FROM oven/bun:1.4.0-slim AS runner
WORKDIR /app

RUN groupadd --system nodejs \
    && useradd --system --gid nodejs --home-dir /app --no-create-home nextjs

# Next.js standalone output mirrors the monorepo layout, so server.js
# ends up nested under apps/app/ rather than at the image root.
COPY --from=builder /app/apps/app/.next/standalone ./
COPY --from=builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder /app/apps/app/public ./apps/app/public

RUN chown -R nextjs:nodejs /app
USER nextjs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# No curl/wget on the slim base — probe with bun's own fetch instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/app/server.js"]
