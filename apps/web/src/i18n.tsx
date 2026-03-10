import {
  DEFAULT_LOCALE,
  RESOURCES,
  sanitizeLocale,
  type BoardSize,
  type ErrorParams,
  type Locale,
  type MatchEventType,
  type MatchPhase,
  type PlayerColor,
  type Resource,
  type ResourceMap,
  type TurnRule
} from "@hexagonia/shared";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode
} from "react";

const LOCALE_STORAGE_KEY = "hexagonia:locale";

type TranslationCatalog = Record<string, string>;

const rawCatalogModules = import.meta.glob("./locales/*.json", {
  eager: true,
  import: "default"
}) as Record<string, TranslationCatalog>;

const CATALOGS = loadCatalogs(rawCatalogModules);
const AVAILABLE_LOCALES = Object.freeze(orderLocales(Object.keys(CATALOGS)));
const AVAILABLE_LOCALE_SET = new Set(AVAILABLE_LOCALES);

export interface LocalizedText {
  key: string;
  params?: ErrorParams;
  fallback: {
    de: string;
    en?: string;
  };
}

export interface I18nContextValue {
  locale: Locale;
  availableLocales: readonly Locale[];
  setLocale: (locale: Locale) => void;
  formatText: (text: LocalizedText) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatList: (items: Iterable<string>, options?: Intl.ListFormatOptions) => string;
  translate: (key: string, fallbackDe?: string, fallbackEn?: string, params?: ErrorParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function getAvailableLocales(): readonly Locale[] {
  return AVAILABLE_LOCALES;
}

export function createText(de: string, en?: string, params?: ErrorParams): LocalizedText {
  return {
    key: de,
    params,
    fallback: {
      de,
      ...(en !== undefined ? { en } : {})
    }
  };
}

export function createCatalogText(
  key: string,
  de: string,
  en?: string,
  params?: ErrorParams
): LocalizedText {
  return {
    key,
    params,
    fallback: {
      de,
      ...(en !== undefined ? { en } : {})
    }
  };
}

export function resolveText(locale: Locale, text: LocalizedText): string {
  const resolvedLocale = normalizeLocale(locale);
  const template = resolveTemplate(resolvedLocale, text);
  return interpolate(template, text.params);
}

export function translate(
  locale: Locale,
  key: string,
  fallbackDe?: string,
  fallbackEn?: string,
  params?: ErrorParams
): string {
  return resolveText(locale, createCatalogText(key, fallbackDe ?? key, fallbackEn, params));
}

export function isLocale(value: unknown): value is Locale {
  return resolveAvailableLocale(value) !== null;
}

export function normalizeLocale(value: unknown): Locale {
  return resolveAvailableLocale(value) ?? DEFAULT_LOCALE;
}

export function getDocumentLocale(): Locale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(document.documentElement.lang);
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const candidates = [...(navigator.languages ?? []), navigator.language];
  for (const candidate of candidates) {
    const resolved = resolveAvailableLocale(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return DEFAULT_LOCALE;
}

export function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return resolveAvailableLocale(stored);
}

export function persistStoredLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, normalizeLocale(locale));
}

export function getInitialGuestLocale(): Locale {
  return readStoredLocale() ?? detectBrowserLocale();
}

export function getLocaleName(value: Locale): LocalizedText {
  const code = normalizeLocale(value);
  if (code === "de") {
    return createCatalogText("language.de", "Deutsch", "German");
  }

  if (code === "en") {
    return createCatalogText("language.en", "Englisch", "English");
  }

  const label = code.toUpperCase();
  return createCatalogText(`language.${code}`, label, label);
}

export function renderConnectionLabel(
  locale: Locale,
  sessionActive: boolean,
  connectionState: "offline" | "connecting" | "online"
): string {
  if (!sessionActive) {
    return resolveText(locale, createText("Offline", "Offline"));
  }

  if (connectionState === "online") {
    return resolveText(locale, createText("Live", "Live"));
  }

  if (connectionState === "connecting") {
    return resolveText(locale, createText("Verbindet...", "Connecting..."));
  }

  return resolveText(locale, createText("Offline", "Offline"));
}

