import { useEffect, useRef, useState } from "react";
import type { AuthUser, ErrorParams, Locale } from "@hexagonia/shared";
import { uiHapticsManager } from "../../audio/uiHapticsManager";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import type { BoardVisualSettings } from "../../boardVisuals";
import { LocaleSelect } from "../shared/LocaleSelect";
import { PopupSelect } from "../shared/PopupSelect";
import { normalizeLocale, useI18n } from "../../i18n";
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
  const { locale, translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);
  const activeLocale = normalizeLocale(props.session.locale);
  const selectedMusicTrack =
    props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const pieceStyleOptions: ReadonlyArray<{ value: BoardVisualSettings["pieceStyle"]; label: string }> = [
    { value: "modern", label: text("profile.board.pieceStyle.modern") },
    { value: "detailed", label: text("profile.board.pieceStyle.detailed") }
  ];
  const musicTrackOptions = props.musicTracks.length
    ? props.musicTracks.map((track) => ({
        value: track.id,
        label: track.name
      }))
    : [{ value: "", label: text("profile.music.noTracksFound") }];
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

  const cycleMusicPlaybackState = () => {
    if (props.musicPaused) {
      props.onMusicPlaybackModeChange("single");
      props.onToggleMusicPaused();
      playSoftMenuHaptic();
      return;
    }

    if (props.musicPlaybackMode === "single") {
      props.onMusicPlaybackModeChange("cycle");
      playSoftMenuHaptic();
      return;
    }

    props.onToggleMusicPaused();
    playSoftMenuHaptic();
  };

  const musicControlTitle = props.musicPaused
    ? text("profile.music.startLoop")
    : props.musicPlaybackMode === "cycle"
      ? text("profile.music.pause")
      : text("profile.music.startPlaylist");
  const musicControlDescription = props.musicPaused
    ? selectedMusicTrack?.name ?? text("profile.music.noneAvailable")
    : selectedMusicTrack
      ? text("profile.music.nowPlaying", { track: selectedMusicTrack.name })
      : text("profile.music.noneAvailable");
  const musicControlStatus = props.musicPaused
    ? text("profile.music.status.paused")
    : props.musicPlaybackMode === "cycle"
      ? text("shared.playlist")
      : text("shared.loop");

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
      aria-label={props.inline ? text("shared.profile") : undefined}
    >
      <div className="profile-dropdown-head">
        <span className="profile-avatar is-large">{toInitials(props.session.username)}</span>
        <div className="profile-dropdown-copy">
          <strong>{props.session.username}</strong>
          <span>
            {text(props.session.role === "admin" ? "profile.role.admin" : "profile.role.playerAccount")}
          </span>
          <span className={`profile-status is-${props.connectionState}`}>
            {renderConnectionLabel(locale, props.session, props.connectionState)}
          </span>
        </div>
      </div>

      <div className="profile-dropdown-actions">
        <div className="profile-music-panel">
          <div className="profile-music-copy">
            <strong>{text("shared.language")}</strong>
          </div>
          <label className="profile-music-select-shell">
            <LocaleSelect
              value={activeLocale}
              ariaLabel={text("shared.language")}
              variant="landing"
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
            <strong>{text("profile.music.title")}</strong>
          </div>
          <label className="profile-music-select-shell">
            <PopupSelect
              value={props.selectedMusicTrackId ?? ""}
              onChange={props.onSelectMusicTrack}
              ariaLabel={text("profile.music.chooseSong")}
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
            onClick={cycleMusicPlaybackState}
            disabled={props.musicTracks.length === 0}
          >
            <span className="menu-toggle-copy">
              <strong>{musicControlTitle}</strong>
              <span>{musicControlDescription}</span>
            </span>
            <span className={`status-pill ${props.musicPaused ? "muted" : ""}`}>{musicControlStatus}</span>
          </button>
        </div>

        <button
          type="button"
          className={`menu-action menu-toggle-action ${props.soundMuted ? "is-muted" : "is-active"}`}
          aria-pressed={!props.soundMuted}
          onClick={toggleSoundMuted}
        >
          <span className="menu-toggle-copy">
            <strong>{text("profile.sound.title")}</strong>
            <span>
              {text(props.soundMuted ? "profile.sound.muted" : "profile.sound.active")}
            </span>
          </span>
          <span className={`status-pill ${props.soundMuted ? "muted" : ""}`}>{text(props.soundMuted ? "shared.off" : "shared.on")}</span>
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
            <strong>{text("profile.haptics.title")}</strong>
            <span>
              {!props.hapticsSupported
                ? text("profile.haptics.unsupported")
                : props.hapticsMuted
                  ? text("profile.haptics.disabled")
                  : text("profile.haptics.active")}
            </span>
          </span>
          <span className={`status-pill ${!props.hapticsSupported || props.hapticsMuted ? "muted" : ""}`}>
            {!props.hapticsSupported ? text("shared.unavailable") : text(props.hapticsMuted ? "shared.off" : "shared.on")}
          </span>
        </button>

        <div className="profile-board-panel">
          <div className="profile-music-copy">
            <strong>{text("profile.board.title")}</strong>
            <span>{text("profile.board.description")}</span>
          </div>
          <label className="profile-music-select-shell">
            <span>{text("profile.board.pieceStyle.label")}</span>
            <PopupSelect
              value={props.boardVisualSettings.pieceStyle}
              onChange={setBoardPieceStyle}
              ariaLabel={text("profile.board.pieceStyle.label")}
              variant="landing"
              className="profile-popup-select-shell"
              options={pieceStyleOptions}
            />
          </label>
          <div
            className="profile-board-toggle-grid"
            role="group"
            aria-label={text("profile.board.title")}
          >
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.props ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.props}
              onClick={() => toggleBoardVisualSetting("props")}
            >
              <span className="menu-toggle-copy">
                <strong>{text("profile.board.props.title")}</strong>
                <span>{text("profile.board.props.description")}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.props ? "" : "muted"}`}>{text(props.boardVisualSettings.props ? "shared.on" : "shared.off")}</span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.textures ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.textures}
              onClick={() => toggleBoardVisualSetting("textures")}
            >
              <span className="menu-toggle-copy">
                <strong>{text("profile.board.textures.title")}</strong>
                <span>{text("profile.board.textures.description")}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.textures ? "" : "muted"}`}>{text(props.boardVisualSettings.textures ? "shared.on" : "shared.off")}</span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.terrainRelief ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.terrainRelief}
              onClick={() => toggleBoardVisualSetting("terrainRelief")}
            >
              <span className="menu-toggle-copy">
                <strong>{text("profile.board.terrainRelief.title")}</strong>
                <span>{text("profile.board.terrainRelief.description")}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.terrainRelief ? "" : "muted"}`}>{text(props.boardVisualSettings.terrainRelief ? "shared.on" : "shared.off")}</span>
            </button>
            <button
              type="button"
              className={`menu-action menu-toggle-action ${props.boardVisualSettings.resourceIcons ? "is-active" : "is-muted"}`}
              aria-pressed={props.boardVisualSettings.resourceIcons}
              onClick={() => toggleBoardVisualSetting("resourceIcons")}
            >
              <span className="menu-toggle-copy">
                <strong>{text("profile.board.resourceIcons.title")}</strong>
                <span>{text("profile.board.resourceIcons.description")}</span>
              </span>
              <span className={`status-pill ${props.boardVisualSettings.resourceIcons ? "" : "muted"}`}>{text(props.boardVisualSettings.resourceIcons ? "shared.on" : "shared.off")}</span>
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
          {text("profile.actions.backToHub")}
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
            {text("profile.actions.adminConsole")}
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
            {text("profile.actions.copyRoomCode", { roomCode: props.roomCode })}
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
            {text("profile.actions.copyInviteLink")}
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
          {text("profile.actions.signOut")}
        </button>
      </div>
    </div>
  );
}

export function ProfileMenu(props: ProfileMenuProps) {
  const { translate: t } = useI18n();
  const text = (key: string) => t(key);
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
          <span>{text(props.session.role === "admin" ? "profile.role.admin" : "profile.role.playerAccount")}</span>
        </span>
      </button>

      {open ? <ProfileMenuPanel {...props} onRequestClose={() => setOpen(false)} /> : null}
    </div>
  );
}
