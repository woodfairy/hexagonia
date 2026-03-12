import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import { createCatalogText, createText, resolveText, useI18n } from "../../i18n";
import { HarborIcon } from "../../resourceIcons";
import { LandingBoardScene } from "../../LandingBoardScene";
import { LocaleSelect } from "../shared/LocaleSelect";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { PopupSelect } from "../shared/PopupSelect";
import type { AuthMode } from "../../ui";
import hexaLogo from "../../../../../assets/img/hexa.png";

const FLOW_STEPS = [
  {
    title: createText("Eine Runde starten", "Start a round"),
    body: createText(
      "Ein Tisch ist in Sekunden bereit. Der Ersteller sitzt direkt auf Platz 1 und steuert Setup und Start.",
      "A table is ready within seconds. The creator takes seat 1 immediately and controls setup and start."
    ),
    meta: createText("Schnell drin, sofort startklar", "Fast in, ready immediately")
  },
  {
    title: createText("Code oder Link teilen", "Share code or link"),
    body: createText(
      "Freunde kommen per Raumcode oder Invite-Link direkt an denselben Tisch. Kein Matchmaking, kein unnötiger Overhead.",
      "Friends join the same table directly via room code or invite link. No matchmaking, no unnecessary overhead."
    ),
    meta: createText("Invite-Code oder Direktlink", "Invite code or direct link")
  },
  {
    title: createText("Partie konfigurieren", "Configure the match"),
    body: createText(
      "Beginner-Aufbau oder dynamisch generiertes Brett, manueller Startspieler oder Auswürfeln: ihr legt fest, wie die Partie startet.",
      "Beginner setup or a dynamically generated board, manual starting player or a roll-off: you decide how the match begins."
    ),
    meta: createText("Beginner oder dynamisch", "Beginner or dynamic")
  },
  {
    title: createText("Gemeinsam starten und losspielen", "Start together and play"),
    body: createText(
      "Sobald alle am Tisch sind, geht es direkt ins Spiel: bauen, handeln, würfeln und den nächsten starken Zug vorbereiten.",
      "As soon as everyone is at the table, the match starts immediately: build, trade, roll, and set up the next strong move."
    ),
    meta: createText("Schnell rein, direkt spielen", "Jump in and play right away")
  }
] as const;

const BUILD_FEATURES = [
  {
    icon: "board",
    title: createText("Jede Runde verändert das Spiel", "Every round changes the game"),
    body: createText(
      "Mit jedem Wurf, jedem Bau und jedem Deal kippt die Lage neu. Gute Positionen entstehen nicht zufällig, sondern weil du sie dir Zug für Zug holst.",
      "Every roll, build, and deal reshapes the board. Strong positions are not random, you earn them move by move."
    ),
    detail: createText("Druck, Timing und starke Züge", "Pressure, timing, and strong moves")
  },
  {
    icon: "rooms",
    title: createText("Mit Freunden direkt am Tisch", "Sit down with friends directly"),
    body: createText(
      "Runde eröffnen, Code oder Link teilen, Plätze füllen und gemeinsam starten, ohne Umwege bis zur Partie.",
      "Open a round, share the code or link, fill the seats, and start together without detours."
    ),
    detail: createText("Schnell eingeladen, schnell im Spiel", "Invite fast, play fast")
  },
  {
    icon: "trade",
    title: createText("Handel, Häfen und gute Deals", "Trades, harbors, and good deals"),
    body: createText(
      "Handle direkt mit anderen Spielern oder nutze Häfen, um aus knappen Karten doch noch den nächsten starken Zug zu machen.",
      "Trade directly with other players or use harbors to turn a tight hand into the next strong move."
    ),
    detail: createText("Spielerhandel und Hafentausch", "Player trades and harbor trades")
  },
  {
    icon: "robber",
    title: createText("Räuber, Entwicklung und Wertungen", "Robber, development, and awards"),
    body: createText(
      "Räuberphase, Entwicklungskarten, längste Straße und größte Rittermacht sorgen schon jetzt für echte Wendepunkte in der Partie.",
      "Robber phases, development cards, longest road, and largest army already create real turning points in the match."
    ),
    detail: createText("Klassische Spannung, sofort im Browser", "Classic tension, instantly in the browser")
  }
] as const;

