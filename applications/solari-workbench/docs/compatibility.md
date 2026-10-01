# Compatibility gates

Recorded 2026-09-30. Package versions below were installed and compiled locally. The final section records the limited live evidence separately.

| Component | Pinned version | Evidence |
| --- | --- | --- |
| Node | 24.21.0 | User-space runtime; build and tests |
| TypeScript | 6.0.3 | Strict ESM typecheck |
| Solari desktop SDK | 0.1.3 | Typed adapter compiles |
| Solari sandbox SDK | 0.1.4 | Typed createDesktop/fromSnapshot compiles |
| MCP SDK | 1.31.0 | Actual stdio client/server image exchange |
| better-sqlite3 | 13.0.3 | Native installation, persistence/restart tests |
| Fastify | 5.12.5 | Authenticated loopback integration tests |
| React / Vite | 19.3.0 / 8.3.1 | Production build and browser tests |
| Playwright | 1.63.0 | Chromium UI tests at three sizes |
| noVNC | 1.7.0 | Browser bundle compiles; upstream stream unverified |

| Gate | Status | Observation and next action |
| --- | --- | --- |
| G1 Desktop fork | Late checkpoint fork verified | A discovered checkpoint produced a live child with matching server boot/memory/disk probes and visible draft; in-place restore still returned 404. |
| G2 Viewer | Unverified live | noVNC and authenticated proxy implemented; test actual RFB rendering, disconnect, and renewed lease in the personal browser. No provider-enforced read-only claim. |
| G3 Recovery identity | Partially verified live | Owned desktops were discovered by metadata after interrupted startup; `listAll` paginates. Snapshot listing exposes a limit but no cursor. Exact-name ambiguity remains uncertain. Test real lost responses. |
| G4 Pause/quota | Unverified | One local active slot is enforced. Prove pause releases actual account capacity before claiming the sequential fork workflow. |
| G5 Transfer | Small fixture verified live | Uploaded source digest matched the import and the app started. Maximum-size transfer remains unverified; limits are 10 MiB/file and 50 MiB/project. |
| G6 MCP location | Partially verified | A local MCP SDK client received PNG content through a spawned stdio shim and service. The actual installed coding-agent client and remote-host configuration still need acceptance. |
| G7 Service lifetime | Partially verified | Foreground service and process lock implemented. Logout persistence and personal SSH forwarding have not been tested. |

Credentialed probes created owned desktops and exercised upload, readiness, screenshots, typing, capture attempts and cleanup. A late-indexed checkpoint was recovered into a live repair fork and supported verified source export. In-place restore still returned 404 after a matching restorable receipt. Later cleanup inventory alternated between zero and one owned checkpoint while deletion reported absence; zero owned desktops were listed. The affected checkpoint and blocked cleanup record remain private and unresolved. No exact browser-tab nonce acceptance, in-place restore, actual-agent repair, live recording, or provider-cost result is claimed. See the [provider compatibility report](provider-compatibility-issue.md). Without explicit live enablement, `test:live` still reports **SKIPPED**.

The tested workstation supplied Python 3 and Google Chrome. The adapter discovers Firefox or Chromium and uses a dedicated visible browser profile in guest runtime storage, suppressing Chromium first-run prompts. Root Chromium requires `--no-sandbox` within the isolated guest. Scroll uses a typed `xdotool click` invocation because the pinned mouse API does not expose a directional wheel parameter. This dependency is explicit and unverified live.

Source references: [desktop SDK](https://docs.getsolari.com/sdk/typescript/vms), [shared SDK](https://docs.getsolari.com/sdk/typescript/sandboxes), [snapshots](https://docs.getsolari.com/snapshots), [Node release support](https://nodejs.org/en/about/previous-releases), and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp). Documentation establishes intended contracts; only recorded probes establish local compatibility.

The follow-up read-only investigation reproduced snapshot presence changes using native HTTPS and Python, including alternating direct lookup responses on one TLS connection. The API reference documents an in-memory snapshot catalog; differing gateway views are the leading explanation, pending provider confirmation. Workbench now refuses to infer successful snapshot deletion from 404 responses. Durable-template promotion is a possible separate experiment, not a verified substitute for in-place restore. See the [investigation and reproducer](provider-compatibility-issue.md#transport-investigation-2026-10-01-utc).
