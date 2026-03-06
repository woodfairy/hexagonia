import type { AuthUser } from "@hexagonia/shared";

export function LobbyScreen(props: {
  session: AuthUser;
  joinCode: string;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
}) {
  return (
    <section className="screen-shell lobby-shell">
      <article className="surface lobby-hero">
        <div className="eyebrow">Spielzentrale</div>
        <h1>Willkommen, {props.session.username}</h1>
        <p className="hero-copy">
          Starte einen privaten Spieltisch oder tritt einem bestehenden Raum ueber den Code bei.
        </p>
        <div className="lobby-summary-grid">
          <div className="summary-card">
            <strong>Basis-Spiel</strong>
            <span>3-4 Spieler, private Raeume, Reconnect im Browser.</span>
          </div>
          <div className="summary-card">
            <strong>Plattform</strong>
            <span>Feste Produktshell, mobile first und optimiert fuer Safari.</span>
          </div>
        </div>
      </article>

      <div className="lobby-side-grid">
        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Schnellstart</div>
              <h2>Neuen Raum eroefnen</h2>
            </div>
          </div>
          <p>Lege sofort einen privaten 4er-Raum an und uebernimm Platz 1.</p>
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
          <span className="muted-copy">Codes sind kompakt gehalten, damit Einladungen mobil schnell funktionieren.</span>
        </article>
      </div>
    </section>
  );
}
