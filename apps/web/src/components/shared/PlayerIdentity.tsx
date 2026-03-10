import type { PlayerColor } from "@hexagonia/shared";
import type { ReactNode } from "react";
import { createText, resolveText, useI18n } from "../../i18n";
import { getPlayerAccentClass, renderPlayerColorLabel } from "../../ui";
import { PlayerMention } from "./PlayerText";

export function PlayerIdentity(props: {
  username: string;
  color: PlayerColor;
  isSelf?: boolean;
  compact?: boolean;
  meta?: ReactNode;
}) {
  const { locale } = useI18n();
  const accentClass = getPlayerAccentClass(props.color);
  const meta =
    props.meta !== undefined
      ? props.meta
      : props.isSelf
        ? (
            <>
              <PlayerMention color={props.color}>{resolveText(locale, createText("Du", "You"))}</PlayerMention>{" "}
              {resolveText(locale, createText("spielst", "play"))} {renderPlayerColorLabel(locale, props.color)}
            </>
          )
        : renderPlayerColorLabel(locale, props.color);

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
  const { locale } = useI18n();
  const accentClass = getPlayerAccentClass(props.color);
  const label = props.label ?? renderPlayerColorLabel(locale, props.color);

  return (
    <span className={`player-badge ${accentClass} ${props.compact ? "is-compact" : ""}`}>
      <span className="player-swatch" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
