# Builds the @acme/app Next.js server for self-hosting on k3s.
# Build from the repo root: docker build -f docker/app.Dockerfile -t <registry>/orixon-app:<tag> .
FROM oven/bun:1-slim AS base
WORKDIR /repo

FROM base AS install
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/package.json
COPY packages packages
COPY tooling tooling
RUN bun install --frozen-lockfile

FROM install AS build
COPY . .
RUN bun run --filter @acme/app build

# `output: "standalone"` (apps/app/next.config.ts) traces only the modules the
# server actually needs, so the runtime stage doesn't carry node_modules.
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/app
COPY --from=build /repo/apps/app/.next/standalone ./
COPY --from=build /repo/apps/app/.next/static ./apps/app/.next/static
COPY --from=build /repo/apps/app/public ./apps/app/public
EXPOSE 3000
CMD ["bun", "apps/app/server.js"]
