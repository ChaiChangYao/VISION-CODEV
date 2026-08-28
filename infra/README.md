# Local foundation services

The compose stack is intentionally limited to first-slice dependencies: PostgreSQL, Redis, Qdrant, MinIO, Temporal, LiveKit Server, and the separately deployed LiveKit Egress worker. It does not include RTSP, MediaMTX, ONVIF, or CCTV services.

```powershell
docker compose -f infra/docker-compose.yml up -d
./infra/healthcheck.ps1
pnpm --filter @vision-codef/database db:migrate
pnpm --filter @vision-codef/database db:seed
```

LiveKit is the canonical phone media plane. MinIO is the local S3-compatible object store for canonical Egress output and derived recovery assets. The Egress worker shares the compose Redis instance and requires `SYS_ADMIN` for RoomComposite Chrome capture. The host-run API uses `LIVEKIT_EGRESS_S3_ENDPOINT=http://host.docker.internal:9000` so the containerized Egress worker can reach host-published MinIO; keep that endpoint in the local `.env` copy when following this host-run workflow.
