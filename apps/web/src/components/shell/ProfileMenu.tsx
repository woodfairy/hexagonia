import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@hexagonia/shared";
import { uiHapticsManager } from "../../audio/uiHapticsManager";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import type { BoardVisualSettings } from "../../boardVisuals";
import type { ConnectionState } from "../../ui";
import { renderConnectionLabel, toInitials } from "../../ui";

export interface ProfileMenuProps {
  boardVisualSettings: BoardVisualSettings;
  session: AuthUser;
  connectionState: ConnectionState;
  soundMuted: boolean;
  hapticsMuted: boolean;
  hapticsSupported: boolean;
  musicTracks: ReadonlyArray<MusicTrack>;
  selectedMusicTrackId: string | null;
  musicPaused: boolean;
  musicPlaybackMode: MusicPlaybackMode;
  roomCode?: string;
  onNavigateHome: () => void;
  onNavigateAdmin?: () => void;
  onCopyInviteLink?: () => void | Promise<void>;
  onCopyRoomCode?: () => void | Promise<void>;
  onBoardVisualSettingsChange: (settings: BoardVisualSettings) => void;
  onMusicPlaybackModeChange: (mode: MusicPlaybackMode) => void;
  onSelectMusicTrack: (trackId: string) => void;
  onToggleSoundMuted: () => void;
  onToggleHapticsMuted: () => void;
  onToggleMusicPaused: () => void;
  onLogout: () => void | Promise<void>;
}

type ToggleableBoardVisualSetting = "props" | "objects" | "textures" | "terrainRelief" | "resourceIcons";

