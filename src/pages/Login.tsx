import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { setToken } from "../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ employee_id: employeeId.trim(), pin: pin.trim() });
      // Expected response shape: { ok: true, token: string } OR { token: string }
      const token = (res as any)?.token;
      if (!token) throw new Error("Login did not return a token");
      setToken(token);
      nav("/");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Login</h1>
        <p className="muted">Enter your Employee ID and 4-digit PIN.</p>

        <form onSubmit={onSubmit} className="form">
          <label className="label">
            Employee ID
            <input
              className="input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              required
            />
          </label>

          <label className="label">
            PIN
            <input
              className="input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <div className="error">{error}</div> : null}

          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
