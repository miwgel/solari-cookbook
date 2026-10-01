# Using Solari Workbench

For the project overview, current results and apparent snapshot bug, start with the [README](../README.md).

## Try the offline demo

Prerequisites: Linux, **Node 24.21.0**, npm, and Git. Native SQLite installation may need Python and a C++ build toolchain when a prebuilt binary is unavailable.

If the machine has an older Node release, install the pinned runtime in your own account first:

```sh
npm install --prefix "$HOME/.local/share/workbench-tools" node@24.21.0
export PATH="$HOME/.local/share/workbench-tools/node_modules/node/bin:$PATH"
```

Then, from `applications/solari-workbench`:

```sh
npm ci
npm run build
npm run demo:scripted
```

The deliberately broken task-board regression fails, a scripted repair passes, and the fake provider produces a verified patch. The demo cleans up its simulated desktops and snapshots, preserving its evidence in a private temporary directory printed at completion. It never creates a paid resource or uses an LLM.

To inspect the dashboard, run these on the development machine:

```sh
node dist/cli.js serve --provider fake
```

In another terminal on the same machine:

```sh
node dist/cli.js project add examples/task-board
node dist/cli.js project inspect PROJECT_ID
node dist/cli.js start PROJECT_ID
node dist/cli.js pair
```

Use the IDs returned by each command. Open `http://127.0.0.1:4317` and enter the pairing code. The UI prominently labels fake runs; they do not contain a real desktop. Mutations return an operation ID: `node dist/cli.js status OPERATION_ID` reports completion.

For access from your personal computer:

```sh
ssh -N -L 4317:127.0.0.1:4317 your-dev-host
```

Keep the service in the foreground. No privileged installation or change to your agent settings is required.

Cleanup is explicit:

```sh
node dist/cli.js cleanup --run RUN_ID --dry-run
node dist/cli.js cleanup --run RUN_ID --apply
node dist/cli.js resources
```

Cleanup includes dependent repair runs and unpinned checkpoints. It preserves local evidence. Pinned checkpoints remain listed and can retain storage costs on Solari.

## Connect Solari

Selected files **leave your machine** when using the Solari provider. Path exclusions catch common credential files, but cannot identify every secret inside source code. Review the manifest and project contents first.

Supply `SOLARI_API_KEY` privately in the service environment. Do not commit it, paste it into a command argument, or put it in the MCP configuration. Keep fake and real state in different directories:

```sh
export WORKBENCH_STATE_DIR="$HOME/.local/state/solari-workbench-live"
node dist/cli.js doctor
node dist/cli.js serve --provider solari
```

If the key is saved in an owner-only file outside the repository, load it explicitly when starting the service:

```sh
node --env-file="$HOME/.config/solari-workbench/.env" dist/cli.js serve --provider solari
```

An `export` in another terminal does not update an already-running process. Keep the environment file private and out of Git.

Set that same state-directory variable in other CLI terminals. Register, inspect, and start a project using the commands above. This provisions paid resources: one active desktop at a time, with a five-minute idle pause policy and a local thirty-active-minute default limit. These are lifecycle policies, **not a spending cap**. The service cannot enforce timers while stopped; paused desktops and snapshots may still incur costs.

A bounded live contract probe is opt-in:

```sh
WORKBENCH_LIVE=1 npm run test:live
```

It uses at most two owned desktops sequentially, one active at a time, and attempts dependency-aware cleanup. Probe state remains private and recoverable after an interrupted operation. Without explicit enablement, the command prints `SKIPPED: live provider verification not run`. Browser-memory restoration still requires inspection of the exact restored page; server probes alone do not establish it.

## Use your own project

Add a `workbench.json` modeled on [the fixture configuration](../examples/task-board/workbench.json). Register a Git directory, including an empty repository. Select include patterns, any intended untracked files, executable/argument arrays, a loopback readiness URL, and the URL to open in the guest browser.

Workbench captures saved working-tree bytes, not just the last commit. Defaults cap source at 50 MiB, 10 MiB per file, and 5,000 files. It rejects symlinks, hard links, special files, and traversal. Git history, remotes, hooks, credentials, caches, dependencies, and host environment variables are not uploaded.

The guest has separate `source`, `runtime`, `artifacts`, and `scratch` directories. The start/setup commands receive `WORKBENCH_RUNTIME`, `WORKBENCH_ARTIFACTS`, and `WORKBENCH_RUN_MARKER`. The guest needs Python 3, Firefox or Chromium, and your application's runtime. Browser availability is checked before opening the app. Chromium runs with its sandbox disabled only when the guest browser user is root; guest VM isolation still applies.

