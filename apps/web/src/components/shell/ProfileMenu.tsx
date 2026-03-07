import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@hexagonia/shared";
import { uiSoundManager, type MusicPlaybackMode, type MusicTrack } from "../../audio/uiSoundManager";
import type { BoardVisualSettings } from "../../boardVisuals";
import type { ConnectionState } from "../../ui";
import { renderConnectionLabel, toInitials } from "../../ui";

export function ProfileMenu(props: {
  boardVisualSettings: BoardVisualSettings;
  session: AuthUser;
  connectionState: ConnectionState;
  soundMuted: boolean;
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
  onToggleMusicPaused: () => void;
  onLogout: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasOpenStateChangedRef = useRef(false);
  const selectedMusicTrack =
    props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const musicSummary =
    props.musicTracks.length === 0
      ? "Keine Songs in assets/songs gefunden"
      : props.musicPlaybackMode === "cycle"
        ? `Alle ${props.musicTracks.length} Songs laufen nacheinander`
        : `${selectedMusicTrack?.name ?? "Kein Song"} in Dauerschleife`;
  const toggleBoardVisualSetting = (setting: keyof BoardVisualSettings) => {
    props.onBoardVisualSettingsChange({
      ...props.boardVisualSettings,
      [setting]: !props.boardVisualSettings[setting]
    });
  };

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
            <div className="profile-board-panel">
              <div className="profile-music-copy">
                <strong>Feldstil</strong>
                <span>Additiv statt Presets: Props bleiben aktiv, wenn du Texturen oder 3D-Terrain dazuschaltest.</span>
              </div>
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
                  className={`menu-action menu-toggle-action ${props.boardVisualSettings.textures ? "is-active" : "is-muted"}`}
                  aria-pressed={props.boardVisualSettings.textures}
                  onClick={() => toggleBoardVisualSetting("textures")}
                >
                  <span className="menu-toggle-copy">
                    <strong>Texturen</strong>
                    <span>Detaillierte Boden- und Oberflaechenstrukturen auf den Feldern.</span>
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
                    <span>Berge, Baume, Duenen und andere Hoehenformen kommen oben drauf.</span>
                  </span>
                  <span className={`status-pill ${props.boardVisualSettings.terrainRelief ? "" : "muted"}`}>
                    {props.boardVisualSettings.terrainRelief ? "An" : "Aus"}
                  </span>
                </button>
              </div>
            </div>
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
                onClick={() => props.onToggleMusicPaused()}
                disabled={props.musicTracks.length === 0}
              >
                <span className="menu-toggle-copy">
                  <strong>{props.musicPaused ? "Musik starten" : "Musik pausieren"}</strong>
                  <span>
                    {props.musicPlaybackMode === "cycle"
                      ? selectedMusicTrack
                        ? `Gerade: ${selectedMusicTrack.name}`
                        : "Keine Songs verfuegbar"
                      : selectedMusicTrack?.name ?? "Keine Songs verfuegbar"}
                  </span>
                </span>
                <span className={`status-pill ${props.musicPaused ? "muted" : ""}`}>
                  {props.musicPaused ? "Pausiert" : props.musicPlaybackMode === "cycle" ? "Playlist" : "Loop"}
                </span>
              </button>
            </div>
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
