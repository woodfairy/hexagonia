import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@hexagonia/shared";
import { uiSoundManager } from "../../audio/uiSoundManager";
import type { ConnectionState } from "../../ui";
import { renderConnectionLabel, toInitials } from "../../ui";

export function ProfileMenu(props: {
  session: AuthUser;
  connectionState: ConnectionState;
  soundMuted: boolean;
  roomCode?: string;
  onNavigateHome: () => void;
  onNavigateAdmin?: () => void;
  onCopyInviteLink?: () => void | Promise<void>;
  onCopyRoomCode?: () => void | Promise<void>;
  onToggleSoundMuted: () => void;
  onLogout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasOpenStateChangedRef = useRef(false);

  useEffect(() => {
    if (!hasOpenStateChangedRef.current) {
      hasOpenStateChangedRef.current = true;
      return;
    }

    void uiSoundManager.play(open ? "open" : "close", { volume: 0.9 });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={`profile-menu ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="profile-trigger"
        data-ui-sound="off"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-avatar">{toInitials(props.session.username)}</span>
        <span className="profile-trigger-copy">
          <strong>{props.session.username}</strong>
          <span>{props.session.role === "admin" ? "Administrator" : "Spielkonto"}</span>
        </span>
      </button>

      {open ? (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head">
            <span className="profile-avatar is-large">{toInitials(props.session.username)}</span>
            <div className="profile-dropdown-copy">
              <strong>{props.session.username}</strong>
              <span>{props.session.role === "admin" ? "Administrator" : "Spielkonto"}</span>
              <span className={`profile-status is-${props.connectionState}`}>
                {renderConnectionLabel(props.session, props.connectionState)}
              </span>
            </div>
          </div>
          <div className="profile-dropdown-actions">
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.soundMuted ? "is-muted" : "is-active"}`}
              aria-pressed={!props.soundMuted}
              onClick={() => props.onToggleSoundMuted()}
            >
              <span className="menu-toggle-copy">
                <strong>UI-Sounds</strong>
                <span>{props.soundMuted ? "Stumm geschaltet" : "Aktiv und bereit"}</span>
              </span>
              <span className={`status-pill ${props.soundMuted ? "muted" : ""}`}>{props.soundMuted ? "Aus" : "An"}</span>
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={() => {
                setOpen(false);
                props.onNavigateHome();
              }}
            >
              Zur Zentrale
            </button>
            {props.session.role === "admin" && props.onNavigateAdmin ? (
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  setOpen(false);
                  props.onNavigateAdmin?.();
                }}
              >
                Admin-Konsole
              </button>
            ) : null}
            {props.roomCode && props.onCopyRoomCode ? (
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  setOpen(false);
                  void props.onCopyRoomCode?.();
                }}
              >
                Raumcode {props.roomCode} kopieren
              </button>
            ) : null}
            {props.roomCode && props.onCopyInviteLink ? (
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  setOpen(false);
                  void props.onCopyInviteLink?.();
                }}
              >
                Einladungslink kopieren
              </button>
            ) : null}
            <button
              type="button"
              className="menu-action danger"
              onClick={() => {
                setOpen(false);
                void props.onLogout();
              }}
            >
              Abmelden
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
