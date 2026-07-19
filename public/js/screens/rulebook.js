import { el, showScreen } from "../screens.js";
import { renderMenu } from "./menu.js";

const TRIGGER_DOCS = [
  ["YOUR TURN", "Usable any time during your own Main Phase - but only once per turn per source."],
  ["OPP. TURN", "Usable any time during your opponent's turn - a general reaction window, but only once per turn per source."],
  ["DURING ATK", "Usable by a card while it is the one attacking (or, for reactive cards, while it's being attacked), right as that attack is declared."],
  ["OPP. ATK", "A reaction usable specifically when your opponent declares an attack."],
  ["ON PLAY", "Usable immediately when the card is played from your hand to the field."],
  ["ON KO", "Usable the moment the card is KOed, before it's removed from the field."],
  ["SACRIFICE", "A defensive ability, usually letting a player card intercept/redirect an attack meant for a different one of your players."],
  ["No trigger listed", "The effect is always active/passive - there's nothing to choose to activate, it's just always true."],
];

const PHASES = [
  ["1. Recover", "All PLAYERSCORE UP! attached to players or rested return to the bottom-center sector, active. All your players return to full Health."],
  ["2. Draw", "Draw 1 card from your deck."],
  ["3. PLAYERSCORE UP! Draw", "Draw 2 PLAYERSCORE UP! from your PS Deck to the active position (only 1 if your PS Deck has exactly 1 left; skipped if it's empty)."],
  ["4. Main Phase", "Play cards, attack, and use effects in any order you like."],
  ["5. End Phase", "Your turn ends. If you have 0 players on your field right now, draw 1 card from your Score (lose if you have none left)."],
];

export function renderRulebook() {
  const root = document.getElementById("rulebook-screen");
  root.innerHTML = "";
  root.className = "screen rulebook-screen";

  const content = el("div", { class: "rulebook-content" }, [
    el("div", { class: "rulebook-back" }, [el("button", { class: "bbl-btn ghost", onclick: () => { renderMenu(); showScreen("menu-screen"); } }, "← Menu")]),
    el("h1", {}, "Big Ball League TCG - Rulebook"),

    el("h2", {}, "The 6 Card Types"),
    cardTypeTable(),
    el(
      "p",
      {},
      "PLAYERSCORE UP!: on your turn, you may attach an active (unrested) PLAYERSCORE UP! to one of your own non-STAR Players for +1 Attack. It cannot be attached to a STAR Player unless a card effect specifically allows it. Attached PLAYERSCORE UP! return to the field, rested, whenever that player leaves the field (KOed, discarded, or otherwise removed) - and everything returns to the field active again in your next Recover phase."
    ),

    el("h2", {}, "Anatomy of a Player Card"),
    el("img", { class: "rulebook-diagram", src: "/assets/branding/card-diagram.png", alt: "Diagram of a Player card's parts" }),
    el("p", {}, "Cost is what you pay (in rested PLAYERSCORE UP!) to play the card. Health (shown in a green marker) is how much damage it can take before being KOed. Attack (shown in a red marker) is how much damage it deals. Tier is mostly cosmetic. Speed is Slow, Midspeed, or Fast."),

    el("h2", {}, "Speed Triangle"),
    el("p", {}, "Fast beats Midspeed, Midspeed beats Slow, and Slow beats Fast. Winning the matchup gives the attacker +1 extra damage."),

    el("h2", {}, "Triggers"),
    triggerTable(),
    el(
      "p",
      {},
      "Any card effect with a trigger (i.e. anything but a passive, always-on effect) can only be activated once per turn per source - a Head Coach, Assistant Coach, or field Player only gets one use of each of its abilities per turn, even a YOUR TURN or OPP. TURN ability that would otherwise stay available all turn long."
    ),

    el("h2", {}, "Setup"),
    el("ol", {}, [
      el("li", {}, "Each player's deck is exactly 60 cards (not counting the Head Coach or PLAYERSCORE UP!), plus 1 Head Coach and 8 PLAYERSCORE UP!."),
      el("li", {}, "Both players roll a die (reroll ties) - the higher roll wins the choice of whether to go first or second."),
      el("li", {}, "Draw 5 cards. You may mulligan once (shuffle your hand back and redraw 5). STAR Players and Players with a Cost of 3 or more cannot be put on the field at setup, so every kept hand is guaranteed to contain at least 1 Player with a Cost of 3 or less."),
      el("li", {}, "Take the next 4 cards off the top of your deck as your face-down Score."),
      el("li", {}, "Each player plays 1 Player (Cost 3 or less, not a STAR Player) from their hand to the field for free."),
    ]),

    el("h2", {}, "Turn Phases"),
    phaseTable(),
    el("p", {}, "The player going first cannot attack on their first turn and only draws 1 PLAYERSCORE UP! that turn. The player going second also cannot attack on their own first turn, but draws PLAYERSCORE UP! normally."),

    el("h2", {}, "Winning and Losing"),
    el("p", {}, "Whenever one of your Player or Star Player cards is KOed (not simply discarded), draw a card from your own Score. If you have no Score cards left when this happens, you lose. You also draw from your Score (and can lose the same way) if you end your turn with 0 players on your field."),

    el("h2", {}, "The Field"),
    el("p", {}, "Each side of the board is its own 3x3 grid of sectors, laid out like this (the center column is wider - that's where all the action happens):"),
    fieldDiagram(),

    el("h2", {}, "Tutorial Video"),
    videoEmbed(),
  ]);
  root.appendChild(content);
}

