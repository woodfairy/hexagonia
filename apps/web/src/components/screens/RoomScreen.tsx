import type { AuthUser, RoomDetails } from "@hexagonia/shared";

export function RoomScreen(props: {
  room: RoomDetails;
  session: AuthUser;
  presence: string[];
  onJoinSeat: (seatIndex: number) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onCopyCode: () => void;
}) {
  const currentSeat = props.room.seats.find((seat) => seat.userId === props.session.id) ?? null;
  const seatedPlayers = props.room.seats.filter((seat) => seat.userId);
  const readyPlayers = seatedPlayers.filter((seat) => seat.ready).length;
  const canStart =
    props.room.ownerUserId === props.session.id &&
    seatedPlayers.length >= 3 &&
    seatedPlayers.length <= 4 &&
    readyPlayers === seatedPlayers.length;

  return (
    <section className="screen-shell room-shell">
      <div className="room-main-grid">
        <article className="surface room-hero">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Privater Raum</div>
              <h1>Code {props.room.code}</h1>
            </div>
            <button type="button" className="ghost-button" onClick={props.onCopyCode}>
              Code kopieren
            </button>
          </div>

          <div className="room-kpi-row">
            <div className="summary-card">
              <strong>{seatedPlayers.length}/4 Spieler</strong>
              <span>Besetzte Plaetze</span>
            </div>
            <div className="summary-card">
              <strong>{readyPlayers}/{seatedPlayers.length || 1}</strong>
              <span>Bereit</span>
            </div>
            <div className="summary-card">
              <strong>{props.room.ownerUserId === props.session.id ? "Du" : "Host"}</strong>
              <span>Raumleitung</span>
            </div>
          </div>

          <div className="seat-grid">
            {props.room.seats.map((seat) => {
              const online = seat.userId ? props.presence.includes(seat.userId) : false;
              const occupied = !!seat.userId;
              const mine = seat.userId === props.session.id;
              return (
                <article key={seat.index} className={`seat-card ${mine ? "is-mine" : ""}`}>
                  <div className="seat-card-top">
                    <span className={`seat-chip seat-${seat.color}`}>Platz {seat.index + 1}</span>
                    {occupied ? <span className={`online-indicator ${online ? "is-online" : "is-offline"}`} /> : null}
                  </div>
                  <strong>{seat.username ?? "Offen"}</strong>
                  <span>{seat.ready ? "Bereit" : occupied ? "Wartet" : "Verfuegbar"}</span>
                  <span className="muted-copy">
                    {occupied ? (online ? "Online im Raum" : "Nicht verbunden") : "Jeder eingeladene Spieler kann beitreten"}
                  </span>
                  {!occupied && props.room.status === "open" ? (
                    <button className="primary-button" type="button" onClick={() => props.onJoinSeat(seat.index)}>
                      Platz nehmen
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </article>

        <div className="room-side-stack">
          <article className="surface room-control-card">
            <div className="eyebrow">Steuerung</div>
            <h2>Bereit machen</h2>
            <p className="muted-copy">Alle sitzenden Spieler muessen bereit sein, bevor die Partie gestartet werden kann.</p>
            <div className="room-action-stack">
              {currentSeat ? (
                <button
                  className={currentSeat.ready ? "secondary-button is-accent" : "primary-button"}
                  type="button"
                  onClick={() => props.onReady(!currentSeat.ready)}
                >
                  {currentSeat.ready ? "Nicht mehr bereit" : "Bereit"}
                </button>
              ) : null}
              {canStart ? (
                <button className="primary-button" type="button" onClick={props.onStart}>
                  Partie starten
                </button>
              ) : null}
              <button className="ghost-button" type="button" onClick={props.onLeave}>
                Raum verlassen
              </button>
            </div>
          </article>

          <article className="surface room-note-card">
            <div className="eyebrow">Hinweis</div>
            <h2>Mobile first</h2>
            <p className="muted-copy">
              Die fertige Partie oeffnet ohne Seitenscrollen. Raumcode und Spielstatus bleiben auch auf kleineren Geraeten direkt greifbar.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
