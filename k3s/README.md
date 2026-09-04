# k3s manifests

Deploys `app` (the Next.js server, `apps/app`) and `worker` (the Hatchet job
worker, `packages/jobs`) into the `orixon` namespace on your k3s cluster.
Assumes a self-hosted Hatchet engine already running somewhere reachable
from the cluster (see https://docs.hatchet.run/self-hosting) — these
manifests only cover our own app and worker, not the Hatchet engine itself.

## Layout

- `namespace.yaml` — the `orixon` namespace
- `secret.example.yaml` — template for the `orixon-secrets` Secret (DB, auth,
  AI keys, S3, `HATCHET_CLIENT_TOKEN`, etc.). Copy it, fill in real values,
  apply it, and keep the filled-in copy out of git.
- `app/` — Deployment, Service, and a ConfigMap for the Next.js app
- `worker/` — Deployment for the Hatchet worker (no Service — it only
  long-polls the Hatchet engine, nothing connects to it)

## Building images

Both Dockerfiles build from the repo root (they need the full workspace for
`bun install`):

```sh
docker build -f docker/app.Dockerfile -t <registry>/orixon-app:<tag> .
docker build -f docker/worker.Dockerfile -t <registry>/orixon-worker:<tag> .
docker push <registry>/orixon-app:<tag>
docker push <registry>/orixon-worker:<tag>
```

Set `<registry>/orixon-app:<tag>` / `<registry>/orixon-worker:<tag>` in
`app/deployment.yaml` and `worker/deployment.yaml` before applying.

## Deploying

```sh
kubectl apply -f namespace.yaml
kubectl apply -n orixon -f secret.yaml   # your filled-in copy of secret.example.yaml
kubectl apply -n orixon -f app/
kubectl apply -n orixon -f worker/
```

`app/service.yaml` is `ClusterIP` — put an Ingress or your existing
LoadBalancer/reverse proxy in front of it and update `APP_URL` /
`NEXT_PUBLIC_APP_URL` in `app/configmap.yaml` to match the public domain.