const MECHANICS = [
  {
    icon: "board",
    title: createText("Board und Aufbauphase", "Board and setup phase"),
    body: createText(
      "Start-Siedlungen, Start-Straßen sowie Vorwärts- und Rückwärts-Setup sind klar abgebildet, egal ob ihr mit variablem oder vorbereitetem Brett spielt.",
      "Initial settlements, initial roads, and forward and reverse setup are clearly represented, whether you play on a variable or prepared board."
    ),
    accent: createText("Setup, Platzierung, Häfen", "Setup, placement, harbors")
  },
  {
    icon: "trade",
    title: createText("Handel mit echter Entscheidungstiefe", "Trading with real decision depth"),
    body: createText(
      "Deals entstehen nicht nebenbei: Du setzt Angebote, reizt andere Spieler zu Fehlern und holst selbst aus knappen Händen noch starke Züge heraus.",
      "Deals do not happen on the side: you set offers, tempt other players into mistakes, and squeeze strong moves out of tight hands."
    ),
    accent: createText("Direkthandel und Banktausch", "Direct trades and bank trade")
  },
  {
    icon: "robber",
    title: createText("Der Räuber kippt die Lage", "The robber shifts the board"),
    body: createText(
      "Wenn der Räuber kommt, werden Karten knapp, starke Felder blockiert und ein gut gesetzter Zug trifft genau den richtigen Gegner.",
      "When the robber appears, cards get tight, strong tiles are blocked, and a well-placed move hits exactly the right opponent."
    ),
    accent: createText("Räuber, Abwurf und Zielwahl", "Robber, discard, and target selection")
  },
  {
    icon: "cards",
    title: createText("Entwicklungskarten und Wertungen", "Development cards and awards"),
    body: createText(
      "Ritter, Straßenbau, Erfindung, Monopol und Siegpunktkarten können eine Partie komplett drehen, zusammen mit den Wertungen für Straße und Rittermacht.",
      "Knight, road building, year of plenty, monopoly, and victory point cards can completely swing a match, together with the road and army awards."
    ),
    accent: createText("Karten, Awards, Punkte", "Cards, awards, points")
  },
  {
    icon: "rooms",
    title: createText("Mit Freunden ohne Umwege spielen", "Play with friends without detours"),
    body: createText(
      "Du eröffnest eine Runde, teilst Code oder Link und sitzt direkt mit deinen Leuten am Tisch.",
      "You open a round, share the code or link, and sit down directly with your group."
    ),
    accent: createText("Code, Link, gemeinsame Runde", "Code, link, shared round")
  },
  {
    icon: "build",
    title: createText("Auch mobil gut spielbar", "Also plays well on mobile"),
    body: createText(
      "Hexagonia funktioniert nicht nur am Desktop, sondern auch im Handy-Browser. So kannst du deiner Runde auch unterwegs beitreten und weiterspielen.",
      "Hexagonia works not just on desktop, but also in mobile browsers. That means you can join and continue your round while on the go."
    ),
    accent: createText("Desktop und Mobile Browser", "Desktop and mobile browsers")
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
  const { locale, setLocale } = useI18n();
  const text = (de: string, en: string) => resolveText(locale, createText(de, en));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [optimisticTrackSwitchId, setOptimisticTrackSwitchId] = useState<string | null>(null);

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
  }, [locale, prefersReducedMotion, props.authMode, props.inviteCode]);

  useEffect(() => {
    if (!optimisticTrackSwitchId) {
      return;
    }

    if (props.selectedMusicTrackId === optimisticTrackSwitchId || !props.musicPaused) {
      setOptimisticTrackSwitchId(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setOptimisticTrackSwitchId(null);
    }, 1400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [optimisticTrackSwitchId, props.musicPaused, props.selectedMusicTrackId]);

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

  const flowSteps = FLOW_STEPS.map((step) => ({
    title: resolveText(locale, step.title),
    body: resolveText(locale, step.body),
    meta: resolveText(locale, step.meta)
  }));
  const buildFeatures = BUILD_FEATURES.map((feature) => ({
    ...feature,
    title: resolveText(locale, feature.title),
    body: resolveText(locale, feature.body),
    detail: resolveText(locale, feature.detail)
  }));
  const mechanics = MECHANICS.map((entry) => ({
    ...entry,
    title: resolveText(locale, entry.title),
    body: resolveText(locale, entry.body),
    accent: resolveText(locale, entry.accent)
  }));
  const authSubmitLabel = props.authMode === "login" ? text("Jetzt anmelden", "Sign in now") : text("Konto anlegen und loslegen", "Create account and start");
  const hasMusicTracks = props.musicTracks.length > 0;
  const selectedTrack = props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const landingModeLabel = props.musicPlaybackMode === "cycle" ? text("Playlist", "Playlist") : text("Loop", "Loop");
  const landingMusicPaused = optimisticTrackSwitchId ? false : props.musicPaused;
  const musicTrackOptions = props.musicTracks.length
    ? props.musicTracks.map((track) => ({
        value: track.id,
        label: track.name
      }))
    : [{ value: "", label: text("Keine Songs gefunden", "No songs found"), disabled: true }];

  return (
    <div ref={rootRef} className="guest-root landing-root">
      <header className="landing-header">
        <button
          type="button"
          className="landing-brand"
          onClick={scrollToTop}
          aria-label={text("Nach oben zu Hexagonia", "Back to the top of Hexagonia")}
        >
          <span className="landing-brand-mark">
            <img src={hexaLogo} alt="Hexagonia" className="landing-brand-image" />
          </span>
          <span className="landing-brand-copy">
            <strong>Hexagonia</strong>
            <span>{text("Modernes Tabletop-Strategy im Browser", "Modern tabletop strategy in the browser")}</span>
          </span>
        </button>

        <div className="landing-header-tools">
          <div className="landing-header-actions">
            <LocaleSelect value={locale} ariaLabel={text("Sprache", "Language")} variant="landing" onChange={setLocale} />
          </div>
          <div className="landing-music-panel">
            <div className="landing-music-copy">
              <strong>{text("Musik", "Music")}</strong>
            </div>
            <div className="landing-music-controls">
              <div className="landing-music-track-shell">
                <PopupSelect
                  value={selectedTrack?.id ?? ""}
                  options={musicTrackOptions}
                  onChange={(trackId) => {
                    if (!props.musicPaused && trackId !== props.selectedMusicTrackId) {
                      setOptimisticTrackSwitchId(trackId);
                    } else {
                      setOptimisticTrackSwitchId(null);
                    }

                    props.onSelectMusicTrack(trackId);
                  }}
                  ariaLabel={text("Song wählen", "Choose track")}
                  variant="landing"
                  disabled={!hasMusicTracks}
                />
              </div>
              <button
                type="button"
                className={`landing-music-chip ${landingMusicPaused ? "is-muted" : "is-active"}`}
                aria-pressed={!landingMusicPaused}
                onClick={() => props.onToggleMusicPaused()}
                disabled={!hasMusicTracks}
              >
                {landingMusicPaused
                  ? resolveText(locale, createCatalogText("landing.music.playButton", "Start", "Play"))
                  : text("Pause", "Pause")}
              </button>
              <button
                type="button"
                className={`landing-music-chip ${props.musicPlaybackMode === "cycle" ? "is-active" : ""}`}
                aria-pressed={props.musicPlaybackMode === "cycle"}
                onClick={() => props.onMusicPlaybackModeChange(props.musicPlaybackMode === "cycle" ? "single" : "cycle")}
                disabled={props.musicTracks.length <= 1}
                title={text("Wiedergabemodus umschalten", "Toggle playback mode")}
              >
                {landingModeLabel}
              </button>
            </div>
          </div>

          <div className="landing-header-actions">
            <button type="button" className="landing-nav-button is-ghost" onClick={() => scrollToSection("zugang")}>
              {text("Login", "Login")}
            </button>
            <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
              {text("Jetzt spielen", "Play now")}
            </button>
          </div>
        </div>
      </header>

      {props.inviteCode ? (
        <aside className="landing-invite-banner" data-reveal style={revealStyle(0)}>
          <div className="landing-invite-copy">
            <span className="landing-kicker">{text("Einladung erkannt", "Invite detected")}</span>
            <strong>
              {resolveText(
                locale,
                createText("Raumcode {code} wartet auf deinen Login.", "Room code {code} is waiting for your login.", {
                  code: props.inviteCode
                })
              )}
            </strong>
            <span>{text("Nach Anmeldung oder Registrierung springst du direkt in die Ziel-Lobby.", "After signing in or registering, you will jump directly into the target lobby.")}</span>
          </div>
          <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
            {text("Einladung öffnen", "Open invite")}
          </button>
        </aside>
      ) : null}

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <span className="landing-kicker">{text("Modernes Tabletop-Strategy im Browser", "Modern tabletop strategy in the browser")}</span>
            <h1 id="landing-hero-title">{text("Hexagonia bringt Strategie und Handel in den Browser.", "Hexagonia brings strategy and trade to the browser.")}</h1>
            <p className="landing-lead">
              {text(
                "Hol Freunde per Code oder Link an den Tisch und spiel direkt los. Handel, Bauentscheidungen, Räuberphase und Entwicklungskarten bringen sofort Druck und echte Brettspielspannung in den Browser.",
                "Bring friends to the table with a code or link and start immediately. Trading, building decisions, robber phases, and development cards bring pressure and real board-game tension straight into the browser."
              )}
            </p>

            <article className="landing-free-promise" data-reveal style={revealStyle(120)}>
              <div className="landing-free-promise-mark" aria-hidden="true">
                <span>100%</span>
                <span>{text("gratis", "free")}</span>
              </div>
              <div className="landing-free-promise-copy">
                <div className="landing-free-promise-head">
                  <span className="landing-kicker">{text("Fair Play", "Fair play")}</span>
                </div>
                <strong>{text("Hexagonia ist 100 % kostenlos und wird es bleiben.", "Hexagonia is 100% free and will stay that way.")}</strong>
                <p>{text("Kein Abo. Keine Paywalls. Keine bezahlten Vorteile. Nie.", "No subscription. No paywalls. No paid advantages. Ever.")}</p>
              </div>
              <div className="landing-free-promise-actions">
                <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
                  {props.inviteCode ? text("Zur Einladung anmelden", "Sign in to open invite") : text("Jetzt kostenlos spielen", "Play for free now")}
                </button>
              </div>
            </article>
          </div>

          <div className="landing-hero-scene-column">
            <div className="landing-scene-shell">
              <LandingBoardScene reducedMotion={prefersReducedMotion} visualProfile="fancy" />
              <div className="landing-scene-badge is-top">
                <span className="landing-badge-label">{text("Am Tisch", "At the table")}</span>
                <strong>{text("Handel, Druck und starke Wendungen", "Trade, pressure, and strong swings")}</strong>
              </div>
              <div className="landing-scene-badge is-bottom">
                <span className="landing-badge-label">{text("Deine Runde", "Your round")}</span>
                <strong>{text("Freunde einladen und direkt losspielen", "Invite friends and start immediately")}</strong>
              </div>
              <div className="landing-scene-badge is-side">
                <span className="landing-badge-label">{text("Einladung", "Invite")}</span>
                <strong>{text("Gemeinsam spielen per Code oder Link", "Play together by code or link")}</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="ablauf" className="landing-section" aria-labelledby="landing-flow-title">
          <div className="landing-section-head" data-reveal style={revealStyle(0)}>
            <span className="landing-kicker">{text("So läuft eine Runde", "How a round works")}</span>
            <h2 id="landing-flow-title">{text("Schnell in die Partie.", "Get into the match quickly.")}</h2>
            <p>{text("Hexagonia setzt auf einen klaren Ablauf: Runde anlegen, Freunde reinholen, Setup festlegen und ohne Umwege gemeinsam starten.", "Hexagonia follows a clear flow: create a round, bring in friends, define the setup, and start together without detours.")}</p>
          </div>

          <div className="landing-flow-grid">
            {flowSteps.map((step, index) => (
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
            <span className="landing-kicker">{text("Im Spiel", "In the match")}</span>
            <h2 id="landing-build-title">{text("Was dich in Hexagonia erwartet.", "What awaits you in Hexagonia.")}</h2>
            <p>{text("Der Fokus liegt auf einer runden Spielerfahrung: Freunde einladen, Partie starten, handeln, bauen und mit jeder Entscheidung mehr Druck auf die anderen Spieler machen.", "The focus is on a tight player experience: invite friends, start a match, trade, build, and put more pressure on the other players with every decision.")}</p>
          </div>

          <div className="landing-build-grid">
            {buildFeatures.map((feature, index) => (
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
              <span className="landing-kicker">{text("Mechaniken im Fokus", "Mechanics in focus")}</span>
              <h2 id="landing-mechanics-title">{text("Die Partie lebt von Interaktion, nicht von Deko.", "The match lives from interaction, not decoration.")}</h2>
              <p>{text("Hexagonia lebt von direkten Entscheidungen: bauen, handeln, blockieren, kontern und die Partie Zug für Zug zu deinen Gunsten kippen.", "Hexagonia lives from direct decisions: build, trade, block, counter, and swing the match in your favor move by move.")}</p>

              <ul className="landing-capability-list">
                <li>{text("Runden mit Sitzplätzen und Ready-State", "Rounds with seats and ready state")}</li>
                <li>{text("Setup-Modi mit kontrolliertem Spielstart", "Setup modes with controlled match start")}</li>
                <li>{text("Handel zwischen Spielern und über Häfen", "Trading between players and through harbors")}</li>
                <li>{text("Räuber- und Abwurfphasen mit klarem Ablauf", "Robber and discard phases with a clear flow")}</li>
                <li>{text("Entwicklungskarten und Wertungen mit echten Wendepunkten", "Development cards and awards with real turning points")}</li>
              </ul>
            </aside>

            <div className="landing-mechanics-grid">
              {mechanics.map((entry, index) => (
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
            <h2 id="landing-access-title">{text("Melde dich an und geh direkt an deinen Tisch.", "Sign in and go straight to your table.")}</h2>
            <p>{text("Erstelle ein Konto oder logg dich ein. Wenn du mit einer Einladung gekommen bist, landest du danach direkt in der passenden Runde.", "Create an account or sign in. If you arrived via invite, you will land directly in the correct round afterward.")}</p>
            <article className="landing-access-point landing-access-point-highlight">
              <strong>{props.inviteCode ? text("Einladung wird direkt geöffnet", "Invite opens directly") : text("Direkt mit Freunden losspielen", "Start directly with friends")}</strong>
              <span>
                {props.inviteCode
                  ? resolveText(
                      locale,
                      createText("Der erkannte Code {code} wird nach dem Login automatisch geöffnet.", "The detected code {code} opens automatically after sign-in.", {
                        code: props.inviteCode
                      })
                    )
                  : text("Code oder Link bringen euch ohne öffentliche Queue direkt an denselben Tisch.", "A code or link takes you straight to the same table without any public queue.")}
              </span>
            </article>
          </div>

          <article className="landing-auth-panel" data-reveal style={revealStyle(120)}>
            <div className="landing-auth-head">
              <div>
                <span className="landing-kicker">{text("Konto", "Account")}</span>
                <h3>{props.authMode === "login" ? text("Anmelden", "Sign in") : text("Neues Konto anlegen", "Create a new account")}</h3>
              </div>
              <div className="segmented-control landing-auth-toggle">
                <button
                  type="button"
                  className={props.authMode === "login" ? "is-active" : ""}
                  onClick={() => props.onAuthModeChange("login")}
                >
                  {text("Login", "Login")}
                </button>
                <button
                  type="button"
                  className={props.authMode === "register" ? "is-active" : ""}
                  onClick={() => props.onAuthModeChange("register")}
                >
                  {text("Registrieren", "Register")}
                </button>
              </div>
            </div>

            {props.inviteCode ? (
              <div className="landing-auth-note">
                <strong>{text("Einladung aktiv", "Invite active")}</strong>
                <span>{resolveText(locale, createText("Nach dem Login springst du direkt in Raum {code}.", "After sign-in, you jump directly into room {code}.", { code: props.inviteCode }))}</span>
              </div>
            ) : null}

            <form className="landing-auth-form" onSubmit={props.onSubmit}>
              <label className="landing-field">
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

              <label className="landing-field">
                <span>{text("Passwort", "Password")}</span>
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
                loadingLabel={props.authMode === "login" ? text("Anmeldung läuft...", "Signing in...") : text("Registrierung läuft...", "Registering...")}
                />
              </button>

              {props.authMode === "register" ? (
                <p className="landing-recaptcha-note">
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
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-copy">
          <strong>Hexagonia</strong>
          <span>{text("Browser-Strategie für gemeinsame Runden mit Freunden. Kostenlos, ohne Abo und ohne Paywalls.", "Browser strategy for shared rounds with friends. Free, without subscriptions, and without paywalls.")}</span>
        </div>
        <span>{text("Einladen, aufbauen, handeln und direkt gemeinsam spielen.", "Invite, set up, trade, and play together right away.")}</span>
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
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.7 4.8h6.6l3.3 5.2-3.3 5.2H8.7L5.4 10z" />
            <path d="M4.5 10.7h4.6l2.3 3.6-2.3 3.6H4.5l-2.3-3.6z" />
            <path d="M14.9 10.7h4.6l2.3 3.6-2.3 3.6h-4.6l-2.3-3.6z" />
          </svg>
        </span>
      );
    case "rooms":
      return (
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8.1" r="2.6" />
            <circle cx="6.5" cy="10.3" r="1.9" />
            <circle cx="17.5" cy="10.3" r="1.9" />
            <path d="M7.4 18.2c.76-2.34 2.56-3.72 4.6-3.72s3.84 1.38 4.6 3.72" />
            <path d="M3.9 17.9c.34-1.3 1.33-2.14 2.74-2.38" />
            <path d="M20.1 17.9c-.34-1.3-1.33-2.14-2.74-2.38" />
          </svg>
        </span>
      );
    case "trade":
      return <HarborIcon size={24} color="currentColor" />;
    case "robber":
      return (
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7.1 10.1 12 4.8l4.9 5.3v5.1c0 2.55-2.07 4.62-4.62 4.62h-.54A4.62 4.62 0 0 1 7.1 15.2z" />
            <path d="M9.3 10.8c.88-.92 1.78-1.32 2.7-1.32s1.82.4 2.7 1.32" />
            <path d="M9.3 15.5c1.82-.94 3.58-.94 5.4 0" />
            <circle cx="10.1" cy="12.35" r="0.72" fill="currentColor" stroke="none" />
            <circle cx="13.9" cy="12.35" r="0.72" fill="currentColor" stroke="none" />
          </svg>
        </span>
      );
    case "cards":
      return (
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4.9" y="7.1" width="10.3" height="12.4" rx="1.8" transform="rotate(-8 4.9 7.1)" />
            <rect x="8.8" y="4.8" width="10.3" height="13.2" rx="1.8" />
            <path d="m13.95 8.95 1.08 1.92 2.2.38-1.57 1.57.36 2.34-2.07-.95-2.07.95.36-2.34-1.57-1.57 2.2-.38z" />
          </svg>
        </span>
      );
    case "build":
      return (
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="3.4" width="10" height="17.2" rx="2.5" />
            <path d="M10.1 6.4h3.8" />
            <circle cx="12" cy="16.9" r="1.15" fill="currentColor" stroke="none" />
            <path d="M12 10.15v3.8" />
            <path d="M10.1 12.05h3.8" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="landing-feature-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.7 4.8h6.6l3.3 5.2-3.3 5.2H8.7L5.4 10z" />
            <path d="M4.5 10.7h4.6l2.3 3.6-2.3 3.6H4.5l-2.3-3.6z" />
            <path d="M14.9 10.7h4.6l2.3 3.6-2.3 3.6h-4.6l-2.3-3.6z" />
          </svg>
        </span>
      );
  }
}