export function renderEventLabel(locale: Locale, type: MatchEventType): string {
  const labels: Record<MatchEventType, LocalizedText> = {
    starting_player_rolled: createText("Startspieler ausgewürfelt.", "Starting player rolled."),
    match_started: createText("Partie gestartet.", "Match started."),
    initial_settlement_placed: createText("Start-Siedlung gesetzt.", "Initial settlement placed."),
    initial_road_placed: createText("Start-Straße gesetzt.", "Initial road placed."),
    dice_rolled: createText("Würfel geworfen.", "Dice rolled."),
    resources_distributed: createText("Rohstoffe verteilt.", "Resources distributed."),
    resources_discarded: createText("Rohstoffe abgeworfen.", "Resources discarded."),
    initial_resources_granted: createText("Start-Rohstoffe erhalten.", "Initial resources granted."),
    road_built: createText("Straße gebaut.", "Road built."),
    settlement_built: createText("Siedlung gebaut.", "Settlement built."),
    city_built: createText("Stadt gebaut.", "City built."),
    development_card_bought: createText("Entwicklung gekauft.", "Development card bought."),
    development_card_played: createText("Entwicklung gespielt.", "Development card played."),
    robber_moved: createText("Räuber versetzt.", "Robber moved."),
    longest_road_awarded: createText("Längste Straße erhalten.", "Longest road awarded."),
    longest_road_lost: createText("Längste Straße verloren.", "Longest road lost."),
    largest_army_awarded: createText("Größte Rittermacht erhalten.", "Largest army awarded."),
    largest_army_lost: createText("Größte Rittermacht verloren.", "Largest army lost."),
    trade_offered: createText("Handelsangebot gesendet.", "Trade offer sent."),
    trade_declined: createText("Handelsangebot abgelehnt.", "Trade offer declined."),
    trade_cancelled: createText("Handelsangebot zurückgezogen.", "Trade offer withdrawn."),
    trade_completed: createText("Handel abgeschlossen.", "Trade completed."),
    maritime_trade: createText("Hafenhandel ausgeführt.", "Maritime trade completed."),
    special_build_started: createText("Sonderbauphase gestartet.", "Special build phase started."),
    paired_player_started: createText("Paired-Players-Phase gestartet.", "Paired players phase started."),
    beginner_setup_applied: createText("Anfängeraufbau gesetzt.", "Beginner setup applied."),
    game_won: createText("Partie gewonnen.", "Match won."),
    turn_ended: createText("Zug beendet.", "Turn ended.")
  };

  return resolveText(locale, labels[type] ?? createText("Spielstatus aktualisiert.", "Game state updated."));
}

export function formatPhase(locale: Locale, phase: MatchPhase): string {
  const labels: Record<MatchPhase, LocalizedText> = {
    room: createText("Raum", "Room"),
    setup_forward: createText("Startaufbau vorwärts", "Initial setup forward"),
    setup_reverse: createText("Startaufbau rückwärts", "Initial setup reverse"),
    turn_roll: createText("Würfeln", "Roll dice"),
    turn_action: createText("Aktionsphase", "Action phase"),
    special_build: createText("Sonderbauphase", "Special build phase"),
    paired_player_action: createText("Paired Players", "Paired players"),
    robber_interrupt: createText("Räuber", "Robber"),
    game_over: createText("Spiel beendet", "Game over")
  };

  return resolveText(locale, labels[phase]);
}

export function renderResourceLabel(locale: Locale, resource: Resource | "desert" | string): string {
  const labels: Record<string, LocalizedText> = {
    brick: createText("Lehm", "Brick"),
    lumber: createText("Holz", "Lumber"),
    ore: createText("Erz", "Ore"),
    grain: createText("Getreide", "Grain"),
    wool: createText("Wolle", "Wool"),
    desert: createText("Wüste", "Desert")
  };

  return labels[resource] ? resolveText(locale, labels[resource]) : resource;
}

