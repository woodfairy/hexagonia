import type { FormEvent } from "react";
import type { AuthMode } from "../../ui";

export function AuthScreen(props: {
  authMode: AuthMode;
  authForm: {
    email: string;
    username: string;
    password: string;
  };
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthFieldChange: (field: "email" | "username" | "password", value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="screen-shell auth-shell">
      <article className="surface hero-surface">
        <div className="eyebrow">Premium Tabletop Plattform</div>
        <h1>Hexagonia</h1>
        <p className="hero-copy">
          Private Echtzeit-Partien im Browser, optimiert fuer Desktop, iPhone und iPad.
        </p>
        <div className="hero-metrics">
          <div className="metric-card">
            <strong>Echtzeit</strong>
            <span>Serverautoritativ ueber WebSockets</span>
          </div>
          <div className="metric-card">
            <strong>Mobil tauglich</strong>
            <span>Viewport-feste UI ohne Seitenscrollen</span>
          </div>
          <div className="metric-card">
            <strong>Private Raeume</strong>
            <span>Schneller Einstieg per Code und Einladung</span>
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
            <span>E-Mail</span>
            <input
              autoComplete="email"
              type="email"
              value={props.authForm.email}
              onChange={(event) => props.onAuthFieldChange("email", event.target.value)}
            />
          </label>

          {props.authMode === "register" ? (
            <label className="field">
              <span>Nutzername</span>
              <input
                autoComplete="username"
                type="text"
                value={props.authForm.username}
                onChange={(event) => props.onAuthFieldChange("username", event.target.value)}
              />
            </label>
          ) : null}

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
