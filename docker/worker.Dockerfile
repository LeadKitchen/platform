# Builds the @acme/jobs Hatchet worker for self-hosting on k3s.
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
CMD ["bun", "run", "--filter", "@acme/jobs", "worker"]
