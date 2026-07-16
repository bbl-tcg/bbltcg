import { el, showScreen } from "../screens.js";
import { toast } from "../ui.js";
import { signup, login } from "../api.js";
import { renderMenu } from "./menu.js";

export function renderLogin() {
  const root = document.getElementById("login-screen");
  root.innerHTML = "";
  root.className = "screen menu-screen";

  const usernameInput = el("input", { type: "text", placeholder: "Username", style: inputStyle() });
  const passwordInput = el("input", { type: "password", placeholder: "Password", style: inputStyle() });
  const statusLine = el("div", { style: "color:var(--bbl-red);font-weight:700;min-height:1.2em;" }, "");

  async function doAuth(fn) {
    statusLine.textContent = "";
    try {
      await fn(usernameInput.value.trim(), passwordInput.value);
      toast("Logged in!");
      renderMenu();
      showScreen("menu-screen");
    } catch (err) {
      statusLine.textContent = err.message;
    }
  }

  root.appendChild(
    el("div", { class: "bbl-panel", style: "padding:24px;max-width:360px;width:92vw;display:flex;flex-direction:column;gap:12px;" }, [
      el("div", { class: "menu-title", style: "font-size:1.2rem;" }, "Log In / Sign Up"),
      usernameInput,
      passwordInput,
      statusLine,
      el("button", { class: "bbl-btn", onclick: () => doAuth(login) }, "Log In"),
      el("button", { class: "bbl-btn ghost", onclick: () => doAuth(signup) }, "Create Account"),
      el("button", { class: "bbl-btn secondary", onclick: () => showScreen("menu-screen") }, "Cancel"),
    ])
  );
}

function inputStyle() {
  return "width:100%;padding:8px;border-radius:6px;border:2px solid var(--bbl-black);box-sizing:border-box;";
}
