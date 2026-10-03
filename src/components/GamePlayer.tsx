// The "Play Game" view: runs the ROM saved by "Save and Play Game" in the browser. Its
// controls follow themightymo/Retro-Game-Emulator-Forked: remappable keyboard bindings and
// game speed remembered in this browser, a 10-second speed check, and fullscreen.

import { useEffect, useRef, useState } from "react";
import {
  createEmulator,
  MAX_SPEED,
  MIN_SPEED,
  NES_BUTTONS,
  type Emulator,
  type NesButton,
  type SpeedCheckUpdate,
} from "@/lib/emulator";
import { loadPlayRom } from "@/lib/playRom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Maximize, Minimize, Gauge } from "lucide-react";

// The pixel font has no left/right arrow glyphs, so arrow keys show as icons on the keycaps.
const ARROW_ICONS: Record<string, typeof ArrowUp> = {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
};

type Bindings = Record<NesButton, string[]>;

const DEFAULT_BINDINGS: Bindings = {
  UP: ["ArrowUp"],
  LEFT: ["ArrowLeft"],
  DOWN: ["ArrowDown"],
  RIGHT: ["ArrowRight"],
  A: ["KeyA", "KeyQ"],
  B: ["KeyS", "KeyO"],
  START: ["Enter"],
  SELECT: ["Tab"],
};

const LS_CONTROLS = "tecmo.emulator.controls.v1";
const LS_SPEED = "tecmo.emulator.speed.v1";

const BUTTON_LABELS: Record<NesButton, string> = {
  UP: "Up",
  LEFT: "Left",
  DOWN: "Down",
  RIGHT: "Right",
  A: "A button",
  B: "B button",
  START: "Start",
  SELECT: "Select",
};

function allowedKey(code: string) {
  return /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Tab|Backspace|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|Numpad[0-9])$/.test(
    code,
  );
}

function keyLabel(code: string) {
  const labels: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
  };
  return labels[code] ?? code.replace(/^Key|^Digit/, "").replace(/(Left|Right)$/, " $1");
}

function loadBindings(): Bindings {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_CONTROLS) ?? "null") as Bindings | null;
    const seen = new Set<string>();
    const valid =
      saved &&
      NES_BUTTONS.every(
        (b) =>
          Array.isArray(saved[b]) &&
          saved[b].length > 0 &&
          saved[b].length <= 2 &&
          saved[b].every((code) => {
            if (typeof code !== "string" || !allowedKey(code) || seen.has(code)) return false;
            seen.add(code);
            return true;
          }),
      );
    if (valid) return saved;
  } catch {
    /* Controls still work when storage is unavailable. */
  }
  return structuredClone(DEFAULT_BINDINGS);
}

const validSpeed = (s: number) => Number.isFinite(s) && s >= MIN_SPEED && s <= MAX_SPEED;

function loadSpeed() {
  try {
    const saved = Number(localStorage.getItem(LS_SPEED));
    if (validSpeed(saved)) return Math.round(saved * 100) / 100;
  } catch {
    /* Speed still works without browser storage. */
  }
  return 1;
}

function describeSpeedCheck(u: Extract<SpeedCheckUpdate, { kind: "done" }>) {
  const ratio = u.fps / u.target;
  let result = `${u.fps.toFixed(1)} game FPS / ${u.target.toFixed(1)} target at ${u.percent}%. `;
  result += `Longest display gap: ${Math.round(u.longestGap)} ms; pauses over 50 ms: ${u.stalls}. `;
  if (ratio < 0.98) {
    result +=
      "The browser is falling behind. Close busy tabs or apps and test again. Raising the speed setting will not fix slowdowns.";
  } else if (ratio > 1.02) {
    result +=
      "The game ran above the selected target. Run the check again to confirm before adjusting speed.";
  } else if (u.stalls > 0) {
    result +=
      "Average speed is on target, but playback had pauses. Close busy tabs or apps and test again.";
  } else {
    result +=
      "Your selected speed is steady. 100% targets 60 game FPS; a lower percentage is a personal preference if the game feels too fast.";
  }
  return result;
}

