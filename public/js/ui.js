// Non-blocking replacements for native alert()/confirm(). Native dialogs are blocking,
// don't match the game's visual style, and (in at least some automated/embedded browser
// contexts) can hang the page entirely with no way to dismiss them - never use them here.
import { el } from "./screens.js";

export function toast(message, ms = 3200) {
  const t = el("div", {}, message);
  Object.assign(t.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bbl-black)",
    color: "white",
    padding: "10px 18px",
    borderRadius: "8px",
    zIndex: 300,
    fontWeight: "700",
    maxWidth: "80vw",
    textAlign: "center",
    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "choice-overlay" });
    const panel = el("div", { class: "choice-panel bbl-panel" });
    panel.appendChild(el("div", { style: "font-weight:800;font-size:1.05rem;color:var(--bbl-blue);" }, message));
    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    panel.appendChild(
      el("div", { style: "display:flex;gap:10px;justify-content:center;" }, [
        el("button", { class: "bbl-btn", onclick: () => finish(true) }, "Yes"),
        el("button", { class: "bbl-btn secondary", onclick: () => finish(false) }, "No"),
      ])
    );
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  });
}