export function ProfileMenuPanel(props: ProfileMenuProps & { inline?: boolean; onRequestClose?: () => void }) {
  const selectedMusicTrack =
    props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const musicSummary =
    props.musicTracks.length === 0
      ? "Keine Songs in assets/songs gefunden"
      : props.musicPlaybackMode === "cycle"
        ? `Alle ${props.musicTracks.length} Songs laufen nacheinander`
        : `${selectedMusicTrack?.name ?? "Kein Song"} in Dauerschleife`;
  const playSoftMenuHaptic = () => void uiHapticsManager.play("soft");
  const toggleBoardVisualSetting = (setting: ToggleableBoardVisualSetting) => {
    props.onBoardVisualSettingsChange({
      ...props.boardVisualSettings,
      [setting]: !props.boardVisualSettings[setting]
    });
    playSoftMenuHaptic();
  };
  const setBoardPieceStyle = (pieceStyle: BoardVisualSettings["pieceStyle"]) => {
    if (props.boardVisualSettings.pieceStyle === pieceStyle) {
      return;
    }

    props.onBoardVisualSettingsChange({
      ...props.boardVisualSettings,
      pieceStyle
    });
    playSoftMenuHaptic();
  };
  const toggleMusicPaused = () => {
    props.onToggleMusicPaused();
    playSoftMenuHaptic();
  };
  const toggleSoundMuted = () => {
    props.onToggleSoundMuted();
    playSoftMenuHaptic();
  };
  const toggleHapticsMuted = () => {
    if (!props.hapticsSupported) {
      return;
    }

    if (!props.hapticsMuted) {
      playSoftMenuHaptic();
    }
    props.onToggleHapticsMuted();
    if (props.hapticsMuted) {
      playSoftMenuHaptic();
    }
  };
  const closePanel = () => props.onRequestClose?.();

  return (
    <div
      className={`profile-dropdown ${props.inline ? "profile-dropdown-inline" : ""}`.trim()}
      role={props.inline ? "region" : "menu"}
      aria-label={props.inline ? "Profil" : undefined}
    >
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
        <div className="profile-music-panel">
          <div className="profile-music-copy">
            <strong>Musikplayer</strong>
            <span>{musicSummary}</span>
          </div>
          <label className="profile-music-select-shell">
            <span>Modus</span>
            <select
              value={props.musicPlaybackMode}
              onChange={(event) => props.onMusicPlaybackModeChange(event.target.value as MusicPlaybackMode)}
              disabled={props.musicTracks.length === 0}
            >
              <option value="single">Ein Song loopen</option>
              <option value="cycle">Alle Songs abwechselnd</option>
            </select>
          </label>
          <label className="profile-music-select-shell">
            <span>{props.musicPlaybackMode === "cycle" ? "Aktueller Song" : "Song"}</span>
            <select
              value={props.selectedMusicTrackId ?? ""}
              onChange={(event) => props.onSelectMusicTrack(event.target.value)}
              disabled={props.musicTracks.length === 0}
            >
              {props.musicTracks.length === 0 ? (
                <option value="">Keine Songs gefunden</option>
              ) : (
                props.musicTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))
              )}
            </select>
          </label>
          <button
            type="button"
            className={`menu-action menu-toggle-action profile-music-toggle ${props.musicPaused ? "is-muted" : "is-active"}`}
            aria-pressed={!props.musicPaused}
            onClick={toggleMusicPaused}
            disabled={props.musicTracks.length === 0}
          >
            <span className="menu-toggle-copy">
              <strong>{props.musicPaused ? "Musik starten" : "Musik pausieren"}</strong>
              <span>
                {props.musicPlaybackMode === "cycle"
                  ? selectedMusicTrack
                    ? `Gerade: ${selectedMusicTrack.name}`
                    : "Keine Songs verfügbar"
                  : selectedMusicTrack?.name ?? "Keine Songs verfügbar"}
              </span>
            </span>
            <span className={`status-pill ${props.musicPaused ? "muted" : ""}`}>
              {props.musicPaused ? "Pausiert" : props.musicPlaybackMode === "cycle" ? "Playlist" : "Loop"}
            </span>
          </button>
        </div>
        <button
          type="button"
          className={`menu-action menu-toggle-action ${props.soundMuted ? "is-muted" : "is-active"}`}
          aria-pressed={!props.soundMuted}
          onClick={toggleSoundMuted}
        >
          <span className="menu-toggle-copy">
            <strong>UI-Sounds</strong>
            <span>{props.soundMuted ? "Stumm geschaltet" : "Aktiv und bereit"}</span>
          </span>
          <span className={`status-pill ${props.soundMuted ? "muted" : ""}`}>{props.soundMuted ? "Aus" : "An"}</span>
        </button>
        <button
          type="button"
          className={`menu-action menu-toggle-action ${
            !props.hapticsSupported || props.hapticsMuted ? "is-muted" : "is-active"
          }`}
          aria-pressed={props.hapticsSupported && !props.hapticsMuted}
          onClick={toggleHapticsMuted}
          disabled={!props.hapticsSupported}
        >
          <span className="menu-toggle-copy">
            <strong>Haptik</strong>
            <span>
              {!props.hapticsSupported
                ? "Auf diesem Gerät nicht verfügbar"
                : props.hapticsMuted
                  ? "Deaktiviert"
                  : "Aktiv für relevantes Feedback"}
            </span>
          </span>
          <span className={`status-pill ${!props.hapticsSupported || props.hapticsMuted ? "muted" : ""}`}>
            {!props.hapticsSupported ? "Nicht verfügbar" : props.hapticsMuted ? "Aus" : "An"}
          </span>
        </button>
        <div className="profile-board-panel">
          <div className="profile-music-copy">
            <strong>Feldstil</strong>
            <span>Wähle, welche Elemente auf dem Spielfeld angezeigt werden.</span>
          </div>
          <label className="profile-music-select-shell">
            <span>Figurenstil</span>
            <select
              value={props.boardVisualSettings.pieceStyle}
              onChange={(event) => setBoardPieceStyle(event.target.value as BoardVisualSettings["pieceStyle"])}
            >
              <option value="minimal">Minimalistisch wie Brettspiel</option>
              <option value="stylized">Detailliert stilisiert</option>
            </select>
          </label>
          <div className="profile-board-toggle-grid" role="group" aria-label="Feldstil">
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.props ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.props}
              onClick={() => toggleBoardVisualSetting("props")}
            >
              <span className="menu-toggle-copy">
                <strong>Props</strong>
                <span>Schafe, Kakteen, Scheunen, Ziegelstapel und andere Feldobjekte.</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.props ? "" : "muted"}`}>
                {props.boardVisualSettings.props ? "An" : "Aus"}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.objects ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.objects}
              onClick={() => toggleBoardVisualSetting("objects")}
            >
              <span className="menu-toggle-copy">
                <strong>Objects</strong>
                <span>Berge, Baumgruppen, Felsobjekte und andere fruehere 3D-Terrain-Objekte.</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.objects ? "" : "muted"}`}>
                {props.boardVisualSettings.objects ? "An" : "Aus"}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.textures ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.textures}
              onClick={() => toggleBoardVisualSetting("textures")}
            >
              <span className="menu-toggle-copy">
                <strong>Texturen</strong>
                <span>Detaillierte Boden- und Oberflächenstrukturen auf den Feldern.</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.textures ? "" : "muted"}`}>
                {props.boardVisualSettings.textures ? "An" : "Aus"}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.terrainRelief ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.terrainRelief}
              onClick={() => toggleBoardVisualSetting("terrainRelief")}
            >
              <span className="menu-toggle-copy">
                <strong>3D-Terrain</strong>
                <span>Berge, Bäume, Dünen und andere Höhenformen kommen oben drauf.</span>
              </span>
                <span className={`status-pill ${props.boardVisualSettings.terrainRelief ? "" : "muted"}`}>
                  {props.boardVisualSettings.terrainRelief ? "An" : "Aus"}
                </span>
              </button>
              <button
                type="button"
                className={`menu-action menu-toggle-action ${props.boardVisualSettings.resourceIcons ? "is-active" : "is-muted"}`}
                aria-pressed={props.boardVisualSettings.resourceIcons}
                onClick={() => toggleBoardVisualSetting("resourceIcons")}
              >
                <span className="menu-toggle-copy">
                  <strong>Ressourcen-Icons</strong>
                  <span>Zeigt die Ressourcensymbole direkt auf den Feldmarkern an.</span>
                </span>
                <span className={`status-pill ${props.boardVisualSettings.resourceIcons ? "" : "muted"}`}>
                  {props.boardVisualSettings.resourceIcons ? "An" : "Aus"}
                </span>
              </button>
          </div>
        </div>
        <button
          type="button"
          className="menu-action"
          onClick={() => {
            closePanel();
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
              closePanel();
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
              closePanel();
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
              closePanel();
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
            closePanel();
            void props.onLogout();
          }}
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}

export function ProfileMenu(props: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasOpenStateChangedRef = useRef(false);

  useEffect(() => {
    if (!hasOpenStateChangedRef.current) {
      hasOpenStateChangedRef.current = true;
      return;
    }

    void uiHapticsManager.play("soft");
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
        <ProfileMenuPanel {...props} onRequestClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
