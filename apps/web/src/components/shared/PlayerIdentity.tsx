import type { PlayerColor } from "@hexagonia/shared";
import type { ReactNode } from "react";
import { getPlayerAccentClass, renderPlayerColorLabel } from "../../ui";
import { PlayerMention } from "./PlayerText";

export function PlayerIdentity(props: {
  username: string;
  color: PlayerColor;
  isSelf?: boolean;
  compact?: boolean;
  meta?: ReactNode;
}) {
  const accentClass = getPlayerAccentClass(props.color);
  const meta =
    props.meta !== undefined
      ? props.meta
      : props.isSelf
        ? (
            <>
              <PlayerMention color={props.color}>Du</PlayerMention> spielst {renderPlayerColorLabel(props.color)}
            </>
          )
        : renderPlayerColorLabel(props.color);

  return (
    <span className={`player-identity ${accentClass} ${props.compact ? "is-compact" : ""}`}>
      <span className="player-swatch" aria-hidden="true" />
      <span className="player-identity-copy">
        <strong className="player-name-text">{props.username}</strong>
        {meta ? <span>{meta}</span> : null}
      </span>
    </span>
  );
}

export function PlayerColorBadge(props: {
  color: PlayerColor;
  label?: ReactNode;
  compact?: boolean;
}) {
  const accentClass = getPlayerAccentClass(props.color);
  const label = props.label ?? renderPlayerColorLabel(props.color);

  return (
    <span className={`player-badge ${accentClass} ${props.compact ? "is-compact" : ""}`}>
      <span className="player-swatch" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
