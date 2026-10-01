# Demonstration

The bundled task board deliberately changes all visible tasks when applying bulk priority. Fixed IDs A, B, and C allow an independent regression to detect the defect. Browser state includes the draft, selected IDs, and per-tab nonce. The server exposes a boot nonce, mutable memory marker, and disk marker through `/api/probes`; task data lives in `WORKBENCH_RUNTIME`.

## Deterministic offline path

```sh
npm run demo:scripted
```

This verifies a failing bundled regression, scripted remote-copy repair using the fake provider, passing regression, patch reconstruction, and simulated resource cleanup. The regression harness executes the trusted fixture in a disposable directory. The original fixture is unchanged. Output identifies the provider as fake and actual-agent acceptance as false.

This is neither a Solari demonstration nor a model success-rate measurement. Its synthetic PNG is only an image transport fixture.

## Required real acceptance path

After the compatibility gates pass, use one running desktop and retain the exact case state:

1. Start the task board from the reviewed manifest and inspect the guest's run marker.
2. In the existing visible browser, select A/B, leave C unselected, and enter a draft.
3. Capture a checkpoint-only `prepared` state.
4. Apply high priority. Verify that C changed incorrectly; capture the distinct `failure` case.
5. Record the browser debug view from that exact tab and the server/disk probes. Do not open a new context to claim browser-memory continuity.
6. Pause the parent, fork the failure case, and verify all three probes before repairing.
7. Ask the existing agent to inspect and fix the defect. It must use a fresh MCP screenshot and change the remote source itself.
8. Run `node --test tests/regression.test.js` in the guest, reset fixture data, and repeat the visible interaction. A code reload can legitimately disturb the old tab state; preserve the original case first.
9. Export the verified patch and logs; declare the outcome with cited evidence.
10. Sequentially restore `prepared` and independently prove the unrepaired source still has the defect.
11. Preview and apply cleanup. Record every retained or unconfirmed resource.

Suggested agent prompt:

> Inspect the task-board project through Workbench. Bulk priority changes appear to affect tasks that were not selected. Preserve a useful failure case, investigate a fix in a repair fork, and return a patch with verification evidence. Keep the original case available until verification is complete, then clean up according to the retention setting.

Record actual model/client versions, human interventions, elapsed time, and failures. The verification log currently marks this path **not run**.

## Recording

A real 90–150 second overview should show the agent's workspace, visible failure and unsaved draft, saved case, independent repair fork, regression outcome, exported patch, and resource inventory. Keep an uncut source recording. Label sped-up waits. Never include credentials, account identifiers, session URLs, local host details, or private project contents.

No recording is supplied yet because the checkpoint-dependent live workflow has not passed; initial real desktop startup and screenshot checks are recorded separately. Dashboard screenshots from offline tests are layout evidence only and remain excluded from Git by default.
