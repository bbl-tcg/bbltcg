import { el, showScreen } from "../screens.js";
import { toast } from "../ui.js";
import { redeemCode } from "../api.js";
import { renderMenu } from "./menu.js";

export function renderCodes() {
  const root = document.getElementById("codes-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const codeInput = el("input", { type: "text", placeholder: "Enter a code", style: inputStyle() });
  const statusLine = el("div", { style: "font-weight:700;min-height:1.2em;text-align:center;" }, "");

  async function onSubmit() {
    const code = codeInput.value.trim();
    if (!code) return;
    statusLine.style.color = "var(--bbl-black)";
    try {
      const result = await redeemCode(code);
      statusLine.style.color = "var(--bbl-blue)";
      statusLine.textContent = result.message;
      codeInput.value = "";
      toast(result.message);
    } catch (err) {
      statusLine.style.color = "var(--bbl-red)";
      statusLine.textContent = err.message;
    }
  }

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSubmit();
  });

  root.appendChild(
    el("div", { class: "bbl-panel", style: "padding:24px;max-width:360px;width:92vw;display:flex;flex-direction:column;gap:12px;" }, [
      el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Community Codes"),
      codeInput,
      el("button", { class: "bbl-btn", onclick: onSubmit }, "Submit"),
      statusLine,
      el("button", { class: "bbl-btn secondary", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu"),
    ])
  );
}

function inputStyle() {
  return "width:100%;padding:8px;border-radius:6px;border:2px solid var(--bbl-black);box-sizing:border-box;";
}
