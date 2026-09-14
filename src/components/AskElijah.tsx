import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getRole } from "../lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────
type Message = {
  id: string;
  role: "user" | "elijah";
  text: string;
  citedTickets?: { id: string; title: string; location: string }[];
  citedProjects?: { id: string; title: string; location: string }[];
  contextFound?: boolean;
  isError?: boolean;
  ts: number;
};

type Conversation = {
  id: string;
  title: string;      // auto-set from first user message
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

// ── Constants ──────────────────────────────────────────────────────────────────
const AVATAR_URL = "/assets/elijah-avatar.png";
const STORAGE_KEY = "elijah_conversations_v2";
const MAX_CONVOS = 20;

// ── Persistence ────────────────────────────────────────────────────────────────
function loadConvos(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveConvos(convos: Conversation[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(convos)); } catch {}
}

function newConvo(): Conversation {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "New conversation",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function renderAnswerText(text: string): string {
  return text
    .replace(/\[TICKET #[a-zA-Z0-9-]+\]/g, "")
    .replace(/\[PROJECT #[a-zA-Z0-9-]+\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function fmtRelTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function askElijah(question: string, history: { role: string; text: string }[]) {
  const token = localStorage.getItem("md_session_token") || localStorage.getItem("swoems_token") || "";
  const res = await fetch("/api/ask-elijah", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, history }),
  });
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AskElijah() {
  const role = getRole();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [convos, setConvos] = useState<Conversation[]>(() => loadConvos());
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadConvos();
    return saved.length > 0 ? saved[0].id : null;
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(() => {
    try { return localStorage.getItem("elijah_seen") === "1"; } catch { return false; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const hour = new Date().getHours();
  const isAfterDark = hour >= 22;

  if (role === "show_tech") return null;

  // Active conversation
  const activeConvo = convos.find(c => c.id === activeId) || null;
  const messages = activeConvo?.messages || [];

  // Persist on change
  useEffect(() => { saveConvos(convos); }, [convos]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // Focus input on open
  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, activeId]);

  function switchConvo(id: string) {
    setActiveId(id);
    setShowSidebar(false);
    setInput("");
  }

  function startNewConvo() {
    const c = newConvo();
    setConvos(prev => {
      const updated = [c, ...prev].slice(0, MAX_CONVOS);
      return updated;
    });
    setActiveId(c.id);
    setShowSidebar(false);
    setInput("");
  }

  function deleteConvo(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConvos(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (activeId === id) setActiveId(updated[0]?.id || null);
      return updated;
    });
  }

  async function send(text?: string) {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    // Ensure we have an active convo
    let convoId = activeId;
    if (!convoId) {
      const c = newConvo();
      setConvos(prev => [c, ...prev].slice(0, MAX_CONVOS));
      setActiveId(c.id);
      convoId = c.id;
    }

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question,
      ts: Date.now(),
    };

    // Build conversation history to send (last 8 exchanges = 16 messages max)
    const currentMessages = convos.find(c => c.id === convoId)?.messages || [];
    const historyToSend = currentMessages.slice(-16).map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      text: m.text,
    }));

    // Append user message and update title
    setConvos(prev => prev.map(c => {
      if (c.id !== convoId) return c;
      const isFirst = c.messages.length === 0;
      return {
        ...c,
        title: isFirst ? question.slice(0, 50) : c.title,
        messages: [...c.messages, userMsg],
        updatedAt: Date.now(),
      };
    }));
    setInput("");
    setBusy(true);

    try {
      const res: any = await askElijah(question, historyToSend);
      if (!res?.ok) throw new Error(res?.error || "Something went wrong.");
      const data = res.data ?? res;
      const elijahMsg: Message = {
        id: `e-${Date.now()}`,
        role: "elijah",
        text: data.answer,
        citedTickets: data.cited_tickets || [],
        citedProjects: data.cited_projects || [],
        contextFound: data.context_found,
        ts: Date.now(),
      };
      setConvos(prev => prev.map(c =>
        c.id === convoId
          ? { ...c, messages: [...c.messages, elijahMsg], updatedAt: Date.now() }
          : c
      ));
    } catch (e: any) {
      const errMsg: Message = {
        id: `e-err-${Date.now()}`,
        role: "elijah",
        text: e?.message || "Ah man, hit a snag. Try me again?",
        isError: true,
        ts: Date.now(),
      };
      setConvos(prev => prev.map(c =>
        c.id === convoId
          ? { ...c, messages: [...c.messages, errMsg], updatedAt: Date.now() }
          : c
      ));
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
      {/* ── Floating button ────────────────────────────────────────────────── */}
      {!open && (
        <div style={{ position: "fixed", bottom: "calc(var(--nav-h, 64px) + 16px)", right: 16, zIndex: 1500, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          {!hasInteracted && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 99, background: "#161827", border: "1px solid rgba(92,107,255,0.4)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)", animation: "elijah-float 2.6s ease-in-out infinite", whiteSpace: "nowrap" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#818cf8", animation: "elijah-ping 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#c7d2fe" }}>Ask Elijah</span>
            </div>
          )}
          <button
            onClick={() => { setOpen(true); setHasInteracted(true); try { localStorage.setItem("elijah_seen", "1"); } catch {} }}
            aria-label="Ask Elijah"
            style={{ width: 58, height: 58, borderRadius: "50%", border: `2px solid ${isAfterDark ? "rgba(168,85,247,0.6)" : "rgba(92,107,255,0.5)"}`, background: "#161827", padding: 0, cursor: "pointer", boxShadow: isAfterDark ? "0 8px 24px rgba(0,0,0,0.5), 0 0 0 4px rgba(168,85,247,0.12)" : "0 8px 24px rgba(0,0,0,0.5), 0 0 0 4px rgba(92,107,255,0.08)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <img src={AVATAR_URL} alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </button>
        </div>
      )}

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2500, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ width: "100%", maxWidth: 520, maxHeight: "min(90svh, 780px)", background: "#0d0f1a", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", boxShadow: "0 -10px 40px rgba(0,0,0,0.6)", border: "1px solid #2d3147", borderBottom: "none", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #1e2030", flexShrink: 0 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", border: `2px solid ${isAfterDark ? "rgba(168,85,247,0.5)" : "rgba(92,107,255,0.4)"}`, flexShrink: 0 }}>
                <img src={AVATAR_URL} alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb", display: "flex", alignItems: "center", gap: 6 }}>
                  {activeConvo?.title && activeConvo.messages.length > 0
                    ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{activeConvo.title}</span>
                    : "Ask Elijah"}
                  {isAfterDark && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: "rgba(168,85,247,0.2)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.3)", flexShrink: 0 }}>🌙 AFTER DARK</span>}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{isAfterDark ? "sassy mode activated" : "your tech, digs through tickets & GroupMe"}</div>
              </div>
              {/* Chats button */}
              <button onClick={() => setShowSidebar(v => !v)} title="All conversations"
                style={{ background: showSidebar ? "rgba(92,107,255,0.15)" : "rgba(255,255,255,0.06)", border: `1px solid ${showSidebar ? "rgba(92,107,255,0.3)" : "rgba(255,255,255,0.1)"}`, borderRadius: 8, color: showSidebar ? "#c7d2fe" : "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "5px 10px", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                💬 {convos.length > 0 ? convos.length : ""}
              </button>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* Body — sidebar or chat */}
            <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

              {/* Sidebar */}
              {showSidebar && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #1e2030", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>Conversations</span>
                    <button onClick={startNewConvo} style={{ background: "rgba(92,107,255,0.15)", border: "1px solid rgba(92,107,255,0.3)", borderRadius: 8, color: "#c7d2fe", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "4px 10px" }}>
                      + New
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                    {convos.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#4b5563", textAlign: "center", paddingTop: 24 }}>No conversations yet</div>
                    ) : convos.map(c => (
                      <div key={c.id} onClick={() => switchConvo(c.id)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10, cursor: "pointer", background: c.id === activeId ? "rgba(92,107,255,0.12)" : "rgba(255,255,255,0.03)", border: `1px solid ${c.id === activeId ? "rgba(92,107,255,0.25)" : "transparent"}`, transition: "all 0.1s" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: c.id === activeId ? "#c7d2fe" : "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>
                            {c.messages.length} message{c.messages.length !== 1 ? "s" : ""} · {fmtRelTime(c.updatedAt)}
                          </div>
                        </div>
                        <button onClick={e => deleteConvo(c.id, e)}
                          style={{ background: "none", border: "none", color: "#374151", fontSize: 14, cursor: "pointer", padding: "2px 4px", borderRadius: 4, flexShrink: 0, lineHeight: 1 }}
                          title="Delete">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat view */}
              {!showSidebar && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {messages.length === 0 && (
                      <div style={{ textAlign: "center", padding: "16px 10px" }}>
                        <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", margin: "0 auto 10px", border: "2px solid rgba(92,107,255,0.3)" }}>
                          <img src={AVATAR_URL} alt="Elijah" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb", marginBottom: 4 }}>
                          {isAfterDark ? "It's After Dark. You've been warned. 🌙" : "Yo, I'm Elijah. 🔧"}
                        </div>
                        <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.5 }}>
                          {isAfterDark
                            ? "Ask me whatever. I'll relate it back to maintenance somehow. No promises I'll be nice."
                            : "Ask me about a ticket, what happened today, recurring issues — I'll dig through everything."}
                        </div>
                        {convos.length > 1 && (
                          <button onClick={() => setShowSidebar(true)} style={{ marginTop: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#6b7280", fontSize: 12, cursor: "pointer", padding: "5px 12px" }}>
                            View past conversations ({convos.length})
                          </button>
                        )}
                      </div>
                    )}

                    {messages.map(msg => (
                      <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                        {msg.role === "user" ? (
                          <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", background: "#4338ca", color: "#fff", fontSize: 14, lineHeight: 1.5 }}>
                            {msg.text}
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 8, maxWidth: "93%" }}>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", flexShrink: 0, marginTop: 2 }}>
                              <img src={AVATAR_URL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                            </div>
                            <div>
                              <div style={{ padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: msg.isError ? "rgba(239,68,68,0.1)" : "#161827", border: `1px solid ${msg.isError ? "rgba(239,68,68,0.25)" : "#2d3147"}`, color: msg.isError ? "#fca5a5" : "#e5e7eb", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                {renderAnswerText(msg.text)}
                              </div>
                              {((msg.citedTickets && msg.citedTickets.length > 0) || (msg.citedProjects && msg.citedProjects.length > 0)) && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                                  {msg.citedTickets?.map(t => (
                                    <button key={t.id} onClick={() => goTo(`/tickets/${t.id}`)}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, border: "1px solid rgba(92,107,255,0.25)", background: "rgba(92,107,255,0.08)", cursor: "pointer", textAlign: "left" }}>
                                      <span style={{ fontSize: 13 }}>🔧</span>
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: "#c7d2fe", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                                        <div style={{ fontSize: 10, color: "#6b7280" }}>{t.location}</div>
                                      </div>
                                      <span style={{ color: "#6b7280", fontSize: 12 }}>›</span>
                                    </button>
                                  ))}
                                  {msg.citedProjects?.map(p => (
                                    <button key={p.id} onClick={() => goTo(`/projects/${p.id}`)}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, border: "1px solid rgba(255,182,39,0.25)", background: "rgba(255,182,39,0.08)", cursor: "pointer", textAlign: "left" }}>
                                      <span style={{ fontSize: 13 }}>📐</span>
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: "#FFD07A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                                        <div style={{ fontSize: 10, color: "#6b7280" }}>{p.location}</div>
                                      </div>
                                      <span style={{ color: "#6b7280", fontSize: 12 }}>›</span>
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
                        <div style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
                          <img src={AVATAR_URL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%" }} />
                        </div>
                        <div style={{ padding: "12px 14px", borderRadius: "4px 14px 14px 14px", background: "#161827", border: "1px solid #2d3147", display: "flex", gap: 4, alignItems: "center" }}>
                          {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#6b7280", animation: `elijah-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />)}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div style={{ padding: "10px 12px", borderTop: "1px solid #1e2030", flexShrink: 0, background: "#0d0f1a" }}>
                    {/* Quick new chat button when there's history */}
                    {messages.length > 0 && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                        <button onClick={startNewConvo}
                          style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#4b5563", fontSize: 11, cursor: "pointer", padding: "3px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                          + New chat
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder={messages.length > 0 ? "Follow up…" : "Ask Elijah somethin'…"}
                        rows={1}
                        style={{ flex: 1, resize: "none", maxHeight: 90, padding: "10px 12px", borderRadius: 13, border: "1px solid #2d3147", background: "#161827", color: "#e5e7eb", fontSize: 14, outline: "none", lineHeight: 1.4 }}
                      />
                      <button onClick={() => send()} disabled={busy || !input.trim()}
                        style={{ width: 38, height: 38, borderRadius: "50%", border: "none", flexShrink: 0, background: input.trim() && !busy ? "#4338ca" : "#1e2030", color: input.trim() && !busy ? "#fff" : "#4b5563", cursor: input.trim() && !busy ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                        ↑
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
