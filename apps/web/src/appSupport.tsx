import type {
  AdminUserRecord,
  ClientMessage,
  MatchSnapshot,
  UserRole
} from "@hexagonia/shared";
import type { ToastMessage } from "./components/shell/ToastStack";
import type {
  AdminUserDraftState
} from "./components/screens/AdminScreen";
import { renderResourceLabel, renderResourceMap } from "./ui";

type MatchAction = Extract<ClientMessage, { type: "match.action" }>["action"];

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
        detail: `Tausche ${action.giveCount} ${renderResourceLabel(action.give)} gegen 1 ${renderResourceLabel(action.receive)}.`,
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
      username: value
    };
  }

  return {
    ...draft,
    password: value
  };
}
