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
// The <input> itself is recreated every render() same as everything else here, so whatever
// the player was mid-typing has to live here too, or it gets wiped out the instant the board
// re-renders for an unrelated reason (opponent's move, an incoming chat message, etc).
let draftText = "";
let draftSelectionStart = null;
let draftWasFocused = false;

export function resetChat() {
  messages = [];
  expanded = false;
  draftText = "";
  draftSelectionStart = null;
  draftWasFocused = false;
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
  input.value = draftText;
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    draftText = "";
    draftSelectionStart = null;
    onSend(text);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
  input.addEventListener("input", () => {
    draftText = input.value;
    draftSelectionStart = input.selectionStart;
  });
  input.addEventListener("focus", () => { draftWasFocused = true; });
  input.addEventListener("blur", () => {
    // render() tears this input out of the DOM (container.innerHTML = "") on every board
    // update, which fires a native blur too - that's not the player clicking away, so only
    // treat this as "really" losing focus if the element is still actually attached.
    if (document.body.contains(input)) draftWasFocused = false;
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
    // .focus() is a no-op on an element not yet attached to the document, which `input`
    // still isn't at this point - renderChatWidget() only builds the DOM, its caller
    // appends `wrap` after this function returns. Deferring a frame (same as the scroll
    // restore above) lets that happen first. Only worth doing if the panel is actually open
    // and the player really was mid-typing right before this rebuild - otherwise this would
    // steal focus onto the chat box on every routine board update.
    if (expanded && draftWasFocused) {
      input.focus();
      const pos = draftSelectionStart ?? draftText.length;
      input.setSelectionRange(pos, pos);
    }
  });

  return wrap;
}
