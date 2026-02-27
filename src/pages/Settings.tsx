import { logout } from "../lib/auth";

export default function Settings() {
  return (
    <div className="container">
      <div className="card">
        <div className="pageTitle">Settings</div>
        <p className="muted" style={{ marginTop: 6 }}>Account</p>

        <button className="btnSecondary" style={{ marginTop: 12 }} onClick={() => logout()}>
          Logout
        </button>
      </div>
      <div className="spacer" />
    </div>
  );
}
