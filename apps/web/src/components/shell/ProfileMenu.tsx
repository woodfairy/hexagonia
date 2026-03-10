import { useEffect, useRef, useState } from "react";
import type { AuthUser, Locale } from "@hexagonia/shared";
import { uiHapticsManager } from "../../audio/uiHapticsManager";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import type { BoardVisualSettings } from "../../boardVisuals";
import { LocaleSelect } from "../shared/LocaleSelect";
import { PopupSelect } from "../shared/PopupSelect";
import {
  createText,
  normalizeLocale,
  resolveText,
  useI18n
} from "../../i18n";
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
  onLocaleChange: (locale: Locale) => void;
  onLogout: () => void | Promise<void>;
}

type ToggleableBoardVisualSetting = "props" | "textures" | "terrainRelief" | "resourceIcons";

export function ProfileMenuPanel(props: ProfileMenuProps & { inline?: boolean; onRequestClose?: () => void }) {
  const { locale } = useI18n();
  const activeLocale = normalizeLocale(props.session.locale);
  const selectedMusicTrack =
    props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const emptyTrackLabel = resolveText(locale, createText("Kein Song", "No track"));
  const musicModeOptions: ReadonlyArray<{ value: MusicPlaybackMode; label: string }> = [
    { value: "single", label: resolveText(locale, createText("Ein Song loopen", "Loop one song")) },
    { value: "cycle", label: resolveText(locale, createText("Alle Songs abwechselnd", "Cycle all songs")) }
  ];
  const musicTrackOptions = props.musicTracks.length
    ? props.musicTracks.map((track) => ({
        value: track.id,
        label: track.name
      }))
    : [{ value: "", label: resolveText(locale, createText("Keine Songs gefunden", "No songs found")) }];
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
      aria-label={props.inline ? resolveText(locale, createText("Profil", "Profile")) : undefined}
    >
      <div className="profile-dropdown-head">
        <span className="profile-avatar is-large">{toInitials(props.session.username)}</span>
        <div className="profile-dropdown-copy">
          <strong>{props.session.username}</strong>
          <span>
            {resolveText(
              locale,
              props.session.role === "admin"
                ? createText("Administrator", "Administrator")
                : createText("Spielkonto", "Player account")
            )}
          </span>
          <span className={`profile-status is-${props.connectionState}`}>
            {renderConnectionLabel(locale, props.session, props.connectionState)}
          </span>
        </div>
      </div>

      <div className="profile-dropdown-actions">
        <div className="profile-music-panel">
          <div className="profile-music-copy">
            <strong>{resolveText(locale, createText("Sprache", "Language"))}</strong>
          </div>
          <label className="profile-music-select-shell">
            <LocaleSelect
              value={activeLocale}
              ariaLabel={resolveText(locale, createText("Sprache", "Language"))}
              variant="profile"
              className="profile-popup-select-shell"
              onChange={(nextLocale) => {
                props.onLocaleChange(nextLocale);
                playSoftMenuHaptic();
              }}
            />
          </label>
        </div>

        <div className="profile-music-panel">
          <div className="profile-music-copy">
            <strong>{resolveText(locale, createText("Musikplayer", "Music player"))}</strong>
          </div>
          <label className="profile-music-select-shell">
            <span>{resolveText(locale, createText("Modus", "Mode"))}</span>
            <PopupSelect
              value={props.musicPlaybackMode}
              onChange={props.onMusicPlaybackModeChange}
              ariaLabel={resolveText(locale, createText("Musikmodus", "Music mode"))}
              variant="landing"
              className="profile-popup-select-shell"
              options={musicModeOptions}
              disabled={props.musicTracks.length === 0}
            />
          </label>
          <label className="profile-music-select-shell">
            <span>{resolveText(locale, props.musicPlaybackMode === "cycle" ? createText("Aktueller Song", "Current song") : createText("Song", "Song"))}</span>
            <PopupSelect
              value={props.selectedMusicTrackId ?? ""}
              onChange={props.onSelectMusicTrack}
              ariaLabel={resolveText(locale, createText("Song auswählen", "Choose song"))}
              variant="landing"
              className="profile-popup-select-shell"
              options={musicTrackOptions}
              disabled={props.musicTracks.length === 0}
            />
          </label>
          <button
            type="button"
            className={`menu-action menu-toggle-action profile-music-toggle ${props.musicPaused ? "is-muted" : "is-active"}`}
            aria-pressed={!props.musicPaused}
            onClick={toggleMusicPaused}
            disabled={props.musicTracks.length === 0}
          >
            <span className="menu-toggle-copy">
              <strong>{resolveText(locale, props.musicPaused ? createText("Musik starten", "Start music") : createText("Musik pausieren", "Pause music"))}</strong>
              <span>
                {props.musicPlaybackMode === "cycle"
                  ? selectedMusicTrack
                    ? resolveText(
                        locale,
                        createText("Gerade: {track}", "Now playing: {track}", { track: selectedMusicTrack.name })
                      )
                    : resolveText(locale, createText("Keine Songs verfügbar", "No songs available"))
                  : selectedMusicTrack?.name ?? resolveText(locale, createText("Keine Songs verfügbar", "No songs available"))}
              </span>
            </span>
            <span className={`status-pill ${props.musicPaused ? "muted" : ""}`}>
              {props.musicPaused
                ? resolveText(locale, createText("Pausiert", "Paused"))
                : props.musicPlaybackMode === "cycle"
                  ? resolveText(locale, createText("Playlist", "Playlist"))
                  : resolveText(locale, createText("Loop", "Loop"))}
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
            <strong>{resolveText(locale, createText("UI-Sounds", "UI sounds"))}</strong>
            <span>{resolveText(locale, props.soundMuted ? createText("Stumm geschaltet", "Muted") : createText("Aktiv und bereit", "Active and ready"))}</span>
          </span>
          <span className={`status-pill ${props.soundMuted ? "muted" : ""}`}>
            {resolveText(locale, props.soundMuted ? createText("Aus", "Off") : createText("An", "On"))}
          </span>
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
            <strong>{resolveText(locale, createText("Haptik", "Haptics"))}</strong>
            <span>
              {!props.hapticsSupported
                ? resolveText(locale, createText("Auf diesem Gerät nicht verfügbar", "Not available on this device"))
                : props.hapticsMuted
                  ? resolveText(locale, createText("Deaktiviert", "Disabled"))
                  : resolveText(locale, createText("Aktiv für relevantes Feedback", "Active for relevant feedback"))}
            </span>
          </span>
          <span className={`status-pill ${!props.hapticsSupported || props.hapticsMuted ? "muted" : ""}`}>
            {!props.hapticsSupported
              ? resolveText(locale, createText("Nicht verfügbar", "Unavailable"))
              : resolveText(locale, props.hapticsMuted ? createText("Aus", "Off") : createText("An", "On"))}
          </span>
        </button>

        <div className="profile-board-panel">
          <div className="profile-music-copy">
            <strong>{resolveText(locale, createText("Feldstil", "Board style"))}</strong>
            <span>{resolveText(locale, createText("Wähle, welche Elemente auf dem Spielfeld angezeigt werden.", "Choose which elements are shown on the board."))}</span>
          </div>
          <label className="profile-music-select-shell">
            <span>{resolveText(locale, createText("Figurenstil", "Piece style"))}</span>
            <select
              value={props.boardVisualSettings.pieceStyle}
              onChange={(event) => setBoardPieceStyle(event.target.value as BoardVisualSettings["pieceStyle"])}
            >
              <option value="modern">{resolveText(locale, createText("Modern", "Modern"))}</option>
              <option value="detailed">{resolveText(locale, createText("Detailliert", "Detailed"))}</option>
            </select>
          </label>
          <div className="profile-board-toggle-grid" role="group" aria-label={resolveText(locale, createText("Feldstil", "Board style"))}>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.props ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.props}
              onClick={() => toggleBoardVisualSetting("props")}
            >
              <span className="menu-toggle-copy">
                <strong>{resolveText(locale, createText("Props", "Props"))}</strong>
                <span>{resolveText(locale, createText("Schafe, Kakteen, Scheunen, Ziegelstapel und andere Feldobjekte.", "Sheep, cacti, barns, brick stacks, and other field props."))}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.props ? "" : "muted"}`}>
                {resolveText(locale, props.boardVisualSettings.props ? createText("An", "On") : createText("Aus", "Off"))}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.textures ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.textures}
              onClick={() => toggleBoardVisualSetting("textures")}
            >
              <span className="menu-toggle-copy">
                <strong>{resolveText(locale, createText("Texturen", "Textures"))}</strong>
                <span>{resolveText(locale, createText("Detaillierte Boden- und Oberflächenstrukturen auf den Feldern.", "Detailed ground and surface textures on the tiles."))}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.textures ? "" : "muted"}`}>
                {resolveText(locale, props.boardVisualSettings.textures ? createText("An", "On") : createText("Aus", "Off"))}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.terrainRelief ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.terrainRelief}
              onClick={() => toggleBoardVisualSetting("terrainRelief")}
            >
              <span className="menu-toggle-copy">
                <strong>{resolveText(locale, createText("3D-Terrain", "3D terrain"))}</strong>
                <span>{resolveText(locale, createText("Berge, Bäume, Dünen und andere Höhenformen kommen oben drauf.", "Mountains, trees, dunes, and other terrain relief are layered on top."))}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.terrainRelief ? "" : "muted"}`}>
                {resolveText(locale, props.boardVisualSettings.terrainRelief ? createText("An", "On") : createText("Aus", "Off"))}
              </span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.resourceIcons ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.resourceIcons}
              onClick={() => toggleBoardVisualSetting("resourceIcons")}
            >
              <span className="menu-toggle-copy">
                <strong>{resolveText(locale, createText("Ressourcen-Icons", "Resource icons"))}</strong>
                <span>{resolveText(locale, createText("Zeigt die Ressourcensymbole direkt auf den Feldmarkern an.", "Shows resource icons directly on the tile markers."))}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.resourceIcons ? "" : "muted"}`}>
                {resolveText(locale, props.boardVisualSettings.resourceIcons ? createText("An", "On") : createText("Aus", "Off"))}
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
          {resolveText(locale, createText("Zur Zentrale", "Back to hub"))}
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
            {resolveText(locale, createText("Admin-Konsole", "Admin console"))}
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
            {resolveText(
              locale,
              createText("Raumcode {roomCode} kopieren", "Copy room code {roomCode}", {
                roomCode: props.roomCode
              })
            )}
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
            {resolveText(locale, createText("Einladungslink kopieren", "Copy invite link"))}
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
          {resolveText(locale, createText("Abmelden", "Sign out"))}
        </button>
      </div>
    </div>
  );
}

export function ProfileMenu(props: ProfileMenuProps) {
  const { locale } = useI18n();
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
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (target instanceof Element && target.closest("[data-popup-select-portal='true']")) {
        return;
      }

      if (rootRef.current && !rootRef.current.contains(target)) {
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
          <span>
            {resolveText(
              locale,
              props.session.role === "admin"
                ? createText("Administrator", "Administrator")
                : createText("Spielkonto", "Player account")
            )}
          </span>
        </span>
      </button>

      {open ? <ProfileMenuPanel {...props} onRequestClose={() => setOpen(false)} /> : null}
    </div>
  );
}
