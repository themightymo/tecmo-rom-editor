// Runs a ROM in JSNES on a <canvas>, with audio and fixed-rate timing. Ported from the
// player in themightymo/Retro-Game-Emulator-Forked (itself based on JSNES's nes-embed
// example): the game advances at 60 emulated frames per second times the chosen speed,
// independent of the display's refresh rate, and audio is resampled to follow that speed.

import { NES, Controller } from "jsnes";

export const NES_BUTTONS = ["UP", "LEFT", "DOWN", "RIGHT", "A", "B", "START", "SELECT"] as const;
export type NesButton = (typeof NES_BUTTONS)[number];

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 2;

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 240;
const FRAME_RATE = 60;
const NES_SAMPLE_RATE = 48000;
const AUDIO_BUFFERING = 512;
const SAMPLE_COUNT = 4 * 1024;
const SAMPLE_MASK = SAMPLE_COUNT - 1;
const SPEED_CHECK_MS = 10000;

export type SpeedCheckUpdate =
  | { kind: "progress"; secondsLeft: number }
  | {
      kind: "done";
      fps: number;
      target: number;
      percent: number;
      longestGap: number;
      stalls: number;
    }
  | { kind: "cancelled"; reason: "hidden" | "speed" };

export interface Emulator {
  press: (button: NesButton, down: boolean) => void;
  releaseAll: () => void;
  setSpeed: (speed: number) => void;
  /** Resumes audio; browsers only allow this after the player interacts with the page. */
  resumeAudio: () => Promise<void>;
  startSpeedCheck: (onUpdate: (u: SpeedCheckUpdate) => void) => void;
  cancelSpeedCheck: (reason: "hidden" | "speed") => void;
  destroy: () => void;
}

