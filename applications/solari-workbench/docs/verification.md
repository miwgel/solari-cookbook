# Verification record

Implementation date: 2026-09-30. This is a review-ready prototype with remaining live gates. The original end-to-end live acceptance is incomplete; the prototype and provider investigation can be reviewed independently.

## Prototype review milestone (2026-10-01 UTC)

The final review covers the prototype and its documented findings, not completion of the original live acceptance gates below.

| Requirement | Evidence checked |
| --- | --- |
| Usable prototype | Typecheck, lint, production build, 6 unit tests, 38 integration tests and 4 dashboard tests passed again. Retained scripted-demo evidence confirms the expected initial regression failure, passing repair, successful patch export and zero remaining simulated resources. |
| Clear introduction | The shorter README explains the workflow, demonstrated results, apparent provider bug, possible fixes and unresolved limits. Detailed setup remains in the usage guide; local documentation links resolve. |
| Reproducible findings | The provider report includes observed request sequences and timestamps. Retained native HTTPS and Python records match the published sequences. The committed diagnostic uses bounded read-only requests and prints only allowlisted fields. Proposed internal causes remain explicitly hypothetical. |
| Private delivery | GitHub visibility was verified private and its main commit matched the local checkout. History checks found no matching secrets or personal metadata. A separate local comparison found no actual configured API key or retained snapshot ID in Git blobs or commit records; neither value was printed. Raw evidence remains outside Git. |

The provider restore and cleanup issue remains unresolved. No additional live resources were provisioned for this milestone audit.

## Results

| Check | Recorded result |
| --- | --- |
| Strict TypeScript | Passed |
| ESLint | Passed |
| Unit tests | 6 passed: selection, path/file types, size limit, concurrent edits, binary/mode/add/delete reconstruction, empty repository |
| Integration tests | 38 passed: live-adapter recovery, late inventory and cleanup contracts, lifecycle/recovery, foreground restart/locking, declared evidence, local HTTP boundary, stdio MCP image transport and byte limits, guest startup/command helpers, ambiguous-resource inventory, retention, database migration and Git-history privacy checks |
| Dashboard tests | 4 passed: three target viewports plus uncertain-resource recovery display; screenshots visually reviewed |
| Production build | Passed |
| Scripted offline demo | Passed: known regression failed before repair, passed after repair, patch verified, zero fake resources retained |
| Solari live probe | Partial: real desktop, transfer, readiness, screenshot, typing, late checkpoint fork and verified export passed; in-place restore and consistent cleanup remain unresolved |
| Actual coding-agent acceptance | Not run |
| Private GitHub publication | Published with gh; private visibility verified before and after the initial push |

Tests that establish provider-independent behavior do not establish Solari's implementation of that behavior. The stdio test uses an MCP SDK client and a valid synthetic one-pixel PNG; it does not prove real desktop image perception by the target coding agent.

## Plan verification matrix

