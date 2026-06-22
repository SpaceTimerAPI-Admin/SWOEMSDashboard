import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { askElijah } from "../lib/api";
import { getRole } from "../lib/auth";

type Message = {
  id: string;
  role: "user" | "elijah";
  text: string;
  citedTickets?: { id: string; title: string; location: string }[];
  citedProjects?: { id: string; title: string; location: string }[];
  contextFound?: boolean;
  isError?: boolean;
};

const AVATAR_URL = "/assets/elijah-avatar.png";

function renderAnswerText(text: string): string {
  // Strip the [TICKET #id] / [PROJECT #id] citation markers from display text —
  // they're rendered as clickable chips below instead, so the markers would
  // just look like clutter inline.
  return text
    .replace(/\[TICKET #[a-zA-Z0-9-]+\]/g, "")
    .replace(/\[PROJECT #[a-zA-Z0-9-]+\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export default function AskElijah() {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(() => {
    try { return localStorage.getItem("elijah_seen") === "1"; } catch { return false; }
  });

  // After Dark: 10 PM – midnight local time (server enforces ET, this is just for the UI indicator)
  const hour = new Date().getHours();
  const isAfterDark = hour >= 22;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nav = useNavigate();
  const role = getRole();

  // Only EMS and Admin get access to Elijah
  if (role === "show_tech") return null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", text: question };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      const res: any = await askElijah(question);
      if (!res?.ok) throw new Error(res?.error || "Something went wrong.");
      const data = res.data ?? res;
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "elijah",
        text: data.answer,
        citedTickets: data.cited_tickets || [],
        citedProjects: data.cited_projects || [],
        contextFound: data.context_found,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: `e-err-${Date.now()}`,
        role: "elijah",
        text: e?.message || "Ah man, hit a snag there. Try me again?",
        isError: true,
      }]);
    } finally {
      setBusy(false);
    }
  }

  function goTo(path: string) {
    setOpen(false);
    nav(path);
  }

  return (
    <>
      {/* Floating button + indicator */}
      {!open && (
        <div style={{
          position: "fixed",
          bottom: "calc(var(--nav-h, 64px) + 16px)",
          right: 16,
          zIndex: 1500,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 8,
        }}>
          {!hasInteracted && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 99,
              background: "#161827", border: "1px solid rgba(92,107,255,0.4)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              animation: "elijah-float 2.6s ease-in-out infinite",
              whiteSpace: "nowrap",
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "#818cf8",
                boxShadow: "0 0 0 0 rgba(129,140,248,0.7)",
                animation: "elijah-ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#c7d2fe" }}>Ask Elijah</span>
            </div>
          )}
          <button
            onClick={() => {
              setOpen(true);
              setHasInteracted(true);
              try { localStorage.setItem("elijah_seen", "1"); } catch {}
            }}
            aria-label="Ask Elijah"
            style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              border: `2px solid ${isAfterDark ? "rgba(168,85,247,0.6)" : "rgba(92,107,255,0.5)"}`,
              background: "#161827",
              padding: 0,
              cursor: "pointer",
              boxShadow: isAfterDark
                ? "0 8px 24px rgba(0,0,0,0.5), 0 0 0 4px rgba(168,85,247,0.12)"
                : "0 8px 24px rgba(0,0,0,0.5), 0 0 0 4px rgba(92,107,255,0.08)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src={AVATAR_URL}
              alt="Elijah"
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </button>
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2500,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "min(85svh, 720px)",
              background: "#0d0f1a",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 -10px 40px rgba(0,0,0,0.6)",
              border: "1px solid #2d3147",
              borderBottom: "none",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
              borderBottom: "1px solid #1e2030", flexShrink: 0,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
                border: `2px solid ${isAfterDark ? "rgba(168,85,247,0.5)" : "rgba(92,107,255,0.4)"}`, flexShrink: 0,
              }}>
                <img src={AVATAR_URL} alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#e5e7eb", display: "flex", alignItems: "center", gap: 6 }}>
                  Ask Elijah
                  {isAfterDark && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                      background: "rgba(168,85,247,0.2)", color: "#c084fc",
                      border: "1px solid rgba(168,85,247,0.3)", letterSpacing: "0.05em",
                    }}>🌙 AFTER DARK</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: isAfterDark ? "#a855f7" : "#6b7280" }}>
                  {isAfterDark ? "sassy mode activated, tread carefully" : "your tech, digs through tickets & GroupMe"}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1 }}
              >×</button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", padding: "20px 10px" }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%", overflow: "hidden", margin: "0 auto 12px",
                    border: "2px solid rgba(92,107,255,0.3)",
                  }}>
                    <img src={AVATAR_URL} alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb", marginBottom: 4 }}>
                    {isAfterDark ? "It's After Dark. You've been warned. 🌙" : "Yo, I'm Elijah. 🔧"}
                  </div>
                  <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>
                    {isAfterDark
                      ? "Ask me whatever. Work stuff, life stuff, whatever's on your mind. I'll relate it back to the job somehow. No promises I'll be nice about it."
                      : "Got a question about a ticket, a project, or somethin' that came up in the group chat? Lemme pull it up for you, dawg."}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  {msg.role === "user" ? (
                    <div style={{
                      maxWidth: "85%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px",
                      background: "#4338ca", color: "#fff", fontSize: 14, lineHeight: 1.5,
                    }}>
                      {msg.text}
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, maxWidth: "92%" }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0, marginTop: 2,
                      }}>
                        <img src={AVATAR_URL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                      </div>
                      <div>
                        <div style={{
                          padding: "10px 14px", borderRadius: "4px 14px 14px 14px",
                          background: msg.isError ? "rgba(239,68,68,0.1)" : "#161827",
                          border: `1px solid ${msg.isError ? "rgba(239,68,68,0.25)" : "#2d3147"}`,
                          color: msg.isError ? "#fca5a5" : "#e5e7eb",
                          fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
                        }}>
                          {renderAnswerText(msg.text)}
                        </div>

                        {/* Citation chips */}
                        {((msg.citedTickets && msg.citedTickets.length > 0) || (msg.citedProjects && msg.citedProjects.length > 0)) && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                            {msg.citedTickets?.map(t => (
                              <button
                                key={t.id}
                                onClick={() => goTo(`/tickets/${t.id}`)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                                  borderRadius: 10, border: "1px solid rgba(92,107,255,0.25)",
                                  background: "rgba(92,107,255,0.08)", cursor: "pointer", textAlign: "left",
                                }}
                              >
                                <span style={{ fontSize: 14 }}>🎫</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#c7d2fe", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{t.location}</div>
                                </div>
                                <span style={{ color: "#6b7280", fontSize: 13 }}>›</span>
                              </button>
                            ))}
                            {msg.citedProjects?.map(p => (
                              <button
                                key={p.id}
                                onClick={() => goTo(`/projects/${p.id}`)}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                                  borderRadius: 10, border: "1px solid rgba(255,182,39,0.25)",
                                  background: "rgba(255,182,39,0.08)", cursor: "pointer", textAlign: "left",
                                }}
                              >
                                <span style={{ fontSize: 14 }}>📐</span>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#FFD07A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                                  <div style={{ fontSize: 11, color: "#6b7280" }}>{p.location}</div>
                                </div>
                                <span style={{ color: "#6b7280", fontSize: 13 }}>›</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                    <img src={AVATAR_URL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                  </div>
                  <div style={{
                    padding: "12px 16px", borderRadius: "4px 14px 14px 14px",
                    background: "#161827", border: "1px solid #2d3147",
                    display: "flex", gap: 4, alignItems: "center",
                  }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{
                        width: 6, height: 6, borderRadius: "50%", background: "#6b7280",
                        animation: `elijah-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "12px 14px", borderTop: "1px solid #1e2030", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask Elijah somethin'…"
                  rows={1}
                  style={{
                    flex: 1, resize: "none", maxHeight: 90, padding: "10px 14px", borderRadius: 14,
                    border: "1px solid #2d3147", background: "#161827", color: "#e5e7eb",
                    fontSize: 14, outline: "none", lineHeight: 1.4,
                  }}
                />
                <button
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  style={{
                    width: 40, height: 40, borderRadius: "50%", border: "none", flexShrink: 0,
                    background: input.trim() && !busy ? "#4338ca" : "#1e2030",
                    color: input.trim() && !busy ? "#fff" : "#4b5563",
                    cursor: input.trim() && !busy ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                  }}
                >
                  ↑
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes elijah-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes elijah-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes elijah-ping {
          0% { box-shadow: 0 0 0 0 rgba(129,140,248,0.7); }
          70% { box-shadow: 0 0 0 7px rgba(129,140,248,0); }
          100% { box-shadow: 0 0 0 0 rgba(129,140,248,0); }
        }
      `}</style>
    </>
  );
}
