import { el } from "./screens.js";

/**
 * A small floating, collapsible chat panel reusable across online multiplayer games and
 * Trade rooms. Both of those screens do a full `root.innerHTML = ""` + rebuild on every
 * update, so the widget's own DOM is recreated each render - message history and
 * expanded/collapsed state instead live here at module level so they survive that.
 * Callers must call resetChat() once when starting a new room/game so stale messages from
 * a previous session don't leak into a new one.
 */
let messages = []; // { from: "me"|"them", text }
let expanded = false;

export function resetChat() {
  messages = [];
  expanded = false;
}

export function addChatMessage(from, text) {
  messages.push({ from, text });
}

/** `onSend(text)` is called with the trimmed message text when the player sends one -
 * callers are responsible for both emitting it over their socket AND calling
 * addChatMessage("me", text) themselves (this module doesn't assume any transport). */
export function renderChatWidget(onSend) {
  const wrap = el("div", { class: "chat-widget" });

  const toggleBtn = el("button", { class: "bbl-btn ghost chat-toggle", onclick: () => { expanded = !expanded; refresh(); } });
  wrap.appendChild(toggleBtn);

  const panel = el("div", { class: "chat-panel" });
  const list = el("div", { class: "chat-messages" });
  for (const m of messages) {
    list.appendChild(el("div", { class: `chat-message ${m.from === "me" ? "mine" : "theirs"}` }, m.text));
  }
  panel.appendChild(list);

  const input = el("input", { type: "text", placeholder: "Message...", class: "chat-input", maxlength: "300" });
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    onSend(text);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
  panel.appendChild(el("div", { class: "chat-input-row" }, [input, el("button", { class: "bbl-btn", onclick: send }, "Send")]));
  wrap.appendChild(panel);

  function refresh() {
    toggleBtn.textContent = `\u{1F4AC} Chat${messages.length ? ` (${messages.length})` : ""}`;
    panel.style.display = expanded ? "flex" : "none";
  }
  refresh();
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });

  return wrap;
}
