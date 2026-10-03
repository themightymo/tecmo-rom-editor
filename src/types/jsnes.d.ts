// jsnes 1.x ships without types. We stay on 1.x because 2.x garbles Tecmo Super Bowl's
// sprites during play; this covers the parts of its API the emulator uses.
declare module "jsnes" {
  export interface NESOptions {
    onFrame?: (buffer: number[]) => void;
    onAudioSample?: (left: number, right: number) => void;
    onStatusUpdate?: (status: string) => void;
    onBatteryRamWrite?: (address: number, value: number) => void;
    emulateSound?: boolean;
    sampleRate?: number;
    preferredFrameRate?: number;
  }

  export class NES {
    constructor(opts?: NESOptions);
    /** ROM data as a byte string: one char per byte. */
    loadROM(data: string): void;
    frame(): void;
    reset(): void;
    buttonDown(controller: 1 | 2, button: number): void;
    buttonUp(controller: 1 | 2, button: number): void;
  }

  export class Controller {
    static readonly BUTTON_A: number;
    static readonly BUTTON_B: number;
    static readonly BUTTON_SELECT: number;
    static readonly BUTTON_START: number;
    static readonly BUTTON_UP: number;
    static readonly BUTTON_DOWN: number;
    static readonly BUTTON_LEFT: number;
    static readonly BUTTON_RIGHT: number;
  }
}
