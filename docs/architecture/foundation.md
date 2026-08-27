# Foundation implementation notes

## Tenant boundary

All tenant rows carry `company_id`. Repository calls require a `TenantContext` and execute inside a transaction-local context. PostgreSQL Row Level Security is enabled and forced on all tenant tables, so an omitted or incorrect application predicate cannot cross the company boundary.

Object keys, LiveKit room grants, Redis keys, Qdrant filters, and Temporal workflow IDs must use the immutable company ID at their respective integration boundaries.

## Media ownership

LiveKit Egress is canonical for phone recordings. The mobile client may retain a bounded rolling recovery buffer, but recovery segments are uploaded only for server-detected Egress gaps or corruption. Reconciliation creates a derived asset and preserves the original Egress object.

## Local service boundary

The initial compose stack supports the physical-phone Golden Run slice. RTSP/CCTV/ONVIF and MediaMTX are intentionally absent until the Golden Run physical-device gate passes.
