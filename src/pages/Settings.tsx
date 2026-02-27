import { logout } from "../lib/auth";

export default function Settings() {
  return (
    <div className="page">
      <div className="card">
        <h1>Settings</h1>
        <p className="muted">Account</p>

        <button className="btn" onClick={() => logout()}>
          Logout
        </button>
      </div>
    </div>
  );
}
