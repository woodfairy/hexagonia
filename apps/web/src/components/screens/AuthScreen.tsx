import type { FormEvent } from "react";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { createText, resolveText, useI18n } from "../../i18n";
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
  authSubmitPending: boolean;
}) {
  const { locale } = useI18n();
  const text = (de: string, en: string) => resolveText(locale, createText(de, en));

  const isLogin = props.authMode === "login";

  return (
    <section className="screen-shell auth-shell">
      <article className="surface hero-surface">
        <div className="eyebrow">{text("Mit Freunden spielen", "Play with friends")}</div>
        <h1>Hexagonia</h1>
        <p className="hero-copy">
          {text(
            "Erstelle einen privaten Spieltisch, teile den Code und starte direkt zusammen.",
            "Create a private table, share the code, and start playing together right away."
          )}
        </p>
        <div className="hero-metrics">
          <div className="metric-card">
            <strong>{text("Eigener Tisch", "Private table")}</strong>
            <span>{text("Raum erstellen und deine Runde selbst starten.", "Create a room and start your round yourself.")}</span>
          </div>
          <div className="metric-card">
            <strong>{text("Schnell drin", "Quick to join")}</strong>
            <span>{text("Mit einem Code kommen alle ohne Umwege in denselben Raum.", "A single code gets everyone into the same room without detours.")}</span>
          </div>
          <div className="metric-card">
            <strong>{text("Alles an einem Ort", "Everything in one place")}</strong>
            <span>{text("Konto anlegen, anmelden und wieder an offene Partien anknüpfen.", "Create an account, sign in, and jump back into unfinished matches.")}</span>
          </div>
        </div>
      </article>

      <article className="surface auth-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">{text("Konto", "Account")}</div>
            <h2>{isLogin ? text("Anmelden", "Sign in") : text("Registrieren", "Register")}</h2>
          </div>
          <div className="segmented-control">
            <button type="button" className={isLogin ? "is-active" : ""} onClick={() => props.onAuthModeChange("login")}>
              {text("Login", "Login")}
            </button>
            <button
              type="button"
              className={props.authMode === "register" ? "is-active" : ""}
              onClick={() => props.onAuthModeChange("register")}
            >
              {text("Konto", "Account")}
            </button>
          </div>
        </div>

        <form className="auth-form" onSubmit={props.onSubmit}>
          <label className="field">
            <span>{text("Nutzername", "Username")}</span>
            <input
              autoComplete="username"
              type="text"
              inputMode="text"
              pattern="[A-Za-z0-9]*"
              value={props.authForm.username}
              onChange={(event) => props.onAuthFieldChange("username", event.target.value)}
            />
          </label>

          <label className="field">
            <span>{text("Passwort", "Password")}</span>
            <input
              autoComplete={isLogin ? "current-password" : "new-password"}
              type="password"
              value={props.authForm.password}
              onChange={(event) => props.onAuthFieldChange("password", event.target.value)}
            />
          </label>

          <button className="primary-button auth-submit" type="submit" disabled={props.authSubmitPending}>
            <LoadingButtonContent
              loading={props.authSubmitPending}
              idleLabel={isLogin ? text("Jetzt anmelden", "Sign in now") : text("Konto anlegen und loslegen", "Create account and start")}
              loadingLabel={isLogin ? text("Anmeldung läuft...", "Signing in...") : text("Registrierung läuft...", "Registering...")}
            />
          </button>

          {props.authMode === "register" ? (
            <p className="recaptcha-note">
              {text("Diese Seite ist durch reCAPTCHA geschützt. Es gelten die Google", "This site is protected by reCAPTCHA and the Google")}{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                {text("Datenschutzerklärung", "Privacy Policy")}
              </a>{" "}
              {text("und", "and")}{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
                {text("Nutzungsbedingungen", "Terms of Service")}
              </a>
              .
            </p>
          ) : null}
        </form>
      </article>
    </section>
  );
}
