import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAuthed } from "../lib/auth";
import { login, setToken } from "../lib/api";

const PENDING_KEY = "md_pending_employee_id";

export default function LoginPin() {
  const nav = useNavigate();
  const authed = useMemo(() => isAuthed(), []);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authed) {
      nav("/");
      return;
    }
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (!pending) {
      nav("/login");
      return;
    }
    setEmployeeId(pending);
  }, [authed, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(employeeId, pin);
      if (!res.ok) throw new Error(res.error || "Login failed");
      setToken(res.token);
      sessionStorage.removeItem(PENDING_KEY);
      nav("/");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function changeId() {
    sessionStorage.removeItem(PENDING_KEY);
    nav("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/40 border border-slate-700/40 rounded-2xl shadow-xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Enter PIN</h1>
          <div className="mt-1 text-slate-300 text-sm flex items-center justify-between">
            <span>Employee ID: <span className="font-mono">{employeeId || "—"}</span></span>
            <button
              type="button"
              onClick={changeId}
              className="text-slate-300 hover:text-white"
            >
              Change
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-300">PIN</label>
            <input
              className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="4-digit PIN"
              maxLength={8}
            />
          </div>

          {error ? <div className="text-red-400 text-sm">{error}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 transition px-4 py-3 font-semibold"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link className="text-slate-300 hover:text-white" to="/reset-pin">
            Reset PIN
          </Link>
          <Link className="text-slate-300 hover:text-white" to="/enroll">
            New user?
          </Link>
        </div>
      </div>
    </div>
  );
}