export function GamePlayer({ onExit }: { onExit: () => void }) {
  const [saved] = useState(loadPlayRom);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const emuRef = useRef<Emulator | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(loadSpeed);
  const [speedInput, setSpeedInput] = useState(() => String(Math.round(speed * 100)));
  const [checking, setChecking] = useState<string | null>(null);
  const [speedResult, setSpeedResult] = useState("");

  const [bindings, setBindings] = useState(loadBindings);
  const [capture, setCapture] = useState<NesButton | null>(null);
  const [feedback, setFeedback] = useState("");
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;
  const captureRef = useRef(capture);
  captureRef.current = capture;
  // Remap buttons set this so the keyup that finishes a capture doesn't re-click the button.
  const capturedKeyRef = useRef<string | null>(null);

  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;

  // Boot the emulator once, on the saved snapshot.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !saved) return;
    let emu: Emulator;
    try {
      emu = createEmulator(canvas, saved.bytes, speed);
    } catch {
      setError("Unable to start this ROM in the emulator.");
      return;
    }
    emuRef.current = emu;
    void emu.resumeAudio().catch(() => {});
    canvas.focus({ preventScroll: true });
    return () => {
      emuRef.current = null;
      emu.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speed is applied via setSpeed below
  }, [saved]);

  // Keyboard → controller, only while the game screen has focus.
  useEffect(() => {
    const held = new Map<string, NesButton>();
    const releaseAll = () => {
      held.clear();
      emuRef.current?.releaseAll();
    };
    const keyboard = (down: boolean, event: KeyboardEvent) => {
      const emu = emuRef.current;
      if (!emu || document.activeElement !== canvasRef.current || captureRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        canvasRef.current?.blur();
        return;
      }
      if (
        down &&
        (event.metaKey || event.ctrlKey || event.altKey) &&
        !/^(Control|Alt)/.test(event.code)
      )
        return;
      const b = bindingsRef.current;
      const button = NES_BUTTONS.find((name) => b[name].includes(event.code));
      if (!button) return;
      event.preventDefault();
      if (down) {
        held.set(event.code, button);
        emu.press(button, true);
      } else {
        held.delete(event.code);
        if (![...held.values()].includes(button)) emu.press(button, false);
      }
    };
    const onDown = (e: KeyboardEvent) => keyboard(true, e);
    const onUp = (e: KeyboardEvent) => keyboard(false, e);
    const canvas = canvasRef.current;
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", releaseAll);
    canvas?.addEventListener("blur", releaseAll);
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", releaseAll);
      canvas?.removeEventListener("blur", releaseAll);
    };
  }, []);

  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === playerRef.current;
      setFullscreen(active);
      emuRef.current?.releaseAll();
      if (active) canvasRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const changeSpeed = (value: string) => {
    setSpeedInput(value);
    const percent = Number(value);
    if (!Number.isInteger(percent) || !validSpeed(percent / 100)) return;
    emuRef.current?.cancelSpeedCheck("speed");
    setSpeed(percent / 100);
    emuRef.current?.setSpeed(percent / 100);
    try {
      localStorage.setItem(LS_SPEED, String(percent / 100));
    } catch {
      /* not remembered, but still applied */
    }
  };

  const startSpeedCheck = () => {
    const emu = emuRef.current;
    if (!emu || document.hidden) {
      setSpeedResult("Start a game first, then check its speed.");
      return;
    }
    setChecking("Checking…");
    setSpeedResult("Checking 10 seconds of gameplay. Keep playing and leave this tab visible.");
    canvasRef.current?.focus({ preventScroll: true });
    emu.startSpeedCheck((u) => {
      if (u.kind === "progress") {
        setChecking(`Checking… ${u.secondsLeft}s`);
        return;
      }
      setChecking(null);
      if (u.kind === "done") setSpeedResult(describeSpeedCheck(u));
      else if (u.reason === "hidden")
        setSpeedResult(
          "Check cancelled because the tab was hidden. Keep this tab visible and try again.",
        );
      else setSpeedResult("Speed changed. Run the check again at your new setting.");
    });
  };

  const toggleFullscreen = async () => {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
      else await playerRef.current?.requestFullscreen();
    } catch {
      setFullscreenError("Fullscreen could not start. Please try again.");
    }
  };

  const saveBindings = (next: Bindings) => {
    setBindings(next);
    try {
      localStorage.setItem(LS_CONTROLS, JSON.stringify(next));
      setFeedback("Controls saved in this browser.");
    } catch {
      setFeedback("Controls updated for this visit. This browser could not save them.");
    }
  };

  const onRemapKey = (button: NesButton, event: React.KeyboardEvent) => {
    if (capture !== button) return;
    event.preventDefault();
    event.stopPropagation();
    capturedKeyRef.current = event.code;
    if (event.key === "Escape") {
      setCapture(null);
      setFeedback("Change cancelled.");
      return;
    }
    if (event.repeat) return;
    if (
      !allowedKey(event.code) ||
      event.metaKey ||
      (event.ctrlKey && !event.code.startsWith("Control")) ||
      (event.altKey && !event.code.startsWith("Alt"))
    ) {
      setFeedback(
        "Choose a letter, number, arrow, or a single keyboard key. Esc is reserved to leave the game.",
      );
      return;
    }
    const conflict = NES_BUTTONS.find((b) => b !== button && bindings[b].includes(event.code));
    if (conflict) {
      setFeedback(
        `${keyLabel(event.code)} is already used for ${BUTTON_LABELS[conflict]}. Choose another key.`,
      );
      return;
    }
    setCapture(null);
    saveBindings({ ...bindings, [button]: [event.code] });
  };

  const remapButton = (button: NesButton) => (
    <button
      key={button}
      type="button"
      aria-label={`Change ${BUTTON_LABELS[button]} key`}
      title={`Change ${BUTTON_LABELS[button]} key`}
      aria-pressed={capture === button}
      onClick={() => {
        emuRef.current?.releaseAll();
        setCapture(button);
        setFeedback(`Press a key for ${BUTTON_LABELS[button]}. Press Esc to cancel.`);
      }}
      onBlur={() => {
        if (captureRef.current === button) {
          setCapture(null);
          setFeedback("Change cancelled.");
        }
      }}
      onKeyDown={(e) => onRemapKey(button, e)}
      onKeyUp={(e) => {
        if (capturedKeyRef.current === e.code) {
          e.preventDefault();
          capturedKeyRef.current = null;
        }
      }}
      className="group normal-case"
    >
      <kbd
        className={`inline-block min-w-8 border-2 border-b-4 px-2 py-1 text-center text-xs ${
          capture === button
            ? "border-highlight bg-accent"
            : "border-muted-foreground bg-card group-hover:border-highlight"
        }`}
      >
        {capture === button
          ? "Press a key…"
          : bindings[button].map((code, i) => {
              const Icon = ARROW_ICONS[code];
              return (
                <span key={code}>
                  {i > 0 && " / "}
                  {Icon ? (
                    <Icon className="inline size-3 align-[-2px]" aria-label={keyLabel(code)} />
                  ) : (
                    keyLabel(code)
                  )}
                </span>
              );
            })}
      </kbd>
    </button>
  );

  if (!saved) {
    return (
      <div className="nes-window space-y-3 p-6 text-center">
        <p className="text-sm">No saved ROM to play yet.</p>
        <Button variant="outline" onClick={onExit}>
          <ArrowLeft className="size-4" /> Back to editor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="nes-window flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <div className="truncate font-medium">Now playing · {saved.name}</div>
          <div className="text-xs text-muted-foreground">
            Saved {new Date(saved.savedAt).toLocaleTimeString()} · edits you make after this won't
            show until you save and play again
          </div>
        </div>
        <Button variant="outline" onClick={onExit}>
          <ArrowLeft className="size-4" /> Back to editor
        </Button>
      </div>

      <div
        ref={playerRef}
        className="nes-window p-3 [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:border-0 [&:fullscreen]:p-0"
      >
        <div className="grid place-items-center bg-black [:fullscreen_&]:min-h-0 [:fullscreen_&]:flex-1 [:fullscreen_&]:grid-cols-[minmax(0,1fr)] [:fullscreen_&]:grid-rows-[minmax(0,1fr)]">
          {error ? (
            <p className="p-12 text-center text-sm text-destructive">{error}</p>
          ) : (
            <canvas
              ref={canvasRef}
              width={256}
              height={240}
              tabIndex={0}
              aria-label="Game screen. Focus here to use the keyboard controls."
              onPointerDown={() => void emuRef.current?.resumeAudio().catch(() => {})}
              onKeyDown={() => void emuRef.current?.resumeAudio().catch(() => {})}
              className="block aspect-[256/240] max-h-[70vh] w-full object-contain outline-none [image-rendering:pixelated] focus-visible:ring-2 focus-visible:ring-highlight [:fullscreen_&]:h-full [:fullscreen_&]:max-h-none"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 [:fullscreen_&]:p-3">
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            Game speed
            <input
              type="number"
              min={MIN_SPEED * 100}
              max={MAX_SPEED * 100}
              step={1}
              value={speedInput}
              onChange={(e) => changeSpeed(e.target.value)}
              onBlur={() => setSpeedInput(String(Math.round(speed * 100)))}
              aria-label="Game speed percentage"
              className="w-20 border-2 border-input bg-card px-2 py-1 text-xs text-foreground"
            />
            %
          </label>
          <Button variant="outline" size="sm" disabled={!!checking} onClick={startSpeedCheck}>
            <Gauge className="size-4" /> {checking ?? "Check game speed"}
          </Button>
          <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {fullscreenError}
          </span>
          {canFullscreen && (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="pt-3 text-xs leading-relaxed text-muted-foreground empty:hidden [:fullscreen_&]:max-h-[25vh] [:fullscreen_&]:overflow-y-auto [:fullscreen_&]:px-3 [:fullscreen_&]:pb-3"
        >
          {speedResult}
        </p>
      </div>

      <div className="nes-window space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm">Controls</h3>
          <span className="text-xs text-muted-foreground">Player 1</span>
        </div>
        <div className="grid grid-cols-2 gap-5 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:justify-between">
          <div className="flex flex-col items-start gap-2">
            <span className="flex flex-wrap gap-1">
              {(["UP", "LEFT", "DOWN", "RIGHT"] as const).map(remapButton)}
            </span>
            Move
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="flex flex-wrap gap-1">{(["A", "B"] as const).map(remapButton)}</span>A
            / B buttons
          </div>
          <div className="flex flex-col items-start gap-2">
            {remapButton("START")}
            Start
          </div>
          <div className="flex flex-col items-start gap-2">
            {remapButton("SELECT")}
            Select
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>Click any key to change it. Press Esc to cancel. Saved in this browser.</p>
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={() => {
              emuRef.current?.releaseAll();
              setCapture(null);
              saveBindings(structuredClone(DEFAULT_BINDINGS));
            }}
          >
            Reset to defaults
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-highlight empty:hidden">
          {feedback}
        </p>
        <p className="text-xs text-muted-foreground">
          Click the game screen to play. Press Esc to release keyboard focus.
        </p>
      </div>
    </div>
  );
}
