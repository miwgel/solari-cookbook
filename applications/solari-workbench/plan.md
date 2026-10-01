# Solari Workbench: Build Plan

> Give your existing agent a computer you can inspect, checkpoint, and recover.

**Working title:** Solari Workbench. An independent project built with Solari.
**Repository note:** This reviewed public edition is published in a fork of the Solari cookbook. The original development repository, its history, credentials, and raw operational evidence remain private. See docs/verification.md for actual progress.

**Spec date:** September 30, 2026.
**Status:** Offline implementation verified; initial live desktop and late-checkpoint fork checks passed; in-place restore and consistent checkpoint cleanup remain unresolved. See docs/verification.md.
**Primary user:** A developer running a coding agent in an isolated, headless Linux workspace.
**Signature workflow:** Turn a failed interaction into a living bug report, then fork its environment to investigate a repair.

## 1. Start Here

This file is the handoff. It must remain useful without the original conversation, the original computer, or private homelab notes.

The first implementation task is **M0: prove the Solari contracts**. Do not begin by building a polished dashboard. First prove that the selected SDK can create a desktop, display it, preserve its state, fork it, and clean up all resources.

Read these sections first:

1. [Product promise](#2-product-promise): what we are building and why.
2. [Scope](#5-scope): what belongs in the submission.
3. [Architecture](#7-architecture): where code, tools, and state live.
4. [Milestones](#18-build-milestones): what to build next and how to finish it.
5. [Development Host handoff](#25-development-host-handoff): instructions for the implementing agent.

Everything else is reference material for the milestone in progress.

### Progress Board

Keep only one milestone marked as active. Each milestone should produce something demonstrable.

- [ ] M0: Verify provider contracts and record decisions.
- [x] M1: Establish the service, durable records, and fake provider (offline exit gate verified).
- [ ] M2: Run one selected project in an inspectable desktop.
- [ ] M3: Connect the real coding agent through MCP.
- [ ] M4: Preserve and recover a living bug report.
- [ ] M5: Fork a repair and export a verified patch.
- [ ] M6: Finish the observation dashboard and failure recovery.
- [ ] M7: Verify the full experience and prepare the submission.

**Next action:** Resolve the in-place restore and inconsistent checkpoint cleanup described in docs/provider-compatibility-issue.md; preserve private ownership records and avoid new provisioning while cleanup is uncertain. The offline implementation, CLI, MCP transport, dashboard, source/patch workflow, and fake-provider tests are present. M0 live verification remains the active gate.

## 2. Product Promise

Developers often run agents in a remote VM to keep development separate from their personal computers. Those agents can read files and run commands, but their environment may have no provisioned browser or desktop. Installing an entire desktop into that VM adds maintenance and does not provide a convenient way to preserve a failed interaction.

Solari Workbench gives the existing agent an on-demand Solari desktop. The app being developed and the browser used to inspect it run together in that desktop. The developer can see the same screen the agent sees.

When an interaction fails, Workbench saves the relevant evidence and a machine checkpoint. A later investigation can create an independent desktop from that checkpoint, change the code, verify a repair, and return a patch to the original workspace.

The agent's process and orchestration remain on the developer's VM. Model inference remains with whatever provider that agent already uses; this project does not make Codex inference local.

### The Memorable Result

**A bug report you can reopen as a working computer.**

Call this a **living bug report** in product explanations. In schemas and code, use the simpler term `case`.

The report consists of two related things:

- A local evidence bundle: what failed, what was expected, what source was running, screenshots, actions, and test results.
- A reference to a Solari checkpoint: the retained guest state from which an authorized user can start an investigation.

Evidence stays readable after the remote resource is deleted. The report must clearly show when its live environment is no longer available.

This is an account-bound recovery workflow. A JSON export is not a portable VM image, and it does not grant another Solari account access to a checkpoint.

## 3. Why This Is Worth Building

### Personal Use

The first real installation is `development VM`: a small, isolated Debian VM used for agent-driven development. Workbench should make it practical to inspect projects without placing a browser on the personal computer under agent control or installing a permanent desktop in `development VM`.

An interrupted debugging session should be easy to resume. Opening a case should answer:

- What was the agent trying to do?
- What actually happened?
- Which code and machine state produced it?
- What is still running or retained?
- What is the next useful action?

### Value Beyond a Connector

Solari already provides SDKs, a CLI, and an MCP server. Building another list of browser or mouse tools would contribute little by itself. The contribution here is the workflow across those tools: selected workspace transfer, inspectable failures, durable ownership, checkpoint recovery, repair forks, and verifiable results. See [Solari's existing MCP](https://docs.getsolari.com/mcp).

### What Should Impress a Technical Reviewer

These are project goals, not claims about Solari's hiring criteria:

| Signal | Evidence the project should provide |
| --- | --- |
| Useful product judgment | A problem the author actually encounters, solved end to end. |
| Understanding of Solari | A desktop checkpoint used to preserve browser, process, and disk state together. |
| Reliable engineering | Recovery after lost responses, process restarts, and stale connections. |
| Good developer experience | One tested installation path, concise tools, actionable failures, readable artifacts. |
| Restraint | One excellent workflow and explicit limits rather than a large unfinished platform. |
| Honest evaluation | Reproducible tests, actual agent use, measured timings, and visible remaining resources. |

The unusual angle is preserving debugging context as an environment that another agent session can investigate. Do not claim that the idea is unprecedented, that Solari's primitives are exclusive, or that reviewers will necessarily find it novel.

## 4. Working Environment

This repository edition removes private host details from the supplied specification.
Target: an unprivileged Linux account, Node 24 LTS, Git, npm, and outbound HTTPS.
Use a private state directory separate from projects. No personal mounts or forwarded credentials are required.
Recheck account limits, provider credentials, MCP execution, and lifecycle contracts before live claims.

## 5. Scope

### Required for the Useful First Slice

M2 and M3 together deliver this slice: an inspectable prototype first, then access from the actual coding agent.

- One developer and one registered project.
- One Solari desktop active at a time by default.
- Explicitly selected project files, including saved working-tree edits.
- App and visible browser in the same desktop.
- CLI-driven launch, status, screenshot, and cleanup.
- A local page displaying the actual desktop or a clearly labeled screenshot fallback.
- A real MCP image response that the existing coding agent can inspect.

### Required for the Submission

- Named checkpoints and verified restore behavior.
- Living bug reports with source provenance and retained evidence.
- One independent repair fork from a case.
- A patch and test evidence exported back to `development VM`.
- Durable operation tracking and recovery after service restart.
- Resource inventory, explicit pause/resume, and verified cleanup.
- An approachable README and a short recording of the real workflow.
- Both deterministic infrastructure tests and an actual agent acceptance run.

### Stretch Work, in Priority Order

1. A second real project beyond the bundled demonstration fixture.
2. Explicit human input handoff through the same action gateway.
3. Two repair alternatives, compared sequentially or in parallel when quota permits.
4. A second MCP client, with separately recorded compatibility results.
5. Reusable desktop templates for repeatedly used project dependencies.
6. Optional browser-only or headless execution modes.

### Out of Scope for the First Release

- A new model, planner, autonomous repair engine, or chat product.
- A replacement for Playwright, agent-browser, or Solari's official MCP.
- Multi-user authentication, organizations, billing, or a hosted SaaS control plane.
- Automatic patch application, Git pushes, deployment, or publishing.
- A reverse tunnel exposing `development VM` services to Solari.
- Arbitrary desktop-to-sandbox conversions or shared desktop volumes.
- Third-party website automation as the primary demo.
- Replay of the agent's hidden reasoning or a claim of deterministic LLM execution.
- Automatic import of the whole home directory, Git history, or personal credentials.
- A promise that VM rollback reverses actions on external services.

## 6. Core User Journey

1. Register a project on `development VM` and inspect its upload manifest.
2. Start a Workbench run. The service creates a desktop and sends the selected source.
3. Run the app in that desktop and open its local address in its visible browser.
4. The existing agent observes the screen and interacts through Workbench tools.
5. A failed interaction becomes a named case with a screenshot, test output, source fingerprint, and checkpoint.
6. Pause the original run when it is not needed.
7. Fork a repair run from the case. Work inside that independent environment.
8. Verify the repair with assertions independent of the agent's own conclusion.
9. Export a reviewable patch and evidence to `development VM`.
10. Keep only the explicitly retained checkpoint or destroy all owned remote resources.

At every step the developer can distinguish task outcome, environment availability, and cleanup status.

## 7. Architecture

### Placement

~~~text
Personal computer
  Browser: local Workbench dashboard
       |
       | existing SSH connection, local port forward
       v
development VM
  Existing coding agent
       |
       | stdio MCP
       v
  Thin Workbench MCP client ----+
  Workbench CLI ---------------+--> Workbench service
  Forwarded dashboard ---------+       |
                                      +-- SQLite: runs, operations, cases
                                      +-- Local source baselines and artifacts
                                      +-- Solari SDK over HTTPS / WSS
                                                    |
                                                    v
                                             Solari desktop
                                               Selected source copy
                                               App process + local data
                                               Visible browser
                                               GUI + checkpoint state
~~~

The dashboard may connect directly to Solari's supported viewer stream. That connection is for viewing; the Solari API key stays in the service. Test this path from the personal browser during M0.

### Important Boundary

The browser used for the core workflow runs **inside the desktop containing the app**. It reaches the app at a guest-local address. A separately provisioned Solari cloud browser would have separate state and is not covered by this desktop's checkpoint.

The core workflow does not need a public app preview URL. The live desktop is sufficient. A future preview option must be clearly identified as a separate access path.

### One Service Owns State

Use a single local service as the authoritative owner of runs, operations, credentials, and provider connections. CLI, MCP, and UI all call the same application layer.

An MCP client exiting must not implicitly destroy the desktop. A browser tab closing must not silently delete a case. A service restart must reconstruct its records and reconcile remote state.

Use:

- TypeScript with strict checking and ESM.
- Node 24 LTS, npm, and a committed lockfile.
- Fastify for the loopback HTTP API and static UI.
- SQLite through `better-sqlite3`, subject to M0 install verification.
- React, Vite, and Lucide for a small dashboard.
- The official TypeScript MCP SDK and Zod-compatible schemas.
- A small CLI parser such as Commander.
- Vitest for domain/contract tests; Playwright for dashboard checks.
- A maintained archive library for streaming packages and inspecting entries.

Keep one npm project initially. No Redis, container orchestration, plugin framework, or provider marketplace.

### Suggested Repository Layout

~~~text
README.md
plan.md
package.json
package-lock.json
src/
  core/           # Runs, cases, operations, lifecycle rules
  provider/       # Narrow Solari adapter and deterministic fake
  workspace/      # Manifest, packaging, baseline, patch export
  persistence/    # SQLite migrations and repositories
  server/         # HTTP API, local authentication, events, jobs
  cli/            # Human CLI; delegates to service
  mcp/            # stdio transport; delegates to service
  shared/         # Shared schemas and serialized result types
ui/
  src/            # Run list, run detail, case detail
examples/
  task-board/     # Deliberately broken, documented demo fixture
tests/
  unit/
  integration/
  ui/
  live/
docs/
  compatibility.md
  architecture.md
  verification.md
  demo.md
  decisions/
~~~

Do not create every directory before it has a responsibility. Keep modules scoped to actual behavior.

## 8. Provider Contract and Early Unknowns

Documentation was checked on September 30, 2026. These are planning facts, not a claim that our account or pinned package has passed live tests.

| Capability | Documented basis | Implementation decision |
| --- | --- | --- |
| GUI runtime | Workstation desktop template includes a desktop and browser. [Templates](https://docs.getsolari.com/templates) | Probe actual executables, runtime versions, and readiness. |
| Observe and act | Desktop SDK provides screenshots, input, app launching, and a live stream. [Desktop SDK](https://docs.getsolari.com/sdk/typescript/vms) | Use supported methods; keep coordinate metadata with observations. |
| Workspace operations | Shared SDK provides guest commands, files, signed transfers, and metadata-filtered listing. [Shared SDK](https://docs.getsolari.com/sdk/typescript/sandboxes) | Hide provider differences behind one narrow adapter. |
| Checkpoint recovery | Snapshots support desktop RAM/disk restore and independent copies. [Snapshots](https://docs.getsolari.com/snapshots) | Verify three state probes and independence before product claims. |
| Lifecycle | Open connections can affect idle behavior. [VM lifecycle](https://docs.getsolari.com/desktops) | Explicitly own activity policy and disconnect on pause. |
| Existing integration | Solari already has MCP tools. [MCP](https://docs.getsolari.com/mcp) | Add workflow and recovery rather than duplicate a raw tool catalogue. |

### Gates That Must Be Resolved

**G1: Desktop fork API.** The documented `DesktopClient.create` options omit `fromSnapshot`, while `SandboxClient.createDesktop` accepts shared creation options. Compile a minimal example against pinned packages and prove the working desktop-to-desktop path. Do not conceal an incompatible API with `any` or unchecked casts.

**G2: Viewer capabilities.** Verify live rendering, no-input mode, resolution, reconnection, and capability renewal. The documented stream is RFB over WebSocket; it is not automatically an HTML page suitable for an iframe. Use noVNC or the supported mount helper. Do not label a raw `wss://` address as an openable desktop page. Determine whether provider-enforced read-only capabilities exist; a client-side no-input setting is not such a permission boundary.

**G3: Recovery identity.** Verify metadata is available when listing our desktops, including after a lost create response. Verify whether an idempotency key can be supplied and reused across processes. A fresh SDK call must not be assumed to reuse an old key. For checkpoints, persist an operation-derived unique name before creation and verify discovery/list limits. Reconcile exactly one compatible match; zero or multiple matches remain uncertain.

**G4: Paused state.** Verify the deployed account's pause/resume behavior, retention limits, quota accounting, and plan duration constraints. The product must not promise indefinite retention. If pause does not free the needed slot, the one-slot workflow must use a confirmed checkpoint and destroy its source before creating the child, with that behavior made explicit.

**G5: Transfer bounds.** Probe a small archive and the chosen project size cap. Provider transfer ceilings are not established by the current reference.

**G6: MCP location.** In M0, use a disposable minimal MCP/image probe and temporary loopback endpoint to verify execution on `development VM`, local connectivity, and image delivery to the active Codex client. Verify the production service integration in M3. A configuration that works in a local Mac chat is not sufficient.

**G7: Development Host service lifetime.** Verify user services and logout behavior. Foreground mode is the required initial path. Persistent user-service installation is optional until tested.

Record each gate as `verified`, `blocked`, or `unverified`, with package version, date, observation, and next action in `docs/compatibility.md`.

Also prove the fixture's browser-memory observation path on the restored visible browser. A fresh browser context or a server-only response cannot establish that its unsaved draft survived.

## 9. Source Transfer and Provenance

### What Goes to Solari

Only files selected by the registered project's configuration. The source copy is cloud data. The UI and README should state this plainly before the first upload.

Support Git projects first. An empty Git repository is valid. Non-Git directories can follow once the same manifest rules work reliably.

Default selection:

- Include existing tracked regular files intersecting the configured include patterns.
- Include explicitly selected untracked files, using Git's ignored-file rules as another filter.
- Include saved working-tree contents, including changes not committed or staged.
- Exclude deleted files from the imported tree and record their absence.
- Exclude `.git`, dependency caches, build output, Workbench state, and credentials.

Example exclusions include `.env`, `.env.*`, `.ssh`, `.codex`, `node_modules`, provider configuration, and private-key files. Allow a deliberately selected `.env.example` containing placeholders. Explain that path rules do not detect every secret embedded in source.

Do not copy Git remotes, hooks, history, credential helpers, SSH sockets, or the host environment. Configuration contains environment-variable names, not secret values. The demo needs no application secrets.

### Manifest Contract

Each import has:

- `importId`, canonical project root, creation time, and manifest schema version.
- Relative POSIX paths, byte lengths, executable bits, and SHA-256 per regular file.
- A deterministic aggregate digest of sorted entries.
- Relevant Git HEAD and dirty-state summary, if available.
- Explicit included-untracked and excluded-path lists.
- Total file count and bytes.

The imported bytes are the baseline. Git HEAD alone cannot identify a dirty working tree.

Build an immutable local staging copy from the selection, then hash and package that copy. Detect files changing during capture and retry or report a conflict. Upload exactly the staged bytes.

Initially reject symlinks, hard links, special files, absolute archive paths, and parent traversal. This is a deliberate support limit; show the offending path. Use archive APIs, not constructed shell extraction commands. Enforce the same path rules when collecting returned files.

Verify the remote extracted file manifest before running project code. A transfer that has not passed this check is not a successful import.

### Defaults Owned by This Product

These are configurable application limits, not Solari limits:

| Limit | Initial default |
| --- | --- |
| Import size | 50 MiB uncompressed |
| Single file | 10 MiB |
| Imported files | 5,000 |
| Artifact bundle | 100 MiB |
| Tool text response | 8 KiB, plus artifact reference for the full bounded log |
| Captured log per command | 5 MiB with visible truncation metadata |
| Desktop resolution | 1280 x 720 |
| Active desktops | 1 |

Stream transfers instead of buffering complete archives. Raise a limit only after a real use case and resource measurement justify it.

### Configuration Shape

This is a proposed schema to implement and test, not an existing command format:

~~~json
{
  "schemaVersion": 1,
  "name": "task-board",
  "include": ["package.json", "package-lock.json", "src/**", "public/**", "tests/**"],
  "includeUntracked": [],
  "exclude": [".env", ".env.*", "node_modules/**", "dist/**"],
  "setup": [{ "program": "npm", "args": ["ci"] }],
  "start": { "program": "npm", "args": ["run", "dev"] },
  "ready": { "url": "http://127.0.0.1:3000/health", "timeoutMs": 60000 },
  "openUrl": "http://127.0.0.1:3000",
  "artifacts": ["test-results/**"],
  "limits": { "maxActiveMinutes": 30, "maxActiveDesktops": 1 }
}
~~~

Resolve the root from the registered project location, not an arbitrary path supplied by an agent. The registration command adds Workbench's state/output paths to exclusions and validates the schema before upload.

Commands use executable and argument arrays. Project scripts may intentionally invoke a shell, but the bridge must not interpolate paths or tool arguments into shell strings.

### Guest Directory Contract

Use a per-run base directory with separate `source/`, `runtime/`, `artifacts/`, and `scratch/` subdirectories. Pass their absolute paths to the fixture through explicit environment variables.

Persist the chosen guest base path with the run. A fork inherits the checkpoint's existing guest paths; it must not rename them to its new local run ID and break running processes. Separate VMs already isolate identical guest paths.

`source/` contains the imported project and eligible code edits. `runtime/` holds the mutable task dataset, state probes, and application data. `artifacts/` contains declared test output. `scratch/` is for reconstruction and temporary work. A checkpoint includes all of them; the source digest and code patch do not.

New remote source files are export-eligible when they match the configured source include patterns and pass the exclusions, file-type rules, and size limits. Their eligibility does not require membership in the original manifest. Show excluded new files in the export summary so a new module or regression test cannot disappear silently.

## 10. Durable Data and Operations

### Storage

Use a private state directory under `$XDG_STATE_HOME/solari-workbench`, falling back to `~/.local/state/solari-workbench`.

Keep SQLite and artifact directories outside the uploaded project. Use owner-only permissions for private state. Store large images, archives, and logs as files, not database blobs.

Use migrations, foreign keys, and transactions. The service is the only writer. Acquire a process lock so two service instances cannot independently manage the same state directory.

### Records

| Record | Required information |
| --- | --- |
| Project | ID, canonical root, validated config, selection policy. |
| Import | Source manifest, immutable baseline location, digest, capture metadata. |
| Run | Project/import IDs, parent case, local label, private provider identity, generation, states, timestamps. |
| Operation | ID, run, action, request key, expected generation, intent, outcome, timing, error. |
| Checkpoint | Run, private provider snapshot ID, memory size, source digest at capture, availability, ownership. |
| Case | Title, expected/observed behavior, checkpoint, evidence, reproduction steps, context summary. |
| Artifact | Type, local path, byte length, digest, producing operation, sensitivity/public-export status. |
| Event | Ordered sequence number, time, actor, local IDs, sanitized summary. |

Use local IDs in UI, logs, and MCP output. Provider session identifiers and stream URLs can be capabilities; retain them only in private records or transient viewer responses.

### Separate States

Do not use a single `status` field for everything.

| Dimension | Values |
| --- | --- |
| Task outcome | `pending`, `running`, `succeeded`, `failed`, `canceled` |
| Environment | `absent`, `creating`, `running`, `pausing`, `paused`, `resuming`, `restoring`, `deleting`, `deleted`, `unknown` |
| Agent action admission | `enabled`, `held` |
| Operation | `queued`, `executing`, `succeeded`, `failed`, `uncertain`, `canceled` |
| Cleanup | `not_requested`, `pending`, `complete`, `blocked` |
| Evidence / checkpoint availability | `available`, `unverified`, `missing`, `deleted` |

A failed task with a paused desktop is a useful retained investigation, not a contradictory status. A successful task with cleanup pending is not fully finished.

Task success requires a recorded user-level verification result through a `workbench_complete` operation or its CLI/UI equivalent. A successful command, import, or export alone cannot set it. Record whether the outcome was declared by an agent, a human, or a deterministic evaluator, and attach the cited evidence. A capture may mark an observed failure without ending the overall investigation.

### Operation Rules

1. Validate project/run ownership, lifecycle, generation, and action admission.
2. Commit the operation intent before making a remote mutation.
3. Serialize mutations per run. Keep observation separately bounded.
4. Record provider identity as soon as it is known.
5. Persist completion and evidence before reporting success.
6. On timeout or lost connection, record uncertainty when completion is unknown.
7. Reconcile remote state before deciding whether a retry is appropriate.

CLI and MCP mutations carry request IDs so client retries can return the existing operation. Persist a normalized request fingerprint; reusing an ID with different arguments is a conflict. This is separate from provider idempotency.

Enforce active-desktop capacity in a service-wide transaction. Reserve a slot before create, fork, or resume. Creating/resuming runs and uncertain creates hold their reservation until reconciled. Per-run queues alone cannot enforce a global limit.

Do not automatically repeat commands, clicks, snapshot creation, or other mutations with uncertain outcomes. Reads can use bounded retry with backoff.

### Crash Recovery

On startup:

1. Load unfinished operations and known remote resources.
2. Read remote status through methods that do not implicitly resume desktops.
3. Reconcile resources bearing our installation ID and operation metadata.
4. Rebuild usable connections only for runs that should be active.
5. Mark unrecoverable command handles as interrupted or uncertain; do not rerun them.
6. Resume pending cleanup and expired-retention work under the stored policy.
7. Present unresolved resources with a specific recovery action.

Never identify ownership solely by creation time or delete every resource in the account. Follow pagination when listing resources.

## 11. Agent and CLI Interfaces

### Design Rule

Expose a compact workflow that returns useful evidence. Keep provider calls inside the service. The agent should not have to understand Solari session capabilities or manage signed URLs.

Use the same schema for CLI, HTTP, and MCP results where practical. Long operations return an operation ID promptly, and status polling reports progress. Tool timeouts must not abandon ownership of a running remote operation.

### Proposed MCP Tools

These names are the public contract to implement, subject to a recorded change if real client testing shows a problem.

| Tool | Purpose and key inputs |
| --- | --- |
| `workbench_start` | Start a registered project; project ID and optional task label. |
| `workbench_status` | Read run/operation/case status; never implicitly resume. |
| `workbench_observe` | Current screenshot, observation ID, dimensions, generation, concise state. |
| `workbench_act` | Typed GUI action using run ID, generation, and recent observation ID. |
| `workbench_exec` | Bounded guest command; executable, arguments, guest cwd, timeout. |
| `workbench_files` | Bounded read/write/list inside approved guest project/artifact roots. |
| `workbench_capture` | Named checkpoint only, or checkpoint plus case evidence; explicit `mode`. |
| `workbench_restore` | Restore a known owned checkpoint into its compatible run. |
| `workbench_fork` | Start one repair run from a case/checkpoint. |
| `workbench_export` | Collect evidence and a patch against the imported baseline. |
| `workbench_complete` | Declare task outcome with verification/evidence references and actor provenance. |
| `workbench_lifecycle` | Explicit pause, resume, or destroy of a known owned run. |

Model GUI actions as a discriminated union: click, type, key combination, scroll, or open the configured application URL. Validate coordinates against the observation dimensions.

Increment a run's generation after restore, resume, or connection recovery that could invalidate assumptions. Invalidate old observations after admitted guest mutations, including commands and file writes that might affect the display. Reject an action from an older generation; return instructions to observe again. This prevents known stale actions, but does not guarantee the page cannot change between screenshot and click.

Return screenshots as actual MCP image content blocks with the correct MIME type. A path or base64 string in ordinary text is not sufficient. Include a small structured result and human-readable summary; cap logs and link to local artifacts. Follow the [MCP tool result contract](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

MCP stdout is protocol-only. Diagnostics go to stderr. Tool errors must be machine-readable and must not report successful actions that did not complete.

Suggested server instruction:

> Workbench operates a remote copy of a registered project. Observe before GUI actions. Preserve a useful failure as a case. Work in a repair fork and export the patch with test evidence. Status reads do not resume desktops. Pause retained runs or destroy finished runs explicitly.

### CLI Surface

Implement a small human equivalent, with `--json` where useful:

~~~text
workbench doctor
workbench serve
workbench project add <path>
workbench project inspect <project-id>
workbench start <project-id>
workbench status [run-id]
workbench observe <run-id>
workbench capture <run-id> --title <title>
workbench capture <run-id> --checkpoint-only --name <name>
workbench restore <run-id> --checkpoint <checkpoint-id>
workbench fork <case-id>
workbench export <run-id>
workbench complete <run-id> --outcome <outcome> --evidence <artifact-id>
workbench pause <run-id>
workbench resume <run-id>
workbench cleanup --run <run-id> --dry-run
workbench cleanup --run <run-id> --apply
workbench resources
workbench mcp
~~~

`doctor` is read-only by default. It distinguishes missing configuration, service reachability, authentication, provider connectivity, and unverified live capabilities. Creating a paid desktop belongs in the explicitly requested live test, not a surprise health check.

### Codex Integration

Use a local stdio MCP process on the same host as the service. Generate a snippet with the actual absolute Node and entrypoint paths, avoiding secrets in the snippet.

~~~toml
[mcp_servers.solari_workbench]
command = "/absolute/path/to/node"
args = ["/path/to/solari-workbench/dist/cli.js", "mcp"]
startup_timeout_sec = 15
tool_timeout_sec = 60
~~~

The MCP shim reads the local service discovery/authentication file under the agent account. Only the service needs `SOLARI_API_KEY`.

Test the configuration from the actual remote chat. Current [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) supports stdio configuration, but the exact remote-host configuration route must be verified for the installed app/server version. Do not automatically rewrite unrelated Codex settings.

## 12. Checkpoints and Living Bug Reports

### Capture Transaction

Treat capture as a coordinated operation, not a collection of unrelated background promises:

1. Stop admitting new Workbench mutations for the run.
2. Wait for short in-flight actions; show and handle long commands explicitly.
3. Capture expected behavior, observed behavior, reproduction steps, and bounded logs.
4. Compute the current remote source fingerprint.
5. Capture a screenshot and the fixture's state probes.
6. Create the provider checkpoint.
7. Persist the checkpoint reference and case manifest atomically.
8. Release the action barrier or pause the run according to the requested policy.

A real app can keep changing internally during this sequence. Store timestamps for evidence and checkpoint capture; do not claim an atomic correspondence with every pixel or external event. The deterministic fixture must be quiescent during capture.

If checkpoint creation fails, preserve any local evidence and label the case `evidence only`. If its outcome is uncertain, reconcile using the operation-derived name before retrying. Never display an available checkpoint until it has a confirmed identifier. A checkpoint-only capture uses the same barrier, provenance, ownership, and retention rules without inventing an observed failure.

### Case Manifest

The local private manifest contains:

- Version, local case ID, title, time, task description, and context summary.
- Expected and observed behavior.
- Reproduction steps or relevant recorded tool actions.
- Initial import digest and source digest at checkpoint time.
- Private checkpoint reference, required memory size, and originating run.
- App startup/readiness configuration and relevant tool/runtime versions.
- Screenshot, log, assertion, and artifact references with hashes.
- Parent/repair relationships.
- Last verified availability and retention policy.
- Restoration limits and evidence timestamps.

The context summary is an explicit handoff note, not hidden model reasoning.

### Restore and Fork Semantics

Restore changes the guest state. It does not rewind the local event log, case history, agent conversation, local repository, or provider bills.

Fork creates a new run referencing the same immutable checkpoint and import baseline. Remote edits belong to that child. Parent evidence remains immutable.

Use compatible desktop kind and memory configuration. Paused sources must be handled using the verified lifecycle path before operations that require them to run. Existing control/viewer connections must be refreshed after a machine replacement.

An open browser inside the guest is within the intended checkpoint boundary. Remote websites, hosted databases, third-party APIs, and separate browser sessions are outside it. Restored network connections may need application-level reconnection.

Do not use destructive external side effects in the demo.

## 13. Patch and Evidence Export

The original workspace remains the canonical source. Remote experiments are evaluated against an immutable copy of the imported bytes.

Export:

- `report.md`: concise outcome, expected/observed behavior, and test summary.
- `manifest.json`: schema version, source provenance, artifact hashes, and result metadata.
- `changes.patch`: supported source changes relative to the import baseline.
- Explicit added/deleted/binary-file metadata and changed binary files when supported.
- Before/after screenshots.
- Bounded command logs and independent test results.

Generate the diff from an isolated temporary Git repository or another proven diff tool using only the selected source tree. Never use the local project's index or copy its Git history. Capture added files and executable-bit changes; do not silently omit changes that the patch format cannot represent.

Exclude remote credentials, dependency trees, internal Git metadata, and unselected output. Revalidate returned relative paths and file types before writing local files.

Collect a stable export under the run's mutation barrier, detecting concurrent source changes from background processes and retrying or reporting a conflict. Verify the patch by applying it to a disposable local copy of the exact import baseline, then compare the resulting manifest with the collected remote source.

Local export verification performs structural patch and manifest checks only. Execute project setup/regression commands in a bounded guest scratch tree with explicit environment and runtime-data directories; do not implicitly run imported project code inside the development VM service. Record where each test ran. Pause other work while using the same guest for reconstruction, or use a separately budgeted verification run.

Also compare the current local project with its captured baseline. If it has changed, label the export `local source changed`; this is not an export failure, but the patch must not be described as automatically applicable to the current tree.

Do not modify the user's working tree during export. Applying a patch is a separate, future user action.

Public exports omit provider capabilities, host paths, API keys, and session URLs. Screenshots and logs need content review before publishing; redacting metadata alone does not make their contents public.

## 14. Dashboard and Interaction

### Screens

Keep three simple surfaces:

1. **Runs:** compact rows showing project, task outcome, environment state, age, and cleanup status.
2. **Run detail:** dominant desktop view, current run identity, activity, checkpoints, and artifacts.
3. **Case detail:** expected/observed behavior, captured evidence, checkpoint availability, repair forks, and export.

Use an unframed working layout. No marketing landing page, oversized hero, nested cards, or decorative metrics. The actual desktop screenshots are the primary visual assets.

### Required Behavior

- A running stream is labeled `Live`; a retained image is labeled `Captured at ...`.
- Disconnected, paused, restoring, missing, and deleted states cannot look live.
- The active project, run, and repair parent remain visible near action controls.
- Polling status or opening a case never resumes a paused machine.
- Primary actions reflect the state: resume a paused run, fork an available case, export completed evidence.
- Destroy shows the exact selected resources and retained evidence before execution.
- Long operations show their current phase, elapsed time, and actionable failure.
- Page reload reconstructs state from the service.
- SSE events use sequence IDs and resynchronization after gaps.
- Errors remain near the affected operation; do not rely only on temporary toasts.

### Agent Hold

Required scope includes a **Hold agent actions** control. It blocks new agent-originated mutating Workbench calls, cancels queued agent mutations, waits for short admitted actions, and displays known running commands. Human capture, pause, export, cleanup, and release-hold controls remain available. Resume of agent action admission is explicit.

This control does not stop the agent's local shell, commands already running in the guest, browser timers, or work performed outside Workbench. Describe exactly that boundary.

The first release's viewer transmits no input. This is a Workbench client behavior, not a claim that its underlying stream capability prevents writable access by another client. Writable human control is stretch work and must use the same serialized action path. Do not present an uncoordinated writable VNC client as a supported handoff.

### Visual and Accessibility Checks

- Stable desktop aspect ratio with fit-to-view; no layout jump when loading.
- Correct coordinate mapping if interactive viewing is added.
- Icons from Lucide for tools, with accessible names and tooltips.
- Text labels for consequential actions such as pause, resume, and destroy where clarity helps.
- Keyboard navigation, visible focus, and status conveyed by text as well as color.
- Normal readable body text; no viewport-scaled typography or negative letter spacing.
- Restrained neutral surfaces with distinct status accents; no single-hue decorative theme.
- At 390 px width, status, case summary, and artifacts remain usable without horizontal page overflow.
- At desktop widths, the live environment receives most of the space.

Test 1440 x 900, 1024 x 768, and 390 x 844 viewports. Inspect actual screenshots, not only DOM assertions.

### Local Access

Bind the service to `127.0.0.1` by default on an available configurable port, proposed `4317`.

From the personal computer:

~~~sh
ssh -N -L 4317:127.0.0.1:4317 your-dev-host
~~~

Then open `http://127.0.0.1:4317`. Verify that the existing SSH setup permits the forward; do not solve a failure by exposing the service publicly.

Use a service-generated local token and a short pairing flow for browser access. Exchange a one-time code for a same-origin HttpOnly cookie; omit codes from access logs and clear any bootstrap value from the address bar. CLI/MCP read a private discovery file. Validate Host and Origin, reject cross-origin mutation requests, and do not enable permissive CORS. This is a single-user local service, not a multi-user identity system.

Serve downloaded HTML and other active artifacts as attachments or plain text. Do not execute guest-generated reports under the dashboard's privileged origin.

## 15. Resource Ownership, Cost, and Cleanup

### Ownership

Tag resources with a stable installation ID, local run ID, and creation operation ID where the verified API permits. Persist snapshot ownership locally as soon as its identifier is known.

The resources view includes active desktops, paused desktops, snapshots, pending cleanup, and uncertain operations. It must distinguish owned resources from unrelated account resources.

### Default Policy

- One active desktop.
- Thirty active minutes per run as a configurable local scheduling limit.
- Five minutes without admitted agent work or an explicit viewing lease triggers pause while the service is available.
- At most three retained cases per project by default; ask the user to choose what to retain when the limit is reached.
- At most six retained checkpoints and four retained desktops per project, including paused children and checkpoint-only captures.
- Seven-day checkpoint retention unless explicitly pinned.
- Cleanup previews show pinned resources and dependency conflicts.

These limits describe application behavior. The local service cannot enforce a timer while `development VM` is off or disconnected. Use a verified provider idle policy as a fallback, and document where it is not equivalent to a wall-clock limit.

Every retained run and checkpoint has a retention owner and expiry/pinned state. Refuse new retention when its limit is reached until the user chooses cleanup or raises the limit; do not silently evict useful evidence. Dependent children keep the cleanup relationship visible.

Passive status polling must not count as user work or reconnect paused desktops. An open viewer/control socket can affect provider activity, so close it during pause and after the configured viewing lease. Test this behavior; do not assume timeout means maximum lifetime.

### Cost Display

Display measured active duration, machine size, snapshot bytes when known, and an optional labeled estimate based on a dated rate configuration. Do not call the estimate a bill or a hard spending cap.

Retained snapshots can incur storage charges. Pricing and concurrency must be rechecked before live tests and publication. Keep rates outside core logic. See [current Solari pricing](https://docs.getsolari.com/pricing).

Support the workflow with one running desktop: preserve and pause the original, then run the repair fork. Parallel forks are not required.

### Cleanup Contract

1. Identify only owned resources in the selected run/case scope.
2. Export requested evidence before deletion.
3. Close viewer and control connections.
4. Destroy child desktops, including paused children.
5. Delete unretained checkpoints after their resource dependencies are removed.
6. Confirm resource state with the provider.
7. Persist the result and show any remaining resources.

A closed connection is not a destroyed VM. A paused VM is not complete cleanup. A network error during deletion means cleanup is uncertain until reconciled.

Make cleanup idempotent. If a provider dependency blocks snapshot deletion, show the dependency and the required next action. Never silently remove a pinned case merely to make cleanup green.

If local evidence collection fails, keep the remote resource visible and retryable; do not destroy the only useful copy under an automatic success path.

## 16. Failure Behavior

| Situation | Expected behavior |
| --- | --- |
| Missing API key | Configuration error before resource creation. |
| Authentication failure | Actionable message; no repeated creation attempts. |
| Capacity or quota exhausted | Explain the constraint; keep existing work visible. |
| Lost create response | Mark uncertain, reconcile by metadata, avoid duplicate desktop. |
| Transfer interrupted | Retain operation; retry bounded transfer or clean partial guest state before execution. |
| Setup exits nonzero | Show command, exit code, bounded logs, and inspect/pause/cleanup options. |
| Readiness timeout | Report startup failure; do not open a success state. |
| GUI not ready | Keep provisioning state; bounded probe and explicit timeout. |
| Screenshot failure | Report no fresh observation; never substitute an old frame as current. |
| Client retries mutation | Return persisted operation by request ID. |
| SDK connection drops | Mark connection state, reconcile, invalidate stale observations. |
| Restore fails | Show actual provider outcome and retain existing evidence. |
| Snapshot outcome unknown | Reconcile; do not create repeated paid snapshots blindly. |
| Service restarts | Reconstruct records, reconcile remote state, preserve held action admission. |
| Remote command survives client exit | Display known command state; do not repeat it. |
| Export too large | Stop at configured bound and report which artifacts were omitted. |
| Local source changes | Preserve export, flag divergence, avoid applying changes. |
| Provider resource disappears | Mark unavailable; keep the local report readable. |
| Cleanup cannot be confirmed | Show pending/uncertain cleanup with retry action. |

Error objects should carry a stable code, short explanation, operation ID, retryability, and next useful action. Keep raw stacks in local developer logs with capability redaction.

## 17. Demonstration Fixture

### Fixture: Bulk-Edit Task Board

Build a deliberately small, clearly labeled demonstration app. Use a table of a few tasks, selection checkboxes, a filter, and a bulk-priority editor.

Seeded defect: applying a priority change affects all visible tasks instead of only selected tasks. Use fixed task IDs so assertions are unambiguous. Do not hide that this is an intentional fixture.

The pre-failure setup includes an unsaved note and selected task IDs in browser memory. The app server maintains an in-memory boot nonce and a small file-backed task dataset in the guest runtime directory. The file marker is also outside the source directory.

A fixture-only debug view exposes the browser draft, selection, and per-tab nonce from that exact page's memory. Inspect it in the existing visible browser, through visible text/screenshots or a verified attachment to that browser context. A server endpoint exposes the server/file probes separately. The harness must never create a fresh browser to assert browser-memory restoration.

### Three State Probes

| Probe | What it demonstrates |
| --- | --- |
| Browser-only draft and selection | A restored interactive state, not merely the same URL reopened. |
| Server boot nonce and in-memory marker | Process memory continuity, not only file restoration. |
| Guest file marker / dataset | Disk restoration. |

The test harness must observe the probes through a documented test-only route or script. It must not reseed them during restore. Avoid continuously changing clocks, animations, or remote requests.

### Reference Scenario

1. Launch the fixture and record its initial source digest.
2. Select tasks A and B, leave C unselected, and enter an unsaved note.
3. Capture `prepared`: the draft and selection exist; C still has its original priority.
4. Apply a bulk priority change; assert that C changed incorrectly.
5. Capture `failure` and a case: C has the wrong priority; record the three expected state probes for this moment.
6. Fork the repair run from `failure`.
7. Verify the failure-state probes before continuing.
8. Fix the source inside one repair fork.
9. Reset fixture data using its documented demo control, run independent regression assertions, and repeat the visible interaction.
10. Export the patch and evidence.
11. Fork `prepared` in a separate sequential run and verify that its unmodified code still reproduces the defect.
12. Clean up according to the explicit retention choice.

Keep the prepared-state checkpoint and failure checkpoint distinct. A post-failure snapshot cannot honestly be described as the state before the failed action.

Use the failure checkpoint for the living-report handoff. Its reproduction notes explain the next steps needed to retest after a repair. For tests requiring the exact pre-action state, use the prepared checkpoint.

A frontend source repair may require a page reload or app restart. Preserve the original case and show that this is part of the repair. Do not claim that the code can always be changed without disturbing the browser's old in-memory state.

### Two Demonstration Paths

**Scripted verification:** deterministic commands and assertions validate infrastructure behavior without an LLM.

**Agent workflow:** the existing coding agent receives the user-level bug task, inspects the real screen, investigates code, makes a repair, and returns evidence.

Neither path substitutes for the other. Published results and recordings must identify which path was used.

## 18. Build Milestones

Each milestone has a bounded deliverable and an exit gate. Implement the smallest useful behavior, verify it, record the result, and then move on. Work may continue across milestones without asking for repeated confirmation when it remains within the authorized build.

Use short progress notes: what now works, what is uncertain, and the next check. Keep detailed failures in the verification log.

### M0: Prove the Provider Contracts

**Deliverable:** An executable contract probe and `docs/compatibility.md`.

Use a tiny standalone probe page/process in M0. It needs only an unsaved input, an in-memory marker, and a disk file. The complete task-board fixture is built in M2; M0 must not depend on it.

Tasks:

- [ ] Verify the actual development VM account, resources, Node installation, and project directory.
- [ ] Select a supported user-space Node 24 patch and pin it.
- [ ] Inspect and pin the required Solari and MCP SDK versions; commit the lockfile.
- [ ] Compile creation, connection, screenshot, command/file transfer, checkpoint, restore, fork, pause/resume, and destruction calls.
- [ ] Verify SQLite dependency installation without privileged changes.
- [ ] Implement a small live probe with explicit resource ownership and cleanup.
- [ ] Resolve G1-G7 with live evidence where credentials are available.
- [ ] Test the no-input viewer from the actual personal browser through the SSH setup.
- [ ] Test identification of a lost desktop-create response and a lost snapshot-create response.
- [ ] Record runtime, template, browser, SDK versions, resource IDs privately, and cleanup result.

**Done when:** A real desktop passes disk/process/browser-state checks, a child starts from a checkpoint, and all probe resources are either confirmed deleted or explicitly recorded as retained.

**Failure gate:** Missing credentials, quota, or unsupported APIs means live verification remains unverified. Continue offline scaffolding, but do not claim the core workflow works. If desktop checkpoint/fork cannot work through a supported API, revise this spec before building the submission around it.

**Scope limit:** No full dashboard, production agent loop, or custom template builder.

### M1: Durable Service and Fake Provider

**Deliverable:** A local service that can survive restart, with no paid resources required.

Tasks:

- [ ] Establish the repository scripts, strict TypeScript, formatting/linting, and test setup.
- [ ] Implement SQLite migrations and the private artifact store.
- [ ] Implement project/run/operation records, request fingerprints, capacity reservations, and per-run queues.
- [ ] Add a narrow provider adapter based on M0's verified methods.
- [ ] Build a deterministic fake provider supporting delays, failures, lost responses, and persisted fake remote state.
- [ ] Add loopback service discovery, local authentication, and CLI status.
- [ ] Add event sequencing and startup reconciliation.

**Done when:** Automated tests show that a restarted service recovers an uncertain create without duplicating it, rejects request-ID conflicts, and respects one active slot across concurrent requests.

**Scope limit:** The fake must be visibly identified as fake in output and UI. Avoid building a generic simulation of every Solari API.

### M2: One Inspectable Remote Project

**Deliverable:** The first inspectable prototype; M3 completes its integration with the agent.

Tasks:

- [ ] Implement project configuration and manifest inspection.
- [ ] Implement immutable staging, streaming transfer, extraction validation, and digest verification.
- [ ] Build the small task-board fixture with separate source/runtime/artifact directories.
- [ ] Run setup/start commands and verify readiness with a deadline.
- [ ] Open the app in the desktop's existing visible browser.
- [ ] Capture a real screenshot and expose a minimal authenticated viewer page.
- [ ] Implement pause, explicit destruction, and final resource inventory.

**Done when:** A command on development VM starts the fixture in Solari, both screenshot and viewer show the same guest, the imported digest matches, and cleanup leaves no unreported resources.

**Scope limit:** One project configuration and one desktop are enough. The viewer page can be plain but must show true state.

### M3: Real Agent Access

**Deliverable:** The first useful agent-integrated slice: the existing coding agent can inspect and operate the remote project.

Tasks:

- [ ] Add the stdio MCP adapter over the same service.
- [ ] Implement start/status/observe/act/exec/files/lifecycle contracts.
- [ ] Implement operation polling for slow requests.
- [ ] Return valid image content and bounded tool text.
- [ ] Generate the absolute-path Codex configuration snippet.
- [ ] Test the actual development VM MCP execution location.
- [ ] Implement observation generations and Hold agent actions.
- [ ] Run one real agent task that reads the screenshot, interacts with the fixture, and reports the observed behavior.

**Done when:** The agent demonstrably uses a current screenshot of the intended guest, its action changes that guest, and old observations and held mutations are rejected.

**Scope limit:** The agent may use a simple manual prompt. Do not build a separate chat UI or reasoning engine.

### M4: Preserve and Recover a Case

**Deliverable:** A living bug report that survives interruptions.

Tasks:

- [ ] Implement checkpoint-only and checkpoint-plus-case capture.
- [ ] Add the capture barrier, source digest, evidence timestamps, and retention owner.
- [ ] Implement snapshot uncertainty reconciliation.
- [ ] Implement restore, connection refresh, generation changes, and fresh observation.
- [ ] Make a case readable after service restart and after guest deletion.
- [ ] Add plain reproduction/context notes for a new agent session.
- [ ] Verify all three state probes without reinitializing them.

**Done when:** `prepared` and `failure` are distinct named checkpoints, restore recovers the expected state, and a new service/client session can locate the case without the old chat transcript.

**Scope limit:** No automatic model-memory persistence. The explicit context summary is sufficient.

### M5: Repair Fork and Export

**Deliverable:** A repair made and verified in an independent environment.

Tasks:

- [ ] Implement fork with parent/checkpoint provenance and compatible memory size.
- [ ] Support the verified one-slot sequence.
- [ ] Preserve the original case while the agent edits the repair source.
- [ ] Implement stable source collection, diff generation, binary/add/delete metadata, and evidence export.
- [ ] Reconstruct the patched import in temporary storage and verify its manifest.
- [ ] Run regression commands in a bounded guest scratch tree.
- [ ] Detect local source divergence and keep the working tree unchanged.
- [ ] Add explicit task completion with evidence references.
- [ ] Verify unmodified behavior from a separate fork of `prepared`.

**Done when:** The baseline fails, the repair passes independent assertions, the exported patch reconstructs the repaired source, and the original case remains available according to policy.

**Scope limit:** One repair fork is sufficient. Do not add parallel model competition before this path passes.

### M6: Dashboard and Recovery Polish

**Deliverable:** A usable observation and case-management interface.

Tasks:

- [ ] Finish runs, run detail, and case detail.
- [ ] Implement live/captured/disconnected/paused/restoring/deleted states.
- [ ] Show task outcome separately from lifecycle and cleanup.
- [ ] Add activity, artifacts, lineage, retention controls, and cleanup preview.
- [ ] Handle reload, SSE gaps, stale capabilities, and unavailable checkpoints.
- [ ] Test keyboard access and the three target viewports.
- [ ] Measure development VM memory and transfer behavior.
- [ ] Test viewer lease expiry and pause with an open tab.
- [ ] Verify optional user-service installation only if used in the documented path.

**Done when:** A developer can find the failure, inspect its evidence, fork a repair, export it, and see remaining resources without reading logs or remembering IDs.

**Scope limit:** Do not add writable human control unless all required behaviors already pass.

### M7: Submission and Documentation

**Deliverable:** A reproducible project another developer can understand and run.

Tasks:

- [ ] Run the full offline suite and the bounded live suite.
- [ ] Run the actual agent acceptance scenario from a clean service state.
- [ ] Follow the README from a fresh project checkout on development VM.
- [ ] Record results, versions, timings, resource counts, and manual steps.
- [ ] Capture the real demo recording and stills.
- [ ] Review exported material for private content.
- [ ] Record known limitations and incomplete stretch work.
- [ ] Add an appropriate license, dependency attribution, and independent-project notice.
- [ ] Recheck any challenge submission instructions before publishing.

**Done when:** The Definition of Done passes, the demo is backed by actual evidence, and the README's commands match the released code.

**Publishing boundary:** Prepare the repository and submission materials. Publishing, pushing, tagging, or messaging Solari requires the user's publishing instruction.

## 19. Verification Matrix

Tests are organized around claims and failure modes, not coverage percentages. P0 checks block the submission. P1 checks are required for the supported workflow, with a documented limitation only where the feature is explicitly removed from scope. P2 checks support stretch work.

| ID | Priority | Check | Passing evidence |
| --- | --- | --- | --- |
| V01 | P0 | Dirty workspace import | Saved tracked edits and selected untracked files match remote bytes. |
| V02 | P0 | Exclusions and path boundaries | Seeded credential sentinels absent; traversal, symlinks, and special files rejected. |
| V03 | P0 | Consistent capture | Concurrent source changes cannot produce an accepted mixed manifest. |
| V04 | P0 | App startup | Real readiness probe passes; nonzero setup/start and timeout cases remain failures. |
| V05 | P0 | Same guest observation | Visible marker matches screenshot, stream, run identity, and guest probe. |
| V06 | P0 | MCP image delivery | Actual target client receives a decodable image content block. |
| V07 | P0 | GUI action validity | Wrong generation, wrong run, invalid coordinates, and stale observation rejected. |
| V08 | P0 | Non-GUI invalidation | Observe, mutate via exec/files, then act with old observation is rejected. |
| V09 | P0 | Agent hold | Queued/new agent mutations stop; human recovery controls and observations still work. |
| V10 | P0 | Local idempotency | Same request/payload returns one operation; changed payload conflicts. |
| V11 | P0 | Global capacity | Concurrent start/fork/resume cannot over-admit the local one-slot policy. |
| V12 | P0 | Lost create response | Restart discovers the owned desktop without creating another. |
| V13 | P0 | Lost checkpoint response | Exact operation-name match reconciles; ambiguity remains visible. |
| V14 | P0 | Restore | Browser draft, server memory marker, and disk marker match the checkpoint. |
| V15 | P0 | Restore connection recovery | Fresh observation works; previous connections/actions cannot masquerade as current. |
| V16 | P0 | Fork independence | Child modifications are absent from a separately restored original checkpoint. |
| V17 | P0 | Actual agent repair | Agent inspects the screen and modifies remote code; independent regression fails before the repair and passes afterward. |
| V18 | P0 | Patch completeness | Added/deleted files, text, supported binary changes, and executable modes reconstruct correctly. |
| V19 | P0 | Original workspace preservation | Before/after source and Git-index fingerprints are unchanged by run/export. |
| V20 | P0 | Export consistency | Changing remote source cannot silently create a mixed patch; runtime data excluded. |
| V21 | P0 | Evidence durability | Report remains usable after service restart and confirmed guest deletion. |
| V22 | P0 | Cleanup | Repeated cleanup succeeds; unknown deletion is not marked complete. |
| V23 | P0 | Dependency cleanup | Paused children and snapshot dependencies handled; unrelated resources untouched. |
| V24 | P1 | Pause/resume | Probes remain consistent; merely opening the UI/status does not resume. |
| V25 | P1 | Service/command interruption | Command is not repeated after service loss; uncertain state is explicit. |
| V26 | P1 | Viewer lifecycle | Open tab cannot defeat Workbench's verified pause policy while service is running. |
| V27 | P1 | Local web boundary | Token/Origin/Host checks, no permissive CORS, active artifacts cannot execute in UI origin. |
| V28 | P1 | Output/resource limits | Oversized transfer/log/artifact produces bounded memory and visible truncation/error. |
| V29 | P1 | Dashboard recovery | Reload/SSE gap reconstructs accurate state and selected run. |
| V30 | P1 | UI accessibility/layout | Keyboard flow and screenshots pass at all target viewports. |
| V31 | P1 | Development Host fit | Measured service memory and tests fit the actual account limits. |
| V32 | P1 | Documentation path | Fresh-checkout README succeeds with only stated prerequisites. |
| V33 | P2 | Second project/client | Independently recorded compatibility result, not inferred from the first. |

### Test Layers

**Unit tests:** State transitions, selection rules, hashes, request fingerprints, path validation, error mapping, retention decisions, and stale observations.

**Integration tests with fake provider:** Persistence, restart recovery, operations, concurrency, lost responses, failed downloads, and cleanup graphs. The fake remote state must survive service restarts so the test does not erase the problem it is meant to detect.

**UI tests:** Real service with deterministic fake runs and evidence. Verify controls, empty/error states, authentication, and rendering. Inspect screenshots manually once per meaningful layout change.

**Live provider tests:** Minimal actual Solari sessions for contracts that a fake cannot establish. These are explicitly enabled, tagged, and bounded.

**Actual agent acceptance:** A real Codex session running on development VM through the actual MCP transport. Preserve tool-action evidence and the independent evaluator's result.

### Proposed Developer Commands

Implement these commands as the relevant milestone lands:

~~~sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:ui
npm run build
npm run test:live
npm run demo:scripted
~~~

`npm test` and ordinary CI must never provision paid resources. Require an explicit live-test setting, such as `WORKBENCH_LIVE=1`, and an available API key for `test:live`. When not enabled, report `SKIPPED: live provider verification not run`; never count that as a passed contract.

Give live runs a maximum resource count, operation deadlines, at most a bounded number of safe retries, a cleanup block, and a final resource inventory. An interrupted cleanup is a test failure with recoverable state.

### Actual Agent Acceptance Prompt

Use a task-level prompt, not a transcript of the exact desired tool calls:

> Inspect the task-board project through Workbench. Bulk priority changes appear to affect tasks that were not selected. Preserve a useful failure case, investigate a fix in a repair fork, and return a patch with verification evidence. Keep the original case available until the verification is complete, then clean up according to the test's retention setting.

The evaluator checks selected and unselected records independently. It also checks that the agent used fresh visual evidence, exported a real source change, and did not modify the canonical development VM tree.

Record model/client versions and human interventions. A failed attempt is useful evidence; do not silently remove it from a claimed success rate.

## 20. Performance and Measurement

Treat these as initial engineering targets, not published claims:

| Area | Target / recording rule |
| --- | --- |
| Local API | Status returns within 300 ms under ordinary idle load, excluding provider work. |
| Service memory | Aim below 250 MiB idle; below 600 MiB during a capped transfer, excluding development tools. |
| Test resources | Keep offline test concurrency low enough for development VM's two-CPU account budget. |
| Provisioning | Record create-to-ready duration; do not invent a guaranteed provider latency. |
| Workspace startup | Record upload, setup, app readiness, and viewer readiness separately. |
| Checkpoint recovery | Measure snapshot, pause, resume, restore, and fork separately. |
| Model workflow | Record agent actions, elapsed time, manual steps, and observed failures. |
| Cleanup | Record requested and confirmed resource counts. |

Do not use frequent polling to improve apparent responsiveness at the cost of keeping desktops active. UI event updates should come from the service.

For a performance claim, document the environment, sample size, failures, and calculation. A single successful demonstration is a demonstration, not a general benchmark.

Do not claim token or cost savings without a real comparison using equivalent tasks, models, policies, and measured usage.

## 21. README and Documentation Specification

The README is part of the product. A reader should understand the problem in about twenty seconds and find the supported demo path immediately.

### Opening Draft

> Your coding agent runs on a server. Now it can use a desktop you can inspect.
>
> Solari Workbench gives your existing agent a temporary Solari computer. When something breaks, preserve the app, browser, and machine state as a living bug report. Fork that checkpoint to investigate a repair, then bring the patch and evidence back to your workspace.

Publish that wording only once those behaviors are verified.

### Required Reading Order

1. Project name, one-sentence promise, and a short actual recording or three-frame sequence.
2. **Try the demo:** supported OS/runtime, Solari account/key, expected cloud use, and one tested command path.
3. **Use your own project:** supported configuration, selection preview, startup and readiness.
4. **Recover a failure:** capture, pause, fork, inspect, export.
5. **Where your files go:** canonical local source, selected cloud copy, local evidence, retained cloud checkpoints.
6. **What gets restored:** guest state and its concrete limits.
7. **Troubleshooting:** symptom, explanation, next action.
8. **Development:** architecture link, offline checks, live checks.
9. **Evidence and limits:** verified versions, known gaps, demo fixture disclosure, measured results.

### Writing Rules

- Short paragraphs with one main idea.
- Descriptive headings that answer a reader's likely question.
- Put the useful command before optional explanation.
- Include a brief expected result after each important command.
- Explain MCP once as the connection that lets the agent call Workbench tools.
- Clearly label commands running on development VM versus the personal computer.
- Keep advanced details in linked documents or collapsible sections.
- Show real screenshots with readable labels, not decorative mockups.
- Avoid a wall of badges, feature adjectives, or unsupported claims.
- Never require the reader to read this entire plan before trying the project.
- Include cleanup beside the demo, not hidden at the end of the README.

Write for interrupted attention without treating readers as incapable. Clear structure helps everyone. Do not include claims that social media causes ADHD.

### Minimum Supporting Documents

| File | Purpose |
| --- | --- |
| `docs/compatibility.md` | Verified API/client/runtime versions, gates, and limitations. |
| `docs/architecture.md` | Placement, state model, snapshot boundary, and ownership. |
| `docs/verification.md` | Commands, actual test results, live test conditions, and remaining gaps. |
| `docs/demo.md` | Reproducible fixture procedure and recording notes. |

Decision records are short and only needed for consequential choices, such as the desktop creation route, viewer connection, or snapshot-recovery limitation.

### Required Troubleshooting Cases

Include missing credentials, unsupported Node version, service not running, MCP on the wrong host, quota/capacity, app readiness failure, viewer disconnected, paused environment, unavailable checkpoint, source divergence, and pending cleanup.

Each entry gives one useful next action. Avoid telling the user to restart everything as a universal remedy.

## 22. Submission Story

### One-Sentence Positioning

> Recoverable debugging handoffs for agents running in your own SSH workspace, built with Solari desktops and checkpoints.

Lead with the developer problem and the visible workflow. Do not position the project as a broad competitor to ChatGPT or claim that hosted agent products lack developer APIs.

### Recording Plan

Aim for a clear 90-150 second overview, backed by a longer uncut recording or reproducible script.

| Beat | What the viewer sees | What it establishes |
| --- | --- | --- |
| 1 | Agent running on development VM; Workbench opens the fixture desktop. | Existing agent, separate runtime. |
| 2 | Bulk-edit failure and an unsaved draft visible. | A concrete stateful problem. |
| 3 | Named case with screenshot and checkpoint. | A failure becomes a recoverable artifact. |
| 4 | Repair fork opens with preserved probes. | Guest state survives the handoff. |
| 5 | Agent fixes the code and an independent test passes. | Practical debugging value. |
| 6 | Patch/evidence return to development VM; retained/cleaned resources are visible. | Reviewable result and responsible lifecycle handling. |

Waiting periods may be sped up only when labeled. Do not edit failed runs into an implied uninterrupted success. Do not expose account credentials, capability URLs, or private projects.

### Evidence Package

- Public source with a tested installation path.
- Actual recording and readable screenshots.
- Example redacted case report and patch.
- Verification matrix results with skipped/failed checks visible.
- Pinned dependency versions and a dated compatibility note.
- A short explanation of why the app and browser share one desktop.
- Known limits, including remote services and retained-resource costs.

Verify the current submission rules before adapting this into a Solari cookbook contribution or social post. This plan does not presume a required repository layout, deadline, or permission to publish.

## 23. Definition of Done

The project is ready to present when all of the following are true:

- [ ] The required path works from the real development VM account without privileged host changes.
- [ ] The existing coding agent uses the implemented MCP tools and sees real screenshots.
- [ ] App and visible browser run in the same identified Solari desktop.
- [ ] Source selection includes intended local edits and excludes seeded private files.
- [ ] A case preserves source provenance, expected/observed behavior, evidence, and a confirmed checkpoint.
- [ ] Browser, process-memory, and disk probes verify checkpoint recovery.
- [ ] An independent repair fork produces a passing result.
- [ ] The patch reconstructs the repaired source without altering the canonical workspace.
- [ ] A fresh client/service session can recover the investigation from local records.
- [ ] Unknown outcomes remain visibly unknown until reconciled.
- [ ] No owned remote resources remain unreported.
- [ ] Offline checks pass; required live checks and agent acceptance are recorded.
- [ ] Dashboard states, layout, and keyboard behavior pass the target checks.
- [ ] README commands work from a fresh checkout.
- [ ] Demo material depicts actual behavior and its limits honestly.

Stretch features do not block completion. An unverified core claim does.

## 24. Decision and Progress Records

### Decisions Already Made

| Decision | Reason |
| --- | --- |
| Desktop-first | Same app/browser state can be inspected and checkpointed together. |
| Existing agent remains on development VM | Fits the user's current workflow and agent choice. |
| SDK behind one local service | Durable resource ownership and shared behavior for CLI/MCP/UI. |
| Single active desktop by default | Fits a small initial budget and simplifies verification. |
| Selected source copy | Avoids a reverse tunnel and captures dirty working-tree contents. |
| Remote repair, exported patch | Makes experiments independent and results reviewable. |
| Observation before writable human handoff | Delivers the central value without an extra input-control system. |
| Deterministic fixture plus actual agent test | Separates infrastructure correctness from model behavior. |

### Decisions to Record During M0

- Exact Node and package versions.
- Supported typed desktop creation/fork path.
- Viewer integration and capability refresh behavior.
- Recoverability of uncertain desktop and snapshot creation.
- Paused-resource quota and retention behavior.
- Actual browser-memory probe method.
- Verified service/MCP execution and persistence on development VM.

Prefer solving these through small experiments. Ask the user only when an unresolved choice changes the product or incurs an unapproved commitment.

### Progress Entry Template

~~~text
Date:
Milestone:
Completed behavior:
Verification and result:
Resources created / retained / deleted:
Known gap:
Next action:
~~~

Record evidence before checking a milestone complete. Update this plan when a verified provider constraint changes the design.

## 25. Development Host Handoff

### What This File Authorizes as a Plan

This document describes the intended implementation. The current chat created the plan only. It did not move files to development VM, create cloud sessions, install software, change Codex configuration, or publish a repository.

Once the user starts implementation on development VM, work within that request and the existing account's permissions. Use the chosen project directory. Inspect its current contents and preserve unrelated changes.

Start with this prompt in the development VM project:

> Read plan.md as the project specification. Begin with M0, verify the current machine and supported SDK contracts, and record evidence before making claims. Build the required workflow milestone by milestone. Keep the implementation small, preserve existing workspace changes, and keep paid resources bounded and accounted for. Use concise progress updates and keep one clear next action. Continue through work that is authorized; surface actual blockers and consequential scope changes.

### First Implementation Session

1. Read this file and any applicable repository instructions.
2. Inspect the actual development VM environment and project state.
3. Establish a pinned, user-space project runtime and dependency lockfile.
4. Check available credentials without printing them.
5. Build and run the offline part of M0.
6. Run bounded live probes when authorized and configured.
7. Record gates, cleanup, and the next milestone.

Do not infer that provider documentation alone is proof of a successful live test.

### How to Work Through a Long Spec

Keep one milestone in view. At the end of a work session, leave a short progress entry and the next executable step. Favor small verified slices over a large pile of partially connected components.

When requirements conflict, prioritize:

1. Correctness and truthful state.
2. The user's real development VM workflow.
3. The complete living-report and repair sequence.
4. Clear documentation and observable results.
5. Visual polish.
6. Stretch features.

## 26. Source References

Recheck these at implementation time. Links establish documented capabilities; M0 establishes what works for the pinned packages and account.

- [Solari TypeScript SDK](https://docs.getsolari.com/sdk/typescript)
- [Solari desktop SDK](https://docs.getsolari.com/sdk/typescript/vms)
- [Solari shared sandbox/desktop SDK](https://docs.getsolari.com/sdk/typescript/sandboxes)
- [Solari desktop lifecycle](https://docs.getsolari.com/desktops)
- [Solari snapshots](https://docs.getsolari.com/snapshots)
- [Solari templates](https://docs.getsolari.com/templates)
- [Solari MCP server](https://docs.getsolari.com/mcp)
- [Solari pricing](https://docs.getsolari.com/pricing)
- [Solari cookbook](https://github.com/solari-sdk/solari-cookbook)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)
- [MCP tool result specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [Node release schedule](https://github.com/nodejs/Release)

## Implementation progress (repository edition)

2026-09-30: Implemented the service, typed adapters, durable fake provider, source selection/capture, cases/checkpoints, fork/restore, verified binary-capable patch export, CLI, twelve MCP tools, authenticated dashboard, and bounded viewer proxy. Offline tests and scripted fixture repair pass. No live Solari sessions were created. Original private machine details and conversation context were intentionally excluded. Current verification and differences from the proposed architecture are recorded in docs/verification.md and docs/architecture.md.
