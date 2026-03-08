import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import { HarborIcon } from "../../resourceIcons";
import { LandingBoardScene } from "../../LandingBoardScene";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import type { AuthMode } from "../../ui";
import hexaLogo from "../../../../../assets/img/hexa.png";

const FLOW_STEPS = [
  {
    title: "Eine Runde starten",
    body: "Ein Tisch ist in Sekunden bereit. Der Ersteller sitzt direkt auf Platz 1 und steuert Setup und Start.",
    meta: "Schnell drin, sofort startklar"
  },
  {
    title: "Code oder Link teilen",
    body: "Freunde kommen per Raumcode oder Invite-Link direkt an denselben Tisch. Kein Matchmaking, kein unnötiger Overhead.",
    meta: "Invite-Code oder Direktlink"
  },
  {
    title: "Partie konfigurieren",
    body: "Beginner-Aufbau oder dynamisch generiertes Brett, manueller Startspieler oder Auswürfeln: die Partie startet mit klaren Regeln.",
    meta: "Beginner oder dynamisch"
  },
  {
    title: "Gemeinsam starten und losspielen",
    body: "Sobald alle am Tisch sind, geht es direkt ins Spiel: bauen, handeln, würfeln und den nächsten starken Zug vorbereiten.",
    meta: "Schnell rein, direkt spielen"
  }
] as const;

const BUILD_FEATURES = [
  {
    icon: "board",
    title: "Jede Runde verändert das Spiel",
    body: "Mit jedem Wurf, jedem Bau und jedem Deal kippt die Lage neu. Gute Positionen entstehen nicht zufällig, sondern weil du sie dir Zug für Zug holst.",
    detail: "Druck, Timing und starke Züge"
  },
  {
    icon: "rooms",
    title: "Mit Freunden direkt am Tisch",
    body: "Runde eröffnen, Code oder Link teilen, Plätze füllen und gemeinsam starten, ohne Umwege bis zur Partie.",
    detail: "Schnell eingeladen, schnell im Spiel"
  },
  {
    icon: "trade",
    title: "Handel, Häfen und gute Deals",
    body: "Handle direkt mit anderen Spielern oder nutze Häfen, um aus knappen Karten doch noch den nächsten starken Zug zu machen.",
    detail: "Spielerhandel und Hafentausch"
  },
  {
    icon: "robber",
    title: "Räuber, Entwicklung und Wertungen",
    body: "Räuberphase, Entwicklungskarten, längste Straße und größte Rittermacht sorgen schon jetzt für echte Wendepunkte in der Partie.",
    detail: "Klassische Spannung, sofort im Browser"
  }
] as const;

const MECHANICS = [
  {
    icon: "board",
    title: "Board und Aufbauphase",
    body: "Start-Siedlungen, Start-Straßen sowie Vorwärts- und Rückwärts-Setup sind klar abgebildet, egal ob ihr mit variablem oder vorbereitetem Brett spielt.",
    accent: "Setup, Platzierung, Häfen"
  },
  {
    icon: "trade",
    title: "Handel mit echter Entscheidungstiefe",
    body: "Deals entstehen nicht nebenbei: Du setzt Angebote, reizt andere Spieler zu Fehlern und holst selbst aus knappen Händen noch starke Züge heraus.",
    accent: "Direkthandel und Banktausch"
  },
  {
    icon: "robber",
    title: "Der Räuber kippt die Lage",
    body: "Wenn der Räuber kommt, werden Karten knapp, starke Felder blockiert und ein gut gesetzter Zug trifft genau den richtigen Gegner.",
    accent: "Räuber, Abwurf und Zielwahl"
  },
  {
    icon: "cards",
    title: "Entwicklungskarten und Wertungen",
    body: "Ritter, Straßenbau, Erfindung, Monopol und Siegpunktkarten können eine Partie komplett drehen, zusammen mit den Wertungen für Straße und Rittermacht.",
    accent: "Karten, Awards, Punkte"
  },
  {
    icon: "rooms",
    title: "Mit Freunden ohne Umwege spielen",
    body: "Du eröffnest eine Runde, teilst Code oder Link und sitzt direkt mit deinen Leuten am Tisch.",
    accent: "Code, Link, gemeinsame Runde"
  },
  {
    icon: "build",
    title: "Auch mobil gut spielbar",
    body: "Hexagonia funktioniert nicht nur am Desktop, sondern auch im Handy-Browser. So kannst du deiner Runde auch unterwegs beitreten und weiterspielen.",
    accent: "Desktop und Mobile Browser"
  }
] as const;

