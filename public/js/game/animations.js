// Lightweight, dependency-free animations. Since render() fully rebuilds the board DOM on
// every action (simplest correct approach given how much can change per action), these
// work by spawning a short-lived absolutely-positioned clone that animates between two
// captured bounding rects, rather than true FLIP-diffing the persistent DOM.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Swipe/flash effect from the attacker's card to the target's card. Works identically
 * whether the target is on the opponent's field or (per Ricky Covey Jr.'s Star Power) a
 * teammate on the attacker's own field - it's driven purely by the two DOM rects, with no
 * assumption about whose field either side is on.
 */
export async function animateAttackSwipe(attackerEl, targetEl) {
  if (!attackerEl || !targetEl) return;
  const a = attackerEl.getBoundingClientRect();
  const t = targetEl.getBoundingClientRect();
  const cx = (a.left + a.right) / 2;
  const cy = (a.top + a.bottom) / 2;
  const tx = (t.left + t.right) / 2;
  const ty = (t.top + t.bottom) / 2;

  const swipe = document.createElement("div");
  swipe.className = "attack-swipe";
  Object.assign(swipe.style, {
    left: `${cx - 14}px`,
    top: `${cy - 14}px`,
    width: "28px",
    height: "28px",
    opacity: "0.9",
    transition: "left 0.28s ease-in, top 0.28s ease-in, width 0.15s ease, height 0.15s ease, opacity 0.2s ease 0.25s",
  });
  document.body.appendChild(swipe);

  targetEl.style.transition = "transform 0.12s ease";
  attackerEl.style.transition = "transform 0.15s ease";

  requestAnimationFrame(() => {
    swipe.style.left = `${tx - 14}px`;
    swipe.style.top = `${ty - 14}px`;
    attackerEl.style.transform = `translate(${(tx - cx) * 0.08}px, ${(ty - cy) * 0.08}px) scale(1.05)`;
  });

  await sleep(280);
  swipe.style.width = "70px";
  swipe.style.height = "70px";
  swipe.style.left = `${tx - 35}px`;
  swipe.style.top = `${ty - 35}px`;
  targetEl.style.transform = "scale(0.94)";
  attackerEl.style.transform = "";

  await sleep(220);
  targetEl.style.transform = "";
  swipe.style.opacity = "0";
  await sleep(200);
  swipe.remove();
}

/** Flies a clone of a card from one rect to another (hand -> field, deck -> field, etc). */
export async function animateCardMove(startRect, imageUrl, endRect) {
  if (!startRect || !endRect) return;
  const clone = document.createElement("div");
  clone.className = "fly-card";
  Object.assign(clone.style, {
    left: `${startRect.left}px`,
    top: `${startRect.top}px`,
    width: `${startRect.width}px`,
    height: `${startRect.height}px`,
    backgroundImage: `url(${imageUrl})`,
  });
  document.body.appendChild(clone);

  await sleep(20); // let the initial position paint before transitioning
  requestAnimationFrame(() => {
    clone.style.left = `${endRect.left}px`;
    clone.style.top = `${endRect.top}px`;
    clone.style.width = `${endRect.width}px`;
    clone.style.height = `${endRect.height}px`;
  });
  await sleep(380);
  clone.remove();
}