| ID | Status and evidence |
| --- | --- |
| V01 | Offline selection checks passed; small live probe upload and digest verification passed, maximum-size transfer unverified |
| V02 | Offline pass: private-file sentinel excluded; traversal, symlinks, hard links rejected |
| V03 | Offline pass: filesystem stamps/digests reject concurrently edited selection |
| V04 | Passed local helper tests and live Solari probe app readiness; startup logs retained |
| V05 | Partial: real guest screenshot showed the probe page and typed draft; upstream stream comparison remains unverified |
| V06 | Partial: actual stdio MCP PNG content tested; target-agent visual acceptance pending |
| V07 | Offline pass: wrong run, generation, expiry and invalid coordinates rejected |
| V08 | Offline pass: exec/file write invalidate old observations |
| V09 | Offline pass: new/queued agent work blocked; human pause and observations work |
| V10 | Offline pass: same key/payload returns operation, changed payload conflicts |
| V11 | Offline pass: concurrent admission obeys one slot |
| V12 | Offline pass: persisted fake remote survives service restart and lost create response |
| V13 | Offline pass: exact checkpoint name reconciles; duplicate match remains uncertain |
| V14 | Late live fork matched server boot/memory/disk probes and preserved the visible draft; in-place restore and exact browser-tab nonce acceptance remain unverified |
| V15 | Generation invalidation implemented; real connection recovery unverified |
| V16 | Offline isolation passed; a live late-checkpoint fork supported source editing and verified export, but comparison with an independently restored live parent remains pending |
| V17 | Not run: scripted repair is explicitly not actual-agent acceptance |
| V18 | Offline pass: added/deleted files, binary content and executable mode reconstructed |
| V19 | Offline pass: original source/index preserved; local divergence detected |
| V20 | Collection barrier and double remote manifest implemented; live concurrent-source test pending |
| V21 | Offline pass: local case/artifact survives guest deletion; database survives restart |
| V22 | Offline pass: repeated cleanup succeeds; lost deletion response stays blocked |
| V23 | Offline pass: paused descendants included; unrelated fake desktop untouched; automatic expiry respects newer children and failed evidence collection |
| V24 | Offline pass: passive reads do not resume; live pause quota/probes pending |
| V25 | Conservative interrupted-operation state implemented; remote surviving-command behavior pending |
| V26 | Proxy lease/disconnect implementation present; actual viewer pause policy unverified |
| V27 | Offline pass: bearer/cookie authentication, Host/Origin checks, one-use pairing, artifact headers |
| V28 | Local helper pass: 6 MiB command output drained with 5 MiB retention; deadline enforced even with closed output streams. Maximum-size live transfer unverified |
| V29 | Offline pass: reload preserves selection/state; SSE connection reloads authoritative status |
| V30 | Offline pass: keyboard focus, no page overflow, three target layouts reviewed |
| V31 | Single-worker local tests pass; idle fake service RSS 102 MiB |
| V32 | Passed: clean local clone, npm ci, build, typecheck, lint, unit/integration tests, scripted demo, skipped-live behavior, privacy scan |
| V33 | Stretch: not attempted |

## Fresh-checkout verification

A separate clean clone of the committed repository passed `npm ci --no-audit --no-fund`, build, typecheck, lint, six unit tests, fourteen integration tests, the scripted demo, and the privacy scan. The live command printed its explicit skipped result. The temporary clone was removed afterward. UI tests separately passed all three viewports against the production build.

The private publishing helper initially stopped at missing GitHub authentication. After authentication was configured, the helper checked all tracked files and Git history, created a private repository, verified its visibility before pushing, and confirmed private visibility afterward. Source commits are attributed to the authenticated GitHub account through its account-specific no-reply address; no personal email is included. The original attachments, conversation, credentials, runtime state, and generated evidence were not committed. Solari live verification remains pending.

## Browser prerequisites on an unprivileged Debian host

The first UI run failed because shared libraries were absent. Installing the browser alone is not sufficient. The implementation environment recovered without privileged changes by downloading the distribution's packages and extracting them into a user-owned directory:

```sh
mkdir -p "$HOME/.local/share/workbench-browser-libs/debs"
cd "$HOME/.local/share/workbench-browser-libs/debs"
apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libxdamage1 libxkbcommon0 libasound2t64 libatspi2.0-0t64
for package in *.deb; do dpkg-deb -x "$package" ..; done
export LD_LIBRARY_PATH="$HOME/.local/share/workbench-browser-libs/usr/lib/x86_64-linux-gnu"
```

Return to the repository before `npm run test:ui`. These package names match the tested Debian release; other distributions should use their own supported browser dependencies. Browser libraries are test tooling, not a requirement for the headless Workbench service.

## Local service measurement

One fresh fake-provider service, Node 24.21.0 on Linux, with no runs: RSS **102 MiB**. Twenty sequential authenticated status requests gave median **0.80 ms** and 95th-percentile **1.82 ms** (sorted sample rank 19/20), including client HTTP processing. This is a small idle sanity check, not a provider or loaded-service benchmark. Maximum transfer memory remains unverified.

## Live probe accounting

The live script is explicitly gated by `WORKBENCH_LIVE=1` and `SOLARI_API_KEY`. It retains private intent/results under the state directory. It limits itself to one active desktop and two total desktops, one checkpoint, bounded commands, and an eight-minute operation-admission deadline. Cleanup runs even after test failures. It never treats a timed-out mutation as permission to create another resource.

An interruption can outlast the local admission deadline while the provider finishes a previously admitted request. The provider's rolling idle policy is not a hard billing deadline. If cleanup is unconfirmed, preserve the private database and reconcile it; do not delete the only ownership record.

## Outstanding acceptance work

