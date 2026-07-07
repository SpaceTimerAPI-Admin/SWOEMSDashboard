import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getWeekSchedule } from "../lib/api";
import ReviewCalendar from "../components/ReviewCalendar";

const TZ = "America/New_York";

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function sundayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

function fmtDayHeader(dateStr: string): { weekday: string; date: string } {
  const d = new Date(dateStr + "T12:00:00");
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
  };
}

function fmtMonthYear(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00");
  const end = new Date(weekStart + "T12:00:00");
  end.setDate(end.getDate() + 6);
  const startStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

// Consistent color per employee name
const PALETTE = [
  "rgba(92,107,255,0.18)",
  "rgba(46,232,160,0.14)",
  "rgba(255,182,39,0.15)",
  "rgba(255,84,84,0.13)",
  "rgba(168,144,255,0.18)",
  "rgba(56,189,248,0.15)",
  "rgba(251,146,60,0.15)",
  "rgba(244,114,182,0.15)",
];
const NAME_COLOR_MAP = new Map<string, string>();
let colorIndex = 0;
function colorForName(name: string): string {
  if (!NAME_COLOR_MAP.has(name)) {
    NAME_COLOR_MAP.set(name, PALETTE[colorIndex % PALETTE.length]);
    colorIndex++;
  }
  return NAME_COLOR_MAP.get(name)!;
}

export default function Schedule() {
  const today = todayET();
  const [weekStart, setWeekStart] = useState(sundayOfWeek(today));
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError(null);
    try {
      const res: any = await getWeekSchedule(ws);
      if (!res?.ok) throw new Error(res?.error || "Failed to load");
      setEntries((res.data ?? res).entries || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(weekStart); }, [weekStart]);

  // Build 7-day columns
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group entries by date
  const byDate = new Map<string, any[]>();
  for (const d of days) byDate.set(d, []);
  for (const e of entries) {
    const list = byDate.get(e.work_date);
    if (list) list.push(e);
  }

  // All unique employees this week, sorted
  const allEmployees = [...new Set(entries.map(e => e.employee_name))].sort();

  // Selected employee filter
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  function prevWeek() { setWeekStart(addDays(weekStart, -7)); }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)); }
  function goToday() { setWeekStart(sundayOfWeek(today)); }

  return (
    <div className="page fade-up" style={{ paddingBottom: 90 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
        <div>
          <div className="page-title">Schedule</div>
          <div className="page-subtitle">{fmtMonthYear(weekStart)}</div>
        </div>
        <Link to="/settings" style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none", whiteSpace: "nowrap" }}>
          Upload ↗
        </Link>
      </div>

      {/* Week navigation */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center" }}>
        <button onClick={prevWeek} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", fontSize: 14, cursor: "pointer",
        }}>‹</button>
        <button onClick={goToday} style={{
          padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--muted)", fontSize: 12,
          fontWeight: 600, cursor: "pointer", flex: 1,
        }}>Today</button>
        <button onClick={nextWeek} style={{
          padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
          background: "rgba(255,255,255,0.05)", color: "var(--text)", fontSize: 14, cursor: "pointer",
        }}>›</button>
      </div>

      {/* Employee filter pills */}
      {allEmployees.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          <button
            onClick={() => setSelectedEmployee(null)}
            style={{
              padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: "1px solid",
              borderColor: selectedEmployee === null ? "rgba(92,107,255,0.4)" : "var(--border)",
              background: selectedEmployee === null ? "rgba(92,107,255,0.14)" : "rgba(255,255,255,0.04)",
              color: selectedEmployee === null ? "#B0B8FF" : "var(--muted)",
            }}
          >All</button>
          {allEmployees.map(name => (
            <button
              key={name}
              onClick={() => setSelectedEmployee(selectedEmployee === name ? null : name)}
              style={{
                padding: "4px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: "1px solid",
                borderColor: selectedEmployee === name ? "rgba(92,107,255,0.5)" : "var(--border)",
                background: selectedEmployee === name ? colorForName(name) : "rgba(255,255,255,0.04)",
                color: selectedEmployee === name ? "var(--text)" : "var(--muted)",
              }}
            >{name}</button>
          ))}
        </div>
      )}

      {loading && (
        <div className="card" style={{ padding: "24px", textAlign: "center" }}>
          <span className="spinner" style={{ display: "block", margin: "0 auto 10px" }} />
          <div className="muted" style={{ fontSize: 13 }}>Loading schedule…</div>
        </div>
      )}

      {error && (
        <div style={{
          padding: "10px 13px", borderRadius: 10, fontSize: 13,
          background: "var(--danger-bg)", color: "#FFB0B0",
          border: "1px solid rgba(255,84,84,0.25)",
        }}>{error}</div>
      )}

      {!loading && !error && (
        <>
          {entries.length === 0 ? (
            <div className="card" style={{ padding: "32px", textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📅</div>
              <div style={{ fontSize: 14, color: "var(--muted)" }}>No schedule uploaded for this week.</div>
              <Link to="/settings" style={{ fontSize: 13, color: "#B0B8FF", marginTop: 8, display: "block" }}>
                Upload in Settings →
              </Link>
            </div>
          ) : (
            /* Calendar grid — one column per day */
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(7, minmax(0, 1fr))`,
              gap: 4,
            }}>
              {/* Day headers */}
              {days.map(d => {
                const { weekday, date } = fmtDayHeader(d);
                const isToday = d === today;
                return (
                  <div key={d} style={{
                    textAlign: "center", padding: "6px 2px 8px",
                    borderRadius: 8,
                    background: isToday ? "rgba(92,107,255,0.15)" : "transparent",
                  }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: isToday ? "#B0B8FF" : "var(--muted2)",
                    }}>{weekday}</div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, marginTop: 1,
                      color: isToday ? "#B0B8FF" : "var(--text)",
                    }}>{date}</div>
                  </div>
                );
              })}

              {/* Shift cells per day */}
              {days.map(d => {
                const dayEntries = (byDate.get(d) || [])
                  .filter(e => !selectedEmployee || e.employee_name === selectedEmployee)
                  .sort((a: any, b: any) => (a.shift_start || "").localeCompare(b.shift_start || ""));

                const isToday = d === today;

                return (
                  <div key={d} style={{
                    display: "flex", flexDirection: "column", gap: 4,
                    minHeight: 60,
                    padding: "2px",
                    borderRadius: 8,
                    background: isToday ? "rgba(92,107,255,0.04)" : "transparent",
                    borderTop: `2px solid ${isToday ? "rgba(92,107,255,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}>
                    {dayEntries.length === 0 ? (
                      <div style={{ fontSize: 10, color: "var(--muted2)", textAlign: "center", paddingTop: 8 }}>—</div>
                    ) : dayEntries.map((entry: any, i: number) => (
                      <div key={i} style={{
                        background: colorForName(entry.employee_name),
                        borderRadius: 6,
                        padding: "5px 5px",
                        minWidth: 0,
                      }}>
                        <div style={{
                          fontSize: 10, fontWeight: 700, color: "var(--text)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          lineHeight: 1.2,
                        }}>
                          {entry.employee_name}
                        </div>
                        <div style={{
                          fontSize: 9, color: "var(--muted)", marginTop: 2, lineHeight: 1.3,
                        }}>
                          {entry.all_shifts
                            ? entry.all_shifts.replace(/ - /g, "–")
                            : entry.shift_start && entry.shift_end
                              ? `${entry.shift_start}–${entry.shift_end}`
                              : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <ReviewCalendar weekStart={weekStart} />
    </div>
  );
}