export function renderResourceMap(locale: Locale, resourceMap: ResourceMap): string {
  const entries = RESOURCES.map((resource) => [resource, resourceMap[resource]] as const)
    .filter(([, count]) => count > 0)
    .map(([resource, count]) => `${count} ${renderResourceLabel(locale, resource)}`);

  if (!entries.length) {
    return "";
  }

  return createListFormatter(locale, { style: "long", type: "conjunction" }).format(entries);
}

export function renderPlayerColorLabel(locale: Locale, color: PlayerColor): string {
  const labels: Record<PlayerColor, LocalizedText> = {
    red: createText("Rot", "Red"),
    blue: createText("Blau", "Blue"),
    white: createText("Weiß", "White"),
    orange: createText("Orange", "Orange"),
    green: createText("Grün", "Green"),
    purple: createText("Lila", "Purple")
  };

  return resolveText(locale, labels[color]);
}

export function renderBoardSizeLabel(locale: Locale, boardSize: BoardSize): string {
  const labels: Record<BoardSize, LocalizedText> = {
    standard: createText("Standard", "Standard"),
    extended: createText("Erweitert", "Extended")
  };

  return resolveText(locale, labels[boardSize]);
}

export function renderTurnRuleLabel(locale: Locale, turnRule: TurnRule): string {
  const labels: Record<TurnRule, LocalizedText> = {
    standard: createText("Standard", "Standard"),
    paired_players: createText("Paired Players", "Paired players"),
    special_build_phase: createText("Sonderbauphase", "Special build phase")
  };

  return resolveText(locale, labels[turnRule]);
}

function interpolate(template: string, params?: ErrorParams): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

function withParams(text: LocalizedText, params?: ErrorParams): LocalizedText {
  return {
    ...text,
    params
  };
}

