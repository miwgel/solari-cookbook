# Snapshot restore and inventory inconsistency

Observed on 2026-09-30 against the documented Solari API, with Node 24.21.0, `@solarisdk/desktop` 0.1.3 and `@solarisdk/sandbox` 0.1.4. Only owned Workbench probe resources were used. This report contains no account, session, snapshot or operation identifiers. Raw receipts and screenshots remain in owner-only local state.

## Observed behavior

| Request or check | Observed result |
| --- | --- |
| Create a workstation desktop, upload a Python probe, open Chrome | Succeeded; real screenshot and typed unsaved input verified |
| `POST /sandboxes/:id/snapshots` through `Desktop.snapshot(name)` | HTTP 201 with `snapshotId`, `sizeBytes` and `createdAt` |
| `GET /snapshots/:snapshotId` using that returned ID | HTTP 200, matching ID, `kind: desktop`, `restorable: true` |
| `POST /sandboxes/:id/revert` through `Desktop.revert(snapshotId)` | HTTP 404, `Snapshot not found` |
| Reconcile a previously unconfirmed capture later | Its exact operation-derived name appeared in inventory |
| Create a desktop from that late checkpoint | Succeeded without rerunning project setup |
| Check the fork's server boot nonce, memory and disk values | Matched the captured values |
| Inspect the fork screenshot | Original unsaved browser draft was visible; exact per-tab nonce acceptance remains pending |
| Edit the fork's source and export | Verified patch reconstruction succeeded |
| Repeated snapshot inventory reads during cleanup | Alternated between zero and one owned entry |
| Repeated deletion of that known owned entry | Returned 404 while the entry continued to appear intermittently in inventory |

The same inventory variation occurred with `Cache-Control: no-cache` and fetch caching disabled. Responses supplied no affinity cookie. These observations do not establish the provider's underlying cause.

An earlier six-sample inventory audit contained respectively **1, 0, 0, 0, 1, 1** matching owned checkpoints. Desktop inventory reported zero owned desktops. Checkpoint cleanup is therefore **unconfirmed**, not complete. The local ownership record is preserved and its run is marked blocked for cleanup. Earlier empty inventory samples do not supersede this later evidence.

## Expected contract and checks needed

