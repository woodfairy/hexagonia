import type { AuthUser } from "@hexagonia/shared";
import type { MusicTrack } from "../../audio/uiSoundManager";
import type { ConnectionState } from "../../ui";
import { renderConnectionLabel } from "../../ui";
import { ProfileMenu } from "./ProfileMenu";
import hexaLogo from "../../../../../assets/img/hexa.png";

export function AppHeader(props: {
  session: AuthUser | null | undefined;
  connectionState: ConnectionState;
  connectionStatusText: string;
  eyebrow: string;
  title: string;
  meta?: string;
  soundMuted: boolean;
  musicTracks: ReadonlyArray<MusicTrack>;
  selectedMusicTrackId: string | null;
  musicPaused: boolean;
  roomCode?: string;
  onCopyInviteLink?: () => void | Promise<void>;
  onNavigateHome: () => void;
  onNavigateAdmin?: () => void;
  onCopyRoomCode?: () => void | Promise<void>;
  onSelectMusicTrack: (trackId: string) => void;
  onToggleSoundMuted: () => void;
  onToggleMusicPaused: () => void;
  onLogout: () => void | Promise<void>;
}) {
  const profileRoomProps = props.roomCode
    ? {
        roomCode: props.roomCode,
        ...(props.onCopyRoomCode ? { onCopyRoomCode: props.onCopyRoomCode } : {}),
        ...(props.onCopyInviteLink ? { onCopyInviteLink: props.onCopyInviteLink } : {})
      }
    : {};

  return (
    <header className="app-header">
      <div className="brand-cluster">
        <button type="button" className="brand-mark" onClick={props.onNavigateHome} aria-label="Zur Startseite von Hexagonia">
          <img src={hexaLogo} alt="Hexagonia" className="brand-mark-image" />
        </button>
        <div className="brand-copy">
          <span className="eyebrow">{props.eyebrow}</span>
          <div className="brand-title-row">
            <strong>{props.title}</strong>
            {props.meta ? <span className="brand-meta">{props.meta}</span> : null}
          </div>
        </div>
      </div>

      <div className="header-utilities">
        <div className={`connection-indicator is-${props.connectionState}`} title={props.connectionStatusText}>
          <span className="connection-dot" aria-hidden="true" />
          <span>{renderConnectionLabel(props.session, props.connectionState)}</span>
        </div>
        {props.session ? (
          <ProfileMenu
            connectionState={props.connectionState}
            musicPaused={props.musicPaused}
            musicTracks={props.musicTracks}
            selectedMusicTrackId={props.selectedMusicTrackId}
            session={props.session}
            soundMuted={props.soundMuted}
            onLogout={props.onLogout}
            onNavigateHome={props.onNavigateHome}
            onSelectMusicTrack={props.onSelectMusicTrack}
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
