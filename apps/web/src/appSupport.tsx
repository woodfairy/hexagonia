import { PIRATE_FRAME_TILE_ID, RESOURCES, sanitizeUsernameInput } from "@hexagonia/shared";
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
import { getDocumentLocale, translate, useI18n } from "./i18n";
import { renderResourceLabel, renderResourceMap } from "./ui";

type MatchAction = Extract<ClientMessage, { type: "match.action" }>["action"];

function t(key: string, params?: Record<string, string | number>) {
  return translate(getDocumentLocale(), key, undefined, undefined, params);
}

function serializeResourceMap(resources: Partial<Record<Resource, number>>): string {
  return RESOURCES.map((resource) => `${resource}:${resources[resource] ?? 0}`).join(",");
}

export function getMatchActionKey(action: MatchAction): string {
  switch (action.type) {
    case "place_initial_settlement":
      return `place_initial_settlement:${action.vertexId}`;
    case "place_initial_road":
      return `place_initial_road:${action.edgeId}:${action.routeType ?? ""}`;
    case "discard_resources":
      return `discard_resources:${serializeResourceMap(action.resources)}`;
    case "roll_dice":
      return "roll_dice";
    case "build_road":
      return `build_road:${action.edgeId}`;
    case "build_ship":
      return `build_ship:${action.edgeId}`;
    case "move_ship":
      return `move_ship:${action.fromEdgeId}:${action.toEdgeId}`;
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
      return `place_free_road:${action.edgeId}:${action.routeType ?? ""}`;
    case "finish_road_building":
      return "finish_road_building";
    case "play_year_of_plenty":
      return `play_year_of_plenty:${action.resources[0]}:${action.resources[1]}`;
    case "play_monopoly":
      return `play_monopoly:${action.resource}`;
    case "move_robber":
      return `move_robber:${action.tileId}:${action.targetPlayerId ?? ""}`;
    case "move_pirate":
      return `move_pirate:${action.tileId}:${action.targetPlayerId ?? ""}:${action.stealType ?? ""}`;
    case "steal_on_seven":
      return `steal_on_seven:${action.targetPlayerId}`;
    case "choose_gold_resource":
      return `choose_gold_resource:${action.resources.join(",")}`;
    case "scenario_setup_place_tile":
      return `scenario_setup_place_tile:${action.tileId}:${action.terrain}`;
    case "scenario_setup_clear_tile":
      return `scenario_setup_clear_tile:${action.tileId}`;
    case "scenario_setup_place_token":
      return `scenario_setup_place_token:${action.tileId}:${action.token}`;
    case "scenario_setup_clear_token":
      return `scenario_setup_clear_token:${action.tileId}`;
    case "scenario_setup_place_port":
      return `scenario_setup_place_port:${action.edgeId}:${action.portType}`;
    case "scenario_setup_clear_port":
      return `scenario_setup_clear_port:${action.edgeId}`;
    case "scenario_setup_set_ready":
      return `scenario_setup_set_ready:${action.ready ? 1 : 0}`;
    case "place_port_token":
      return `place_port_token:${action.vertexId}:${action.portType}`;
    case "claim_wonder":
      return `claim_wonder:${action.vertexId}`;
    case "build_wonder_level":
      return `build_wonder_level:${action.vertexId}`;
    case "attack_fortress":
      return `attack_fortress:${action.vertexId}`;
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

const DEEP_LINK_BOARD_SKELETON_ROWS = [3, 4, 5, 4, 3] as const;

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
  const { translate: tt } = useI18n();
  return (
    <section className="screen-shell status-shell">
      <article className="surface status-surface">
        <div className="eyebrow">{tt("app.status.syncEyebrow")}</div>
        <h1>{props.title}</h1>
        <p className="hero-copy">{props.text}</p>
      </article>
    </section>
  );
}

export function AppHeaderSkeleton(props: { eyebrow: string; compact?: boolean }) {
  return (
    <header className={`app-header app-header-skeleton ${props.compact ? "is-compact" : ""}`.trim()} aria-hidden="true">
      <div className="brand-cluster">
        <div className="brand-mark app-skeleton-brand-mark" />
        <span className="skeleton-shape app-skeleton-wordmark" />
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
  kind: "home" | "play" | "room" | "invite" | "match" | "admin";
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
              {DEEP_LINK_BOARD_SKELETON_ROWS.map((hexCount, rowIndex) => (
                <div key={rowIndex} className="deep-link-board-hex-row">
                  {Array.from({ length: hexCount }).map((_, hexIndex) => (
                    <span key={hexIndex} className="skeleton-shape deep-link-board-hex" />
                  ))}
                </div>
              ))}
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

  if (props.kind === "play") {
    return (
      <section className="screen-shell lobby-shell deep-link-boot-shell" aria-busy="true" aria-live="polite">
        <article className="surface resume-surface deep-link-play-main">
          <div className="surface-head">
            <div>
              <span className="skeleton-shape deep-link-line is-short" />
              <span className="skeleton-shape deep-link-line is-medium" />
            </div>
          </div>

          <div className="resume-list deep-link-play-list">
            {Array.from({ length: 3 }).map((_, index) => (
              <article key={index} className="resume-card deep-link-play-card">
                <div className="resume-card-head">
                  <div>
                    <span className="skeleton-shape deep-link-line is-short" />
                    <span className="skeleton-shape deep-link-line is-medium" />
                  </div>
                  <span className={`skeleton-shape deep-link-chip ${index === 0 ? "" : "is-short"}`.trim()} />
                </div>
                <div className="resume-card-meta-row">
                  <span className="skeleton-shape deep-link-chip is-wide" />
                </div>
                <div className="resume-card-actions">
                  <span className="skeleton-shape deep-link-button" />
                </div>
              </article>
            ))}
          </div>
        </article>

        <div className="lobby-side-grid">
          <article className="surface action-surface deep-link-play-action">
            <div className="surface-head">
              <div>
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-medium" />
              </div>
            </div>
            <span className="skeleton-shape deep-link-line" />
            <span className="skeleton-shape deep-link-button" />
          </article>

          <article className="surface action-surface deep-link-play-action">
            <div className="surface-head">
              <div>
                <span className="skeleton-shape deep-link-line is-short" />
                <span className="skeleton-shape deep-link-line is-medium" />
              </div>
            </div>
            <div className="code-join-row deep-link-play-join-row">
              <span className="skeleton-shape deep-link-input" />
              <span className="skeleton-shape deep-link-button is-compact" />
            </div>
            <span className="skeleton-shape deep-link-line is-medium" />
          </article>
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
        title: t("match.confirm.initialSettlement.title"),
        detail: t("match.confirm.initialSettlement.detail"),
        confirmLabel: t("match.confirm.initialSettlement.confirm")
      };
    case "place_initial_road":
      return {
        title: t("match.confirm.initialRoad.title"),
        detail:
          action.routeType === "ship"
            ? t("match.confirm.initialShip.detail")
            : t("match.confirm.initialRoad.detail"),
        confirmLabel:
          action.routeType === "ship"
            ? t("match.confirm.initialShip.confirm")
            : t("match.confirm.initialRoad.confirm")
      };
    case "build_road":
      return {
        title: t("match.confirm.buildRoad.title"),
        detail: t("match.confirm.buildRoad.detail"),
        confirmLabel: t("match.confirm.buildRoad.confirm")
      };
    case "build_ship":
      return {
        title: t("match.confirm.buildShip.title"),
        detail: t("match.confirm.buildShip.detail"),
        confirmLabel: t("match.confirm.buildShip.confirm")
      };
    case "move_ship":
      return {
        title: t("match.confirm.moveShip.title"),
        detail: t("match.confirm.moveShip.detail"),
        confirmLabel: t("match.confirm.moveShip.confirm")
      };
    case "build_settlement":
      return {
        title: t("match.confirm.buildSettlement.title"),
        detail: t("match.confirm.buildSettlement.detail"),
        confirmLabel: t("match.confirm.buildSettlement.confirm")
      };
    case "build_city":
      return {
        title: t("match.confirm.buildCity.title"),
        detail: t("match.confirm.buildCity.detail"),
        confirmLabel: t("match.confirm.buildCity.confirm")
      };
    case "buy_development_card":
      return {
        title: t("match.confirm.buyDevelopment.title"),
        detail: t("match.confirm.buyDevelopment.detail"),
        confirmLabel: t("match.confirm.buyDevelopment.confirm")
      };
    case "play_knight":
      return {
        title: t("match.confirm.playKnight.title"),
        detail: t("match.confirm.playKnight.detail"),
        confirmLabel: t("match.confirm.playKnight.confirm")
      };
    case "play_road_building":
      return {
        title: t("match.confirm.playRoadBuilding.title"),
        detail: t("match.confirm.playRoadBuilding.detail"),
        confirmLabel: t("match.confirm.playRoadBuilding.confirm")
      };
    case "place_free_road":
      return {
        title:
          action.routeType === "ship"
            ? t("match.confirm.placeFreeShip.title")
            : t("match.confirm.placeFreeRoad.title"),
        detail:
          action.routeType === "ship"
            ? t("match.confirm.placeFreeShip.detail")
            : t("match.confirm.placeFreeRoad.detail"),
        confirmLabel:
          action.routeType === "ship"
            ? t("match.confirm.placeFreeShip.confirm")
            : t("match.confirm.placeFreeRoad.confirm")
      };
    case "finish_road_building":
      return {
        title: t("match.confirm.finishRoadBuilding.title"),
        detail: t("match.confirm.finishRoadBuilding.detail"),
        confirmLabel: t("match.confirm.finishRoadBuilding.confirm")
      };
    case "play_year_of_plenty":
      return {
        title: t("match.confirm.playYearOfPlenty.title"),
        detail: t("match.confirm.playYearOfPlenty.detail", {
          first: renderResourceLabel(action.resources[0]),
          second: renderResourceLabel(action.resources[1])
        }),
        confirmLabel: t("match.confirm.playYearOfPlenty.confirm")
      };
    case "play_monopoly":
      return {
        title: t("match.confirm.playMonopoly.title"),
        detail: t("match.confirm.playMonopoly.detail", {
          resource: renderResourceLabel(action.resource)
        }),
        confirmLabel: t("match.confirm.playMonopoly.confirm")
      };
    case "move_robber": {
      const targetName = action.targetPlayerId
        ? match.players.find((player) => player.id === action.targetPlayerId)?.username
        : null;
      return {
        title: t("match.confirm.moveRobber.title"),
        detail: targetName
          ? t("match.confirm.moveRobber.detailWithTarget", { player: targetName })
          : t("match.confirm.moveRobber.detail"),
        confirmLabel: t("match.confirm.moveRobber.confirm")
      };
    }
    case "move_pirate": {
      const movingToFrame = action.tileId === PIRATE_FRAME_TILE_ID;
      const targetName = action.targetPlayerId
        ? match.players.find((player) => player.id === action.targetPlayerId)?.username
        : null;
      const stealTypeLabel =
        action.stealType === "cloth"
          ? t("match.pirateSteal.cloth")
          : action.stealType === "resource"
            ? t("match.pirateSteal.resource")
            : null;
      const detail = movingToFrame
        ? t("match.confirm.movePirate.detailFrame")
        : targetName && stealTypeLabel
          ? t("match.confirm.movePirate.detailWithTargetAndStealType", {
              player: targetName,
              stealType: stealTypeLabel
            })
          : targetName
            ? t("match.confirm.movePirate.detailWithTarget", { player: targetName })
            : t("match.confirm.movePirate.detail");
      return {
        title: t("match.confirm.movePirate.title"),
        detail,
        confirmLabel: t("match.confirm.movePirate.confirm")
      };
    }
    case "steal_on_seven":
      return null;
    case "choose_gold_resource":
      return {
        title: t("match.confirm.chooseGold.title"),
        detail: t("match.confirm.chooseGold.detail", {
          resources: renderResourceMap(
            RESOURCES.reduce<Record<Resource, number>>((result, resource) => {
              result[resource] = action.resources.filter((entry) => entry === resource).length;
              return result;
            }, {} as Record<Resource, number>)
          )
        }),
        confirmLabel: t("match.confirm.chooseGold.confirm")
      };
    case "scenario_setup_place_tile":
    case "scenario_setup_clear_tile":
    case "scenario_setup_place_token":
    case "scenario_setup_clear_token":
    case "scenario_setup_place_port":
    case "scenario_setup_clear_port":
    case "scenario_setup_set_ready":
      return null;
    case "place_port_token":
      return {
        title: t("match.confirm.placePort.title"),
        detail: t("match.confirm.placePort.detail"),
        confirmLabel: t("match.confirm.placePort.confirm")
      };
    case "claim_wonder":
      return {
        title: t("match.confirm.claimWonder.title"),
        detail: t("match.confirm.claimWonder.detail"),
        confirmLabel: t("match.confirm.claimWonder.confirm")
      };
    case "build_wonder_level":
      return {
        title: t("match.confirm.buildWonderLevel.title"),
        detail: t("match.confirm.buildWonderLevel.detail"),
        confirmLabel: t("match.confirm.buildWonderLevel.confirm")
      };
    case "attack_fortress":
      return {
        title: t("match.confirm.attackFortress.title"),
        detail: t("match.confirm.attackFortress.detail"),
        confirmLabel: t("match.confirm.attackFortress.confirm")
      };
    case "create_trade_offer": {
      const targetName = action.toPlayerId
        ? match.players.find((player) => player.id === action.toPlayerId)?.username ?? t("match.confirm.trade.targetPlayer")
        : t("match.confirm.trade.allPlayers");
      return {
        title: t("match.confirm.trade.title"),
        detail: t("match.confirm.trade.detail", {
          give: renderResourceMap(action.give) || t("shared.nothing"),
          want: renderResourceMap(action.want) || t("shared.nothing"),
          player: targetName
        }),
        confirmLabel: t("match.confirm.trade.confirm")
      };
    }
    case "maritime_trade":
      return {
        title: t("match.confirm.maritimeTrade.title"),
        detail: t("match.confirm.maritimeTrade.detail", {
          count: action.giveCount,
          resource: renderResourceLabel(action.give),
          receive: renderResourceMap(action.receive) || t("shared.nothing")
        }),
        confirmLabel: t("match.confirm.maritimeTrade.confirm")
      };
    case "discard_resources":
      return null;
    case "end_turn":
      if (match.allowedMoves.fortressVertexIds.length > 0) {
        return {
          title: t("match.confirm.endTurn.attackFortress.title"),
          detail: t("match.confirm.endTurn.attackFortress.detail"),
          confirmLabel: t("match.confirm.endTurn.attackFortress.confirm")
        };
      }
      return {
        title: t("match.confirm.endTurn.title"),
        detail: t("match.confirm.endTurn.detail"),
        confirmLabel: t("match.confirm.endTurn.confirm")
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