export function localizeError(errorCode: string, errorParams?: ErrorParams): LocalizedText {
  switch (errorCode) {
    case "generic.internal":
      return createText("Interner Serverfehler. Bitte versuche es erneut.", "Internal server error. Please try again.");
    case "generic.unknown":
      return createText("Unbekannter Fehler.", "Unknown error.");
    case "validation.invalid_input":
      return createText("Ungültige Eingabe.", "Invalid input.");
    case "validation.username_invalid_characters":
      return createText("Der Nutzername darf nur Buchstaben und Zahlen enthalten.", "Username may only contain letters and numbers.");
    case "validation.username_too_short":
      return withParams(
        createText("Der Nutzername muss mindestens {minimum} Zeichen haben.", "Username must be at least {minimum} characters long."),
        errorParams
      );
    case "validation.username_too_long":
      return withParams(
        createText("Der Nutzername darf höchstens {maximum} Zeichen haben.", "Username may be at most {maximum} characters long."),
        errorParams
      );
    case "validation.password_too_short":
      return withParams(
        createText("Das Passwort muss mindestens {minimum} Zeichen haben.", "Password must be at least {minimum} characters long."),
        errorParams
      );
    case "validation.password_too_long":
      return withParams(
        createText("Das Passwort darf höchstens {maximum} Zeichen haben.", "Password may be at most {maximum} characters long."),
        errorParams
      );
    case "validation.seat_invalid":
      return createText("Der gewählte Sitzplatz ist ungültig.", "The selected seat is invalid.");
    case "validation.ready_invalid":
      return createText("Der Bereit-Status ist ungültig.", "The ready status is invalid.");
    case "validation.room_settings_required":
      return createText("Mindestens eine Spieleinstellung muss gesetzt werden.", "At least one game setting must be provided.");
    case "validation.starting_player_settings_required":
      return createText("Mindestens eine Startspieler-Einstellung muss gesetzt werden.", "At least one starting-player setting must be provided.");
    case "validation.user_update_required":
      return createText("Mindestens ein Feld muss aktualisiert werden.", "At least one field must be updated.");
    case "auth.username_taken":
      return createText("Der Nutzername ist bereits vergeben.", "That username is already taken.");
    case "auth.invalid_credentials":
      return createText("Ungültige Zugangsdaten.", "Invalid credentials.");
    case "auth.not_authenticated":
      return createText("Nicht angemeldet.", "Not authenticated.");
    case "auth.admin_required":
      return createText("Adminrechte erforderlich.", "Admin privileges required.");
    case "auth.user_not_found":
      return createText("Nutzer nicht gefunden.", "User not found.");
    case "auth.recaptcha_token_missing":
      return createText("reCAPTCHA-Token fehlt.", "reCAPTCHA token is missing.");
    case "auth.recaptcha_verification_failed":
      return createText("reCAPTCHA-Prüfung ist fehlgeschlagen.", "reCAPTCHA verification failed.");
    case "admin.user_not_found":
      return createText("Nutzer nicht gefunden.", "User not found.");
    case "admin.last_admin_role_required":
      return createText("Der letzte Admin kann nicht entzogen werden.", "The last admin cannot be downgraded.");
    case "admin.cannot_delete_current_admin":
      return createText("Den aktuell angemeldeten Admin kannst du nicht löschen.", "You cannot delete the currently signed-in admin.");
    case "admin.last_admin_delete_forbidden":
      return createText("Der letzte Admin kann nicht gelöscht werden.", "The last admin cannot be deleted.");
    case "room.not_found":
      return createText("Raum nicht gefunden.", "Room not found.");
    case "room.closed_to_new_players":
      return createText("Dieser Raum nimmt gerade keine neuen Spieler an.", "This room is not accepting new players right now.");
    case "room.no_free_seat":
      return createText("Kein freier Platz mehr vorhanden.", "No free seat is available.");
    case "room.leave_requires_reconnect":
      return createText(
        "Laufende Partien werden über Reconnect fortgesetzt, nicht über Verlassen.",
        "Running matches continue via reconnect, not by leaving."
      );
    case "room.kick_only_in_lobby":
      return createText("Spieler können nur in der Lobby entfernt werden.", "Players can only be removed in the lobby.");
    case "room.kick_only_host":
      return createText("Nur der Host kann Spieler aus der Lobby entfernen.", "Only the host can remove players from the lobby.");
    case "room.kick_self_forbidden":
      return createText("Du kannst dich nicht selbst entfernen.", "You cannot remove yourself.");
    case "room.player_not_in_room":
      return createText("Dieser Spieler sitzt nicht in diesem Raum.", "That player is not seated in this room.");
    case "room.ready_after_start_forbidden":
      return createText("Bereits gestartete Räume können nicht mehr bereit gesetzt werden.", "Started rooms can no longer change ready state.");
    case "room.ready_requires_seat":
      return createText("Nur sitzende Spieler können bereit gesetzt werden.", "Only seated players can be marked ready.");
    case "room.settings_only_host":
      return createText("Nur der Host kann die Spieleinstellungen ändern.", "Only the host can change the game settings.");
    case "room.settings_only_in_lobby":
      return createText("Spieleinstellungen können nur in der Lobby geändert werden.", "Game settings can only be changed in the lobby.");
    case "room.manual_start_player_only":
      return createText(
        "Ein fester Startspieler kann nur im manuellen Modus gewählt werden.",
        "A fixed starting player can only be selected in manual mode."
      );
    case "room.start_player_not_in_room":
      return createText("Der gewählte Startspieler sitzt nicht im Raum.", "The selected starting player is not seated in the room.");
    case "room.start_only_owner":
      return createText("Nur der Raumbesitzer kann das Spiel starten.", "Only the room owner can start the game.");
    case "room.match_already_active":
      return createText("Dieser Raum hat bereits ein aktives Spiel.", "This room already has an active match.");
    case "room.invalid_player_count":
      return createText("Für diese Partie werden 3 bis 6 Spieler benötigt.", "This match requires 3 to 6 players.");
    case "room.all_players_must_be_ready":
      return createText("Alle sitzenden Spieler müssen bereit sein.", "All seated players must be ready.");
    case "match.not_found":
      return createText("Partie nicht gefunden.", "Match not found.");
    case "match.player_not_in_match":
      return createText("Der Spieler gehört nicht zu dieser Partie.", "That player does not belong to this match.");
    case "match.terminated.admin_removed_user":
      return withParams(
        createText(
          "Partie durch Admin beendet, weil {username} entfernt wurde.",
          "Match ended by an admin because {username} was removed."
        ),
        errorParams
      );
    case "match.terminated.admin_stopped":
      return createText("Partie wurde vom Admin gestoppt.", "The match was stopped by an admin.");
    case "match.terminated.admin_repair":
      return createText("Partie wurde vom Admin zur Reparatur entfernt.", "The match was removed by an admin for repair.");
    case "match.terminated.player_evicted":
      return withParams(
        createText(
          "Partie wurde beendet, weil {username} zu lange getrennt war.",
          "The match ended because {username} was disconnected for too long."
        ),
        errorParams
      );
    case "match.terminated.schema_mismatch":
      return createText(
        "Partie wurde nach dem Regel-Update beendet. Bitte startet eine neue Runde.",
        "The match was ended after a rules update. Please start a new round."
      );
    case "ws.unknown_message_type":
      return createText("Unbekannter Nachrichtentyp.", "Unknown message type.");
    case "game.already_over":
      return createText("Das Spiel ist bereits beendet.", "The game is already over.");
    case "game.pending_development_effect":
      return createText(
        "Der laufende Entwicklungskarten-Effekt muss zuerst abgeschlossen werden.",
        "The current development card effect must be completed first."
      );
    case "game.unknown_action":
      return withParams(createText("Unbekannte Aktion: {actionType}", "Unknown action: {actionType}"), errorParams);
    case "game.starting_player_unresolved":
      return createText("Es konnte kein Startspieler ausgewürfelt werden.", "No starting player could be determined.");
    case "game.initial_settlement_not_expected":
      return createText("Aktuell wird keine Start-Siedlung erwartet.", "No initial settlement is expected right now.");
    case "game.initial_settlement_not_allowed":
      return createText("Diese Startposition ist nicht erlaubt.", "This starting position is not allowed.");
    case "game.initial_road_not_expected":
      return createText("Aktuell wird keine Start-Straße erwartet.", "No initial road is expected right now.");
    case "game.initial_road_not_allowed":
      return createText("Diese Startstraße ist nicht erlaubt.", "This initial road is not allowed.");
    case "game.robber_state_missing":
      return createText("Kein Räuberstatus aktiv.", "No robber state is active.");
    case "game.discard_not_pending":
      return createText("Für diesen Spieler ist kein Abwurf offen.", "No discard is pending for this player.");
    case "game.discard_invalid":
      return createText("Der gewählte Abwurf ist ungültig.", "The selected discard is invalid.");
    case "game.cities_unavailable":
      return createText("Es sind keine Städte mehr verfügbar.", "No cities are available anymore.");
    case "game.no_own_settlement":
      return createText("Hier steht keine eigene Siedlung.", "There is no settlement of yours here.");
    case "game.development_deck_empty":
      return createText("Der Entwicklungskartenstapel ist leer.", "The development card deck is empty.");
    case "game.free_road_not_available":
      return createText("Aktuell kann keine kostenlose Straße gesetzt werden.", "No free road can be placed right now.");
    case "game.free_road_not_allowed":
      return createText("Diese kostenlose Straße ist aktuell nicht erlaubt.", "This free road is not allowed right now.");
    case "game.road_building_requires_one_road":
      return createText(
        "Bevor Straßenbau beendet wird, muss mindestens eine Straße gesetzt werden.",
        "At least one road must be placed before finishing road building."
      );
    case "game.bank_cannot_pay":
      return createText("Die Bank kann diese Rohstoffe nicht ausgeben.", "The bank cannot pay out these resources.");
    case "game.robber_state_inactive":
      return createText("Kein aktiver Räuberstatus.", "No active robber state.");
    case "game.robber_discard_first":
      return createText("Zuerst müssen alle geforderten Karten abgeworfen werden.", "All required cards must be discarded first.");
    case "game.robber_must_move":
      return createText("Der Räuber muss auf ein anderes Feld bewegt werden.", "The robber must be moved to a different tile.");
    case "game.robber_target_required":
      return createText("Wähle den Spieler aus, von dem gestohlen werden soll.", "Choose the player to steal from.");
    case "game.robber_target_invalid":
      return createText("Von diesem Spieler kann hier nicht gestohlen werden.", "You cannot steal from that player here.");
    case "trade.empty":
      return createText("Ein Handel darf nicht komplett leer sein.", "A trade may not be completely empty.");
    case "trade.resources_unavailable":
      return createText("Diese Rohstoffe sind nicht verfügbar.", "These resources are not available.");
    case "trade.self_forbidden":
      return createText("Ein Handel mit dir selbst ist nicht erlaubt.", "Trading with yourself is not allowed.");
    case "trade.partner_invalid":
      return createText("Ungültiger Handelspartner.", "Invalid trade partner.");
    case "trade.active_player_self_target_forbidden":
      return createText("Der aktive Spieler kann sich nicht selbst adressieren.", "The active player cannot address themselves.");
    case "trade.counter_must_target_active_player":
      return createText("Gegenangebote müssen an den aktiven Spieler gehen.", "Counter offers must target the active player.");
    case "trade.inactive":
      return createText("Dieser Handel ist nicht aktiv.", "This trade is not active.");
    case "trade.cannot_accept":
      return createText("Dieser Handel kann von dir nicht angenommen werden.", "You cannot accept this trade.");
    case "trade.insufficient_resources":
      return createText("Einer der Spieler hat nicht mehr genügend Rohstoffe.", "One of the players no longer has enough resources.");
    case "trade.cannot_decline":
      return createText("Dieses Angebot kann von dir nicht abgelehnt werden.", "You cannot decline this offer.");
    case "trade.only_offer_owner_can_withdraw":
      return createText("Nur der anbietende Spieler kann das Angebot zurückziehen.", "Only the offering player can withdraw the offer.");
    case "trade.harbor_rate_invalid":
      return createText("Der gewählte Hafenkurs ist ungültig.", "The selected harbor rate is invalid.");
    case "trade.receive_required":
      return createText("Es muss mindestens ein Zielrohstoff gewählt werden.", "At least one target resource must be selected.");
    case "trade.resources_must_differ":
      return createText("Es müssen unterschiedliche Rohstoffe gehandelt werden.", "Different resources must be traded.");
    case "trade.harbor_distribution_invalid":
      return createText("Die gewählte Hafenverteilung ist ungültig.", "The selected harbor distribution is invalid.");
    case "trade.maritime_not_possible":
      return createText("Der Hafenhandel ist mit diesen Beständen nicht möglich.", "This maritime trade is not possible with the current supplies.");
    case "game.roads_unavailable":
      return createText("Es sind keine Straßen mehr verfügbar.", "No roads are available anymore.");
    case "game.settlements_unavailable":
      return createText("Es sind keine Siedlungen mehr verfügbar.", "No settlements are available anymore.");
    case "game.intersection_occupied":
      return createText("Diese Kreuzung ist nicht frei.", "This intersection is not free.");
    case "game.road_occupied":
      return createText("Die Straße ist bereits belegt.", "That road is already occupied.");
    case "game.road_must_connect":
      return createText("Straßen müssen an das eigene Netz anschließen.", "Roads must connect to your own network.");
    case "game.settlement_requires_road":
      return createText("Neue Siedlungen müssen an eine eigene Straße grenzen.", "New settlements must border one of your own roads.");
    case "game.one_development_per_turn":
      return createText("Es darf nur eine Entwicklungskarte pro Zug gespielt werden.", "Only one development card may be played per turn.");
    case "game.development_not_playable":
      return createText("Diese Entwicklungskarte ist aktuell nicht spielbar.", "This development card cannot be played right now.");
    case "game.resources_insufficient":
      return createText("Nicht genügend Rohstoffe vorhanden.", "Not enough resources available.");
    case "game.no_active_road_building":
      return createText("Es ist kein aktiver Straßenbau-Effekt offen.", "There is no active road-building effect.");
    case "game.turn_other_player":
      return createText("Dieser Zug gehört einem anderen Spieler.", "This turn belongs to another player.");
    case "game.action_phase_not_allowed":
      return createText("Diese Aktion ist in der aktuellen Spielphase nicht erlaubt.", "This action is not allowed in the current game phase.");
    case "game.unknown_player":
      return createText("Unbekannter Spieler.", "Unknown player.");
    case "game.unknown_tile":
      return createText("Unbekanntes Feld.", "Unknown tile.");
    case "game.unknown_vertex":
      return createText("Unbekannte Kreuzung.", "Unknown intersection.");
    case "game.unknown_edge":
      return createText("Unbekannte Kante.", "Unknown edge.");
    default:
      return createText(errorCode, errorCode);
  }
}

