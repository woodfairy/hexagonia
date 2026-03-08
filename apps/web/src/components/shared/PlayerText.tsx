import type { MatchSnapshot, PlayerColor } from "@hexagonia/shared";
import { Fragment, type ReactNode } from "react";
import { getPlayerAccentClass } from "../../ui";

const SELF_PLAYER_TOKENS = [
  "Du",
  "du",
  "Dich",
  "dich",
  "Dir",
  "dir",
  "Dein",
  "dein",
  "Deine",
  "deine",
  "Deinem",
  "deinem",
  "Deinen",
  "deinen",
  "Deiner",
  "deiner",
  "Deines",
  "deines"
] as const;

type MatchPlayerTextContext = Pick<MatchSnapshot, "players" | "you">;

export function PlayerMention(props: {
  color: PlayerColor | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  const accentClass = getPlayerAccentClass(props.color);

  return (
    <span className={`player-inline-text ${accentClass} ${props.className ?? ""}`.trim()}>
      {props.children}
    </span>
  );
}

export function renderMatchPlayerText(match: MatchPlayerTextContext, text: string): ReactNode {
  const tokenMap = buildPlayerTokenMap(match);
  const tokens = [...tokenMap.keys()].sort((left, right) => right.length - left.length);
  if (!tokens.length) {
    return text;
  }

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${tokens.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`, "gu");
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const matchEntry of text.matchAll(pattern)) {
    const matchText = matchEntry[0];
    const index = matchEntry.index ?? -1;
    if (index < 0) {
      continue;
    }

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    parts.push(
      <PlayerMention key={`${matchText}-${index}`} color={tokenMap.get(matchText) ?? null}>
        {matchText}
      </PlayerMention>
    );
    lastIndex = index + matchText.length;
  }

  if (parts.length === 0) {
    return text;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <Fragment>{parts}</Fragment>;
}

function buildPlayerTokenMap(match: MatchPlayerTextContext): Map<string, PlayerColor> {
  const tokenMap = new Map<string, PlayerColor>();
  const selfPlayer = match.players.find((player) => player.id === match.you);
  if (selfPlayer) {
    for (const token of SELF_PLAYER_TOKENS) {
      tokenMap.set(token, selfPlayer.color);
    }
  }

  for (const player of match.players) {
    tokenMap.set(player.username, player.color);
  }

  return tokenMap;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
