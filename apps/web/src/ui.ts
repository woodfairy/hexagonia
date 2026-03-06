import type { AuthUser, MatchPhase, PlayerColor, ResourceMap } from "@hexagonia/shared";
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
    initial_road_placed: "Start-Straße gesetzt.",
    dice_rolled: "Würfel geworfen.",
    resources_distributed: "Rohstoffe verteilt.",
    resources_discarded: "Rohstoffe abgeworfen.",
    initial_resources_granted: "Start-Rohstoffe erhalten.",
    road_built: "Straße gebaut.",
    settlement_built: "Siedlung gebaut.",
    city_built: "Stadt gebaut.",
    development_card_bought: "Entwicklung gekauft.",
    development_card_played: "Entwicklung gespielt.",
    robber_moved: "Räuber versetzt.",
    trade_completed: "Handel abgeschlossen.",
    turn_ended: "Zug beendet."
  };

  return labels[type] ?? "Spielstatus aktualisiert.";
}

export function formatPhase(phase: MatchPhase): string {
  const labels: Record<MatchPhase, string> = {
    room: "Raum",
    setup_forward: "Startaufbau vorwärts",
    setup_reverse: "Startaufbau rückwärts",
    turn_roll: "Würfeln",
    turn_action: "Aktionsphase",
    robber_interrupt: "Räuber",
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
    desert: "Wüste"
  };

  return labels[resource] ?? resource;
}

export function renderPlayerColorLabel(color: PlayerColor): string {
  const labels: Record<PlayerColor, string> = {
    red: "Rot",
    blue: "Blau",
    white: "Weiß",
    orange: "Orange"
  };

  return labels[color];
}

export function getPlayerAccentClass(color: PlayerColor | null | undefined): string {
  return color ? `player-accent-${color}` : "";
}

export function toInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
