import { useEffect, useRef, useState } from "react";
import RFB from "@novnc/novnc";
export function Viewer({
  runId,
  generation,
  onClose,
}: {
  runId: string;
  generation: number;
  onClose: () => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [state, setState] = useState("Connecting");
  useEffect(() => {
    if (!target.current) return;
    const url = new URL(
      `/api/view/${encodeURIComponent(runId)}`,
      location.href,
    );
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const rfb = new RFB(target.current, url.href);
    rfb.viewOnly = true;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.addEventListener("connect", () => setState("Live · observation only"));
    rfb.addEventListener("disconnect", () =>
      setState("Disconnected · viewing lease ended"),
    );
    return () => rfb.disconnect();
  }, [runId, generation]);
  return (
    <section className="viewer">
      <div className="screen-label">
        <span role="status">{state}</span>
        <button onClick={onClose}>Close view</button>
      </div>
      <div ref={target} className="viewer-screen" />
      <p className="muted">
        The viewing connection closes after 60 seconds. Open it again explicitly
        to continue. This client sends no input.
      </p>
    </section>
  );
}
