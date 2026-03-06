import type { FormEvent } from "react";
import type { AuthMode } from "../../ui";

export function AuthScreen(props: {
  authMode: AuthMode;
  authForm: {
    username: string;
    password: string;
  };
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthFieldChange: (field: "username" | "password", value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="screen-shell auth-shell">
      <article className="surface hero-surface">
        <div className="eyebrow">Mit Freunden spielen</div>
        <h1>Hexagonia</h1>
        <p className="hero-copy">Erstelle einen privaten Spieltisch, teile den Code und starte direkt zusammen.</p>
        <div className="hero-metrics">
          <div className="metric-card">
            <strong>Eigener Tisch</strong>
            <span>Raum erstellen und deine Runde selbst starten.</span>
          </div>
          <div className="metric-card">
            <strong>Schnell drin</strong>
            <span>Mit einem Code kommen alle ohne Umwege in denselben Raum.</span>
          </div>
          <div className="metric-card">
            <strong>Alles an einem Ort</strong>
            <span>Konto anlegen, anmelden und wieder an offene Partien anknüpfen.</span>
          </div>
        </div>
      </article>

      <article className="surface auth-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">Konto</div>
            <h2>{props.authMode === "login" ? "Anmelden" : "Registrieren"}</h2>
          </div>
          <div className="segmented-control">
            <button
              type="button"
              className={props.authMode === "login" ? "is-active" : ""}
              onClick={() => props.onAuthModeChange("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={props.authMode === "register" ? "is-active" : ""}
              onClick={() => props.onAuthModeChange("register")}
            >
              Konto
            </button>
          </div>
        </div>

        <form className="auth-form" onSubmit={props.onSubmit}>
          <label className="field">
            <span>Nutzername</span>
            <input
              autoComplete="username"
              type="text"
              value={props.authForm.username}
              onChange={(event) => props.onAuthFieldChange("username", event.target.value)}
            />
          </label>

          <label className="field">
            <span>Passwort</span>
            <input
              autoComplete={props.authMode === "login" ? "current-password" : "new-password"}
              type="password"
              value={props.authForm.password}
              onChange={(event) => props.onAuthFieldChange("password", event.target.value)}
            />
          </label>

          <button className="primary-button auth-submit" type="submit">
            {props.authMode === "login" ? "Jetzt anmelden" : "Konto anlegen"}
          </button>
        </form>
      </article>
    </section>
  );
}
