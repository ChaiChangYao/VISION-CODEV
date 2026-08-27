# Capture contract proposals for coordinator review

No shared contract files are changed by the capture workstream. The following additions should be reviewed and versioned by the coordinator before integration:

1. Add a capture-session token request/response schema containing `companyId`, `memberId`, `workflowId`, `sessionId`, LiveKit `serverUrl`, and a short-lived token. The mobile app must never mint or persist LiveKit tokens.
2. Add media recovery events for `egress_gap_detected`, `recovery_upload_requested`, and `recovery_reconciled`, carrying object references, timestamp ranges, sequence numbers, and checksums—not media bytes.
3. Add a capture lifecycle event payload for foreground/background transitions, audio interruptions, route changes, camera facing changes, and reconnect status.
4. Add an explicit server acknowledgement that distinguishes a healthy canonical Egress object from a derived reconciled media version.

The mobile implementation uses local types until these are approved; it does not widen or duplicate the shared contract package.
