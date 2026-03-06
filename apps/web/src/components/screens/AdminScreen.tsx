import type { AdminMatchSummary, AdminUserRecord, AuthUser, RoomDetails, UserRole } from "@hexagonia/shared";
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
  return (
    <section className="screen-shell admin-shell">
      <article className="surface admin-users-surface">
        <div className="surface-head">
          <div>
            <div className="eyebrow">Admin</div>
            <h1>Konsole</h1>
          </div>
          <span className="status-pill">Angemeldet als {props.session.username}</span>
        </div>

        <section className="admin-section">
          <div className="dock-section-head">
            <h2>Nutzer anlegen</h2>
            <span>Konten, Rollen und Passwort-Resets laufen hier zentral.</span>
          </div>
          <div className="admin-form-grid">
            <input
              type="text"
              placeholder="Nutzername"
              value={props.createForm.username}
              onChange={(event) => props.onCreateFormChange("username", event.target.value)}
            />
            <input
              type="password"
              placeholder="Passwort"
              value={props.createForm.password}
              onChange={(event) => props.onCreateFormChange("password", event.target.value)}
            />
            <select value={props.createForm.role} onChange={(event) => props.onCreateFormChange("role", event.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button type="button" className="primary-button" onClick={props.onCreateUser}>
              Nutzer anlegen
            </button>
          </div>
        </section>

        <section className="admin-section admin-scroll-section">
          <div className="dock-section-head">
            <h2>Nutzerverwaltung</h2>
            <span>{props.users.length} Konten</span>
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
                      <span>Konto seit {new Date(user.createdAt).toLocaleDateString("de-DE")}</span>
                    </div>
                    <span className="status-pill">{user.role === "admin" ? "Admin" : "User"}</span>
                  </div>
                  <div className="admin-form-grid compact">
                    <input
                      type="text"
                      value={draft.username}
                      onChange={(event) => props.onUserDraftChange(user.id, "username", event.target.value)}
                    />
                    <input
                      type="password"
                      placeholder="Neues Passwort"
                      value={draft.password}
                      onChange={(event) => props.onUserDraftChange(user.id, "password", event.target.value)}
                    />
                    <select value={draft.role} onChange={(event) => props.onUserDraftChange(user.id, "role", event.target.value)}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="admin-card-actions">
                    <button type="button" className="primary-button" onClick={() => props.onSaveUser(user.id)}>
                      Speichern
                    </button>
                    <button type="button" className="ghost-button" onClick={() => props.onDeleteUser(user.id)}>
                      Loeschen
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
              <div className="eyebrow">Raeume</div>
              <h2>Aktive Tische</h2>
            </div>
            <span className="status-pill">{props.rooms.length} Raeume</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.rooms.map((room) => (
              <article key={room.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>Code {room.code}</strong>
                    <span>
                      {room.status === "in_match" ? "Laufende Partie" : room.status === "open" ? "Offen" : "Geschlossen"} -{" "}
                      {room.seats.filter((seat) => seat.userId).length}/4 Spieler
                    </span>
                  </div>
                  <span className="status-pill">{room.status}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(room.id)}>
                    Raum oeffnen
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onCloseRoom(room.id)}>
                    Raum schliessen
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface admin-matches-surface">
          <div className="surface-head">
            <div>
              <div className="eyebrow">Partien</div>
              <h2>Match-Verwaltung</h2>
            </div>
            <span className="status-pill">{props.matches.length} Matches</span>
          </div>
          <div className="scroll-list admin-card-list">
            {props.matches.map((match) => (
              <article key={match.id} className="admin-card">
                <div className="admin-card-head">
                  <div>
                    <strong>{formatPhase(match.status)}</strong>
                    <span>
                      Raum {match.roomId.slice(0, 8)} - {match.playerCount} Spieler
                    </span>
                  </div>
                  <span className="status-pill">{match.id.slice(0, 8)}</span>
                </div>
                <div className="admin-card-actions">
                  <button type="button" className="secondary-button" onClick={() => props.onOpenRoom(match.roomId)}>
                    Zum Raum
                  </button>
                  <button type="button" className="ghost-button" onClick={() => props.onDeleteMatch(match.id)}>
                    Match resetten
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
