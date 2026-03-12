import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { ErrorParams } from "@hexagonia/shared";
import type { MusicPlaybackMode, MusicTrack } from "../../audio/uiSoundManager";
import { useI18n } from "../../i18n";
import { HarborIcon } from "../../resourceIcons";
import { LandingBoardScene } from "../../LandingBoardScene";
import { LocaleSelect } from "../shared/LocaleSelect";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { PopupSelect } from "../shared/PopupSelect";
import type { AuthMode } from "../../ui";
import hexaLogo from "../../../../../assets/img/hexa.png";

const FLOW_STEPS = [
  {
    titleKey: "landing.flow.startRound.title",
    bodyKey: "landing.flow.startRound.body",
    metaKey: "landing.flow.startRound.meta"
  },
  {
    titleKey: "landing.flow.shareInvite.title",
    bodyKey: "landing.flow.shareInvite.body",
    metaKey: "landing.flow.shareInvite.meta"
  },
  {
    titleKey: "landing.flow.configureMatch.title",
    bodyKey: "landing.flow.configureMatch.body",
    metaKey: "landing.flow.configureMatch.meta"
  },
  {
    titleKey: "landing.flow.startPlaying.title",
    bodyKey: "landing.flow.startPlaying.body",
    metaKey: "landing.flow.startPlaying.meta"
  }
] as const;

const BUILD_FEATURES = [
  {
    icon: "board",
    titleKey: "landing.features.boardDynamics.title",
    bodyKey: "landing.features.boardDynamics.body",
    detailKey: "landing.features.boardDynamics.detail"
  },
  {
    icon: "rooms",
    titleKey: "landing.features.friendsAtTable.title",
    bodyKey: "landing.features.friendsAtTable.body",
    detailKey: "landing.features.friendsAtTable.detail"
  },
  {
    icon: "trade",
    titleKey: "landing.features.tradeHarbors.title",
    bodyKey: "landing.features.tradeHarbors.body",
    detailKey: "landing.features.tradeHarbors.detail"
  },
  {
    icon: "robber",
    titleKey: "landing.features.robberDevelopment.title",
    bodyKey: "landing.features.robberDevelopment.body",
    detailKey: "landing.features.robberDevelopment.detail"
  }
] as const;

