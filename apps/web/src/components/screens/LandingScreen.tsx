import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { DEVELOPMENT_CARD_TYPES, SETUP_MODES } from "@hexagonia/shared";
import { HarborIcon, ResourceIcon } from "../../resourceIcons";
import { LandingBoardScene } from "../../LandingBoardScene";
import type { AuthMode } from "../../ui";
import hexaLogo from "../../../../../assets/img/hexa.png";

const NAV_ITEMS = [
  { id: "ablauf", label: "Ablauf" },
  { id: "build", label: "Highlights" },
  { id: "features", label: "Mechaniken" },
  { id: "zugang", label: "Zugang" }
] as const;

const HERO_STATS = [
  { value: "4", label: "Plätze pro Tisch" },
  { value: `${SETUP_MODES.length}`, label: "Setup-Varianten" },
  { value: `${DEVELOPMENT_CARD_TYPES.length}`, label: "Entwicklungskarten" },
  { value: "Live", label: "Spielen + fortsetzen" }
] as const;

const FLOW_STEPS = [
  {
    title: "Privaten Tisch eröffnen",
    body: "Ein Raum ist in Sekunden bereit. Der Ersteller sitzt direkt auf Platz 1 und steuert Setup und Start.",
    meta: "Privat, kompakt, sofort startklar"
  },
  {
    title: "Code oder Link teilen",
    body: "Freunde kommen per Raumcode oder Invite-Link genau in dieselbe Lobby. Kein Matchmaking, kein unnötiger Overhead.",
    meta: "Invite-Code oder Direktlink"
  },
  {
    title: "Setup festlegen",
    body: "Beginner-Aufbau oder variable Verteilung, manueller Startspieler oder Auswürfeln: die Runde startet mit klaren Regeln.",
    meta: "Beginner oder variabel"
  },
  {
    title: "Live spielen und wieder einsteigen",
    body: "Board, Handel, Würfel, Räuber und Event-Log laufen synchron. Offene Räume und laufende Partien bleiben für dich erreichbar.",
    meta: "Live spielen, wieder einsteigen"
  }
] as const;

const BUILD_FEATURES = [
  {
    icon: "board",
    title: "Das Brett lebt mit jeder Runde",
    body: "Du siehst sofort, was auf dem Spielfeld passiert: Würfel, Bauaktionen, Handelsmomente und wichtige Wendepunkte der Partie.",
    detail: "Animiertes 3D-Spielbrett"
  },
  {
    icon: "rooms",
    title: "Private Räume für deine Runde",
    body: "Raum erstellen, Code oder Link teilen, Plätze füllen und gemeinsam starten, ohne öffentliche Lobby dazwischen.",
    detail: "Schnell eingeladen, schnell am Tisch"
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
    detail: "Klassische Spannung, direkt spielbar"
  }
] as const;

const MECHANICS = [
  {
    icon: "board",
    title: "Board und Aufbauphase",
    body: "Start-Siedlungen, Start-Straßen, Vorwärts- und Rückwärts-Setup sowie variable oder vorbereitete Bretter laufen bereits im Match.",
    accent: "Setup, Platzierung, Häfen"
  },
  {
    icon: "trade",
    title: "Handel mit echter Entscheidungstiefe",
    body: "Angebote können offen oder gezielt gestellt, angenommen, abgelehnt oder zurückgezogen werden. Maritime Raten richten sich am eigenen Hafenstatus aus.",
    accent: "Direkthandel und Banktausch"
  },
  {
    icon: "robber",
    title: "Räuberphase mit klaren Entscheidungen",
    body: "Wenn der Räuber ins Spiel kommt, bleiben Abwurf, Zielwahl und das neue Feld jederzeit klar verständlich und spürbar spannend.",
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
    title: "Räume, Wiedereinstieg und Fortsetzen",
    body: "Konten speichern deinen Zugang. Räume und laufende Matches bleiben zugänglich, damit eine Runde nicht am Browser-Refresh scheitert.",
    accent: "Persistente Zugänge"
  },
  {
    icon: "build",
    title: "Schon heute gut spielbar",
    body: "Hexagonia konzentriert sich auf das, was eine Runde wirklich trägt: Einladungen, Spielfeld, Handel, Aufbauphase und starke Partiemomente.",
    accent: "Substanz statt leere Versprechen"
  }
] as const;

