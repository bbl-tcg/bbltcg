export const CARD_TYPE = {
  PLAYER: "Player",
  STAR_PLAYER: "StarPlayer",
  HEAD_COACH: "HeadCoach",
  ASSISTANT_COACH: "AssistantCoach",
  EVENT: "Event",
};

export const TRIGGER = {
  YOUR_TURN: "YOUR_TURN",
  OPPONENTS_TURN: "OPPONENTS_TURN",
  WHILE_ATTACKING: "WHILE_ATTACKING",
  ON_OPPONENTS_ATTACK: "ON_OPPONENTS_ATTACK",
  ON_PLAY: "ON_PLAY",
  ON_KO: "ON_KO",
  SACRIFICE: "SACRIFICE",
};

export const SPEED = {
  SLOW: "SLOW",
  MIDSPEED: "MIDSPEED",
  FAST: "FAST",
};

// speedBeats[attackerSpeed] = defenderSpeed that grants the attacker +1 damage.
export const SPEED_BEATS = {
  FAST: "MIDSPEED",
  MIDSPEED: "SLOW",
  SLOW: "FAST",
};

export const PHASE = {
  RECOVER: "RECOVER",
  DRAW: "DRAW",
  PS_DRAW: "PS_DRAW",
  MAIN: "MAIN",
  END: "END",
};

export const ZONE = {
  DECK: "DECK",
  HAND: "HAND",
  DISCARD: "DISCARD",
  SCORE: "SCORE",
  FIELD: "FIELD",
  PS_FIELD: "PS_FIELD",
  PS_DECK: "PS_DECK",
  HEAD_COACH: "HEAD_COACH",
  ASSISTANT_COACH: "ASSISTANT_COACH",
};

export const MAIN_DECK_SIZE = 60;
export const MAX_COPIES_PER_NAME = 5;
export const PS_DECK_SIZE = 5;
export const PLAYER_SLOT_COUNT = 3;
export const STARTING_SCORE_COUNT = 2;
export const STARTING_HAND_SIZE = 5;
export const STARTING_PACK_POINTS = 5;
