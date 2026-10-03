import { useRef, useState } from "react";
import { useRom } from "@/lib/romStore";
import { saveFileAs } from "@/lib/download";
import { Button } from "@/components/ui/button";
import { Upload, Save, RotateCcw, FileWarning, FileUp, Gamepad2 } from "lucide-react";

const ACCEPT = ".nes,.bin,application/octet-stream";

function useOpenRom() {
  const { setRom } = useRom();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = async (file: File) => setRom(new Uint8Array(await file.arrayBuffer()), file.name);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) open(f);
        e.target.value = "";
      }}
    />
  );
  return { open, input, browse: () => inputRef.current?.click() };
}

/** Full-page landing shown before a ROM is loaded. */
export function RomDropZone() {
  const { open, input, browse } = useOpenRom();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) open(f);
      }}
      className={`mx-auto flex max-w-2xl flex-col items-center gap-4 nes-window px-6 py-16 text-center transition ${
        dragging ? "bg-accent" : ""
      }`}
    >
      <div className="rounded-full bg-primary/10 p-4">
        <FileUp className="size-10 text-highlight" />
      </div>
      <div className="space-y-1">
        <h2 className="text-xl leading-relaxed text-highlight">Open your Tecmo Super Bowl ROM</h2>
        <p className="text-sm text-muted-foreground">
          Drag and drop a <span className="font-mono">.nes</span> file here, or choose one from
          your computer.
        </p>
      </div>
      <Button size="lg" onClick={browse} className="gap-2">
        <Upload className="size-5" /> Choose ROM file
      </Button>
      <p className="max-w-md text-xs text-muted-foreground">
        Your ROM never leaves your computer — everything happens right here in your browser.
        Use a ROM you legally own.
      </p>
      {input}
    </div>
  );
}

/** Top-of-page bar once a ROM is loaded: file info, Save ROM As, and secondary actions. */
export function RomToolbar({ onPlay }: { onPlay: () => void }) {
  const { rom, romName, romChecksum, hasINES, edits, clearEdits } = useRom();
  if (!rom) return null;

  const editCount = edits.size;
  const confirmDiscard = () =>
    editCount === 0 || confirm("You have unsaved changes. Discard them?");

  return (
    <div className="nes-window p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{romName}</div>
          <div className="text-xs text-muted-foreground">
            {editCount === 0
              ? "No changes yet"
              : `${editCount} unsaved change${editCount === 1 ? "" : "s"}`}
            <span className="hidden sm:inline">
              {" "}· {rom.length.toLocaleString()} bytes · CRC32 {romChecksum}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => confirmDiscard() && clearEdits()}>
              <RotateCcw className="size-4" /> Undo all changes
            </Button>
          )}
          <Button variant="outline" onClick={onPlay}>
            <Gamepad2 className="size-4" /> Save and Play Game
          </Button>
          <Button onClick={() => saveFileAs(romName ?? "modified.nes", rom)}>
            <Save className="size-4" /> Save ROM As…
          </Button>
        </div>
      </div>
      {!hasINES && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          <FileWarning className="size-4 shrink-0" />
          This file has no standard NES header. Editing may still work, but double-check the
          results in an emulator.
        </div>
      )}
    </div>
  );
}
