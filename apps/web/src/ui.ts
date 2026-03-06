import type { AuthUser, MatchPhase, ResourceMap } from "@hexagonia/shared";
import { RESOURCES } from "@hexagonia/shared";

export type AuthMode = "login" | "register";
export type ConnectionState = "offline" | "connecting" | "online";
export type RouteState =
  | { kind: "home" }
  | { kind: "admin" }
  | { kind: "invite"; code: string }
  | { kind: "room"; roomId: string }
  | { kind: "match"; matchId: string };

export function readRoute(): RouteState {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return { kind: "home" };
  }

  const [kind, id] = hash.split("/");
  if (kind === "admin") {
    return { kind: "admin" };
  }
  if (kind === "invite" && id) {
    return { kind: "invite", code: id.toUpperCase() };
  }
  if (kind === "room" && id) {
    return { kind: "room", roomId: id };
  }
  if (kind === "match" && id) {
    return { kind: "match", matchId: id };
  }
  return { kind: "home" };
}

export function renderConnectionLabel(session: AuthUser | null | undefined, connectionState: ConnectionState): string {
  if (!session) {
    return "Offline";
  }

  if (connectionState === "online") {
    return "Live";
  }

  if (connectionState === "connecting") {
    return "Verbinde";
  }

  return "Getrennt";
}

export function renderEventLabel(type: string): string {
  const labels: Record<string, string> = {
    match_started: "Partie gestartet.",
    initial_settlement_placed: "Start-Siedlung gesetzt.",
    initial_road_placed: "Start-Strasse gesetzt.",
    dice_rolled: "Wuerfel geworfen.",
    road_built: "Strasse gebaut.",
    settlement_built: "Siedlung gebaut.",
    city_built: "Stadt gebaut.",
    robber_moved: "Raeuber versetzt.",
    trade_completed: "Handel abgeschlossen.",
    turn_ended: "Zug beendet."
  };

  return labels[type] ?? "Spielstatus aktualisiert.";
}

export function formatPhase(phase: MatchPhase): string {
  const labels: Record<MatchPhase, string> = {
    room: "Raum",
    setup_forward: "Startaufbau vorwaerts",
    setup_reverse: "Startaufbau rueckwaerts",
    turn_roll: "Wuerfeln",
    turn_action: "Aktionsphase",
    robber_interrupt: "Raeuber",
    trade_resolution: "Handel",
    game_over: "Spiel beendet"
  };

  return labels[phase];
}

export function renderResourceMap(resourceMap: ResourceMap): string {
  return RESOURCES.map((resource) => [resource, resourceMap[resource]] as const)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => `${count} ${renderResourceLabel(resource)}`)
    .join(", ");
}

export function renderResourceLabel(resource: string): string {
  const labels: Record<string, string> = {
    brick: "Lehm",
    lumber: "Holz",
    ore: "Erz",
    grain: "Getreide",
    wool: "Wolle",
    desert: "Wueste"
  };

  return labels[resource] ?? resource;
}

export function toInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