const MECHANICS = [
  {
    icon: "board",
    titleKey: "landing.mechanics.boardSetup.title",
    bodyKey: "landing.mechanics.boardSetup.body",
    accentKey: "landing.mechanics.boardSetup.accent"
  },
  {
    icon: "trade",
    titleKey: "landing.mechanics.trading.title",
    bodyKey: "landing.mechanics.trading.body",
    accentKey: "landing.mechanics.trading.accent"
  },
  {
    icon: "robber",
    titleKey: "landing.mechanics.robber.title",
    bodyKey: "landing.mechanics.robber.body",
    accentKey: "landing.mechanics.robber.accent"
  },
  {
    icon: "cards",
    titleKey: "landing.mechanics.development.title",
    bodyKey: "landing.mechanics.development.body",
    accentKey: "landing.mechanics.development.accent"
  },
  {
    icon: "rooms",
    titleKey: "landing.mechanics.friends.title",
    bodyKey: "landing.mechanics.friends.body",
    accentKey: "landing.mechanics.friends.accent"
  },
  {
    icon: "build",
    titleKey: "landing.mechanics.mobile.title",
    bodyKey: "landing.mechanics.mobile.body",
    accentKey: "landing.mechanics.mobile.accent"
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
  const { locale, setLocale, translate: t } = useI18n();
  const text = (key: string, params?: ErrorParams) => t(key, undefined, undefined, params);
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
    title: text(step.titleKey),
    body: text(step.bodyKey),
    meta: text(step.metaKey)
  }));
  const buildFeatures = BUILD_FEATURES.map((feature) => ({
    ...feature,
    title: text(feature.titleKey),
    body: text(feature.bodyKey),
    detail: text(feature.detailKey)
  }));
  const mechanics = MECHANICS.map((entry) => ({
    ...entry,
    title: text(entry.titleKey),
    body: text(entry.bodyKey),
    accent: text(entry.accentKey)
  }));
  const authSubmitLabel =
    props.authMode === "login" ? text("landing.auth.submit.login") : text("landing.auth.submit.register");
  const hasMusicTracks = props.musicTracks.length > 0;
  const selectedTrack = props.musicTracks.find((track) => track.id === props.selectedMusicTrackId) ?? props.musicTracks[0] ?? null;
  const landingModeLabel =
    props.musicPlaybackMode === "cycle" ? text("shared.playlist") : text("shared.loop");
  const landingMusicPaused = optimisticTrackSwitchId ? false : props.musicPaused;
  const brandName = text("app.title");
  const musicTrackOptions = props.musicTracks.length
    ? props.musicTracks.map((track) => ({
        value: track.id,
        label: track.name
      }))
    : [{ value: "", label: text("landing.music.noTracks"), disabled: true }];

  return (
    <div ref={rootRef} className="guest-root landing-root">
      <header className="landing-header">
        <button
          type="button"
          className="landing-brand"
          onClick={scrollToTop}
          aria-label={text("landing.header.backToTop")}
        >
          <span className="landing-brand-mark">
            <img src={hexaLogo} alt={brandName} className="landing-brand-image" />
          </span>
          <span className="landing-brand-copy">
            <strong>{brandName}</strong>
            <span>{text("landing.header.tagline")}</span>
          </span>
        </button>

        <div className="landing-header-tools">
          <div className="landing-header-actions">
            <LocaleSelect value={locale} ariaLabel={text("shared.language")} variant="landing" onChange={setLocale} />
          </div>
          <div className="landing-music-panel">
            <div className="landing-music-copy">
              <strong>{text("shared.music")}</strong>
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
                  ariaLabel={text("landing.music.chooseTrack")}
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
                  ? text("shared.play")
                  : text("shared.pause")}
              </button>
              <button
                type="button"
                className={`landing-music-chip ${props.musicPlaybackMode === "cycle" ? "is-active" : ""}`}
                aria-pressed={props.musicPlaybackMode === "cycle"}
                onClick={() => props.onMusicPlaybackModeChange(props.musicPlaybackMode === "cycle" ? "single" : "cycle")}
                disabled={props.musicTracks.length <= 1}
                title={text("landing.music.toggleMode")}
              >
                {landingModeLabel}
              </button>
            </div>
          </div>

          <div className="landing-header-actions">
            <button type="button" className="landing-nav-button is-ghost" onClick={() => scrollToSection("zugang")}>
              {text("shared.login")}
            </button>
            <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
              {text("landing.actions.playNow")}
            </button>
          </div>
        </div>
      </header>

      {props.inviteCode ? (
        <aside className="landing-invite-banner" data-reveal style={revealStyle(0)}>
          <div className="landing-invite-copy">
            <span className="landing-kicker">{text("landing.invite.detected")}</span>
            <strong>
              {text("landing.invite.waitingForLogin", { code: props.inviteCode })}
            </strong>
            <span>{text("landing.invite.redirect")}</span>
          </div>
          <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
            {text("landing.invite.open")}
          </button>
        </aside>
      ) : null}

      <main className="landing-main">
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-copy">
            <span className="landing-kicker">{text("landing.header.tagline")}</span>
            <h1 id="landing-hero-title">{text("landing.hero.title")}</h1>
            <p className="landing-lead">
              {text("landing.hero.lead")}
            </p>

            <article className="landing-free-promise" data-reveal style={revealStyle(120)}>
              <div className="landing-free-promise-mark" aria-hidden="true">
                <span>100%</span>
                <span>{text("shared.free")}</span>
              </div>
              <div className="landing-free-promise-copy">
                <div className="landing-free-promise-head">
                  <span className="landing-kicker">{text("landing.hero.fairPlay")}</span>
                </div>
                <strong>{text("landing.hero.freeTitle")}</strong>
                <p>{text("landing.hero.freeBody")}</p>
              </div>
              <div className="landing-free-promise-actions">
                <button type="button" className="landing-button" onClick={() => scrollToSection("zugang")}>
                  {props.inviteCode ? text("landing.hero.cta.invite") : text("landing.hero.cta.free")}
                </button>
              </div>
            </article>
          </div>

          <div className="landing-hero-scene-column">
            <div className="landing-scene-shell">
              <LandingBoardScene reducedMotion={prefersReducedMotion} visualProfile="fancy" />
              <div className="landing-scene-badge is-top">
                <span className="landing-badge-label">{text("landing.hero.badge.table.label")}</span>
                <strong>{text("landing.hero.badge.table.value")}</strong>
              </div>
              <div className="landing-scene-badge is-bottom">
                <span className="landing-badge-label">{text("landing.hero.badge.round.label")}</span>
                <strong>{text("landing.hero.badge.round.value")}</strong>
              </div>
              <div className="landing-scene-badge is-side">
                <span className="landing-badge-label">{text("landing.hero.badge.invite.label")}</span>
                <strong>{text("landing.hero.badge.invite.value")}</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="ablauf" className="landing-section" aria-labelledby="landing-flow-title">
          <div className="landing-section-head" data-reveal style={revealStyle(0)}>
            <span className="landing-kicker">{text("landing.section.flow.kicker")}</span>
            <h2 id="landing-flow-title">{text("landing.section.flow.title")}</h2>
            <p>{text("landing.section.flow.body")}</p>
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
            <span className="landing-kicker">{text("landing.section.build.kicker")}</span>
            <h2 id="landing-build-title">{text("landing.section.build.title")}</h2>
            <p>{text("landing.section.build.body")}</p>
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
              <span className="landing-kicker">{text("landing.section.mechanics.kicker")}</span>
              <h2 id="landing-mechanics-title">{text("landing.section.mechanics.title")}</h2>
              <p>{text("landing.section.mechanics.body")}</p>

              <ul className="landing-capability-list">
                <li>{text("landing.section.mechanics.capability.seats")}</li>
                <li>{text("landing.section.mechanics.capability.setup")}</li>
                <li>{text("landing.section.mechanics.capability.trade")}</li>
                <li>{text("landing.section.mechanics.capability.robber")}</li>
                <li>{text("landing.section.mechanics.capability.cards")}</li>
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
            <h2 id="landing-access-title">{text("landing.access.title")}</h2>
            <p>{text("landing.access.body")}</p>
            <article className="landing-access-point landing-access-point-highlight">
              <strong>{props.inviteCode ? text("landing.access.highlight.inviteTitle") : text("landing.access.highlight.defaultTitle")}</strong>
              <span>
                {props.inviteCode
                  ? text("landing.access.highlight.inviteBody", { code: props.inviteCode })
                  : text("landing.access.highlight.defaultBody")}
              </span>
            </article>
          </div>

          <article className="landing-auth-panel" data-reveal style={revealStyle(120)}>
            <div className="landing-auth-head">
              <div>
                <span className="landing-kicker">{text("shared.account")}</span>
                <h3>{props.authMode === "login" ? text("landing.auth.title.login") : text("landing.auth.title.register")}</h3>
              </div>
              <div className="segmented-control landing-auth-toggle">
                <button
                  type="button"
                  className={props.authMode === "login" ? "is-active" : ""}
                  onClick={() => props.onAuthModeChange("login")}
                >
                  {text("shared.login")}
                </button>
                <button
                  type="button"
                  className={props.authMode === "register" ? "is-active" : ""}
                  onClick={() => props.onAuthModeChange("register")}
                >
                  {text("shared.register")}
                </button>
              </div>
            </div>

            {props.inviteCode ? (
              <div className="landing-auth-note">
                <strong>{text("landing.auth.inviteActive")}</strong>
                <span>{text("landing.auth.inviteAfterLogin", { code: props.inviteCode })}</span>
              </div>
            ) : null}

            <form className="landing-auth-form" onSubmit={props.onSubmit}>
              <label className="landing-field">
                <span>{text("shared.username")}</span>
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
                <span>{text("shared.password")}</span>
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
                loadingLabel={props.authMode === "login" ? text("landing.auth.loading.login") : text("landing.auth.loading.register")}
                />
              </button>

              {props.authMode === "register" ? (
                <p className="landing-recaptcha-note">
                {text("landing.auth.recaptcha.prefix")}{" "}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
                    {text("shared.privacyPolicy")}
                  </a>{" "}
                  {text("shared.and")}{" "}
                  <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
                    {text("shared.termsOfService")}
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
          <span>{text("landing.footer.body")}</span>
        </div>
        <span>{text("landing.footer.tagline")}</span>
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