export function LandingScreen(props: {
  authMode: AuthMode;
  authForm: {
    username: string;
    password: string;
  };
  inviteCode?: string | null;
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthFieldChange: (field: "username" | "password", value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -10% 0px"
      }
    );

    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  const scrollToSection = (sectionId: string) => {
    const node = document.getElementById(sectionId);
    if (!node) {
      return;
    }

    node.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth"
    });
  };

  const authSubmitLabel = props.authMode === "login" ? "Jetzt anmelden" : "Konto anlegen";

  return (
    <div ref={rootRef} className="guest-root landing-root">
      <header className="landing-header">
        <button type="button" className="landing-brand" onClick={scrollToTop} aria-label="Nach oben zu Hexagonia">
          <span className="landing-brand-mark">
            <img src={hexaLogo} alt="Hexagonia" className="landing-brand-image" />
          </span>
          <span className="landing-brand-copy">
            <strong>Hexagonia</strong>
            <span>Der private Tisch für Strategie und Handel</span>
          </span>
        </button>

        <nav className="landing-nav" aria-label="Sektionen">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className="landing-nav-button" onClick={() => scrollToSection(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="landing-header-actions">
          <button type="button" className="landing-nav-button is-ghost" onClick={() => scrollToSection("zugang")}>
            Login
          </button>
          <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
            Jetzt spielen
          </button>
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
          <div className="landing-hero-copy" data-reveal style={revealStyle(40)}>
            <span className="landing-kicker">Moderne Tabletop-Strategie im Browser</span>
            <h1 id="landing-hero-title">Hexagonia bringt Strategie, Handel und Live-Board in eine private Online-Runde.</h1>
            <p className="landing-lead">
              Eröffne private Räume, hol Freunde per Code oder Link an den Tisch und spiel direkt los. Auf dich warten
              Handel, Bauentscheidungen, Räuberphase, Entwicklungskarten und laufende Partien, in die du später wieder
              sauber einsteigen kannst.
            </p>

            <div className="landing-hero-actions">
              <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
                {props.inviteCode ? "Zur Einladung anmelden" : "Konto anlegen"}
              </button>
              <button type="button" className="landing-button is-secondary" onClick={() => scrollToSection("build")}>
                Highlights ansehen
              </button>
            </div>

            <div className="landing-hero-stats">
              {HERO_STATS.map((entry, index) => (
                <article
                  key={entry.label}
                  className="landing-stat-card"
                  data-reveal
                  style={revealStyle(120 + index * 60)}
                >
                  <strong>{entry.value}</strong>
                  <span>{entry.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="landing-hero-scene-column" data-reveal style={revealStyle(140)}>
            <div className="landing-scene-shell">
              <LandingBoardScene reducedMotion={prefersReducedMotion} />
              <div className="landing-scene-badge is-top">
                <span className="landing-badge-label">Schon spielbar</span>
                <strong>Trade, Robber, Development</strong>
              </div>
              <div className="landing-scene-badge is-bottom">
                <span className="landing-badge-label">Spielstart</span>
                <strong>Beginner oder variable Verteilung</strong>
              </div>
              <div className="landing-scene-badge is-side">
                <span className="landing-badge-label">Einladung</span>
                <strong>Private Räume mit Code oder Link</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="ablauf" className="landing-section" aria-labelledby="landing-flow-title">
          <div className="landing-section-head" data-reveal style={revealStyle(0)}>
            <span className="landing-kicker">So läuft eine Runde</span>
            <h2 id="landing-flow-title">Von der Einladung bis zur laufenden Partie kommst du ohne unnötige Umwege.</h2>
            <p>
              Hexagonia setzt auf einen klaren privaten Ablauf: Runde anlegen, Mitspieler reinholen, Setup festziehen,
              Partie starten und bei Bedarf später sauber wieder aufnehmen.
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
            <h2 id="landing-build-title">Was dich in Hexagonia schon jetzt am Tisch erwartet.</h2>
            <p>
              Der Fokus liegt auf einer runden Spielerfahrung: Freunde einladen, Partie starten, handeln, bauen,
              den Räuber versetzen und später wieder in laufende Runden einsteigen.
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
              <h2 id="landing-mechanics-title">Die Partie ist auf Interaktion gebaut, nicht auf Screen-Tapete.</h2>
              <p>
                Entscheidende Systeme greifen bereits ineinander: Aufbauphase, Ressourcenfluss, Handel, Räuber, Entwicklung,
                Wertung und der Wiedereinstieg in laufende Sessions.
              </p>

              <ul className="landing-capability-list">
                <li>Private Räume mit Sitzplätzen und Ready-State</li>
                <li>Setup-Modi mit kontrolliertem Spielstart</li>
                <li>Handel zwischen Spielern und über Häfen</li>
                <li>Räuber- und Abwurfphasen mit klarem Ablauf</li>
                <li>Konten mit einfachem Wiedereinstieg</li>
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
            <span className="landing-kicker">Zugang</span>
            <h2 id="landing-access-title">Melde dich an und geh direkt an deinen Tisch.</h2>
            <p>
              Erstelle ein Konto oder logg dich wieder ein. Wenn du mit einer Einladung gekommen bist, landest du danach
              direkt in der passenden Runde.
            </p>

            <div className="landing-access-points">
              <article className="landing-access-point">
                <strong>Private Runde statt öffentlicher Queue</strong>
                <span>Du landest in deinem Raum, nicht in einem anonymen Matchmaking-Prozess.</span>
              </article>
              <article className="landing-access-point">
                <strong>Wieder rein in gespeicherte Sessions</strong>
                <span>Offene Räume und laufende Matches bleiben deinem Konto zugeordnet.</span>
              </article>
              <article className="landing-access-point">
                <strong>Einladungen bleiben erhalten</strong>
                <span>
                  {props.inviteCode
                    ? `Der erkannte Code ${props.inviteCode} wird nach dem Login automatisch geöffnet.`
                    : "Einladungslinks und Raumcodes führen nach dem Login direkt an den richtigen Tisch."}
                </span>
              </article>
            </div>
          </div>

          <article className="landing-auth-panel" data-reveal style={revealStyle(120)}>
            <div className="landing-auth-head">
              <div>
                <span className="landing-kicker">Konto</span>
                <h3>{props.authMode === "login" ? "Wieder anmelden" : "Neues Konto anlegen"}</h3>
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
                  Konto
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

              <button className="landing-button landing-auth-submit" type="submit">
                {authSubmitLabel}
              </button>
            </form>
          </article>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-copy">
          <strong>Hexagonia</strong>
          <span>Browser-Strategie für private Runden mit starkem Brettgefühl, spannenden Entscheidungen und klarer Einladungskette.</span>
        </div>
        <span>Einladen, aufbauen, handeln, bauen und laufende Partien später wieder aufnehmen.</span>
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
      return <ResourceIcon resource="grain" shell size={18} tone="light" />;
    case "rooms":
      return <ResourceIcon resource="lumber" shell size={18} tone="light" />;
    case "trade":
      return <HarborIcon shell size={18} color="#f8f0de" />;
    case "robber":
      return <ResourceIcon resource="ore" shell size={18} tone="light" />;
    case "cards":
      return <ResourceIcon resource="wool" shell size={18} tone="light" />;
    case "build":
      return <ResourceIcon resource="brick" shell size={18} tone="light" />;
    default:
      return <ResourceIcon resource="grain" shell size={18} tone="light" />;
  }
}