## Let the existing agent inspect a run

```sh
node dist/cli.js mcp-config
```

This prints a configuration snippet containing the actual absolute executable paths and state directory. Add it through your client's supported MCP configuration process **on the host where Workbench runs**. It contains no Solari key. Existing settings are not modified automatically. See [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

The twelve tools cover start, status, observe, GUI actions, commands, files, capture, restore, fork, export, completion, and lifecycle. Every mutation requires a request ID; run mutations also require the current generation. Observe before acting. Images expire after thirty seconds or any admitted mutation. Reuse the same request ID only for an identical retry.

A human can hold agent actions from the UI or CLI:

```sh
node dist/cli.js hold RUN_ID
node dist/cli.js hold RUN_ID --release
```

Hold blocks new and queued agent mutations through Workbench. It does not stop commands already running, browser timers, or the agent's own shell. This is coordination inside a trusted single-user account, not a security boundary against that account.

## Preserve a failure and return a repair

```sh
node dist/cli.js capture RUN_ID --title "Bulk edit changes unselected task" \
  --expected "Only selected tasks change" --observed "An unselected task changed"
node dist/cli.js pause RUN_ID
node dist/cli.js fork CASE_ID
node dist/cli.js export REPAIR_RUN_ID
```

Wait for each operation to succeed before the next step. The agent edits the remote copy through the file and command tools. Run regression checks in the guest and declare completion with `workbench_complete`, citing the returned log artifact. Export creates `report`, `manifest`, and `patch` artifacts visible in the dashboard. It verifies patch reconstruction against the exact imported baseline, including supported binary changes and executable bits. It never applies a patch to your working tree.

Checkpoints restore guest state, not your agent conversation, local repository, remote services, or provider charges. Evidence remains readable after deletion. A case without a confirmed checkpoint is labeled evidence-only. The report is account-bound, not a portable VM image.

The live viewer is a no-input noVNC client through an authenticated service proxy. Each viewing connection expires after sixty seconds and closes on pause, restore, or deletion. The screenshot remains labeled with its capture time. Provider-enforced read-only capabilities are **not** claimed.

## Where your information lives

| Location | Contents |
| --- | --- |
| Original project | Canonical source; unchanged by import/export |
| Private local state | SQLite records, import baselines, cases, screenshots, logs, patches, discovery token |
| Owned Solari desktop | Selected source and guest runtime state |
| Retained Solari checkpoints | Guest memory/disk state; potentially billable |

State defaults to `$XDG_STATE_HOME/solari-workbench` or `~/.local/state/solari-workbench`, with owner-only access. Host paths and provider identifiers stay out of normal status output. Evidence is private by default: screenshots, logs, source patches, and free-text notes need content review before sharing.

## When something goes wrong

| Symptom | Next action |
| --- | --- |
| Missing credentials | Set `SOLARI_API_KEY` privately in the service environment; `doctor` never provisions resources. |
| Unsupported Node | Select the pinned Node 24 runtime before `npm ci`. |
| Service unreachable | Start the foreground service and check that the CLI uses its state directory. |
| MCP cannot connect | Verify the absolute command and state directory run on the development host. |
| Capacity occupied | Pause the active run or reconcile an uncertain create before retrying. |
| App not ready | Inspect the retained setup/startup log artifact, then run a bounded guest diagnostic command; failed startup is not success. |
| Viewer disconnected | Check run status; explicitly open another viewing lease if the run is running. |
| Run paused | Resume it explicitly. Opening status or a case will not resume it. |
| Checkpoint unavailable | Run `reconcile`; preserve local evidence and inspect unresolved operations. |
| Local source changed | Review the exported patch against its import baseline; apply manually only after resolving divergence. |
| Cleanup pending | Run `resources` and `reconcile`, then retry scoped cleanup. Unknown outcomes are never green. |

## Develop and verify

```sh
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:ui
```

Browser tests need Chromium's Linux shared libraries. See [verification](verification.md) for the unprivileged installation used here. Ordinary checks use no Solari resources. The task-board's own `npm test` intentionally fails until its seeded defect is repaired; it is separate from Workbench's passing tests.

Read [architecture](architecture.md), [compatibility gates](compatibility.md), [demo instructions](demo.md), and the [sanitized implementation specification](../plan.md). [License and dependency notices](../NOTICE.md) describe this independent project's relationship to Solari.