/** 16:9-responsive iframe wrapper - the padding-top:56.25% trick keeps the aspect ratio
 * without JS, since a plain <iframe> ignores CSS aspect-ratio inconsistently across browsers. */
function videoEmbed() {
  return el("div", { class: "rulebook-video-wrap" }, [
    el("iframe", {
      src: "https://www.youtube.com/embed/fbaeQsHo3ec",
      title: "BBLTCG Tutorial Video",
      frameborder: "0",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
      allowfullscreen: "true",
    }),
  ]);
}

function cardTypeTable() {
  const rows = [
    ["Player", "Cost, Health, Attack, Speed, Tier, an effect/trigger. Up to 3 on the field. Can't attack the turn it's played unless its effect says otherwise."],
    ["Star Player", "Same as a Player, plus a Star Power. Cannot attack during its 2 \"Power Up Turns\" (the turn played and the next one) - but its effects still work. Only 1 Star Player on the field at a time."],
    ["Head Coach", "Free, played at the start of the game, never leaves the field. Doesn't take a player slot. Only 1 per deck."],
    ["Assistant Coach", "Played from your deck like a Player, for its Cost. Attaches to your Head Coach. Only 1 on the field at a time, and you can't play a new one while you have one."],
    ["Event", "Played for its Cost, resolves, then is discarded. Only usable when its trigger allows."],
    ["PLAYERSCORE UP!", "Your resource. Rest them to pay costs. Attach active ones to a (non-Star) Player on your turn for +1 Attack each."],
  ];
  return el(
    "table",
    {},
    [el("tr", {}, [el("th", {}, "Type"), el("th", {}, "What it does")]), ...rows.map(([a, b]) => el("tr", {}, [el("td", {}, a), el("td", {}, b)]))]
  );
}

function triggerTable() {
  return el("table", {}, [
    el("tr", {}, [el("th", {}, "Trigger"), el("th", {}, "When you can use it")]),
    ...TRIGGER_DOCS.map(([a, b]) => el("tr", {}, [el("td", {}, a), el("td", {}, b)])),
  ]);
}

function phaseTable() {
  return el("table", {}, [
    el("tr", {}, [el("th", {}, "Phase"), el("th", {}, "What happens")]),
    ...PHASES.map(([a, b]) => el("tr", {}, [el("td", {}, a), el("td", {}, b)])),
  ]);
}

/** Maps out the 3x3 field grid - a plain CSS-grid mock (not an image) so it always matches
 * the real board.css proportions and never goes stale as a separately-drawn diagram would. */
function fieldDiagram() {
  const cells = [
    ["Score", false],
    ["3 Player Slots", false],
    ["(empty)", true],
    ["(empty)", true],
    ["Head Coach +\nAssistant Coach", false],
    ["Deck", false],
    ["PS Deck", false],
    ["8 PLAYERSCORE UP! Slots", false],
    ["Discard Pile", false],
  ];
  return el(
    "div",
    { class: "field-diagram" },
    cells.map(([label, empty]) =>
      el("div", { class: `field-diagram-cell${empty ? " empty" : ""}` }, label)
    )
  );
}
