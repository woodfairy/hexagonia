import { RESOURCES, sanitizeUsernameInput } from "@hexagonia/shared";
import type {
  AdminUserRecord,
  ClientMessage,
  MatchSnapshot,
  Resource,
  UserRole
} from "@hexagonia/shared";
import type { ToastMessage } from "./components/shell/ToastStack";
import type {
  AdminUserDraftState
} from "./components/screens/AdminScreen";
import { renderResourceLabel, renderResourceMap } from "./ui";

type MatchAction = Extract<ClientMessage, { type: "match.action" }>["action"];

function serializeResourceMap(resources: Partial<Record<Resource, number>>): string {
  return RESOURCES.map((resource) => `${resource}:${resources[resource] ?? 0}`).join(",");
}

export function getMatchActionKey(action: MatchAction): string {
  switch (action.type) {
    case "place_initial_settlement":
      return `place_initial_settlement:${action.vertexId}`;
    case "place_initial_road":
      return `place_initial_road:${action.edgeId}`;
    case "discard_resources":
      return `discard_resources:${serializeResourceMap(action.resources)}`;
    case "roll_dice":
      return "roll_dice";
    case "build_road":
      return `build_road:${action.edgeId}`;
    case "build_settlement":
      return `build_settlement:${action.vertexId}`;
    case "build_city":
      return `build_city:${action.vertexId}`;
    case "buy_development_card":
      return "buy_development_card";
    case "play_knight":
      return "play_knight";
    case "play_road_building":
      return "play_road_building";
    case "place_free_road":
      return `place_free_road:${action.edgeId}`;
    case "finish_road_building":
      return "finish_road_building";
    case "play_year_of_plenty":
      return `play_year_of_plenty:${action.resources[0]}:${action.resources[1]}`;
    case "play_monopoly":
      return `play_monopoly:${action.resource}`;
    case "move_robber":
      return `move_robber:${action.tileId}:${action.targetPlayerId ?? ""}`;
    case "create_trade_offer":
      return `create_trade_offer:${action.toPlayerId ?? ""}:${serializeResourceMap(action.give)}:${serializeResourceMap(action.want)}`;
    case "accept_trade_offer":
      return `accept_trade_offer:${action.tradeId}`;
    case "decline_trade_offer":
      return `decline_trade_offer:${action.tradeId}`;
    case "withdraw_trade_offer":
      return `withdraw_trade_offer:${action.tradeId}`;
    case "maritime_trade":
      return `maritime_trade:${action.give}:${serializeResourceMap(action.receive)}:${action.giveCount}`;
    case "end_turn":
      return "end_turn";
    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}

export function getReconnectJitter(attempt: number): number {
  return (attempt * 173) % 351;
}

export function getToastHapticId(tone: ToastMessage["tone"]) {
  switch (tone) {
    case "error":
      return "error" as const;
    case "success":
      return "success" as const;
    default:
      return "nudge" as const;
  }
}

export function getActionableTradeCount(match: MatchSnapshot): number {
  return new Set([
    ...match.allowedMoves.acceptableTradeOfferIds,
    ...match.allowedMoves.declineableTradeOfferIds
  ]).size;
}

export function StatusSurface(props: { title: string; text: string }) {
  return (
    <section className="screen-shell status-shell">
      <article className="surface status-surface">
        <div className="eyebrow">Synchronisation</div>
        <h1>{props.title}</h1>
        <p className="hero-copy">{props.text}</p>
      </article>
    </section>
  );
}

export function AppHeaderSkeleton(props: { eyebrow: string }) {
  return (
    <header className="app-header app-header-skeleton" aria-hidden="true">
      <div className="brand-cluster">
        <div className="brand-mark app-skeleton-brand-mark" />
        <div className="brand-copy">
          <span className="eyebrow">{props.eyebrow}</span>
          <div className="brand-title-row">
            <span className="skeleton-shape app-skeleton-title" />
            <span className="skeleton-shape app-skeleton-meta" />
          </div>
        </div>
      </div>

      <div className="header-utilities">
        <div className="connection-indicator app-skeleton-connection">
          <span className="connection-dot" aria-hidden="true" />
          <span className="skeleton-shape app-skeleton-connection-label" />
        </div>
        <div className="profile-trigger app-skeleton-profile">
          <span className="profile-avatar" aria-hidden="true">
            <span className="skeleton-shape app-skeleton-avatar-core" />
          </span>
          <span className="profile-trigger-copy">
            <span className="skeleton-shape app-skeleton-profile-name" />
            <span className="skeleton-shape app-skeleton-profile-role" />
          </span>
        </div>
      </div>
    </header>
  );
}

export function DeepLinkBootSkeleton(props: {
  kind: "home" | "room" | "invite" | "match" | "admin";
}) {
  if (props.kind === "match") {
    return (
      <section className="screen-shell match-shell deep-link-boot-shell" aria-busy="true" aria-live="polite">
        <div className="match-screen deep-link-match-skeleton">
          <div className="match-stage">
            <div className="board-topbar deep-link-skeleton-topbar">
              <span className="skeleton-shape deep-link-chip" />
              <span className="skeleton-shape deep-link-chip is-wide" />
              <span className="skeleton-shape deep-link-chip" />
            </div>
            <article className="surface deep-link-board-skeleton">
              <div className="deep-link-board-glow" />
              <div className="deep-link-board-hex-row is-row-1">
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
              </div>
              <div className="deep-link-board-hex-row is-row-2">
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
              </div>
              <div className="deep-link-board-hex-row is-row-3">
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
              </div>
              <div className="deep-link-board-hex-row is-row-4">
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
              </div>
              <div className="deep-link-board-hex-row is-row-5">
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
                <span className="skeleton-shape deep-link-board-hex" />
              </div>
            </article>
            <div className="board-bottom-hint deep-link-skeleton-bottom">
              <span className="skeleton-shape deep-link-line is-short" />
            </div>
          </div>

          <aside className="surface match-dock deep-link-dock-skeleton">
            <div className="match-dock-head">
              <div className="match-dock-head-copy">
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-medium" />
              </div>
              <div className="match-dock-context">
                <span className="skeleton-shape deep-link-chip" />
                <span className="skeleton-shape deep-link-chip" />
              </div>
            </div>
            <div className="dock-card-grid">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="mini-card deep-link-mini-card">
                  <span className="skeleton-shape deep-link-line is-short" />
                  <span className="skeleton-shape deep-link-line is-tiny" />
                </div>
              ))}
            </div>
            <div className="quick-action-grid">
              <span className="skeleton-shape deep-link-button" />
              <span className="skeleton-shape deep-link-button" />
              <span className="skeleton-shape deep-link-button" />
            </div>
            <div className="dock-section">
              <span className="skeleton-shape deep-link-line is-short" />
              <span className="skeleton-shape deep-link-line" />
              <span className="skeleton-shape deep-link-line is-medium" />
              <span className="skeleton-shape deep-link-line" />
            </div>
          </aside>
        </div>
      </section>
    );
  }

  if (props.kind === "admin") {
    return (
      <section className="screen-shell admin-shell deep-link-boot-shell" aria-busy="true" aria-live="polite">
        <article className="surface action-surface deep-link-admin-main">
          <span className="skeleton-shape deep-link-line is-short" />
          <span className="skeleton-shape deep-link-line is-medium" />
          <div className="dock-card-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="summary-card deep-link-mini-card">
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-tiny" />
              </div>
            ))}
          </div>
        </article>
        <div className="admin-side-stack">
          <article className="surface status-surface deep-link-admin-side">
            <span className="skeleton-shape deep-link-line is-short" />
            <span className="skeleton-shape deep-link-line" />
            <span className="skeleton-shape deep-link-button" />
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="screen-shell room-shell deep-link-boot-shell" aria-busy="true" aria-live="polite">
      <div className="room-main-grid deep-link-room-skeleton">
        <article className="surface room-hero">
          <div className="surface-head room-surface-head">
            <div className="room-title-stack">
              <span className="skeleton-shape deep-link-line is-short" />
              <div className="room-code-row">
                <span className="skeleton-shape deep-link-room-code" />
                <span className="skeleton-shape deep-link-chip" />
              </div>
              <span className="skeleton-shape deep-link-line is-medium" />
            </div>
            <div className="room-share-actions">
              <span className="skeleton-shape deep-link-button is-compact" />
              <span className="skeleton-shape deep-link-button is-compact" />
            </div>
          </div>

          <div className="room-meta-strip">
            <span className="skeleton-shape deep-link-chip" />
            <span className="skeleton-shape deep-link-chip" />
            <span className="skeleton-shape deep-link-chip is-wide" />
            <span className="skeleton-shape deep-link-chip is-wide" />
          </div>

          <div className="seat-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={index} className="seat-card deep-link-seat-card">
                <div className="seat-card-head">
                  <div className="seat-slot-meta">
                    <span className="skeleton-shape deep-link-chip" />
                    <span className="skeleton-shape deep-link-chip is-short" />
                  </div>
                </div>
                <div className="seat-card-identity deep-link-seat-identity">
                  <span className="skeleton-shape deep-link-seat-avatar" />
                  <div className="seat-identity-copy">
                    <span className="skeleton-shape deep-link-line is-short" />
                    <span className="skeleton-shape deep-link-line is-tiny" />
                  </div>
                </div>
                <div className="seat-card-state">
                  <span className="skeleton-shape deep-link-line is-short" />
                </div>
                <div className="seat-card-detail">
                  <span className="skeleton-shape deep-link-line is-medium" />
                </div>
                <div className="seat-card-action">
                  <span className="skeleton-shape deep-link-button" />
                </div>
              </article>
            ))}
          </div>
        </article>

        <div className="room-side-stack">
          <article className="surface room-control-card">
            <span className="skeleton-shape deep-link-line is-short" />
            <span className="skeleton-shape deep-link-line is-medium" />
            <div className="room-action-stack">
              <span className="skeleton-shape deep-link-button" />
              <span className="skeleton-shape deep-link-button" />
            </div>
            <span className="skeleton-shape deep-link-line" />
            <div className="room-settings-block">
              <div className="room-setting-head">
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-short" />
              </div>
              <span className="skeleton-shape deep-link-segmented" />
              <span className="skeleton-shape deep-link-line" />
            </div>
            <div className="room-settings-block">
              <div className="room-setting-head">
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-short" />
              </div>
              <span className="skeleton-shape deep-link-segmented" />
              <span className="skeleton-shape deep-link-line is-medium" />
            </div>
            <div className="room-settings-block">
              <div className="room-setting-head">
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-short" />
              </div>
              <span className="skeleton-shape deep-link-segmented is-short" />
              <span className="skeleton-shape deep-link-segmented is-medium" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function sendMessage(socket: WebSocket, message: ClientMessage) {
  socket.send(JSON.stringify(message));
}