function loadCatalogs(modules: Record<string, TranslationCatalog>): Record<Locale, TranslationCatalog> {
  const catalogs: Record<Locale, TranslationCatalog> = {};

  for (const [path, catalog] of Object.entries(modules)) {
    const locale = extractLocaleFromPath(path);
    if (!locale) {
      continue;
    }

    catalogs[locale] = normalizeCatalog(catalog);
  }

  if (!catalogs[DEFAULT_LOCALE]) {
    catalogs[DEFAULT_LOCALE] = {};
  }

  return catalogs;
}

function extractLocaleFromPath(path: string): Locale | null {
  const match = path.match(/\/([^/]+)\.json$/);
  return match ? sanitizeLocale(match[1]) : null;
}

function normalizeCatalog(catalog: TranslationCatalog): TranslationCatalog {
  const normalized: TranslationCatalog = {};

  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== "string") {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function orderLocales(locales: string[]): Locale[] {
  return Array.from(new Set([DEFAULT_LOCALE, ...locales]))
    .filter((locale) => !!sanitizeLocale(locale))
    .sort((left, right) => {
      if (left === DEFAULT_LOCALE) {
        return -1;
      }
      if (right === DEFAULT_LOCALE) {
        return 1;
      }
      return left.localeCompare(right);
    });
}

function resolveAvailableLocale(value: unknown): Locale | null {
  const normalized = sanitizeLocale(value);
  if (!normalized) {
    return null;
  }

  if (AVAILABLE_LOCALE_SET.has(normalized)) {
    return normalized;
  }

  const language = normalized.split("-")[0];
  return AVAILABLE_LOCALE_SET.has(language) ? language : null;
}

function resolveTemplate(locale: Locale, text: LocalizedText): string {
  const translation = CATALOGS[locale]?.[text.key];
  if (translation) {
    return translation;
  }

  if (locale === "en" && text.fallback.en) {
    return text.fallback.en;
  }

  return CATALOGS[DEFAULT_LOCALE]?.[text.key] ?? text.fallback.de;
}

function createDateFormatter(locale: Locale, options?: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, options);
  }
}

function createListFormatter(locale: Locale, options?: Intl.ListFormatOptions) {
  try {
    return new Intl.ListFormat(locale, options);
  } catch {
    return new Intl.ListFormat(DEFAULT_LOCALE, options);
  }
}

export function I18nProvider(props: {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  children: ReactNode;
}) {
  const normalizedLocale = normalizeLocale(props.locale);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: normalizedLocale,
      availableLocales: AVAILABLE_LOCALES,
      setLocale: (locale) => props.setLocale(normalizeLocale(locale)),
      formatText: (text) => resolveText(normalizedLocale, text),
      formatDate: (value, options) => createDateFormatter(normalizedLocale, options).format(new Date(value)),
      formatList: (items, options) => createListFormatter(normalizedLocale, options).format(Array.from(items)),
      translate: (key, fallbackDe, fallbackEn, params) =>
        translate(normalizedLocale, key, fallbackDe, fallbackEn, params)
    }),
    [normalizedLocale, props.setLocale]
  );

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