/** Boots `rom` on `canvas`. Throws if JSNES can't load the ROM. */
export function createEmulator(canvas: HTMLCanvasElement, rom: Uint8Array, speed = 1): Emulator {
  const ctx = canvas.getContext("2d")!;
  const image = ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  const buffer = new ArrayBuffer(image.data.length);
  const framebufferU8 = new Uint8ClampedArray(buffer);
  const framebufferU32 = new Uint32Array(buffer);

  const samplesL = new Float32Array(SAMPLE_COUNT);
  const samplesR = new Float32Array(SAMPLE_COUNT);
  let writeCursor = 0;
  let readCursor = 0;
  let audioFraction = 0;

  let lastFrameTime: number | null = null;
  let frameBudget = 0;
  let emulatedFrames = 0;
  let destroyed = false;

  type Check = {
    onUpdate: (u: SpeedCheckUpdate) => void;
    start: number | null;
    previous: number;
    frames: number;
    longestGap: number;
    stalls: number;
    percent: number;
    target: number;
  };
  let check: Check | null = null;

  const nes = new NES({
    sampleRate: NES_SAMPLE_RATE,
    onFrame: (fb) => {
      for (let i = 0; i < fb.length; i++) framebufferU32[i] = 0xff000000 | fb[i];
    },
    onAudioSample: (l, r) => {
      // Drop the oldest sample if audio output stalls; never wrap to an empty queue.
      if (((writeCursor + 1) & SAMPLE_MASK) === readCursor) {
        readCursor = (readCursor + 1) & SAMPLE_MASK;
      }
      samplesL[writeCursor] = l;
      samplesR[writeCursor] = r;
      writeCursor = (writeCursor + 1) & SAMPLE_MASK;
    },
  });
  // JSNES wants a byte string (one char per byte) or a byte array.
  nes.loadROM(new Uint8Array(rom));

  function resetTiming() {
    lastFrameTime = null;
    frameBudget = 0;
    writeCursor = readCursor = 0;
    audioFraction = 0;
  }

  const audioCtx = new AudioContext();
  // ScriptProcessorNode is deprecated but universally supported, and it's what the
  // reference player uses; an AudioWorklet would need a separate module file.
  const processor = audioCtx.createScriptProcessor(AUDIO_BUFFERING, 0, 2);
  processor.onaudioprocess = (event) => {
    const dst = event.outputBuffer;
    const dstL = dst.getChannelData(0);
    const dstR = dst.getChannelData(1);
    if (document.hidden) {
      dstL.fill(0);
      dstR.fill(0);
      return;
    }
    // Consume emulated audio at the selected rate. Matching the source and output sample
    // rates keeps 100% speed correct on 44.1 kHz devices too.
    const step = (speed * NES_SAMPLE_RATE) / audioCtx.sampleRate;
    const remain = () => (writeCursor - readCursor) & SAMPLE_MASK;
    for (let i = 0; i < dst.length; i++) {
      // Audio follows the clock; an underrun must never advance the game.
      if (remain() < Math.ceil(step) + 1) {
        dstL.fill(0, i);
        dstR.fill(0, i);
        break;
      }
      const next = (readCursor + 1) & SAMPLE_MASK;
      dstL[i] = samplesL[readCursor] * (1 - audioFraction) + samplesL[next] * audioFraction;
      dstR[i] = samplesR[readCursor] * (1 - audioFraction) + samplesR[next] * audioFraction;
      audioFraction += step;
      const consumed = Math.floor(audioFraction);
      readCursor = (readCursor + consumed) & SAMPLE_MASK;
      audioFraction -= consumed;
    }
  };
  processor.connect(audioCtx.destination);

  function measureSpeed(timestamp: number) {
    if (!check) return;
    if (check.start === null) {
      check.start = check.previous = timestamp;
      check.frames = emulatedFrames;
      return;
    }
    const gap = timestamp - check.previous;
    check.previous = timestamp;
    check.longestGap = Math.max(check.longestGap, gap);
    if (gap > 50) check.stalls++;
    const elapsed = timestamp - check.start;
    if (elapsed < SPEED_CHECK_MS) {
      check.onUpdate({
        kind: "progress",
        secondsLeft: Math.ceil((SPEED_CHECK_MS - elapsed) / 1000),
      });
      return;
    }
    const { onUpdate, frames, target, percent, longestGap, stalls } = check;
    check = null;
    onUpdate({
      kind: "done",
      fps: ((emulatedFrames - frames) * 1000) / elapsed,
      target,
      percent,
      longestGap,
      stalls,
    });
  }

  let rafId = 0;
  function onAnimationFrame(timestamp: number) {
    if (destroyed) return;
    rafId = requestAnimationFrame(onAnimationFrame);
    if (document.hidden) {
      resetTiming();
      return;
    }
    if (lastFrameTime !== null) {
      // Carry fractional frames forward so refresh rate cannot change game speed.
      // Discard long stalls rather than fast-forwarding to catch up.
      const elapsed = timestamp - lastFrameTime;
      if (elapsed >= 0 && elapsed <= 100) {
        frameBudget += (elapsed * FRAME_RATE * speed) / 1000;
        while (frameBudget >= 1) {
          nes.frame();
          emulatedFrames++;
          frameBudget -= 1;
        }
      } else {
        resetTiming();
      }
    }
    lastFrameTime = timestamp;
    image.data.set(framebufferU8);
    ctx.putImageData(image, 0, 0);
    measureSpeed(timestamp);
  }
  rafId = requestAnimationFrame(onAnimationFrame);

  const releaseAll = () => {
    for (const b of NES_BUTTONS) nes.buttonUp(1, Controller[`BUTTON_${b}`]);
  };

  const cancelSpeedCheck = (reason: "hidden" | "speed") => {
    if (!check) return;
    const { onUpdate } = check;
    check = null;
    onUpdate({ kind: "cancelled", reason });
  };

  const onVisibility = () => {
    if (document.hidden) cancelSpeedCheck("hidden");
    resetTiming();
    releaseAll();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    press: (button, down) => {
      const code = Controller[`BUTTON_${button}`];
      if (down) nes.buttonDown(1, code);
      else nes.buttonUp(1, code);
    },
    releaseAll,
    setSpeed: (s) => {
      speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
      resetTiming();
    },
    resumeAudio: () => audioCtx.resume(),
    startSpeedCheck: (onUpdate) => {
      check = {
        onUpdate,
        start: null,
        previous: 0,
        frames: 0,
        longestGap: 0,
        stalls: 0,
        percent: Math.round(speed * 100),
        target: FRAME_RATE * speed,
      };
    },
    cancelSpeedCheck,
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      processor.disconnect();
      void audioCtx.close();
    },
  };
}
