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

  return (
    <section className="screen-shell admin-shell">
      <article className="surface admin-users-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">{formatText(createText("Admin", "Admin"))}</div>
            <h1>{formatText(createText("Konsole", "Console"))}</h1>
          </div>
          <span className="status-pill">
            {locale === "en" ? `Signed in as ${props.session.username}` : `Angemeldet als ${props.session.username}`}
          </span>
        </div>

        <section className="admin-section">
          <div className="dock-section-head">
            <h2>{formatText(createText("Nutzer anlegen", "Create user"))}</h2>
            <span>{formatText(createText("Konten, Rollen und Passwort-Resets laufen hier zentral.", "Accounts, roles, and password resets are managed here."))}</span>
          </div>
          <div className="admin-form-grid">
            <input
              type="text"
              placeholder={formatText(createText("Nutzername", "Username"))}
              inputMode="text"
              pattern="[A-Za-z0-9]*"
              value={props.createForm.username}
              onChange={(event) => props.onCreateFormChange("username", event.target.value)}
            />
            <input
              type="password"
              placeholder={formatText(createText("Passwort", "Password"))}
              value={props.createForm.password}
              onChange={(event) => props.onCreateFormChange("password", event.target.value)}
            />
            <select value={props.createForm.role} onChange={(event) => props.onCreateFormChange("role", event.target.value)}>
              <option value="user">{formatText(createText("User", "User"))}</option>
              <option value="admin">{formatText(createText("Admin", "Admin"))}</option>
            </select>
            <button type="button" className="primary-button" onClick={props.onCreateUser}>
              {formatText(createText("Nutzer anlegen", "Create user"))}
            </button>
          </div>
        </section>

        <section className="admin-section admin-scroll-section">
          <div className="dock-section-head">
            <h2>{formatText(createText("Nutzerverwaltung", "User management"))}</h2>
            <span>{locale === "en" ? `${props.users.length} accounts` : `${props.users.length} Konten`}</span>
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
                      <span>
                        {locale === "en"
                          ? `Account since ${formatDate(user.createdAt)}`
                          : `Konto seit ${formatDate(user.createdAt)}`}
                      </span>
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
                      placeholder={formatText(createText("Neues Passwort", "New password"))}
                      value={draft.password}
                      onChange={(event) => props.onUserDraftChange(user.id, "password", event.target.value)}
                    />
                    <select value={draft.role} onChange={(event) => props.onUserDraftChange(user.id, "role", event.target.value)}>
                      <option value="user">{formatText(createText("User", "User"))}</option>
                      <option value="admin">{formatText(createText("Admin", "Admin"))}</option>
                    </select>
                  </div>
                  <div className="admin-card-actions">
                    <button type="button" className="primary-button" onClick={() => props.onSaveUser(user.id)}>
                      {formatText(createText("Speichern", "Save"))}
                    </button>
                    <button type="button" className="ghost-button" onClick={() => props.onDeleteUser(user.id)}>
                      {formatText(createText("Löschen", "Delete"))}
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
              <div className="eyebrow">{formatText(createText("Räume", "Rooms"))}</div>
              <h2>{formatText(createText("Aktive Tische", "Active tables"))}</h2>
            </div>
            <span className="status-pill">{locale === "en" ? `${props.rooms.length} rooms` : `${props.rooms.length} Räume`}</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.rooms.map((room) => (
              <article key={room.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>{`Code ${room.code}`}</strong>
                    <span>
                      {room.status === "in_match"
                        ? formatText(createText("Laufende Partie", "Live match"))
                        : room.status === "open"
                          ? formatText(createText("Offen", "Open"))
                          : formatText(createText("Geschlossen", "Closed"))}{" "}
                      - {locale === "en" ? `${room.seats.filter((seat) => seat.userId).length}/6 players` : `${room.seats.filter((seat) => seat.userId).length}/6 Spieler`}
                    </span>
                  </div>
                  <span className="status-pill">{room.status}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(room.id)}>
                    {formatText(createText("Raum öffnen", "Open room"))}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onCloseRoom(room.id)}>
                    {formatText(createText("Raum schließen", "Close room"))}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface admin-matches-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">{formatText(createText("Partien", "Matches"))}</div>
              <h2>{formatText(createText("Match-Verwaltung", "Match management"))}</h2>
            </div>
            <span className="status-pill">{locale === "en" ? `${props.matches.length} matches` : `${props.matches.length} Matches`}</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.matches.map((match) => (
              <article key={match.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>{formatPhase(locale, match.status)}</strong>
                    <span>
                      {locale === "en"
                        ? `Room ${match.roomId.slice(0, 8)} - ${match.playerCount} players`
                        : `Raum ${match.roomId.slice(0, 8)} - ${match.playerCount} Spieler`}
                    </span>
                  </div>
                  <span className="status-pill">{match.id.slice(0, 8)}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(match.roomId)}>
                    {formatText(createText("Zum Raum", "Open room"))}
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onDeleteMatch(match.id)}>
                    {formatText(createText("Match resetten", "Reset match"))}
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
