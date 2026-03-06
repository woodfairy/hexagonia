import type { PlayerColor } from "@hexagonia/shared";
import { getPlayerAccentClass, renderPlayerColorLabel } from "../../ui";

export function PlayerIdentity(props: {
  username: string;
  color: PlayerColor;
  isSelf?: boolean;
  compact?: boolean;
  meta?: string;
}) {
  const accentClass = getPlayerAccentClass(props.color);
  const meta = props.meta ?? (props.isSelf ? `Du spielst ${renderPlayerColorLabel(props.color)}` : renderPlayerColorLabel(props.color));

  return (
    <span className={`player-identity ${accentClass} ${props.compact ? "is-compact" : ""}`}>
      <span className="player-swatch" aria-hidden="true" />
      <span className="player-identity-copy">
        <strong className="player-name-text">{props.username}</strong>
        <span>{meta}</span>
      </span>
    </span>
  );
}

export function PlayerColorBadge(props: {
  color: PlayerColor;
  label?: string;
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
