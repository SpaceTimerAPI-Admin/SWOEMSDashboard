import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Enroll from "./pages/Enroll";
import ResetPin from "./pages/ResetPin";
import Home from "./pages/Home";
import ShowTechHome from "./pages/ShowTechHome";
import Admin from "./pages/Admin";
import AdminSchedule from "./pages/AdminSchedule";
import Tickets from "./pages/Tickets";
import TicketNew from "./pages/TicketNew";
import TicketDetail from "./pages/TicketDetail";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ShiftLog from "./pages/ShiftLog";
import Schedule from "./pages/Schedule";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import EOD from "./pages/EOD";
import Settings from "./pages/Settings";
import BottomNav from "./components/BottomNav";
import ShowTechNav from "./components/ShowTechNav";
import { isAuthed, clearToken, clearProfile, getRole } from "./lib/auth";

// Global 401 interceptor
let _interceptorInstalled = false;
function installAuthInterceptor(onUnauthed: () => void) {
  if (_interceptorInstalled) return;
  _interceptorInstalled = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await orig(...args);
    if (res.status === 401) onUnauthed();
    return res;
  };
}

const PUBLIC_PATHS = ["/login", "/enroll", "/reset-pin"];
const ST_ALLOWED = ["/", "/tickets", "/tickets/new", "/shift-log", "/settings"];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const role = getRole();

  useEffect(() => {
    installAuthInterceptor(() => {
      clearToken(); clearProfile();
      navigate("/login", { replace: true, state: { from: window.location.pathname } });
    });
  }, [navigate]);

  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  // Show Tech: block EMS-only routes
  if (role === "show_tech") {
    const allowed = ST_ALLOWED.some(p => loc.pathname === p || loc.pathname.startsWith("/tickets/"));
    if (!allowed) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  if (getRole() !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const loc = useLocation();
  const role = getRole();
  const isPublic = PUBLIC_PATHS.includes(loc.pathname);
  const isShowTech = isAuthed() && role === "show_tech";

  // Home component based on role
  const HomeComponent = isAuthed()
    ? (role === "show_tech" ? ShowTechHome : Home)
    : Home;

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/enroll" element={<Enroll />} />
        <Route path="/reset-pin" element={<ResetPin />} />

        <Route path="/" element={<RequireAuth><HomeComponent /></RequireAuth>} />

        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/admin/schedule" element={<RequireAdmin><AdminSchedule /></RequireAdmin>} />

        <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
        <Route path="/tickets/new" element={<RequireAuth><TicketNew /></RequireAuth>} />
        <Route path="/tickets/:id" element={<RequireAuth><TicketDetail /></RequireAuth>} />

        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />

        <Route path="/shift-log" element={<RequireAuth><ShiftLog /></RequireAuth>} />
        <Route path="/schedule" element={<RequireAuth><Schedule /></RequireAuth>} />
        <Route path="/events" element={<RequireAuth><Events /></RequireAuth>} />
        <Route path="/events/:id" element={<RequireAuth><EventDetail /></RequireAuth>} />

        <Route path="/eod" element={<RequireAuth><EOD /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isPublic && (isShowTech ? <ShowTechNav /> : <BottomNav />)}
    </>
  );
}
