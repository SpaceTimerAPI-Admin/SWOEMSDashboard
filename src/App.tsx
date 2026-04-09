import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Enroll from "./pages/Enroll";
import ResetPin from "./pages/ResetPin";
import Home from "./pages/Home";
import Tickets from "./pages/Tickets";
import TicketNew from "./pages/TicketNew";
import TicketDetail from "./pages/TicketDetail";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ShiftLog from "./pages/ShiftLog";
import EOD from "./pages/EOD";
import Settings from "./pages/Settings";
import BottomNav from "./components/BottomNav";
import { isAuthed, clearToken, clearProfile } from "./lib/auth";

// Global 401 interceptor — monkey-patch fetch once at startup
let _interceptorInstalled = false;
function installAuthInterceptor(onUnauthed: () => void) {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await orig(...args);
    if (res.status === 401) {
      // Clone so the caller can still read the body if they want, but redirect
      onUnauthed();
    }
    return res;
  };
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    installAuthInterceptor(() => {
      clearToken();
      clearProfile();
      const currentPath = window.location.pathname + window.location.search;
      navigate("/login", { replace: true, state: { from: currentPath } });
    });
  }, [navigate]);

  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const loc = useLocation();
  const showNav = !["/login", "/enroll", "/reset-pin"].includes(loc.pathname);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/enroll" element={<Enroll />} />
        <Route path="/reset-pin" element={<ResetPin />} />

        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />

        <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
        <Route path="/tickets/new" element={<RequireAuth><TicketNew /></RequireAuth>} />
        <Route path="/tickets/:id" element={<RequireAuth><TicketDetail /></RequireAuth>} />

        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />

        <Route path="/shift-log" element={<RequireAuth><ShiftLog /></RequireAuth>} />

        <Route path="/eod" element={<RequireAuth><EOD /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav ? <BottomNav /> : null}
    </>
  );
}
