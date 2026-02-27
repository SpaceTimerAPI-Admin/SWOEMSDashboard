import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPin } from "../lib/api";

export default function ResetPin() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const id = employeeId.trim();
    if (!id) {
      setError("Employee ID required");
      return;
    }
    if (!code.trim()) {
      setError("Reset code required");
      return;
    }
    if (!pin.trim()) {
      setError("New PIN required");
      return;
    }
    if (pin.trim() !== pin2.trim()) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await resetPin({ employee_id: id, code: code.trim(), pin: pin.trim() });
      if (!res.ok) throw new Error(res.error || "Reset failed");
      setSuccess("PIN updated. You can sign in now.");
      setTimeout(() => nav("/login"), 600);
    } catch (err: any) {
      setError(err?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/40 border border-slate-700/40 rounded-2xl shadow-xl p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Reset PIN</h1>
          <p className="text-slate-300 mt-1 text-sm">
            Enter your Employee ID and the reset code provided by a supervisor.
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
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">Reset code</label>
            <input
              className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">New PIN</label>
            <input
              className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">Confirm new PIN</label>
            <input
              className="mt-1 w-full rounded-xl bg-slate-950/50 border border-slate-700/50 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={pin2}
              onChange={(e) => setPin2(e.target.value)}
              inputMode="numeric"
              autoComplete="new-password"
            />
          </div>

          {error ? <div className="text-red-400 text-sm">{error}</div> : null}
          {success ? <div className="text-emerald-400 text-sm">{success}</div> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 transition px-4 py-3 font-semibold"
          >
            {loading ? "Updating…" : "Update PIN"}
          </button>
        </form>

        <div className="mt-5 text-sm">
          <Link className="text-slate-300 hover:text-white" to="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