Resolve the checkpoint receipt/restore failure, complete G1–G7, prove browser-memory restoration in the exact visible tab, verify live stream/pause behavior, execute the actual-agent repair scenario, record real evidence, and verify the live README path. Until then, M0's live exit gate and M2–M7's live-dependent exit gates remain open. M1's offline service/recovery deliverable is implemented and tested.

## Follow-up requirement audit

The original clean-clone check covered the first fourteen integration tests. A subsequent audit added ten tests for real controlled guest-helper subprocesses, ambiguous remote ownership, retention dependencies, database migration, and historical privacy checks. The MCP transport test also verifies its byte budget with Unicode logs while preserving downloadable evidence references. Startup now preserves bounded diagnostic logs through a guest supervisor; commands enforce timeouts even after both output streams close. Reconciliation reports ambiguous owned resources with local identifiers while withholding provider identities. Automatic expiry does not delete a newer repair child or resources whose evidence collection failed. These changes still require live Solari validation.

## First credentialed live checks

Live checks ran with the key loaded from an owner-only environment file outside the repository. The workstation template supplied Google Chrome rather than Firefox. Browser discovery and a dedicated profile under guest runtime storage now open the probe without first-run prompts. A real screenshot was visually inspected and showed the local probe page and the typed unsaved draft. Source upload/digest verification, Python app startup/readiness, guest commands, screenshot capture and GUI typing completed successfully.

Snapshot creation returned an identifier, but an immediate restore reported `Snapshot not found`. A subsequent run added a receipt lookup and correctly retained an uncertain capture when that receipt could not be confirmed. Browser/process/disk restoration and fork acceptance therefore remain unverified. No passing checkpoint result is claimed.

Deletion was initially observed in progress. Follow-up cleanup confirmed completion; the adapter now waits up to thirty seconds for the terminal deletion state without replaying the delete request. Initial inventory reads reported zero desktops and snapshots, but later reads revealed a checkpoint again. Those initial empty samples are superseded by the follow-up findings below. The ownership record remains in private local state for diagnosis. Provider logs, session identifiers, source screenshots and environment files were not published.

Four adapter regression tests cover installed-browser launch/profile selection, asynchronous deletion without mutation replay, preserving a snapshot identifier before reporting an unconfirmed receipt, and redaction of private session identifiers from SDK close warnings. Live provider failures are retained privately; published results contain only sanitized observations.

## Follow-up live recovery and cleanup audit

A private HTTP trace confirmed a successful snapshot creation receipt and a matching, explicitly restorable metadata response, followed by a 404 from in-place revert. Reconciliation subsequently recovered a previously unconfirmed checkpoint by its exact name. Creating a repair fork from that retained checkpoint succeeded; server boot, memory and disk values matched, the original unsaved draft was visible, and a child-only source edit exported as a reconstructed, verified patch. This was a controlled probe, not the coding-agent task-board acceptance scenario.

Cleanup remains unresolved. The most recent six catalog reads contained 1, 0, 0, 0, 1 and 1 matching owned checkpoints, despite deletion responses reporting absence. No owned desktops were listed. The affected local checkpoint remains unverified and its run has blocked cleanup; no further provisioning was started. See the [sanitized provider compatibility report](provider-compatibility-issue.md). Private trace bodies and resource identifiers were not published.

Additional regression coverage checks the real pinned SDK request transport, temporary inventory omissions, resource reappearance after cleanup, confirmed-absence handling for repeated deletion, and the distinction between rejected restore requests and unknown transport outcomes. All 36 integration tests pass. These tests verify Workbench's response to inconsistent inventory, not provider correctness.

## Read-only transport investigation

On 2026-10-01 UTC, native Node HTTPS and Python urllib independently reproduced changing snapshot presence without intervening writes. One persistent TLS connection returned both 200 and 404 for the same snapshot. Removing the kind filter did not resolve it. The new bounded `scripts/diagnose-snapshots.ts` reproduced the behavior against an existing owned receipt without mutating local state or remote resources. The documented in-memory snapshot catalog is consistent with divergent gateway views, but the deployment cause requires provider confirmation. The [compatibility report](provider-compatibility-issue.md) includes sequences, timestamps, the proposed provider fix and the limits of durable-template promotion.

Snapshot DELETE 404 now remains unconfirmed even if a subsequent lookup could also return 404. A successful DELETE is checked for a conflicting direct lookup before the existing list check. All 38 integration tests, typecheck, lint and production build passed after this correction. No new desktop, snapshot or template was provisioned; the previously owned checkpoint remains unresolved.
