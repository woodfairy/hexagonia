import type { AuthUser, RoomDetails } from "@hexagonia/shared";
import { createText, resolveText, useI18n } from "../../i18n";
import { renderPlayerColorLabel } from "../../ui";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { PlayerColorBadge } from "../shared/PlayerIdentity";

export function LobbyScreen(props: {
  session: AuthUser;
  rooms: RoomDetails[];
  joinCode: string;
  createRoomPending: boolean;
  joinByCodePending: boolean;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onOpenRoom: (roomId: string) => void;
  onResumeMatch: (matchId: string) => void;
}) {
  const { locale } = useI18n();

  return (
    <section className="screen-shell lobby-shell">
      <article className="surface resume-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">{resolveText(locale, createText("Fortsetzen", "Resume"))}</div>
            <h2>{resolveText(locale, createText("Deine Räume und Partien", "Your rooms and matches"))}</h2>
          </div>
        </div>

        <div className="scroll-list resume-list">
          {props.rooms.length ? (
            props.rooms.map((room) => {
              const occupiedSeats = room.seats.filter((seat) => seat.userId).length;
              const mySeat = room.seats.find((seat) => seat.userId === props.session.id);
              const canResumeMatch = room.status === "in_match" && !!room.matchId;
              const meta = [
                resolveText(locale, room.status === "in_match" ? createText("Laufende Partie", "Live match") : createText("Raum offen", "Room open")),
                locale === "en" ? `${occupiedSeats}/6 players` : `${occupiedSeats}/6 Spieler`,
                mySeat
                  ? locale === "en"
                    ? `You at seat ${mySeat.index + 1}`
                    : `Du auf Platz ${mySeat.index + 1}`
                  : resolveText(locale, createText("Teilnahme gespeichert", "Participation saved"))
              ].join(" - ");

              return (
                <article key={room.id} className="resume-card">
                  <div className="resume-card-head">
                    <div>
                      <strong>{`Code ${room.code}`}</strong>
                      <span>{meta}</span>
                    </div>
                    <span className={`status-pill ${canResumeMatch ? "is-warning" : ""}`}>
                      {resolveText(locale, canResumeMatch ? createText("Live", "Live") : createText("Bereit", "Ready"))}
                    </span>
                  </div>
                  {mySeat ? (
                    <div className="resume-card-meta-row">
                      <PlayerColorBadge
                        color={mySeat.color}
                        label={
                          locale === "en"
                            ? `Your color: ${renderPlayerColorLabel(locale, mySeat.color)}`
                            : `Deine Farbe: ${renderPlayerColorLabel(locale, mySeat.color)}`
                        }
                        compact
                      />
                    </div>
                  ) : null}
                  <div className="resume-card-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() =>
                        canResumeMatch && room.matchId ? props.onResumeMatch(room.matchId) : props.onOpenRoom(room.id)
                      }
                    >
                      {resolveText(locale, canResumeMatch ? createText("Partie fortsetzen", "Resume match") : createText("Raum öffnen", "Open room"))}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{resolveText(locale, createText("Noch keine offenen Räume oder laufenden Partien in deiner Liste.", "No open rooms or running matches in your list yet."))}</div>
          )}
        </div>
      </article>

      <div className="lobby-side-grid">
        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{resolveText(locale, createText("Schnellstart", "Quick start"))}</div>
              <h2>{resolveText(locale, createText("Neuen Raum eröffnen", "Open a new room"))}</h2>
            </div>
          </div>
          <p>{resolveText(locale, createText("Erstelle direkt einen privaten Raum und starte als Host auf Platz 1.", "Create a private room instantly and start as host in seat 1."))}</p>
          <button
            className="primary-button large-button"
            type="button"
            onClick={props.onCreateRoom}
            disabled={props.createRoomPending}
          >
            <LoadingButtonContent
              loading={props.createRoomPending}
              idleLabel={resolveText(locale, createText("Privaten Raum erstellen", "Create private room"))}
              loadingLabel={resolveText(locale, createText("Raum wird erstellt...", "Creating room..."))}
            />
          </button>
        </article>

        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{resolveText(locale, createText("Direkter Beitritt", "Direct join"))}</div>
              <h2>{resolveText(locale, createText("Per Code eintreten", "Join by code"))}</h2>
            </div>
          </div>
          <div className="code-join-row">
            <input
              maxLength={6}
              placeholder={resolveText(locale, createText("RAUMCODE", "ROOM CODE"))}
              value={props.joinCode}
              onChange={(event) => props.onJoinCodeChange(event.target.value.toUpperCase())}
            />
            <button className="primary-button" type="button" onClick={props.onJoinByCode} disabled={props.joinByCodePending}>
              <LoadingButtonContent
                loading={props.joinByCodePending}
                idleLabel={resolveText(locale, createText("Beitreten", "Join"))}
                loadingLabel={resolveText(locale, createText("Beitritt läuft...", "Joining..."))}
              />
            </button>
          </div>
          <span className="muted-copy">{resolveText(locale, createText("Code eingeben und direkt in den Raum springen.", "Enter a code and jump straight into the room."))}</span>
        </article>
      </div>
    </section>
  );
}
