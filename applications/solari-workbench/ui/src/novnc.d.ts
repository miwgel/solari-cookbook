// Narrow declaration for the noVNC 1.7 public RFB API used by this viewer.
// Upstream API: node_modules/@novnc/novnc/docs/API.md.
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string);
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
  }
}
