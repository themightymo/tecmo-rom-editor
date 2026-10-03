# Tecmo Super Bowl Roster Editor

A browser-based editor for Tecmo Super Bowl (NES) ROMs, styled after the game's own screens. Open your ROM, click a player, and change their name, jersey number, face, or ratings. You can also rename teams and paint custom helmets and headshots. When you're done, save a new `.nes` file or share your changes as an `.ips` patch.

Everything runs in your browser. Your ROM is never uploaded anywhere.

**Try it online: https://themightymo.github.io/tecmo-rom-editor/** (no install needed)

> **You must supply your own legally owned ROM.** This tool ships with no ROM data.

![Team Roster view](docs/screenshots/team-roster.png)

---

## Quick start

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173) and drop in your `.nes` file.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Production build to `dist/`, bundled into a single self-contained `index.html` |
| `npm run build:dev` | Same build in development mode (unminified) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format the code with Prettier |

Because `npm run build` inlines all JavaScript, CSS and images into one `dist/index.html`, you can host the result on any static web server, or open it straight from disk.

### Online version

Every push to `main` triggers a GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that runs the build and publishes it to GitHub Pages at **https://themightymo.github.io/tecmo-rom-editor/**. The site updates about a minute after each push, and the built file is never committed to the repo. To keep an offline copy, open the link and use your browser's **Save Page As…**.

### Build check before pushing

A git `pre-push` hook in [`.githooks/`](.githooks/pre-push) runs `npm run build` before every push. This keeps your local `dist/index.html` up to date and cancels the push if the build fails. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

To skip it for a single push, use `git push --no-verify`.

---

## Features

### Open a ROM

Drag a `.nes` file onto the page, or click **Choose ROM file**. The toolbar then shows the file name, size, CRC32, and how many unsaved changes you have. It also gives you **Save ROM As…** and **Undo all changes**. If the file has no iNES header, you'll see a warning.

![Landing screen](docs/screenshots/landing.png)

### Team Roster

The main screen. It shows a team's default depth chart the way the game lays it out: offensive starters and backups, returners, offensive line, defense, and kickers. The formation (for example `2 RB · 2 WR · 1 TE`) is read from the ROM.