The [snapshot documentation](https://docs.getsolari.com/snapshots) describes the returned snapshot ID as usable for in-place restore and independent copies, and describes snapshot deletion as removing its ID and data. The installed SDK forwards the returned ID unchanged in the documented revert payload. A transport-level regression test verifies these request paths and preservation of a receipt even when lookup fails.

The remaining questions for provider investigation are why an explicitly restorable receipt is rejected by revert, why an owned catalog entry can be listed after its deletion endpoint reports absence, and what consistency/retention guarantees callers can rely on. Private identifiers and timestamps can be supplied separately by the account owner if support requires them; they must not be added to Git or copied into a public issue.

## Workbench behavior

Workbench persists the returned ID before checking the receipt, honors an explicit non-restorable state, and retains uncertainty rather than presenting a false success. Reconciliation recovers temporarily missing checkpoints and reopens cleanup when an unpinned resource appears after cleanup. Definitive HTTP 404 restore rejection is distinguished from an unknown transport outcome; the adapter never replays either mutation automatically. The bounded live probe may submit a fresh restore intent after explicit reconciliation of a rejected request, but never repeats an uncertain capture.

No further provisioning was started after the inconsistent cleanup inventory was confirmed. Real in-place restore, pause/quota behavior, viewer acceptance and the full coding-agent repair scenario remain open gates. The successful late fork is evidence for that path only, not a replacement for in-place restore or full acceptance.

## Transport investigation (2026-10-01 UTC)

Three read-only diagnostic runs made 44 authenticated GET requests against the existing owned checkpoint, without creating, restoring, promoting or deleting anything. No proxy environment variables were configured. All requests used the documented public API hostname with normal TLS verification.

| Client / connection | Owned entry present in successive lists | Direct lookup statuses |
| --- | --- | --- |
| Native Node HTTPS, persistent TLS connection A | 0, 0, 1, 0 | 200, 200, 200, 404 |
| Native Node HTTPS, separate persistent connection B | 0, 0, 0, 1 | 404, 200, 200, 404 |
| Native Node HTTPS, four fresh connections | 1, 1, 1, 0 | Not sampled |
| Python urllib, unfiltered listing | 1, 0, 0, 0, 1, 1 | 200, 200, 404, 404, 200, 200 |
| Committed reproducer, one TLS connection | Filtered: 0, 1, 1, 1; unfiltered: 0, 0, 1, 0 | 404, 200, 404, 404 |

The first run was at 00:04:03–00:04:09 UTC; Python at 00:07:37–00:07:45; the committed reproducer at 00:09:37–00:09:40. The 200 lookup responses matched the owned ID and reported `restorable: true`. Negative responses were genuine HTTP 404 responses, not client parsing failures. Native HTTPS responses carried current `Date` values and `Via: 1.1 google`; there was no affinity cookie or cache-hit header. Empty lists had no pagination cursor. No-cache headers did not stabilize results.

This establishes a service-side inconsistency at the public API boundary. It rules out SDK mapping/retries, JavaScript-specific transport, the desktop filter, pagination and connection churn as necessary causes. Keeping one TLS connection open is not a workaround. Absence of cache headers does not prove the service has no internal cache. The observations cannot identify an individual backend or distinguish replica-local state, divergent cache contents and ongoing server-side registry changes.

### Leading explanation and resolution

The [raw Sandbox API reference](https://docs.getsolari.com/api-reference/sandboxes#snapshots) explicitly describes the ordinary snapshot catalog as in-memory and promotion as persisting a template across gateway restarts. It also confirms the request paths and `snapshotId` revert payload used by our pinned SDK. This narrows the leading explanation to requests encountering different server-side catalog views. **Replica-local snapshot registries behind request-level load balancing are a hypothesis, not a confirmed deployment diagnosis.** Solari must correlate the retained request timestamps and private snapshot ID with its gateway logs to confirm it.

The provider-side fix to investigate is a shared durable snapshot registry, scoped to the account, consulted consistently by capture, list, get, revert, fork, promotion and deletion. A successful capture must publish its record before returning its receipt. Deletion must invalidate all readers, enforce lineage protection and give an authoritative result for storage cleanup. Solari should verify these properties across multiple gateway instances and restarts. Client retries cannot implement those guarantees.

A documented candidate workaround is promotion followed by creation from the durable template. It is **not validated here**: promotion still requires finding the original snapshot, creates another owned resource, and the documented in-place revert API still takes a snapshot ID. Template-based replacement would therefore change restore identity and requires its own ownership, cleanup, memory-preservation and viewer tests. It must not silently replace the plan's in-place restore requirement.

### Workbench correction

The investigation exposed an unsafe local assumption: a rejected snapshot DELETE followed by a lookup 404 was treated as confirmed absence. Direct lookup is now proven inconsistent, so two negative answers do not establish deletion. The adapter now retains uncertainty on DELETE 404 without replaying it. After an acknowledged DELETE it checks the direct receipt, and the existing cleanup workflow also checks listing; any positive evidence prevents completion. These checks reduce false success but cannot establish global consistency while the provider is faulty. An already-absent snapshot returning only 404 remains unresolved and may require provider confirmation.

Four transport cases cover rejected/acknowledged deletion with present/absent lookup results. The adapter never repeats DELETE in these cases. All 38 integration tests pass. The retained checkpoint remains unresolved; this investigation made no cleanup mutation and provisioned no new resources.

### Read-only reproducer

With a privately configured key, point the script at an existing Workbench state directory containing the owned checkpoint:

```sh
node --env-file="$HOME/.config/solari-workbench/.env" --import tsx \
  scripts/diagnose-snapshots.ts --state /path/to/private/workbench-state
```

If the state has multiple checkpoint receipts, select the Workbench-local checkpoint ID with `--checkpoint`. The script opens SQLite read-only, reads the provider ID privately, and performs exactly twelve bounded HTTPS GETs without SDK transport, redirects or retries. It prints only UTC timestamps, route labels, HTTP statuses, anonymous connection numbers and presence/restorable booleans. It never prints credentials, provider IDs, response bodies, headers or local paths. Raw private traces from this investigation remain outside Git. The report is ready for the account owner to share; no message or issue has been sent to Solari.
