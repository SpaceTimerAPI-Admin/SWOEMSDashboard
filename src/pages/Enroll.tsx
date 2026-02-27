import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { enroll } from "../lib/api";

export default function Enroll() {
  const nav = useNavigate();
  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      employee_id: employeeId.trim(),
      name: name.trim(),
      pin: pin.trim(),
      // backend expects "code"
      code: code.trim(),
    };

    if (!payload.employee_id || !payload.name || !payload.pin || !payload.code) {
      setError("All fields are required.");
      return;
    }

    setLoading(true);
    try {
      const res: any = await enroll(payload);
      if (!res?.ok) {
        setError(res?.error || "Enrollment failed.");
        return;
      }
      nav("/login");
    } catch (err: any) {
      setError(err?.message || "Enrollment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="pageTitle">Enroll</div>

        <form onSubmit={onSubmit} className="form">
          <label>
            Employee ID
            <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          </label>

          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <label>
            PIN
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
          </label>

          <label>
            Enrollment code
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btnPrimary" disabled={loading}>
            {loading ? "Enrolling..." : "Enroll"}
          </button>
        </form>
      </div>
      <div className="spacer" />
    </div>
  );
}