- **Team picker.** Opens a recreation of the game's *Team Data* screen, with every helmet decoded straight from the ROM's graphics. It includes all 28 teams plus the AFC and NFC All-Star teams.
- **Rename Team.** Change a team's city, nickname and abbreviation. The editor checks that the new text fits in the ROM's team-name table and tells you how many letters to cut if it doesn't.
- **Paint Helmet.** See [Custom art](#custom-helmets-and-headshots) below.

![Team Data select screen](docs/screenshots/team-select.png)

### Player card

Click any player to open their card, which is modelled on the in-game player screen. From the card you can:

- Change the **first name, last name and jersey number**
- Drag the **rating bars** (running speed, rushing power, passing, receptions, coverage, kicking and so on, depending on position)
- Pick a different **face portrait**, or paint your own
- Use the arrows to step through the roster, and revert any field to its original value

All-Star team slots point back to the real player on their home team, so editing an All-Star edits that player.

![Player card](docs/screenshots/player-card.png)

### Play the game

Click **Save and Play Game** in the toolbar to test your changes without leaving the page. This saves a copy of the current ROM in your browser (not as a file) and starts it in a built-in NES emulator ([JSNES](https://github.com/bfirsh/jsnes)), with sound. The player works like the one in [Retro-Game-Emulator-Forked](https://github.com/themightymo/Retro-Game-Emulator-Forked):

- **Keyboard controls:** arrows to move, **A**/**Q** for A, **S**/**O** for B, **Enter** for Start, **Tab** for Select. Click the game screen first. Press **Esc** to release the keyboard. Click any keycap to remap it. Your bindings are remembered in this browser.
- **Game speed:** set 25% to 200% (remembered). 100% targets 60 frames per second, whatever your display's refresh rate.
- **Check game speed:** measures 10 seconds of play and reports the actual frame rate and any pauses.
- **Fullscreen.**

The game keeps running the version you saved. If you edit more, click **Back to editor**, then **Save and Play Game** again.


There's a pixel painter for 16×16 team helmets and 32×32 player headshots. It has pencil, eraser, fill, eyedropper, mirror, grid, undo/redo, and the NES palette. You can start from the original art, from another team or player, or from a blank canvas, and you can download your work as a PNG.

> **Note:** Custom art is currently saved **in your browser only** (localStorage) and shown inside the editor. It is **not** written into the ROM yet, so it won't appear in an emulator. See the [roadmap](#roadmap).

![Helmet painter](docs/screenshots/helmet-painter.png)

### Advanced tab

| Section | Purpose |
|---|---|
| **Edit Players** | A table of one team's players, grouped by QBs, skill players, O-line, defense and special teams. Edit names, faces and every rating in one place. Changed values are highlighted. |
| **Names & Jersey Numbers** | Every team's roster on one page, for renaming players or changing numbers across the whole league. |
| **Save & Share** | Save the edited ROM, download an **IPS patch**, save or open a *project file* (your list of byte edits, which you can re-apply to a fresh ROM), and import or export layout files. Also lists every changed byte. |
| **Inspect ROM Data** | Tools for ROM hackers: text-encoding table, string search, hex viewer, and a diff against the original file. |
| **Custom Data Layouts** | Describe a table of player or team records in the ROM (start offset, record size, field meanings). You then get an editable grid for that table. Layouts are saved in the browser. |

![Edit Players](docs/screenshots/edit-players.png)
![Names & Jersey Numbers](docs/screenshots/names.png)
![Save & Share](docs/screenshots/save-share.png)

---

## How names are stored

Tecmo Super Bowl stores each name as `lowercasefirstname` + `UPPERCASELASTNAME` with no space. The game adds the space when it draws the name. The editor handles this for you: first names are written in lowercase and last names in uppercase, whatever case you type them in.

The editor keeps these special forms the game supports:

- **Initials:** `c.BENNETT` shows as `C.BENNETT`
- **Multi-word first names:** `ivy joeHUNTER` shows as `IVY JOE HUNTER`
- **Position labels:** `qbBILLS` shows as `QB BILLS`

**Length limits:** each player's name has a fixed number of bytes in the ROM, so a new name can be the same length as the original or shorter, but not longer. Team names share one table, so a longer city name has to be offset by a shorter name elsewhere.

---

## Privacy and data

- The ROM is read and edited in memory in your browser. It is never uploaded.
- Custom helmets, headshots, data layouts and the detected ratings offset are saved in your browser's `localStorage`.
- **Save and Play Game** keeps a copy of the last ROM you played in `localStorage`, along with your emulator controls and speed.
- Original face portraits are loaded as images from the open-source [tsbtools](https://github.com/BAD-AL/tsbtools) project on GitHub. This is the only network request the app makes, and no ROM data is sent with it.

---

## Tech stack

- **React 19** + **TypeScript**, built with **Vite 7**
- **TanStack Router** (file-based routes in `src/routes/`)
- **Tailwind CSS 4** + **shadcn/ui** (Radix) components, with a custom NES theme and the Press Start 2P font
- `vite-plugin-singlefile` to bundle the build into one HTML file

### Project layout

```
src/
  routes/index.tsx         App shell and tab layout
  components/              Feature UI (TeamRosterView, PlayerCard, TeamSelect,
                           PixelPainter, ExportPanel, HexViewer, …)
  components/ui/           shadcn/ui primitives
  lib/
    romStore.tsx           ROM bytes, edit tracking, original baseline
    nameLoader.ts          Player name pointer table (28 teams)
    abilities.ts           Nibble-packed player ratings and face IDs
    tsbRoster.ts           Positions, formations, returners, All-Stars, team text
    helmets.ts             Decode helmet tiles and palettes from the ROM
    customFaces.ts         Custom headshot storage (browser only)
    customHelmets.ts       Custom helmet storage (browser only)
    diff.ts                IPS patch builder
    checksum.ts            CRC32 and iNES header detection
    emulator.ts            JSNES runner: timing, audio, speed check
    playRom.ts             The ROM snapshot "Save and Play Game" runs
```

---

## Roadmap

Ideas for future improvements, roughly by priority:

- **Write custom helmets and headshots into the ROM.** Encode painted art back into CHR tiles and palettes so it shows up in emulators, not just in the editor.
- **Longer names.** Repack the name pointer table so a name can grow as long as there's free space elsewhere, instead of being capped at its original length.
- **Team colours and uniforms.** Edit the palettes used for jerseys and on-field sprites.
- **Playbooks and formations.** Change each team's plays and default formation.
- **Depth chart and starters.** Reorder players in the default lineup from the Team Roster view.
- **Apply IPS patches.** Load an `.ips` file onto your ROM inside the editor.
- **Hacked-ROM support.** Detect and handle common expanded ROMs (32-team, 2020s roster hacks).
- **Bulk import/export.** Round-trip whole rosters as CSV or JSON for spreadsheet editing.
- **Persist work between sessions.** Optionally keep the working ROM and edit history in the browser so a reload doesn't lose changes.
- **Tests.** Unit tests for the ROM parsers and writers (names, ratings, team text, IPS).

---

## Legal

This project is an unofficial fan tool and is not affiliated with or endorsed by Tecmo, Koei Tecmo, Nintendo, the NFL or the NFLPA. It contains no ROM data. Use it only with a ROM you legally own, and share your changes as IPS patches rather than ROM files.
