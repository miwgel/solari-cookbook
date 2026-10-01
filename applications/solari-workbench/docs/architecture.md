# Architecture

The local foreground service owns provider access, SQLite state, operation queues, and artifacts. The CLI, stdio MCP process, and React dashboard call the same loopback API. The canonical Git project is an input to capture; it is never the target of repair or patch application.

```text
CLI / stdio MCP / paired browser
               |
      loopback Fastify service
       |        |          |
     SQLite   artifacts   provider adapter
                             |
                    one active desktop
                    source / runtime /
                    artifacts / scratch
```

## Durable ownership

A stable installation ID and persisted creation operation ID tag provider resources. Local run IDs are used in responses. Provider IDs, source roots, and capability URLs stay in private state or the server's memory. The fake provider writes its own remote state outside the service database, so service restarts do not erase the failure being tested.

Mutations commit intent before contacting the provider. A request ID plus normalized payload/actor fingerprint makes local retries idempotent; changed payloads conflict. Immediate SQLite transactions reserve a global active slot before start, fork, or resume. Mutations are serialized per run. An uncertain create retains its slot.

No uncertain command, GUI action, or snapshot is blindly repeated. Restart reconciliation matches creation metadata or the exact operation-derived snapshot name. Exactly one matching snapshot is accepted; ambiguous or absent matches remain unresolved. Every discovered owned desktop and matching checkpoint is recorded in the private recovery inventory, including duplicate matches. Public status exposes only local resource identifiers. An interrupted startup is reported as recovered-but-unverified, because the app setup may not have completed.

Task outcome, environment, admission, operation, checkpoint availability, and cleanup are separate fields. Task completion requires explicit evidence references and actor provenance. A held agent cannot admit new guest mutations; queued agent mutations are canceled. Already-running commands continue. Human recovery remains available.

## Source and export

The selection uses tracked working-tree bytes plus explicitly included, nonignored untracked files. Capture checks file type, hard links, size, digest, executable mode, and before/after filesystem metadata; a changing selection is rejected. A private immutable copy becomes the baseline. Paths and configuration are never interpolated into shell commands.

The adapter transfers one bounded file at a time instead of constructing a tar archive. This removes archive extraction from the initial implementation. It verifies remote source digests before running setup. This is a recorded implementation decision, not a claim of tested cloud transfer limits. Large archive throughput remains unverified.

Export collects a stable remote source copy under the mutation queue. An isolated temporary Git repository produces a binary-capable diff against the import; applying it to a disposable baseline must reconstruct the collected manifest. Local Git hooks and fsmonitor are disabled for service Git calls. No user project setup/regression code runs inside the local service. The deterministic demo executes only the bundled fixture from a separate test harness.

Runtime data is outside `source`. Newly added eligible source files participate in export. Public export is not automatic: reports, screenshots, logs, and patches remain private artifacts requiring content review.

## Checkpoint boundary

App process, browser, files, and guest memory are intended to share one Solari desktop. A repair fork inherits the original guest paths; separate VMs provide independence without renaming paths beneath running processes. A late-indexed Solari checkpoint produced a live fork with matching server boot/memory/disk probes and a visible unsaved draft. Exact browser-tab nonce acceptance and in-place restore remain unverified. Provider inventory inconsistencies keep the broader live gates open.

Capture serializes Workbench mutations and records evidence before snapshot creation. A failed/uncertain checkpoint still leaves a readable local case. Browser timers and external systems are not frozen by this barrier, so screenshots and checkpoints have separate timestamps. Restore increments the generation and invalidates observations; it does not rewind local records, conversations, remote databases, or bills.

## Local web boundary

The service binds only to `127.0.0.1`. CLI/MCP read an owner-only discovery token. Browser pairing exchanges a short-lived, one-use code for a same-origin HttpOnly/SameSite cookie. Host and Origin checks, no permissive CORS, a restrictive CSP, and download-only active artifacts protect the UI boundary. API access assumes one trusted operating-system account; actor labels are coordination metadata, not separate principals.

The noVNC viewer uses a local authenticated WebSocket proxy. Provider capabilities are not exposed to the browser. The client has `viewOnly=true`; this is not provider-enforced read-only permission. The proxy has bounded frame queues, closes after sixty seconds, and is closed by pause, restore, deletion, or service shutdown. Merely loading the dashboard never opens a stream or resumes a desktop. The SDK's reconnect behavior and actual upstream stream transport await live verification.

## Persistence and recovery limits

Schema version 2 stores typed JSON documents in SQLite, with a unique request-ID index and ordered events. A relational link table enforces composite foreign keys between documents. Document changes and their links commit atomically. Migration from version 1 backfills these relationships in a transaction and preserves the original database if any relationship is invalid. The service additionally validates cross-record ownership; newer schema versions are rejected rather than downgraded.

A guest-local app supervisor retains at most 5 MiB of startup output while keeping the output pipes alive after readiness returns. A launch intent prevents accidental startup replay. The command helper keeps enforcing its deadline even after a process closes stdout/stderr. Setup and startup logs become private local artifacts before failures are reported.

A private process lock prevents two service instances from managing the same state directory. Graceful shutdown waits for admitted operations; abrupt interruption is recovered from persisted intent. Cleanup is scoped to the chosen run and its descendants. Pinned snapshots remain visible. Automatic expiry defers while a descendant has newer retention or evidence collection has failed; explicit human cleanup remains available. Unknown deletions cannot become `complete`. Reconciliation restores temporarily missing checkpoint records when a unique restorable match returns, and reopens cleanup when an unpinned resource appears after cleanup. A single empty inventory response does not resolve a previously observed provider inconsistency.

Status reads do not touch provider connections. Local idle/active-duration sweeps operate only while the service is running. Provider idle fallback, paused quota, viewer effects, exact command interruption behavior, and logout lifetime all require live verification. Foreground execution is the supported path; no systemd unit is installed.