export function LandingScreen(props: {
  authMode: AuthMode;
  authForm: {
    username: string;
    password: string;
  };
  inviteCode?: string | null;
  musicTracks: ReadonlyArray<MusicTrack>;
  selectedMusicTrackId: string | null;
  musicPaused: boolean;
  musicPlaybackMode: MusicPlaybackMode;
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthFieldChange: (field: "username" | "password", value: string) => void;
  onMusicPlaybackModeChange: (mode: MusicPlaybackMode) => void;
  onSelectMusicTrack: (trackId: string) => void;
  onSubmit: (event: FormEvent) => void;
  onToggleMusicPaused: () => void;
  authSubmitPending: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackMenuRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }

    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const revealNodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!revealNodes.length) {
      return;
    }

    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    revealNodes.forEach((node) => node.classList.remove("is-visible"));

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    revealNodes.forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.top < viewportHeight * 0.96 && rect.bottom > 0) {
        node.classList.add("is-visible");
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.18
      }
    );

    revealNodes.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!trackMenuOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (trackMenuRef.current && !trackMenuRef.current.contains(event.target as Node)) {
        setTrackMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTrackMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [trackMenuOpen]);

  const scrollToSection = (sectionId: string) => {
    const section = document.getElementById(sectionId);
    const node = section?.querySelector(".landing-auth-panel") ?? section;
    if (!node) {
      return;
    }

    const header = document.querySelector(".landing-header");
    const headerHeight = header instanceof HTMLElement ? header.getBoundingClientRect().height : 0;
    const targetTop = window.scrollY + node.getBoundingClientRect().top - headerHeight - 18;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  };

  const authSubmitLabel = props.authMode === "login" ? "Jetzt anmelden" : "Konto anlegen und loslegen";
  const hasMusicTracks = props.musicTracks.length > 0;
  const selectedTrack = props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const landingModeLabel = props.musicPlaybackMode === "cycle" ? "Playlist" : "Loop";

  return (
    <div ref={rootRef} className="guest-root landing-root">
      <header className="landing-header">
        <button type="button" className="landing-brand" onClick={scrollToTop} aria-label="Nach oben zu Hexagonia">
          <span className="landing-brand-mark">
            <img src={hexaLogo} alt="Hexagonia" className="landing-brand-image" />
          </span>
          <span className="landing-brand-copy">
            <strong>Hexagonia</strong>
            <span>Modernes Tabletop-Strategy im Browser</span>
          </span>
        </button>

        <div className="landing-header-tools">
          <div className="landing-music-panel">
            <div className="landing-music-copy">
              <strong>Musik</strong>
            </div>
            <div className="landing-music-controls">
              <div className="landing-music-track-shell" ref={trackMenuRef}>
                <button
                  type="button"
                  className={`landing-music-select-button ${trackMenuOpen ? "is-open" : ""}`}
                  aria-expanded={trackMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setTrackMenuOpen((current) => !current)}
                  disabled={!hasMusicTracks}
                >
                  <span className="landing-music-track-label">{selectedTrack?.name ?? "Keine Songs gefunden"}</span>
                  <span className="landing-music-select-caret" aria-hidden="true">
                    v
                  </span>
                </button>
                {trackMenuOpen ? (
                  <div className="landing-music-menu" role="menu" aria-label="Song wählen">
                    {props.musicTracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        className={`landing-music-menu-item ${track.id === selectedTrack?.id ? "is-active" : ""}`}
                        role="menuitemradio"
                        aria-checked={track.id === selectedTrack?.id}
                        onClick={() => {
                          props.onSelectMusicTrack(track.id);
                          setTrackMenuOpen(false);
                        }}
                      >
                        {track.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={`landing-music-chip ${props.musicPaused ? "is-muted" : "is-active"}`}
                aria-pressed={!props.musicPaused}
                onClick={() => props.onToggleMusicPaused()}
                disabled={!hasMusicTracks}
              >
                {props.musicPaused ? "Start" : "Pause"}
              </button>
              <button
                type="button"
                className={`landing-music-chip ${props.musicPlaybackMode === "cycle" ? "is-active" : ""}`}
                aria-pressed={props.musicPlaybackMode === "cycle"}
                onClick={() => props.onMusicPlaybackModeChange(props.musicPlaybackMode === "cycle" ? "single" : "cycle")}
                disabled={props.musicTracks.length <= 1}
                title="Wiedergabemodus umschalten"
              >
                {landingModeLabel}
              </button>
            </div>
          </div>

          <div className="landing-header-actions">
            <button type="button" className="landing-nav-button is-ghost" onClick={() => scrollToSection("zugang")}>
              Login
            </button>
            <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
              Jetzt spielen
            </button>
          </div>
        </div>
      </header>

      {props.inviteCode ? (
        <aside className="landing-invite-banner" data-reveal style={revealStyle(0)}>
          <div className="landing-invite-copy">
            <span className="landing-kicker">Einladung erkannt</span>
            <strong>Raumcode {props.inviteCode} wartet auf deinen Login.</strong>
            <span>Nach Anmeldung oder Registrierung springst du direkt in die Ziel-Lobby.</span>
          </div>
          <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
            Einladung öffnen
          </button>
        </aside>
      ) : null}

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <span className="landing-kicker">Modernes Tabletop-Strategy im Browser</span>
            <h1 id="landing-hero-title">Hexagonia bringt Strategie und Handel in den Browser.</h1>
            <p className="landing-lead">
              Hol Freunde per Code oder Link an den Tisch und spiel direkt los. Handel,
              Bauentscheidungen, Räuberphase und Entwicklungskarten bringen sofort Druck und echte Brettspielspannung in
              den Browser.
            </p>

            <div className="landing-hero-actions">
              <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
                {props.inviteCode ? "Zur Einladung anmelden" : "Konto anlegen und loslegen"}
              </button>
            </div>

            <article className="landing-free-promise" data-reveal style={revealStyle(120)}>
              <div className="landing-free-promise-mark" aria-hidden="true">
                <span>100%</span>
                <span>gratis</span>
              </div>
              <div className="landing-free-promise-copy">
                <div className="landing-free-promise-head">
                  <span className="landing-kicker">Fair Play</span>
                  <span className="landing-free-promise-pill">Ohne Pay-to-Win</span>
                </div>
                <strong>Hexagonia ist 100 % kostenlos und wird es bleiben.</strong>
                <p>Kein Abo. Keine Paywalls. Keine bezahlten Vorteile. Nie.</p>
                <div className="landing-free-promise-points" aria-label="Fair-Play-Versprechen">
                  <span className="landing-free-promise-point">Kein Abo</span>
                  <span className="landing-free-promise-point">Keine Paywalls</span>
                  <span className="landing-free-promise-point">Keine bezahlten Vorteile</span>
                </div>
              </div>
            </article>
          </div>

          <div className="landing-hero-scene-column">
            <div className="landing-scene-shell">
              <LandingBoardScene reducedMotion={prefersReducedMotion} visualProfile="fancy" />
              <div className="landing-scene-badge is-top">
                <span className="landing-badge-label">Am Tisch</span>
                <strong>Handel, Druck und starke Wendungen</strong>
              </div>
              <div className="landing-scene-badge is-bottom">
                <span className="landing-badge-label">Deine Runde</span>
                <strong>Freunde einladen und direkt losspielen</strong>
              </div>
              <div className="landing-scene-badge is-side">
                <span className="landing-badge-label">Einladung</span>
                <strong>Gemeinsam spielen per Code oder Link</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="ablauf" className="landing-section" aria-labelledby="landing-flow-title">
          <div className="landing-section-head" data-reveal style={revealStyle(0)}>
            <span className="landing-kicker">So läuft eine Runde</span>
            <h2 id="landing-flow-title">Schnell in die Partie.</h2>
            <p>
              Hexagonia setzt auf einen klaren Ablauf: Runde anlegen, Freunde reinholen, Setup festlegen und ohne
              Umwege gemeinsam starten.
            </p>
          </div>

          <div className="landing-flow-grid">
            {FLOW_STEPS.map((step, index) => (
              <article
                key={step.title}
                className="landing-flow-card"
                data-reveal
                style={revealStyle(80 + index * 70)}
              >
                <span className="landing-step-index">0{index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
                <span className="landing-card-meta">{step.meta}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="build" className="landing-section" aria-labelledby="landing-build-title">
          <div className="landing-section-head" data-reveal style={revealStyle(0)}>
            <span className="landing-kicker">Im Spiel</span>
            <h2 id="landing-build-title">Was dich in Hexagonia erwartet.</h2>
            <p>
              Der Fokus liegt auf einer runden Spielerfahrung: Freunde einladen, Partie starten, handeln, bauen und mit
              jeder Entscheidung mehr Druck auf die anderen Spieler machen.
            </p>
          </div>

          <div className="landing-build-grid">
            {BUILD_FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className="landing-build-card"
                data-reveal
                style={revealStyle(80 + index * 70)}
              >
                <div className="landing-feature-icon">{renderFeatureIcon(feature.icon)}</div>
                <strong>{feature.title}</strong>
                <p>{feature.body}</p>
                <span className="landing-card-meta">{feature.detail}</span>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="landing-section landing-mechanics-section" aria-labelledby="landing-mechanics-title">
          <div className="landing-mechanics-layout">
            <aside className="landing-mechanics-sticky" data-reveal style={revealStyle(0)}>
              <span className="landing-kicker">Mechaniken im Fokus</span>
              <h2 id="landing-mechanics-title">Die Partie lebt von Interaktion, nicht von Deko.</h2>
              <p>Hexagonia lebt von direkten Entscheidungen: bauen, handeln, blockieren, kontern und die Partie Zug für Zug zu deinen Gunsten kippen.</p>

              <ul className="landing-capability-list">
                <li>Runden mit Sitzplätzen und Ready-State</li>
                <li>Setup-Modi mit kontrolliertem Spielstart</li>
                <li>Handel zwischen Spielern und über Häfen</li>
                <li>Räuber- und Abwurfphasen mit klarem Ablauf</li>
                <li>Entwicklungskarten und Wertungen mit echten Wendepunkten</li>
              </ul>
            </aside>

            <div className="landing-mechanics-grid">
              {MECHANICS.map((entry, index) => (
                <article
                  key={entry.title}
                  className="landing-mechanic-card"
                  data-reveal
                  style={revealStyle(80 + index * 60)}
                >
                  <div className="landing-feature-icon">{renderFeatureIcon(entry.icon)}</div>
                  <strong>{entry.title}</strong>
                  <p>{entry.body}</p>
                  <span className="landing-card-meta">{entry.accent}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="zugang" className="landing-section landing-access-section" aria-labelledby="landing-access-title">
          <div className="landing-access-copy" data-reveal style={revealStyle(0)}>
            <h2 id="landing-access-title">Melde dich an und geh direkt an deinen Tisch.</h2>
            <p>
              Erstelle ein Konto oder logg dich ein. Wenn du mit einer Einladung gekommen bist, landest du danach direkt
              in der passenden Runde.
            </p>
            <article className="landing-access-point landing-access-point-highlight">
              <strong>{props.inviteCode ? "Einladung wird direkt geöffnet" : "Direkt mit Freunden losspielen"}</strong>
              <span>
                {props.inviteCode
                  ? `Der erkannte Code ${props.inviteCode} wird nach dem Login automatisch geöffnet.`
                  : "Code oder Link bringen euch ohne öffentliche Queue direkt an denselben Tisch."}
              </span>
            </article>
          </div>

          <article className="landing-auth-panel" data-reveal style={revealStyle(120)}>
            <div className="landing-auth-head">
              <div>
                <span className="landing-kicker">Konto</span>
                <h3>{props.authMode === "login" ? "Anmelden" : "Neues Konto anlegen"}</h3>
              </div>
              <div className="segmented-control landing-auth-toggle">
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
                  Registrieren
                </button>
              </div>
            </div>

            {props.inviteCode ? (
              <div className="landing-auth-note">
                <strong>Einladung aktiv</strong>
                <span>Nach dem Login springst du direkt in Raum {props.inviteCode}.</span>
              </div>
            ) : null}

            <form className="landing-auth-form" onSubmit={props.onSubmit}>
              <label className="landing-field">
                <span>Nutzername</span>
                <input
                  autoComplete="username"
                  type="text"
                  value={props.authForm.username}
                  onChange={(event) => props.onAuthFieldChange("username", event.target.value)}
                />
              </label>

              <label className="landing-field">
                <span>Passwort</span>
                <input
                  autoComplete={props.authMode === "login" ? "current-password" : "new-password"}
                  type="password"
                  value={props.authForm.password}
                  onChange={(event) => props.onAuthFieldChange("password", event.target.value)}
                />
              </label>

              <button className="landing-button landing-auth-submit" type="submit" disabled={props.authSubmitPending}>
                <LoadingButtonContent
                  loading={props.authSubmitPending}
                  idleLabel={authSubmitLabel}
                  loadingLabel={props.authMode === "login" ? "Anmeldung läuft..." : "Registrierung läuft..."}
                />
              </button>

              {props.authMode === "register" ? (
                <p className="landing-recaptcha-note">
                  Diese Seite ist durch reCAPTCHA geschützt. Es gelten die Google{" "}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                    Datenschutzerklärung
                  </a>{" "}
                  und{" "}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
                    Nutzungsbedingungen
                  </a>
                  .
                </p>
              ) : null}
            </form>
          </article>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-copy">
          <strong>Hexagonia</strong>
          <span>Browser-Strategie für gemeinsame Runden mit Freunden. Kostenlos, ohne Abo und ohne Paywalls.</span>
        </div>
        <span>Einladen, aufbauen, handeln und direkt gemeinsam spielen.</span>
      </footer>
    </div>
  );
}

function revealStyle(delayMs: number): CSSProperties {
  return {
    "--landing-reveal-delay": `${delayMs}ms`
  } as CSSProperties;
}

function renderFeatureIcon(icon: (typeof BUILD_FEATURES)[number]["icon"] | (typeof MECHANICS)[number]["icon"]) {
  switch (icon) {
    case "board":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.2 5.2h9.6l4.4 6.8-4.4 6.8H7.2L2.8 12z" />
          <path d="M7.2 5.2 12 12l-4.8 6.8" />
          <path d="M16.8 5.2 12 12l4.8 6.8" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "rooms":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8.1" cy="9" r="2.3" />
          <circle cx="15.9" cy="9" r="2.3" />
          <path d="M4.8 17.4c.86-2.08 2.74-3.2 5.16-3.2s4.3 1.12 5.16 3.2" />
          <path d="M10.8 9h2.4" />
        </svg>
      );
    case "trade":
      return <HarborIcon shell size={18} color="#f8f0de" />;
    case "robber":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.2 9.4 9.4 5.6h5.2l2.2 3.8v7.8H7.2z" />
          <path d="M9.4 5.6 12 8l2.6-2.4" />
          <path d="M7.2 14.8 9.8 13l2.2 1.5 2.2-1.5 2.6 1.8" />
          <circle cx="9.7" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
          <circle cx="14.3" cy="11.6" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case "cards":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5.2" y="6.2" width="10.8" height="13" rx="1.9" transform="rotate(-8 5.2 6.2)" />
          <rect x="8.2" y="4.8" width="10.8" height="13.4" rx="1.9" />
          <path d="m12 9.2 1 1.7 1.95.34-1.38 1.35.3 1.9L12 13.7l-1.87.79.3-1.9-1.38-1.35 1.95-.34z" />
        </svg>
      );
    case "build":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="3.8" width="10" height="16.4" rx="2.4" />
          <path d="M10.2 6.8h3.6" />
          <path d="M9.6 15.1h4.8" />
          <path d="M10.1 17.6h3.8" />
          <circle cx="12" cy="18.5" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.2 5.2h9.6l4.4 6.8-4.4 6.8H7.2L2.8 12z" />
          <path d="M7.2 5.2 12 12l-4.8 6.8" />
          <path d="M16.8 5.2 12 12l4.8 6.8" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
