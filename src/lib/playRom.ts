// The ROM snapshot the in-browser player runs. "Save and Play Game" stores the current
// bytes in this browser's localStorage (no file is written), so the game keeps running the
// version you saved even while you go on editing. If storage is unavailable or full, the
// snapshot is kept in memory for this visit.

const LS_KEY = "tecmo.playrom.v1";

export interface PlayRom {
  name: string;
  bytes: Uint8Array;
  savedAt: number;
}

let current: PlayRom | null = null;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  // Chunked so String.fromCharCode doesn't overflow the argument limit on a full ROM.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Saves a copy of `bytes` as the ROM to play. Returns true if it reached browser storage. */
export function savePlayRom(name: string, bytes: Uint8Array): boolean {
  current = { name, bytes: new Uint8Array(bytes), savedAt: Date.now() };
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ name, savedAt: current.savedAt, data: toBase64(bytes) }),
    );
    return true;
  } catch {
    return false;
  }
}

/** The last ROM saved with savePlayRom, from memory or browser storage. */
export function loadPlayRom(): PlayRom | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { name, savedAt, data } = JSON.parse(raw) as {
      name: string;
      savedAt: number;
      data: string;
    };
    current = { name, savedAt, bytes: fromBase64(data) };
    return current;
  } catch {
    return null;
  }
}
