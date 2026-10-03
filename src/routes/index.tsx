import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RomProvider, useRom } from "@/lib/romStore";
import { RomDropZone, RomToolbar } from "@/components/RomUploader";
import { GamePlayer } from "@/components/GamePlayer";
import { savePlayRom } from "@/lib/playRom";
import { PlayerNameEditor } from "@/components/PlayerNameEditor";
import { PlayerAbilitiesEditor } from "@/components/PlayerAbilitiesEditor";
import type { GroupId } from "@/lib/abilities";
import { TeamRosterView } from "@/components/TeamRosterView";
import { isAllStarTeam } from "@/lib/tsbRoster";
import { PlayerCard } from "@/components/PlayerCard";
import { ExportPanel } from "@/components/ExportPanel";
import { InspectRomTools, CustomLayoutTools } from "@/components/AdvancedTools";
import tsbLogo from "@/assets/tsb-logo.png";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, SlidersHorizontal, Hash, Save, Wrench, Search, Table } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <RomProvider>
      <Shell />
    </RomProvider>
  );
}

function Shell() {
  const { rom, romName } = useRom();
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("roster");
  const [advancedTab, setAdvancedTab] = useState("edit");
  // Shared between the roster view and the player editor so clicking a player jumps to them.
  const [teamIdx, setTeamIdxState] = useState(0);
  // The Edit Players table only works on regular teams, so it keeps the last one picked
  // while the roster view shows an All-Star team.
  const [editTeam, setEditTeam] = useState(0);
  const setTeamIdx = (t: number) => {
    setTeamIdxState(t);
    if (!isAllStarTeam(t)) setEditTeam(t);
  };
  const [group, setGroup] = useState<GroupId>("qb");
  const [card, setCard] = useState<{ team: number; pos: number } | null>(null);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="nes-rule bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <h1 className="flex flex-wrap items-center gap-x-4 gap-y-1 text-lg leading-snug text-foreground">
            <img src={tsbLogo} alt="Tecmo Super Bowl" className="h-12 w-auto shrink-0 sm:h-14" />
            Roster Editor
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
        {!rom ? (
          <div className="py-8">
            <RomDropZone />
          </div>
        ) : playing ? (
          <GamePlayer onExit={() => setPlaying(false)} />
        ) : (
          <>
            <RomToolbar
              onPlay={() => {
                savePlayRom(romName ?? "modified.nes", rom);
                setPlaying(true);
              }}
            />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="roster" className="gap-1.5">
                  <Users className="size-4" /> Team Roster
                </TabsTrigger>
                <TabsTrigger
                  value="advanced"
                  className="ml-auto gap-1.5 text-muted-foreground"
                  // Clicking Advanced while it's open toggles back to the roster. Radix activates
                  // tabs on mousedown, so intercept there (preventDefault skips its handler).
                  onMouseDown={(e) => {
                    if (tab === "advanced" && e.button === 0 && !e.ctrlKey) {
                      e.preventDefault();
                      setTab("roster");
                    }
                  }}
                  onKeyDown={(e) => {
                    if (tab === "advanced" && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setTab("roster");
                    }
                  }}
                >
                  <Wrench className="size-4" /> Advanced
                </TabsTrigger>
              </TabsList>

              <TabsContent value="roster" className="space-y-3">
                <TeamRosterView
                  teamIdx={teamIdx}
                  onTeamChange={setTeamIdx}
                  onEditPlayer={(pos) => setCard({ team: teamIdx, pos })}
                />
              </TabsContent>

              <TabsContent value="advanced" className="space-y-3">
                <Tabs value={advancedTab} onValueChange={setAdvancedTab}>
                  <TabsList className="flex h-auto w-full flex-wrap justify-start">
                    <TabsTrigger value="edit" className="gap-1.5">
                      <SlidersHorizontal className="size-4" /> Edit Players
                    </TabsTrigger>
                    <TabsTrigger value="names" className="gap-1.5">
                      <Hash className="size-4" /> Names &amp; Jersey Numbers
                    </TabsTrigger>
                    <TabsTrigger value="save" className="gap-1.5">
                      <Save className="size-4" /> Save &amp; Share
                    </TabsTrigger>
                    <TabsTrigger value="inspect" className="gap-1.5 text-muted-foreground">
                      <Search className="size-4" /> Inspect ROM Data
                    </TabsTrigger>
                    <TabsTrigger value="layouts" className="gap-1.5 text-muted-foreground">
                      <Table className="size-4" /> Custom Data Layouts
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="edit" className="space-y-3">
                    <Intro>
                      Pick a team, then edit each player's name, face, and ratings. Changed values
                      are highlighted in yellow.
                    </Intro>
                    <PlayerAbilitiesEditor
                      teamIdx={editTeam}
                      onTeamChange={setTeamIdx}
                      group={group}
                      onGroupChange={setGroup}
                      onOpenPlayer={(pos) => setCard({ team: editTeam, pos })}
                    />
                  </TabsContent>

                  <TabsContent value="names" className="space-y-3">
                    <Intro>
                      Every team's full roster on one page — quick for renaming players or changing
                      jersey numbers across the league.
                    </Intro>
                    <PlayerNameEditor />
                  </TabsContent>

                  <TabsContent value="save" className="space-y-3">
                    <ExportPanel />
                  </TabsContent>

                  <TabsContent value="inspect" className="space-y-3">
                    <InspectRomTools />
                  </TabsContent>

                  <TabsContent value="layouts" className="space-y-3">
                    <CustomLayoutTools />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            </Tabs>
            <PlayerCard
              teamIdx={card?.team ?? 0}
              posIdx={card?.pos ?? null}
              onClose={() => setCard(null)}
              onNavigate={(pos) => setCard((c) => c && { ...c, pos })}
            />
          </>
        )}
      </main>

      <footer className="border-t-[3px] border-[#fc74b4] bg-card px-4 py-3 text-center text-xs text-muted-foreground">
        <Popover>
          <PopoverTrigger className="underline-offset-4 hover:text-foreground hover:underline">
            About
          </PopoverTrigger>
          <PopoverContent side="top" className="text-xs leading-relaxed text-muted-foreground">
            This tool ships with no ROM data and no NFL/Tecmo/Nintendo content. You must supply your
            own legally owned ROM. All processing happens in your browser.
          </PopoverContent>
        </Popover>
      </footer>
    </div>
  );
}

function Intro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
