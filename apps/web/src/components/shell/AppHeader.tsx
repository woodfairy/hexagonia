import type { AuthUser, Locale } from "@hexagonia/shared";
import type { ReactNode } from "react";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import type { BoardVisualSettings } from "../../boardVisuals";
import { createText, resolveText, type LocalizedText, useI18n } from "../../i18n";
import type { ConnectionState } from "../../ui";
import { renderConnectionLabel } from "../../ui";
import { ProfileMenu } from "./ProfileMenu";
import hexaLogo from "../../../../../assets/img/hexa.png";

export function AppHeader(props: {
  boardVisualSettings: BoardVisualSettings;
  session: AuthUser | null | undefined;
  connectionState: ConnectionState;
  connectionStatusText: LocalizedText;
  compact?: boolean;
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  soundMuted: boolean;
  hapticsMuted: boolean;
  hapticsSupported: boolean;
  musicTracks: ReadonlyArray<MusicTrack>;
  selectedMusicTrackId: string | null;
  musicPaused: boolean;
  musicPlaybackMode: MusicPlaybackMode;
  roomCode?: string;
  onCopyInviteLink?: () => void | Promise<void>;
  onNavigateHome: () => void;
  onNavigateAdmin?: () => void;
  onCopyRoomCode?: () => void | Promise<void>;
  onBoardVisualSettingsChange: (settings: BoardVisualSettings) => void;
  onMusicPlaybackModeChange: (mode: MusicPlaybackMode) => void;
  onSelectMusicTrack: (trackId: string) => void;
  onToggleSoundMuted: () => void;
  onToggleHapticsMuted: () => void;
  onToggleMusicPaused: () => void;
  onLocaleChange: (locale: Locale) => void;
  onLogout: () => void | Promise<void>;
}) {
  const { locale } = useI18n();
  const profileRoomProps = props.roomCode
    ? {
        roomCode: props.roomCode,
        ...(props.onCopyRoomCode ? { onCopyRoomCode: props.onCopyRoomCode } : {}),
        ...(props.onCopyInviteLink ? { onCopyInviteLink: props.onCopyInviteLink } : {})
      }
    : {};

  return (
    <header className={`app-header ${props.compact ? "is-compact" : ""}`.trim()}>
      <div className="brand-cluster">
        <button
          type="button"
          className="brand-mark"
          onClick={props.onNavigateHome}
          aria-label={resolveText(locale, createText("Zur Startseite von Hexagonia", "Go to the Hexagonia home page"))}
        >
          <img src={hexaLogo} alt="Hexagonia" className="brand-mark-image" />
        </button>
        <span className="brand-wordmark">HEXAGONIA</span>
      </div>

      <div className="header-utilities">
        <div className={`connection-indicator is-${props.connectionState}`} title={resolveText(locale, props.connectionStatusText)}>
          <span className="connection-dot" aria-hidden="true" />
          <span>{renderConnectionLabel(locale, props.session, props.connectionState)}</span>
        </div>
        {props.session ? (
          <ProfileMenu
            boardVisualSettings={props.boardVisualSettings}
            connectionState={props.connectionState}
            musicPaused={props.musicPaused}
            musicPlaybackMode={props.musicPlaybackMode}
            musicTracks={props.musicTracks}
            selectedMusicTrackId={props.selectedMusicTrackId}
            session={props.session}
            soundMuted={props.soundMuted}
            hapticsMuted={props.hapticsMuted}
            hapticsSupported={props.hapticsSupported}
            onBoardVisualSettingsChange={props.onBoardVisualSettingsChange}
            onMusicPlaybackModeChange={props.onMusicPlaybackModeChange}
            onLogout={props.onLogout}
            onLocaleChange={props.onLocaleChange}
            onNavigateHome={props.onNavigateHome}
            onSelectMusicTrack={props.onSelectMusicTrack}
            onToggleHapticsMuted={props.onToggleHapticsMuted}
            onToggleSoundMuted={props.onToggleSoundMuted}
            onToggleMusicPaused={props.onToggleMusicPaused}
            {...(props.onNavigateAdmin ? { onNavigateAdmin: props.onNavigateAdmin } : {})}
            {...profileRoomProps}
          />
        ) : null}
      </div>
    </header>
  );
}
