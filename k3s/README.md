# k3s manifests

Deploys `app` (the Next.js server, `apps/app`) and `worker` (the Hatchet job
worker, `packages/jobs`) into the `orixon` namespace on your k3s cluster.
The job queue itself is **Hatchet Cloud** (cloud.onhatchet.run) — `worker`
just needs outbound network access and a `HATCHET_CLIENT_TOKEN`, no Hatchet
engine to run ourselves.

## Layout

- `namespace.yaml` — the `orixon` namespace
- `secret.yaml` — template for the `orixon-secrets` Secret (DB, auth, AI
  keys, S3 credentials, `HATCHET_CLIENT_TOKEN`, etc.). Fill in real values
  and apply your own copy — never commit it.
- `app.yaml` — ConfigMap, Deployment, Service, and the `IngressRoute` that
  routes to it on our own Traefik (its CRD, not k3s's bundled Traefik/its
  IngressClass)
- `worker.yaml` — Deployment for the Hatchet worker (no Service — it only
  long-polls the Hatchet engine, nothing connects to it)

## Building images

`app`'s image is built and pushed automatically by
`.github/workflows/deploy-k3s.yml` on every push to `main` (from
`apps/app/Dockerfile`, to `ghcr.io/leadkitchen/platform/app`); that workflow
also runs `kubectl set image` against the `app` Deployment created here, so
`app.yaml` only needs applying once to bootstrap it.

`worker` has no such pipeline yet — build and push it by hand:

```sh
docker build -f docker/worker.Dockerfile -t <registry>/orixon-worker:<tag> .
docker push <registry>/orixon-worker:<tag>
```

Set `<registry>/orixon-worker:<tag>` in `worker.yaml` before applying.

## Deploying

```sh
kubectl apply -f namespace.yaml
kubectl apply -n orixon -f secret.yaml   # your filled-in copy
kubectl apply -n orixon -f app.yaml
kubectl apply -n orixon -f worker.yaml
```

`app.yaml`'s `IngressRoute` assumes `web`/`websecure` entryPoints on your
Traefik and that it already terminates TLS (or fronts something that does).
Update the `Host()` match and, if needed, add a `tls:` block to fit how your
Traefik is actually configured.
