import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAuthed } from "../lib/auth";

const PENDING_KEY = "md_pending_employee_id";

export default function Login() {
  const nav = useNavigate();
  const authed = useMemo(() => isAuthed(), []);
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (authed) nav("/");
  }, [authed, nav]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const id = employeeId.trim();
    if (!id) {
      setError("Employee ID required");
      return;
    }

    sessionStorage.setItem(PENDING_KEY, id);
    nav("/login-pin");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/40 border border-slate-700/40 rounded-2xl shadow-xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-slate-300 mt-1">
            Enter your Employee ID. You will enter your PIN on the next screen.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-300">Employee ID</label>
            <input
              className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              inputMode="numeric"
              autoComplete="username"
              placeholder="e.g. 12345"
            />
          </div>

          {error ? <div className="text-red-400 text-sm">{error}</div> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 transition px-4 py-3 font-semibold"
          >
            Continue
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
