# Builds the @acme/jobs Hatchet worker, deployed on our own k3s cluster and
# connecting outbound to Hatchet Cloud (the queue/engine itself is managed).
# Build from the repo root: docker build -f docker/worker.Dockerfile -t <registry>/orixon-worker:<tag> .
FROM oven/bun:1-slim AS base
WORKDIR /repo

FROM base AS install
COPY package.json bun.lock ./
COPY packages/jobs/package.json packages/jobs/package.json
COPY packages packages
COPY tooling tooling
RUN bun install --frozen-lockfile

FROM install AS runtime
ENV NODE_ENV=production
COPY . .
# @acme/config and @acme/storage publish from dist/ (unlike @acme/jobs,
# @acme/ai, @acme/db, which the worker imports straight from src/) — build
# them or the worker fails at runtime with "Cannot find module".
RUN bunx turbo run build --filter=@acme/config --filter=@acme/storage
CMD ["bun", "run", "--filter", "@acme/jobs", "worker"]
