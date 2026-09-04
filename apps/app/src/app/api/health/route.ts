/**
 * Liveness endpoint for the container runtime — the Dockerfile's
 * HEALTHCHECK hits this. Deliberately dependency-free so it stays fast
 * and doesn't flag the container unhealthy over a downstream outage.
 *
 * @example GET /api/health
 */
export function GET() {
  return new Response("ok", { status: 200 });
}
