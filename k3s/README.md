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
- `embeddings.yaml` — PVC, Deployment, and internal-only Service for
  self-hosted embeddings (Text Embeddings Inference, see
  `packages/ai/src/knowledge/embeddings.ts`). Mirrors docker-compose.yml's
  `embeddings` service; Qdrant and Neo4j run the same in-cluster way but
  aren't tracked here — see `QDRANT_URL`/`NEO4J_URL` in your filled-in
  `secret.yaml` for how those are expected to already be reachable

## Building images

Both images are built and pushed automatically by
`.github/workflows/deploy-k3s.yml` on every push to `main`: `app` from
`apps/app/Dockerfile` to `ghcr.io/leadkitchen/platform/app`, `worker` from
`docker/worker.Dockerfile` to `ghcr.io/leadkitchen/platform/worker`. That
workflow also runs `kubectl set image` against both Deployments, so
`app.yaml`/`worker.yaml` only need applying once each to bootstrap them.

`worker.yaml` ships pointing at `:latest` as a bootstrap image — the first
push to `main` after adding this pipeline populates it; until then the
Deployment can't pull anything. To build and push a one-off image by hand
instead:

```sh
docker build -f docker/worker.Dockerfile -t ghcr.io/leadkitchen/platform/worker:<tag> .
docker push ghcr.io/leadkitchen/platform/worker:<tag>
```

## Deploying

`ghcr.io/leadkitchen/platform/app` (and `orixon-worker`, once you push it)
are private GHCR packages, so the cluster needs a pull secret — both
Deployments reference `ghcr-creds` via `imagePullSecrets`. Create it
once with a GitHub PAT that has `read:packages` scope:

```sh
kubectl create secret docker-registry ghcr-creds \
  -n orixon \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password=<PAT with read:packages> \
  --docker-email=<your-email>
```

```sh
kubectl apply -f namespace.yaml
kubectl apply -n orixon -f secret.yaml   # your filled-in copy
# (ghcr-creds — see above)
kubectl apply -n orixon -f app.yaml
kubectl apply -n orixon -f worker.yaml
kubectl apply -n orixon -f embeddings.yaml
```

`app.yaml`'s `IngressRoute` assumes `web`/`websecure` entryPoints on your
Traefik, and issues TLS via that Traefik's own `letsencrypt` ACME cert
resolver (`tls.certResolver: letsencrypt`). Update the `Host()` match and
the resolver name to fit how your Traefik is actually configured.
