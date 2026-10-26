import type { Rng } from "./rng";

/**
 * Epitaphs any destroyed Tank may show. Plain ASCII, family-friendly, and at most MAX_LINE_LENGTH
 * characters, so each one fits the field when drawn.
 */
export const EPITAPHS: readonly string[] = [
  "I regret nothing!",
  "Tell my turret I loved it.",
  "That was my good armour.",
  "Is it hot in here?",
  "I'll be back... in the next Round.",
  "Not like this!",
  "Ow.",
  "Worth it.",
  "I was one Turn from retiring.",
  "Avenge me!",
  "Well, that escalated quickly.",
  "Who taught you to aim like that?",
  "My warranty just expired.",
  "Rest in pieces.",
  "Goodbye, cruel hills!",
  "I should have bought a Shield.",
  "Lucky shot!",
  "That one stung a bit.",
  "Is this the Shop?",
  "Tanks for the memories.",
  "Game over, man!",
  "I see a bright light...",
  "Mommy?",
  "Can we call it a Draw?",
  "Return to sender.",
  "Somebody fetch a mop.",
  "That's going to leave a mark.",
  "I was aiming for that.",
  "Not the treads!",
  "Remember me as a hero.",
  "Back to the factory I go.",
  "Curse you, Wind!",
];

/** Extra Epitaphs a Tank may show when it destroyed itself. */
export const SELF_INFLICTED_EPITAPHS: readonly string[] = [
  "Oops.",
  "I meant to do that.",
  "Note to self: aim AWAY.",
  "What goes up must come down.",
  "Friendly fire. Very friendly.",
  "Who put my Tank there?",
];

/** Taunts a Tank may show as its Player is about to fire. Same rules as the Epitaphs. */
export const TAUNTS: readonly string[] = [
  "Say goodbye!",
  "Eat dirt!",
  "Incoming!",
  "This one's for you.",
  "Duck!",
  "Special delivery!",
  "You call that a Tank?",
  "Hold still, this won't hurt.",
  "Ready or not!",
  "Fire in the hole!",
  "Catch!",
  "I never miss. Well, rarely.",
  "Your Shield won't save you.",
  "Make my day.",
  "Prepare to be scorched!",
  "Here comes the boom!",
  "Bombs away!",
  "Read it and weep.",
  "Let's dance!",
  "Time to redecorate!",
  "You're toast!",
  "Knock knock!",
  "Smile for the camera!",
  "Nothing personal.",
  "Feeling lucky?",
  "Physics is on my side.",
  "Mind the gap!",
  "Hasta la vista!",
  "Gotcha now!",
  "Take that!",
];

/**
 * A random Epitaph for a destroyed Tank, from one draw of the flavour Rng. A Tank that destroyed
 * itself draws from the self-inflicted Epitaphs too, each as likely as any other.
 */
export function pickEpitaph(flavourRng: Rng, selfInflicted: boolean): string {
  const pool = selfInflicted ? [...EPITAPHS, ...SELF_INFLICTED_EPITAPHS] : EPITAPHS;
  return pool[flavourRng.int(0, pool.length - 1)] as string;
}
