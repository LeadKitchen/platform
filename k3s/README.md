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
docker build -f docker/worker.Dockerfile -t ghcr.io/leadkitchen/platform/worker:<tag> .
docker push ghcr.io/leadkitchen/platform/worker:<tag>
```

`worker.yaml` ships pointing at `:latest` as a bootstrap image — push at
least one `:latest` (or update the tag in `worker.yaml`/`kubectl set image`)
before applying, otherwise the Deployment can't pull anything.

## Deploying

`ghcr.io/leadkitchen/platform/app` (and `orixon-worker`, once you push it)
are private GHCR packages, so the cluster needs a pull secret — both
Deployments reference `ghcr-pull-secret` via `imagePullSecrets`. Create it
once with a GitHub PAT that has `read:packages` scope:

```sh
kubectl create secret docker-registry ghcr-pull-secret \
  -n orixon \
  --docker-server=ghcr.io \
  --docker-username=<your-github-username> \
  --docker-password=<PAT with read:packages> \
  --docker-email=<your-email>
```

```sh
kubectl apply -f namespace.yaml
kubectl apply -n orixon -f secret.yaml   # your filled-in copy
# (ghcr-pull-secret — see above)
kubectl apply -n orixon -f app.yaml
kubectl apply -n orixon -f worker.yaml
```

`app.yaml`'s `IngressRoute` assumes `web`/`websecure` entryPoints on your
Traefik and that it already terminates TLS (or fronts something that does).
Update the `Host()` match and, if needed, add a `tls:` block to fit how your
Traefik is actually configured.
