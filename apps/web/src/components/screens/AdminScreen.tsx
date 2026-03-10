import type { AdminMatchSummary, AdminUserRecord, AuthUser, RoomDetails, UserRole } from "@hexagonia/shared";
import { createText, useI18n } from "../../i18n";
import { formatPhase } from "../../ui";

export interface AdminCreateFormState {
  username: string;
  password: string;
  role: UserRole;
}

export interface AdminUserDraftState {
  username: string;
  password: string;
  role: UserRole;
}

export function AdminScreen(props: {
  session: AuthUser;
  users: AdminUserRecord[];
  rooms: RoomDetails[];
  matches: AdminMatchSummary[];
  createForm: AdminCreateFormState;
  userDrafts: Record<string, AdminUserDraftState>;
  onCreateFormChange: (field: keyof AdminCreateFormState, value: string) => void;
  onCreateUser: () => void;
  onUserDraftChange: (userId: string, field: keyof AdminUserDraftState, value: string) => void;
  onSaveUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onCloseRoom: (roomId: string) => void;
  onDeleteMatch: (matchId: string) => void;
  onOpenRoom: (roomId: string) => void;
}) {
  const { locale, formatDate, formatText } = useI18n();
  const text = (de: string, en: string, params?: Record<string, string | number>) =>
    formatText(createText(de, en, params));

  return (
    <section className="screen-shell admin-shell">
      <article className="surface admin-users-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">{text("Admin", "Admin")}</div>
            <h1>{text("Konsole", "Console")}</h1>
          </div>
          <span className="status-pill">{text("Angemeldet als {username}", "Signed in as {username}", { username: props.session.username })}</span>
        </div>

        <section className="admin-section">
          <div className="dock-section-head">
            <h2>{text("Nutzer anlegen", "Create user")}</h2>
            <span>{text("Konten, Rollen und Passwort-Resets laufen hier zentral.", "Accounts, roles, and password resets are managed here.")}</span>
          </div>
          <div className="admin-form-grid">
            <input
              type="text"
              placeholder={text("Nutzername", "Username")}
              inputMode="text"
              pattern="[A-Za-z0-9]*"
              value={props.createForm.username}
              onChange={(event) => props.onCreateFormChange("username", event.target.value)}
            />
            <input
              type="password"
              placeholder={text("Passwort", "Password")}
              value={props.createForm.password}
              onChange={(event) => props.onCreateFormChange("password", event.target.value)}
            />
            <select value={props.createForm.role} onChange={(event) => props.onCreateFormChange("role", event.target.value)}>
              <option value="user">{text("User", "User")}</option>
              <option value="admin">{text("Admin", "Admin")}</option>
            </select>
            <button type="button" className="primary-button" onClick={props.onCreateUser}>
              {text("Nutzer anlegen", "Create user")}
            </button>
          </div>
        </section>

        <section className="admin-section admin-scroll-section">
          <div className="dock-section-head">
            <h2>{text("Nutzerverwaltung", "User management")}</h2>
            <span>{text("{count} Konten", "{count} accounts", { count: props.users.length })}</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.users.map((user) => {
              const draft = props.userDrafts[user.id] ?? {
                username: user.username,
                password: "",
                role: user.role
              };
              return (
                <article key={user.id} className="admin-card">
                  <div className="admin-card-head">
                    <div>
                      <strong>{user.username}</strong>
                      <span>{text("Konto seit {date}", "Account since {date}", { date: formatDate(user.createdAt) })}</span>
                    </div>
                    <span className="status-pill">{user.role === "admin" ? "Admin" : "User"}</span>
                  </div>
                  <div className="admin-form-grid compact">
                    <input
                      type="text"
                      inputMode="text"
                      pattern="[A-Za-z0-9]*"
                      value={draft.username}
                      onChange={(event) => props.onUserDraftChange(user.id, "username", event.target.value)}
                    />
                    <input
                      type="password"
                      placeholder={text("Neues Passwort", "New password")}
                      value={draft.password}
                      onChange={(event) => props.onUserDraftChange(user.id, "password", event.target.value)}
                    />
                    <select value={draft.role} onChange={(event) => props.onUserDraftChange(user.id, "role", event.target.value)}>
                      <option value="user">{text("User", "User")}</option>
                      <option value="admin">{text("Admin", "Admin")}</option>
                    </select>
                  </div>
                  <div className="admin-card-actions">
                    <button type="button" className="primary-button" onClick={() => props.onSaveUser(user.id)}>
                      {text("Speichern", "Save")}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => props.onDeleteUser(user.id)}>
                      {text("Löschen", "Delete")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </article>

      <div className="admin-side-stack">
        <article className="surface admin-rooms-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{text("Räume", "Rooms")}</div>
              <h2>{text("Aktive Tische", "Active tables")}</h2>
            </div>
            <span className="status-pill">{text("{count} Räume", "{count} rooms", { count: props.rooms.length })}</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.rooms.map((room) => (
              <article key={room.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>{`Code ${room.code}`}</strong>
                    <span>
                      {room.status === "in_match"
                        ? text("Laufende Partie", "Live match")
                        : room.status === "open"
                          ? text("Offen", "Open")
                          : text("Geschlossen", "Closed")}{" "}
                      -{" "}
                      {text("{count}/6 Spieler", "{count}/6 players", {
                        count: room.seats.filter((seat) => seat.userId).length
                      })}
                    </span>
                  </div>
                  <span className="status-pill">{room.status}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(room.id)}>
                    {text("Raum öffnen", "Open room")}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onCloseRoom(room.id)}>
                    {text("Raum schließen", "Close room")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface admin-matches-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{text("Partien", "Matches")}</div>
              <h2>{text("Match-Verwaltung", "Match management")}</h2>
            </div>
            <span className="status-pill">{text("{count} Matches", "{count} matches", { count: props.matches.length })}</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.matches.map((match) => (
              <article key={match.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>{formatPhase(locale, match.status)}</strong>
                    <span>
                      {text("Raum {room} - {count} Spieler", "Room {room} - {count} players", {
                        room: match.roomId.slice(0, 8),
                        count: match.playerCount
                      })}
                    </span>
                  </div>
                  <span className="status-pill">{match.id.slice(0, 8)}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(match.roomId)}>
                    {text("Zum Raum", "Open room")}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onDeleteMatch(match.id)}>
                    {text("Match resetten", "Reset match")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
