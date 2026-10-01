# Solari Workbench

This application lives in `applications/solari-workbench` in the Solari cookbook fork. The quickstart below starts at the cookbook repository root.

Save a broken app session, let a coding agent investigate a copy, and get a repair back as a patch.

Workbench runs a copy of your project on a Solari desktop. Your existing agent can see the app, run commands and edit files while you follow along in a local dashboard. Your original project stays unchanged until you apply an exported patch.

**Status: a tested prototype with successful live checks and a reproducible, apparent Solari snapshot bug.** Reliable restore and cleanup remain blocked. The complete live agent workflow is not yet verified.

## What we built and proved

The intended workflow is simple: **run the app → save a failure → investigate a copy → export a verified repair.**

| Part | What we verified |
| --- | --- |
| Local workflow | CLI, dashboard, saved cases and agent tools through MCP (Model Context Protocol) have automated coverage. |
| Repair demo | A scripted offline demo reproduces a task-board bug, repairs a separate copy, verifies the patch and cleans up simulated resources. |
| Real Solari desktop | Source upload, app startup, commands, screenshots and typing worked. |
| Snapshot fork | One recovered checkpoint produced a working copy with matching server memory/disk markers and a visible browser draft. A source edit exported as a verified patch. |
| Restore and cleanup | In-place restore failed. One owned checkpoint remained intermittently visible during cleanup; its deletion is unconfirmed. |

The demo uses a simulated provider and a scripted repair. The full live agent scenario, exact browser-tab restoration and live viewer remain unverified. See the [verification record](docs/verification.md).

## How this project uncovered an apparent bug

Debugging a saved failure requires preserving the app's running state. Testing that workflow on September 30–October 1, 2026 exposed this sequence:

1. **Save succeeded:** Solari returned a new snapshot ID.
2. **Lookup succeeded:** the same ID was reported as existing and `restorable: true`.
3. **Restore failed:** Solari returned HTTP 404, “Snapshot not found.”
4. **Inventory disagreed:** later reads alternated between finding the snapshot and reporting it missing. Deletion also returned 404 while the snapshot continued to appear.

We reproduced this with **44 read-only requests** using native HTTPS and Python, bypassing the Solari SDK. The same snapshot alternated between 200 and 404, even on one persistent connection, without intervening writes by our diagnostics.

Solari's [snapshot guide](https://docs.getsolari.com/snapshots) explicitly supports restoring saved machine state. We are reporting an **apparent provider bug** in that supported workflow; its internal cause is unconfirmed.

The [detailed report](docs/provider-compatibility-issue.md) includes request sequences, timestamps and a bounded read-only reproducer. Credentials, private resource IDs, screenshots and raw traces are excluded from this repository.

## What Solari could investigate and fix

Their [API reference](https://docs.getsolari.com/api-reference/sandboxes) says ordinary snapshot records are held in memory, while promoted templates survive gateway restarts. Different gateways or caches may therefore disagree about a snapshot. **That is a hypothesis, not a confirmed cause.**

A useful provider investigation would:

- Check gateway logs for the conflicting responses.
- Ensure save, lookup, restore and deletion share consistent, durable records. Confirm a saved record before returning success, and propagate deletion to every reader.
- Test save → restore → fork → delete across gateway instances and restarts, including storage cleanup.

Template promotion is an untested workaround for creating copies; it does not establish reliable in-place restore.

Workbench retains uncertain resources and no longer treats snapshot DELETE 404 as proof of cleanup. The provider inconsistency remains unresolved.

## Try the working demo

Requires Linux, **Node 24.21.0**, npm and Git. From the repository:

```sh
cd applications/solari-workbench
npm ci
npm run build
npm run demo:scripted
```

Expect a deliberately failing regression before the scripted repair, a passing regression afterward, a verified patch and zero remaining simulated resources. No API key, cloud resource or LLM is needed. Evidence is saved privately on your machine.

For optional live use, [.env.example](.env.example) documents application environment variables. Load credentials from a private file outside the repository, as described in the usage guide; the application does not automatically load this template.

For dashboard setup, your own project, agent connections and optional live checks, see the [usage guide](docs/usage.md). Native dependency and browser requirements are documented there. Live Solari use uploads selected files and can incur charges; keep credentials outside Git and review source before uploading.

## Project outcome

This project delivers a demonstrable repair workflow, evidence that several real Solari capabilities work, and a reproducible provider issue with a proposed path to resolution. The prototype and report are ready for review. Completing the original live workflow still depends on reliable checkpoint restore and cleanup.

Further reading: [architecture](docs/architecture.md), [demo](docs/demo.md), [compatibility](docs/compatibility.md), [plan](plan.md), and [notices](NOTICE.md).
