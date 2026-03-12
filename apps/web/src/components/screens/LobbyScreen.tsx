import type { AuthUser, RoomDetails } from "@hexagonia/shared";
import { useI18n } from "../../i18n";
import { renderPlayerColorLabel } from "../../ui";
import { LoadingButtonContent } from "../shared/LoadingButtonContent";
import { PlayerColorBadge } from "../shared/PlayerIdentity";

export function LobbyScreen(props: {
  session: AuthUser;
  rooms: RoomDetails[];
  joinCode: string;
  createRoomPending: boolean;
  joinByCodePending: boolean;
  onJoinCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onOpenRoom: (roomId: string) => void;
  onResumeMatch: (matchId: string) => void;
}) {
  const { locale, translate } = useI18n();
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, undefined, undefined, params);

  return (
    <section className="screen-shell lobby-shell">
      <article className="surface resume-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">{t("lobby.resume.eyebrow")}</div>
            <h2>{t("lobby.resume.title")}</h2>
          </div>
        </div>

        <div className="scroll-list resume-list">
          {props.rooms.length ? (
            props.rooms.map((room) => {
              const occupiedSeats = room.seats.filter((seat) => seat.userId).length;
              const mySeat = room.seats.find((seat) => seat.userId === props.session.id);
              const canResumeMatch = room.status === "in_match" && !!room.matchId;
              const meta = [
                room.status === "in_match" ? t("lobby.room.status.liveMatch") : t("lobby.room.status.openRoom"),
                t("lobby.room.players", { count: occupiedSeats }),
                mySeat ? t("lobby.room.yourSeat", { seat: mySeat.index + 1 }) : t("lobby.room.saved")
              ].join(" / ");

              return (
                <article key={room.id} className="resume-card">
                  <div className="resume-card-head">
                    <div>
                      <strong>{t("lobby.room.code", { code: room.code })}</strong>
                      <span>{meta}</span>
                    </div>
                    <span className={`status-pill ${canResumeMatch ? "is-warning" : ""}`}>
                      {canResumeMatch ? t("lobby.room.badge.live") : t("lobby.room.badge.ready")}
                    </span>
                  </div>
                  {mySeat ? (
                    <div className="resume-card-meta-row">
                      <PlayerColorBadge
                        color={mySeat.color}
                        label={t("lobby.room.color", {
                          color: renderPlayerColorLabel(locale, mySeat.color)
                        })}
                        compact
                      />
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
                      {canResumeMatch ? t("lobby.room.action.resumeMatch") : t("lobby.room.action.openRoom")}
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">{t("lobby.empty")}</div>
          )}
        </div>
      </article>

      <div className="lobby-side-grid">
        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{t("lobby.create.eyebrow")}</div>
              <h2>{t("lobby.create.title")}</h2>
            </div>
          </div>
          <p>{t("lobby.create.detail")}</p>
          <button
            className="primary-button large-button"
            type="button"
            onClick={props.onCreateRoom}
            disabled={props.createRoomPending}
          >
            <LoadingButtonContent
              loading={props.createRoomPending}
              idleLabel={t("lobby.create.action")}
              loadingLabel={t("lobby.create.loading")}
            />
          </button>
        </article>

        <article className="surface action-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{t("lobby.join.eyebrow")}</div>
              <h2>{t("lobby.join.title")}</h2>
            </div>
          </div>
          <div className="code-join-row">
            <input
              maxLength={6}
              placeholder={t("lobby.join.placeholder")}
              value={props.joinCode}
              onChange={(event) => props.onJoinCodeChange(event.target.value.toUpperCase())}
            />
            <button className="primary-button" type="button" onClick={props.onJoinByCode} disabled={props.joinByCodePending}>
              <LoadingButtonContent
                loading={props.joinByCodePending}
                idleLabel={t("lobby.join.action")}
                loadingLabel={t("lobby.join.loading")}
              />
            </button>
          </div>
          <span className="muted-copy">{t("lobby.join.detail")}</span>
        </article>
      </div>
    </section>
  );
}
