import type { AuthUser, RoomDetails } from "@hexagonia/shared";
import { PlayerColorBadge } from "../shared/PlayerIdentity";
import { renderPlayerColorLabel } from "../../ui";

export function LobbyScreen(props: {
  session: AuthUser;
  rooms: RoomDetails[];
  joinCode: string;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onOpenRoom: (roomId: string) => void;
  onResumeMatch: (matchId: string) => void;
}) {
  return (
    <section className="screen-shell lobby-shell">
      <div className="lobby-primary-stack">
        <article className="surface lobby-hero">
          <div className="eyebrow">Spielzentrale</div>
          <h1>Willkommen, {props.session.username}</h1>
          <p className="hero-copy">
            Starte einen privaten Spieltisch oder steig direkt wieder in deine laufenden Räume und Partien ein.
          </p>
          <div className="lobby-summary-grid">
            <div className="summary-card">
              <strong>Sofort starten</strong>
              <span>Privaten Raum anlegen, Freunde einladen und die Runde aufsetzen.</span>
            </div>
            <div className="summary-card">
              <strong>Nahtlos fortsetzen</strong>
              <span>Offene Räume und aktive Partien bleiben für dich griffbereit.</span>
            </div>
          </div>
        </article>

        <article className="surface resume-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Fortsetzen</div>
              <h2>Deine Räume und Partien</h2>
            </div>
          </div>

          <div className="scroll-list resume-list">
            {props.rooms.length ? (
              props.rooms.map((room) => {
                const occupiedSeats = room.seats.filter((seat) => seat.userId).length;
                const mySeat = room.seats.find((seat) => seat.userId === props.session.id);
                const canResumeMatch = room.status === "in_match" && !!room.matchId;
                const meta = [
                  room.status === "in_match" ? "Laufende Partie" : "Raum offen",
                  `${occupiedSeats}/4 Spieler`,
                  mySeat ? `Du auf Platz ${mySeat.index + 1}` : "Teilnahme gespeichert"
                ].join(" - ");

                return (
                  <article key={room.id} className="resume-card">
                    <div className="resume-card-head">
                      <div>
                        <strong>Code {room.code}</strong>
                        <span>{meta}</span>
                      </div>
                      <span className={`status-pill ${canResumeMatch ? "is-warning" : ""}`}>
                        {canResumeMatch ? "Live" : "Bereit"}
                      </span>
                    </div>
                    {mySeat ? (
                      <div className="resume-card-meta-row">
                        <PlayerColorBadge color={mySeat.color} label={`Deine Farbe: ${renderPlayerColorLabel(mySeat.color)}`} compact />
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
                        {canResumeMatch ? "Partie fortsetzen" : "Raum öffnen"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-state">Noch keine offenen Räume oder laufenden Partien in deiner Liste.</div>
            )}
          </div>
        </article>
      </div>

      <div className="lobby-side-grid">
        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Schnellstart</div>
              <h2>Neuen Raum eröffnen</h2>
            </div>
          </div>
          <p>Lege sofort einen privaten 4er-Raum an und übernimm Platz 1.</p>
          <button className="primary-button large-button" type="button" onClick={props.onCreateRoom}>
            Privaten Raum erstellen
          </button>
        </article>

        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Direkter Beitritt</div>
              <h2>Per Code eintreten</h2>
            </div>
          </div>
          <div className="code-join-row">
            <input
              maxLength={6}
              placeholder="RAUMCODE"
              value={props.joinCode}
              onChange={(event) => props.onJoinCodeChange(event.target.value.toUpperCase())}
            />
            <button className="primary-button" type="button" onClick={props.onJoinByCode}>
              Beitreten
            </button>
          </div>
          <span className="muted-copy">Code eingeben, bestätigen und direkt in den Raum springen.</span>
        </article>
      </div>
    </section>
  );
}
