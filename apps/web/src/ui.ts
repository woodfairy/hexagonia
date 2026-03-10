import type {
  AuthUser,
  BoardSize,
  Locale,
  MatchEventType,
  MatchPhase,
  PlayerColor,
  ResourceMap,
  TurnRule
} from "@hexagonia/shared";
import { DEFAULT_LOCALE as DEFAULT_LOCALE_VALUE } from "@hexagonia/shared";
import {
  formatPhase as formatPhaseByLocale,
  renderBoardSizeLabel as renderBoardSizeLabelByLocale,
  renderConnectionLabel as renderConnectionLabelByLocale,
  renderEventLabel as renderEventLabelByLocale,
  renderPlayerColorLabel as renderPlayerColorLabelByLocale,
  renderResourceLabel as renderResourceLabelByLocale,
  renderResourceMap as renderResourceMapByLocale,
  renderTurnRuleLabel as renderTurnRuleLabelByLocale
} from "./i18n";

export type AuthMode = "login" | "register";
export type ConnectionState = "offline" | "connecting" | "online";
export type RouteState =
  | { kind: "home" }
  | { kind: "play" }
  | { kind: "admin" }
  | { kind: "invite"; code: string }
  | { kind: "room"; roomId: string }
  | { kind: "match"; matchId: string };

function getRouteSegments(value: string, separator: RegExp): string[] {
  return value
    .split(separator)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parseRouteSegments(segments: string[]): RouteState | null {
  const [kind, id] = segments;
  if (!kind) {
    return { kind: "home" };
  }

  if (kind === "play" && segments.length === 1) {
    return { kind: "play" };
  }
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

  return null;
}

export function readRoute(): RouteState {
  const pathSegments = getRouteSegments(window.location.pathname, /\//);
  const pathRoute = parseRouteSegments(pathSegments);
  if (pathSegments.length > 0 && pathRoute) {
    return pathRoute;
  }

  const hashRoute = parseRouteSegments(getRouteSegments(window.location.hash.replace(/^#/, ""), /\//));
  return hashRoute ?? pathRoute ?? { kind: "home" };
}

export function getRoutePath(route: RouteState): string {
  switch (route.kind) {
    case "home":
      return "/";
    case "play":
      return "/play";
    case "admin":
      return "/admin";
    case "invite":
      return `/invite/${route.code}`;
    case "room":
      return `/room/${route.roomId}`;
    case "match":
      return `/match/${route.matchId}`;
    default: {
      const exhaustiveCheck: never = route;
      return exhaustiveCheck;
    }
  }
}

export function writeRoute(route: RouteState, mode: "push" | "replace" = "push") {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = getRoutePath(route);
  nextUrl.hash = "";
  const historyUrl = `${nextUrl.pathname}${nextUrl.search}`;

  if (mode === "replace") {
    window.history.replaceState(null, "", historyUrl);
    return;
  }

  window.history.pushState(null, "", historyUrl);
}

function getActiveLocale(value?: Locale): Locale {
  if (value) {
    return value;
  }

  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (lang === "en" || lang === "de") {
      return lang;
    }
  }

  return DEFAULT_LOCALE_VALUE;
}

export function renderConnectionLabel(
  session: AuthUser | null | undefined,
  connectionState: ConnectionState
): string;
export function renderConnectionLabel(
  locale: Locale,
  session: AuthUser | null | undefined,
  connectionState: ConnectionState
): string;
export function renderConnectionLabel(
  first: Locale | AuthUser | null | undefined,
  second: AuthUser | ConnectionState | null | undefined,
  third?: ConnectionState
): string {
  if (typeof first === "string" && third) {
    return renderConnectionLabelByLocale(first, !!second, third);
  }

  return renderConnectionLabelByLocale(getActiveLocale(), !!first, second as ConnectionState);
}

export function renderEventLabel(type: MatchEventType): string;
export function renderEventLabel(locale: Locale, type: MatchEventType): string;
export function renderEventLabel(first: Locale | MatchEventType, second?: MatchEventType): string {
  if (second) {
    return renderEventLabelByLocale(first as Locale, second);
  }

  return renderEventLabelByLocale(getActiveLocale(), first as MatchEventType);
}

export function formatPhase(phase: MatchPhase): string;
export function formatPhase(locale: Locale, phase: MatchPhase): string;
export function formatPhase(first: Locale | MatchPhase, second?: MatchPhase): string {
  if (second) {
    return formatPhaseByLocale(first as Locale, second);
  }

  return formatPhaseByLocale(getActiveLocale(), first as MatchPhase);
}

export function renderResourceMap(resourceMap: ResourceMap): string;
export function renderResourceMap(locale: Locale, resourceMap: ResourceMap): string;
export function renderResourceMap(first: Locale | ResourceMap, second?: ResourceMap): string {
  if (second) {
    return renderResourceMapByLocale(first as Locale, second);
  }

  return renderResourceMapByLocale(getActiveLocale(), first as ResourceMap);
}

export function renderResourceLabel(resource: string): string;
export function renderResourceLabel(locale: Locale, resource: string): string;
export function renderResourceLabel(first: Locale | string, second?: string): string {
  if (second !== undefined) {
    return renderResourceLabelByLocale(first as Locale, second);
  }

  return renderResourceLabelByLocale(getActiveLocale(), first as string);
}

export function renderPlayerColorLabel(color: PlayerColor): string;
export function renderPlayerColorLabel(locale: Locale, color: PlayerColor): string;
export function renderPlayerColorLabel(first: Locale | PlayerColor, second?: PlayerColor): string {
  if (second) {
    return renderPlayerColorLabelByLocale(first as Locale, second);
  }

  return renderPlayerColorLabelByLocale(getActiveLocale(), first as PlayerColor);
}

export function renderBoardSizeLabel(boardSize: BoardSize): string;
export function renderBoardSizeLabel(locale: Locale, boardSize: BoardSize): string;
export function renderBoardSizeLabel(first: Locale | BoardSize, second?: BoardSize): string {
  if (second) {
    return renderBoardSizeLabelByLocale(first as Locale, second);
  }

  return renderBoardSizeLabelByLocale(getActiveLocale(), first as BoardSize);
}

export function renderTurnRuleLabel(turnRule: TurnRule): string;
export function renderTurnRuleLabel(locale: Locale, turnRule: TurnRule): string;
export function renderTurnRuleLabel(first: Locale | TurnRule, second?: TurnRule): string {
  if (second) {
    return renderTurnRuleLabelByLocale(first as Locale, second);
  }

  return renderTurnRuleLabelByLocale(getActiveLocale(), first as TurnRule);
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
