const KEY = "scorched-earth:muted";

/** Whether Sound Effects were Muted on a previous visit. Sound is on unless saved otherwise. */
export function loadMuted(scope: object = globalThis): boolean {
  try {
    return (scope as { localStorage?: Storage }).localStorage?.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked or unavailable: just start with sound on
  }
}

/** Remember the Mute choice for next time; a blocked store is ignored. */
export function saveMuted(muted: boolean, scope: object = globalThis): void {
  try {
    (scope as { localStorage?: Storage }).localStorage?.setItem(KEY, muted ? "1" : "0");
  } catch {
    // The choice just won't survive a reload.
  }
}