export function getMatchActionConfirmation(
  match: MatchSnapshot,
  action: MatchAction
): { title: string; detail: string; confirmLabel: string } | null {
  switch (action.type) {
    case "place_initial_settlement":
      return {
        title: "Start-Siedlung setzen?",
        detail: "Die ausgewählte Position wird als deine Start-Siedlung gesetzt.",
        confirmLabel: "Siedlung setzen"
      };
    case "place_initial_road":
      return {
        title: "Start-Straße setzen?",
        detail: "Die ausgewählte Kante wird als deine Start-Straße gesetzt.",
        confirmLabel: "Straße setzen"
      };
    case "build_road":
      return {
        title: "Straße bauen?",
        detail: "Die Straße wird sofort gebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Straße bauen"
      };
    case "build_settlement":
      return {
        title: "Siedlung bauen?",
        detail: "Die Siedlung wird sofort gebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Siedlung bauen"
      };
    case "build_city":
      return {
        title: "Stadt bauen?",
        detail: "Die ausgewählte Siedlung wird zur Stadt ausgebaut und die Baukosten werden bezahlt.",
        confirmLabel: "Stadt bauen"
      };
    case "buy_development_card":
      return {
        title: "Entwicklungskarte kaufen?",
        detail: "Die Rohstoffe werden direkt abgezogen und du ziehst eine verdeckte Entwicklungskarte.",
        confirmLabel: "Karte kaufen"
      };
    case "play_knight":
      return {
        title: "Ritter spielen?",
        detail: "Der Ritter wird ausgespielt und danach setzt du den Räuber.",
        confirmLabel: "Ritter spielen"
      };
    case "play_road_building":
      return {
        title: "Straßenbau spielen?",
        detail: "Die Karte wird aktiviert. Danach setzt du eine oder zwei kostenlose Straßen direkt über das Brett.",
        confirmLabel: "Straßenbau starten"
      };
    case "place_free_road":
      return {
        title: "Kostenlose Straße setzen?",
        detail: "Die ausgewählte Kante wird als kostenlose Straße aus dem Straßenbau-Effekt gesetzt.",
        confirmLabel: "Straße setzen"
      };
    case "finish_road_building":
      return {
        title: "Straßenbau beenden?",
        detail: "Der offene Straßenbau-Effekt wird beendet. Du kannst in diesem Zug danach normal weiterspielen.",
        confirmLabel: "Straßenbau beenden"
      };
    case "play_year_of_plenty":
      return {
        title: "Erfindung ausspielen?",
        detail: `Du nimmst ${renderResourceLabel(action.resources[0])} und ${renderResourceLabel(action.resources[1])} aus der Bank.`,
        confirmLabel: "Erfindung spielen"
      };
    case "play_monopoly":
      return {
        title: "Monopol ausspielen?",
        detail: `Alle Mitspieler geben dir ihre ${renderResourceLabel(action.resource)}-Karten.`,
        confirmLabel: "Monopol spielen"
      };
    case "move_robber": {
      const targetName = action.targetPlayerId
        ? match.players.find((player) => player.id === action.targetPlayerId)?.username
        : null;
      return {
        title: "Räuber versetzen?",
        detail: targetName
          ? `Der Räuber wird auf das gewählte Feld versetzt und ${targetName} wird als Zielspieler verwendet.`
          : "Der Räuber wird auf das gewählte Feld versetzt.",
        confirmLabel: "Räuber setzen"
      };
    }
    case "create_trade_offer": {
      const targetName = action.toPlayerId
        ? match.players.find((player) => player.id === action.toPlayerId)?.username ?? "dem Zielspieler"
        : "allen Mitspielern";
      return {
        title: "Handelsangebot senden?",
        detail: `${renderResourceMap(action.give) || "nichts"} gegen ${renderResourceMap(action.want) || "nichts"} an ${targetName}.`,
        confirmLabel: "Angebot senden"
      };
    }
    case "maritime_trade":
      return {
        title: "Hafenhandel bestätigen?",
        detail: `Tausche ${action.giveCount} ${renderResourceLabel(action.give)} gegen ${renderResourceMap(action.receive) || "nichts"}.`,
        confirmLabel: "Tausch senden"
      };
    case "discard_resources":
      return null;
    case "end_turn":
      return {
        title: "Zug beenden?",
        detail: "Danach kann in diesem Zug nichts mehr gebaut oder gespielt werden.",
        confirmLabel: "Zug beenden"
      };
    default:
      return null;
  }
}

export function getNextAdminUserDraft(
  currentDrafts: Record<string, AdminUserDraftState>,
  users: AdminUserRecord[],
  userId: string,
  field: keyof AdminUserDraftState,
  value: string
): AdminUserDraftState {
  const baseUser = users.find((user) => user.id === userId);
  const current = currentDrafts[userId];
  const draft: AdminUserDraftState = {
    username: current?.username ?? baseUser?.username ?? "",
    password: current?.password ?? "",
    role: current?.role ?? baseUser?.role ?? "user"
  };

  if (field === "role") {
    return {
      ...draft,
      role: value as UserRole
    };
  }

  if (field === "username") {
    return {
      ...draft,
      username: sanitizeUsernameInput(value)
    };
  }

  return {
    ...draft,
    password: value
  };
}
