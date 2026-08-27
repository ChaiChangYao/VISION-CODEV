# Local foundation services

The compose stack is intentionally limited to first-slice dependencies: PostgreSQL, Redis, Qdrant, MinIO, and LiveKit. It does not include RTSP, MediaMTX, ONVIF, or CCTV services.

```powershell
docker compose -f infra/docker-compose.yml up -d
./infra/healthcheck.ps1
pnpm --filter @vision-codef/database db:migrate
pnpm --filter @vision-codef/database db:seed
```

LiveKit is the canonical phone media plane. MinIO is the local S3-compatible object store for canonical Egress output and derived recovery assets.
