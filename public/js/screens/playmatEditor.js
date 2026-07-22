import { el } from "../screens.js";

// The final saved image is rendered at this resolution regardless of the source photo's own
// size - matches the recommended-dimensions text shown in the picker and keeps the saved
// data: URL a predictable, reasonable size (JPEG at this resolution is comfortably under the
// server's per-deck playmat size cap - see server/routes/decks.js).
const OUTPUT_W = 1600;
const OUTPUT_H = 600;
// UI crop frame - same aspect ratio as the output, just sized for on-screen editing.
const FRAME_W = 480;
const FRAME_H = 180;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Opens a modal letting the player pick an image from their computer, then pan/zoom to crop
 * it to the field's playmat aspect ratio. `onSave(dataUrl)` is called with a JPEG data: URL
 * once they confirm, or never if they cancel - callers don't need to handle a null/cancelled
 * case separately.
 */
export function openPlaymatEditor(onSave) {
  const overlay = el("div", { class: "playmat-editor-overlay" });
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const panel = el("div", { class: "playmat-editor-panel bbl-panel" });
  panel.appendChild(el("div", { style: "font-weight:800;color:var(--bbl-blue);font-size:1.1rem;" }, "Playmat"));
  panel.appendChild(
    el(
      "div",
      { class: "playmat-hint" },
      `Recommended image size: ${OUTPUT_W}×${OUTPUT_H} or larger, landscape (about 8:3) for best results. Drag to reposition, use the slider to zoom, then crop to fit your field.`
    )
  );

  const fileInput = el("input", { type: "file", accept: "image/*" });
  panel.appendChild(fileInput);

  const frame = el("div", { class: "playmat-crop-frame" });
  panel.appendChild(frame);

  const zoomRow = el("div", { style: "display:flex;align-items:center;gap:8px;" });
  const zoomSlider = el("input", { type: "range", min: "100", max: "300", value: "100", style: "flex:1 1 auto;" });
  zoomRow.appendChild(el("span", { style: "font-size:0.8rem;" }, "Zoom"));
  zoomRow.appendChild(zoomSlider);
  panel.appendChild(zoomRow);

  const actions = el("div", { style: "display:flex;gap:10px;justify-content:flex-end;" });
  const cropBtn = el("button", { class: "bbl-btn", disabled: "true" }, "Use This Playmat");
  const cancelBtn = el("button", { class: "bbl-btn ghost", onclick: () => overlay.remove() }, "Cancel");
  actions.appendChild(cancelBtn);
  actions.appendChild(cropBtn);
  panel.appendChild(actions);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // --- Crop state, set once an image is loaded ---
  let img = null;
  let iw = 0;
  let ih = 0;
  let baseScale = 1; // scale at which the image just covers the frame with no gaps
  let zoom = 1; // additional user zoom on top of baseScale, 1..3
  let offsetX = 0; // top-left of the image within the frame, in frame-space px (<= 0)
  let offsetY = 0;

  function clampOffsets() {
    const scale = baseScale * zoom;
    const dispW = iw * scale;
    const dispH = ih * scale;
    offsetX = Math.min(0, Math.max(FRAME_W - dispW, offsetX));
    offsetY = Math.min(0, Math.max(FRAME_H - dispH, offsetY));
  }

  function redraw() {
    const scale = baseScale * zoom;
    frame.style.backgroundSize = `${iw * scale}px ${ih * scale}px`;
    frame.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
  }

  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = new Image();
      loaded.onload = () => {
        img = loaded;
        iw = img.naturalWidth;
        ih = img.naturalHeight;
        baseScale = Math.max(FRAME_W / iw, FRAME_H / ih);
        zoom = 1;
        zoomSlider.value = "100";
        offsetX = (FRAME_W - iw * baseScale) / 2;
        offsetY = (FRAME_H - ih * baseScale) / 2;
        frame.style.backgroundImage = `url(${reader.result})`;
        redraw();
        cropBtn.removeAttribute("disabled");
      };
      loaded.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  zoomSlider.oninput = () => {
    if (!img) return;
    zoom = Number(zoomSlider.value) / 100;
    clampOffsets();
    redraw();
  };

  // Pointer-based drag-to-pan - setPointerCapture keeps receiving move events even if the
  // pointer leaves the frame mid-drag, so a fast/sloppy drag doesn't get "stuck".
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetStartX = 0;
  let dragOffsetStartY = 0;
  frame.onpointerdown = (e) => {
    if (!img) return;
    dragging = true;
    frame.classList.add("dragging");
    frame.setPointerCapture(e.pointerId);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOffsetStartX = offsetX;
    dragOffsetStartY = offsetY;
  };
  frame.onpointermove = (e) => {
    if (!dragging) return;
    offsetX = dragOffsetStartX + (e.clientX - dragStartX);
    offsetY = dragOffsetStartY + (e.clientY - dragStartY);
    clampOffsets();
    redraw();
  };
  const stopDrag = () => {
    dragging = false;
    frame.classList.remove("dragging");
  };
  frame.onpointerup = stopDrag;
  frame.onpointercancel = stopDrag;

  cropBtn.onclick = () => {
    if (!img) return;
    const scale = baseScale * zoom;
    // The frame-space window [0,0]..[FRAME_W,FRAME_H] maps back to this rectangle in the
    // original image's own pixel coordinates - extracting exactly that (and scaling it up
    // to the output resolution) crops to what the player actually sees in the frame.
    const sx = -offsetX / scale;
    const sy = -offsetY / scale;
    const sWidth = FRAME_W / scale;
    const sHeight = FRAME_H / scale;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, OUTPUT_W, OUTPUT_H);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    overlay.remove();
    onSave(dataUrl);
  };
}
