import type {
  AuthUser,
  BoardSize,
  MatchEventType,
  MatchPhase,
  PlayerColor,
  ResourceMap,
  TurnRule
} from "@hexagonia/shared";
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
    return "Verbindet...";
  }

  return "Offline";
}

export function renderEventLabel(type: MatchEventType): string {
  const labels: Record<MatchEventType, string> = {
    starting_player_rolled: "Startspieler ausgewürfelt.",
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
    longest_road_awarded: "Längste Straße erhalten.",
    longest_road_lost: "Längste Straße verloren.",
    largest_army_awarded: "Größte Rittermacht erhalten.",
    largest_army_lost: "Größte Rittermacht verloren.",
    trade_offered: "Handelsangebot gesendet.",
    trade_declined: "Handelsangebot abgelehnt.",
    trade_cancelled: "Handelsangebot zurückgezogen.",
    trade_completed: "Handel abgeschlossen.",
    maritime_trade: "Hafenhandel ausgeführt.",
    special_build_started: "Sonderbauphase gestartet.",
    paired_player_started: "Paired-Players-Phase gestartet.",
    beginner_setup_applied: "Anfängeraufbau gesetzt.",
    game_won: "Partie gewonnen.",
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
    special_build: "Sonderbauphase",
    paired_player_action: "Paired Players",
    robber_interrupt: "Räuber",
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
    orange: "Orange",
    green: "Grün",
    purple: "Lila"
  };

  return labels[color];
}

export function renderBoardSizeLabel(boardSize: BoardSize): string {
  const labels: Record<BoardSize, string> = {
    standard: "Standard",
    extended: "Erweitert"
  };

  return labels[boardSize];
}

export function renderTurnRuleLabel(turnRule: TurnRule): string {
  const labels: Record<TurnRule, string> = {
    standard: "Standard",
    paired_players: "Paired Players",
    special_build_phase: "Sonderbauphase"
  };

  return labels[turnRule];
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
