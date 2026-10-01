import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Monitor,
  Camera,
  Pause,
  Play,
  GitFork,
  Download,
  Shield,
  Trash2,
  Terminal,
  RefreshCw,
} from "lucide-react";
import "./style.css";
import { Viewer } from "./Viewer.js";
type Run = {
  id: string;
  projectId: string;
  label: string;
  environment: string;
  outcome: string;
  admission: string;
  generation: number;
  cleanup: string;
  parentCaseId?: string;
  createdAt: number;
};
type Case = {
  id: string;
  runId: string;
  checkpointId: string;
  title: string;
  expected: string;
  observed: string;
  context: string;
  artifacts: string[];
};
type Data = {
  provider: string;
  resources: { id: string; kind: string; state: string; assignment: string }[];
  projects: { id: string; name: string }[];
  runs: Run[];
  cases: Case[];
  checkpoints: {
    id: string;
    availability: string;
    label?: string;
    pinned: boolean;
    runId: string;
  }[];
  artifacts: {
    id: string;
    runId: string;
    kind: string;
    createdAt: number;
    bytes: number;
  }[];
  operations: {
    id: string;
    runId?: string;
    action: string;
    state: string;
    error?: { message: string; nextAction: string };
  }[];
  events: { seq: number; at: number; summary: string }[];
};
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message ?? data.error ?? "Request failed");
  return data;
}
function App() {
  const [data, setData] = useState<Data>();
  const [paired, setPaired] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(
    localStorage.getItem("selectedRun") ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const [capture, setCapture] = useState(false);
  const [preview, setPreview] = useState<{
    runs: string[];
    checkpoints: string[];
    retainedPinned: string[];
  }>();
  const [title, setTitle] = useState("");
  const [expected, setExpected] = useState("");
  const [observed, setObserved] = useState("");
  const load = async () => {
    try {
      setData(await api("/api/status"));
      setPaired(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!paired) return;
    const events = new EventSource("/api/events");
    events.addEventListener("update", () => {
      void load();
    });
    events.onopen = () => {
      void load();
    };
    return () => events.close();
  }, [paired]);
  const run = data?.runs.find((r) => r.id === selected) ?? data?.runs.at(-1);
  const artifacts = data?.artifacts.filter((a) => a.runId === run?.id) ?? [];
  const shot = artifacts.filter((a) => a.kind === "screenshot").at(-1);
  const cases =
    data?.cases.filter(
      (c) => c.runId === run?.id || c.id === run?.parentCaseId,
    ) ?? [];
  async function act(name: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/tools/${name}`, {
        actor: "human",
        args: {
          requestId: crypto.randomUUID(),
          ...(run ? { runId: run.id, generation: run.generation } : {}),
          ...args,
        },
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!paired)
    return (
      <main className="pair">
        <Monitor size={30} />
        <p className="eyebrow">SOLARI WORKBENCH</p>
        <h1>Connect to your workspace</h1>
        <p>
          Run <code>workbench pair</code> beside the service, then enter the
          one-time code. It expires after two minutes.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/api/pair", { code });
              setCode("");
              setError("");
              await load();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Pairing code
            <input
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <button className="primary">Connect browser</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  return (
    <div className="app">
      <header>
        <div className="brand">
          <Monitor size={22} />
          <strong>Workbench</strong>
          <span>Solari</span>
        </div>
        <span className="provider">
          {data?.provider === "fake"
            ? "FAKE PROVIDER · offline simulation"
            : "SOLARI · live contracts unverified"}
        </span>
        <button onClick={() => void load()} aria-label="Refresh status">
          <RefreshCw size={16} />
        </button>
      </header>
      <div className="layout">
        <aside>
          <div className="section-label">WORKSPACE</div>
          {data?.projects.map((p) => (
            <div className="project" key={p.id}>
              <strong>{p.name}</strong>
              <button
                disabled={busy}
                onClick={() =>
                  void act("start", {
                    projectId: p.id,
                    runId: undefined,
                    generation: undefined,
                  })
                }
              >
                <Play size={14} />
                Start run
              </button>
            </div>
          ))}
          {!data?.projects.length && (
            <p className="muted">
              Register a Git project using <code>workbench project add</code>.
            </p>
          )}
          <div className="section-label">
            RUNS <span>{data?.runs.length}</span>
          </div>
          <nav aria-label="Runs">
            {data?.runs.map((r) => (
              <button
                className={`run-row ${r.id === run?.id ? "selected" : ""}`}
                key={r.id}
                onClick={() => {
                  setSelected(r.id);
                  localStorage.setItem("selectedRun", r.id);
                  setPreview(undefined);
                }}
              >
                <strong>{r.label}</strong>
                <span>
                  {r.environment} · {r.outcome}
                </span>
                <small>{r.id.slice(0, 13)}</small>
              </button>
            ))}
          </nav>
          <div className="aside-note">
            <Terminal size={17} />
            <p>
              Your source stays in your workspace. Selected files run in a
              separate computer.
            </p>
          </div>
        </aside>
        <main>
          {data?.resources.some(
            (resource) =>
              resource.assignment === "unresolved" &&
              resource.state !== "deleted",
          ) && (
            <section
              className="notice"
              aria-label="Resources needing reconciliation"
            >
              <h2>Resources need reconciliation</h2>
              <p>
                Owned resources were discovered with uncertain operation
                outcomes. Additional desktops may be blocked until ownership is
                resolved.
              </p>
              {data.resources
                .filter(
                  (resource) =>
                    resource.assignment === "unresolved" &&
                    resource.state !== "deleted",
                )
                .map((resource) => (
                  <p key={resource.id}>
                    <code>{resource.id}</code> · {resource.kind} ·{" "}
                    {resource.state}
                  </p>
                ))}
              <button
                onClick={async () => {
                  try {
                    await api("/api/reconcile", {});
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Reconcile resources
              </button>
            </section>
          )}

          {run ? (
            <>
              <div className="run-heading">
                <div>
                  <p className="eyebrow">
                    {data?.projects.find((p) => p.id === run.projectId)?.name}
                  </p>
                  <h1>{run.label}</h1>
                  <p className="identity">
                    {run.id}
                    {run.parentCaseId && ` · repair of ${run.parentCaseId}`}
                  </p>
                </div>
                <span className={`state ${run.environment}`}>
                  {run.environment}
                </span>
              </div>
              <div className="status-line">
                <span>
                  Task <strong>{run.outcome}</strong>
                </span>
                <span>
                  Cleanup <strong>{run.cleanup}</strong>
                </span>
                <span>
                  Agent{" "}
                  <strong>
                    {run.admission === "held" ? "held" : "enabled"}
                  </strong>
                </span>
                <span>Generation {run.generation}</span>
              </div>
              <div className="toolbar">
                {data?.provider === "solari" && (
                  <button
                    disabled={busy || run.environment !== "running"}
                    onClick={() => setWatching(true)}
                  >
                    <Monitor size={16} />
                    Watch for 60 seconds
                  </button>
                )}
                <button
                  disabled={busy || run.environment !== "running"}
                  onClick={() => void act("observe")}
                >
                  <Camera size={16} />
                  Observe
                </button>
                <button
                  disabled={
                    busy || !["running", "paused"].includes(run.environment)
                  }
                  onClick={() =>
                    void act("lifecycle", {
                      action: run.environment === "paused" ? "resume" : "pause",
                    })
                  }
                >
                  {run.environment === "paused" ? (
                    <Play size={16} />
                  ) : (
                    <Pause size={16} />
                  )}{" "}
                  {run.environment === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void act("hold", {
                      held: run.admission !== "held",
                      generation: undefined,
                    })
                  }
                >
                  <Shield size={16} />
                  {run.admission === "held"
                    ? "Release hold"
                    : "Hold agent actions"}
                </button>
                <button
                  disabled={busy || run.environment !== "running"}
                  onClick={() => setCapture(!capture)}
                >
                  Capture case
                </button>
                <button
                  disabled={busy || run.environment !== "running"}
                  onClick={() => void act("export")}
                >
                  <Download size={16} />
                  Export
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    const scope = new Set([run.id]);
                    let changed = true;
                    while (changed) {
                      changed = false;
                      for (const child of data?.runs ?? []) {
                        const parent = data?.cases.find(
                          (c) => c.id === child.parentCaseId,
                        );
                        if (
                          parent &&
                          scope.has(parent.runId) &&
                          !scope.has(child.id)
                        ) {
                          scope.add(child.id);
                          changed = true;
                        }
                      }
                    }
                    const cps =
                      data?.checkpoints.filter(
                        (c) =>
                          scope.has(c.runId) && c.availability !== "deleted",
                      ) ?? [];
                    setPreview({
                      runs: [...scope],
                      checkpoints: cps
                        .filter((c) => !c.pinned)
                        .map((c) => c.id),
                      retainedPinned: cps
                        .filter((c) => c.pinned)
                        .map((c) => c.id),
                    });
                  }}
                >
                  <Trash2 size={16} />
                  Cleanup
                </button>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {run.admission === "held" && (
                <p className="notice">
                  Agent mutations are held. Commands already running, browser
                  timers, and the agent’s local shell continue.
                </p>
              )}
              {preview && (
                <section className="cleanup">
                  <h2>Confirm cleanup</h2>
                  <p>
                    These desktops and unpinned checkpoints will be deleted.
                    Local evidence stays available.
                  </p>
                  <pre>{JSON.stringify(preview, null, 2)}</pre>
                  <button
                    className="danger"
                    onClick={() => {
                      void act("lifecycle", { action: "destroy", apply: true });
                      setPreview(undefined);
                    }}
                  >
                    Delete listed resources
                  </button>
                  <button onClick={() => setPreview(undefined)}>Cancel</button>
                </section>
              )}
              {capture && (
                <form
                  className="capture"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("capture", {
                      mode: "case",
                      title,
                      expected,
                      observed,
                    });
                    setCapture(false);
                  }}
                >
                  <h2>Preserve a failure</h2>
                  <label>
                    Case title
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      maxLength={160}
                    />
                  </label>
                  <label>
                    Expected behavior
                    <textarea
                      value={expected}
                      onChange={(e) => setExpected(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Observed behavior
                    <textarea
                      value={observed}
                      onChange={(e) => setObserved(e.target.value)}
                      required
                    />
                  </label>
                  <button className="primary">
                    Save evidence and checkpoint
                  </button>
                </form>
              )}
              {watching && run.environment === "running" && (
                <Viewer
                  runId={run.id}
                  generation={run.generation}
                  onClose={() => setWatching(false)}
                />
              )}
              <section className="desktop" aria-label="Desktop observation">
                <div className="screen-label">
                  <span>
                    {data?.provider === "fake"
                      ? "Simulated image · no real desktop"
                      : "Screenshot observation"}
                  </span>
                  <span>
                    {shot
                      ? `Captured ${new Date(shot.createdAt).toLocaleTimeString()}`
                      : "No observation yet"}
                  </span>
                </div>
                <div className="screen">
                  {shot && data?.provider !== "fake" ? (
                    <img
                      alt={`Captured desktop of ${run.label}`}
                      src={`/api/artifacts/${shot.id}`}
                    />
                  ) : (
                    <div className="screen-empty">
                      <Monitor size={42} />
                      <h2>
                        {data?.provider === "fake"
                          ? "Offline workflow simulation"
                          : "Observe the remote desktop"}
                      </h2>
                      <p>
                        {data?.provider === "fake"
                          ? "The fake provider verifies workflow state. It does not render a desktop."
                          : "Take a screenshot to inspect the guest. Captured images do not update automatically."}
                      </p>
                    </div>
                  )}
                </div>
              </section>
              <section className="checkpoints">
                <h2>Checkpoints</h2>
                {data?.checkpoints
                  .filter((cp) => cp.runId === run.id)
                  .map((cp) => (
                    <div className="checkpoint-row" key={cp.id}>
                      <span>
                        <strong>{cp.label ?? cp.id}</strong>
                        <small>
                          {cp.availability}
                          {cp.pinned ? " · pinned" : ""}
                        </small>
                      </span>
                      <button
                        disabled={
                          busy ||
                          cp.availability !== "available" ||
                          run.environment !== "running"
                        }
                        onClick={() =>
                          void act("restore", { checkpointId: cp.id })
                        }
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                {!data?.checkpoints.some((cp) => cp.runId === run.id) && (
                  <p className="muted">
                    A captured checkpoint preserves a place to return to.
                  </p>
                )}
              </section>
              <div className="details-grid">
                <section>
                  <h2>
                    Cases <span>{cases.length}</span>
                  </h2>
                  {cases.length === 0 && (
                    <p className="muted">
                      Capture a failure to preserve the evidence and its
                      environment.
                    </p>
                  )}
                  {cases.map((c) => {
                    const cp = data?.checkpoints.find(
                      (x) => x.id === c.checkpointId,
                    );
                    return (
                      <article className="case" key={c.id}>
                        <h3>{c.title}</h3>
                        <span className="state">
                          {cp?.availability === "available"
                            ? "Checkpoint available"
                            : "Evidence only · checkpoint " + cp?.availability}
                        </span>
                        <dl>
                          <dt>Expected</dt>
                          <dd>{c.expected || "Not supplied"}</dd>
                          <dt>Observed</dt>
                          <dd>{c.observed || "Not supplied"}</dd>
                        </dl>
                        {c.context && <p>{c.context}</p>}
                        <button
                          disabled={busy || cp?.availability !== "available"}
                          onClick={() =>
                            void act("fork", {
                              caseId: c.id,
                              runId: undefined,
                              generation: undefined,
                            })
                          }
                        >
                          <GitFork size={16} />
                          Fork repair
                        </button>
                        {cp && (
                          <button
                            onClick={() =>
                              void act("retain", {
                                checkpointId: cp.id,
                                pinned: !cp.pinned,
                                runId: undefined,
                                generation: undefined,
                              })
                            }
                          >
                            {cp.pinned ? "Unpin" : "Pin checkpoint"}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </section>
                <section>
                  <h2>
                    Evidence <span>{artifacts.length}</span>
                  </h2>
                  {artifacts.length === 0 && (
                    <p className="muted">
                      Screenshots, command logs, and exports appear here.
                    </p>
                  )}
                  {artifacts.map((a) => (
                    <a
                      className="artifact"
                      key={a.id}
                      href={`/api/artifacts/${a.id}`}
                      download
                    >
                      <Download size={15} />
                      <span>{a.kind}</span>
                      <small>{Math.ceil(a.bytes / 1024)} KB</small>
                    </a>
                  ))}
                </section>
              </div>
              <section>
                <h2>Activity</h2>
                {data?.operations
                  .filter((o) => o.runId === run.id)
                  .slice(-12)
                  .reverse()
                  .map((o) => (
                    <div className="operation" key={o.id}>
                      <strong>{o.action}</strong>
                      <span>{o.state}</span>
                      {o.error && (
                        <p className="error">
                          {o.error.message} {o.error.nextAction}
                        </p>
                      )}
                    </div>
                  ))}
              </section>
            </>
          ) : (
            <div className="empty">
              <Monitor size={46} />
              <h1>Your next investigation starts here.</h1>
              <p>
                Register a project, review its selected files, and start a run.
                The desktop, cases, and repair evidence will appear here.
              </p>
              <code>workbench project add /path/to/project</code>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
