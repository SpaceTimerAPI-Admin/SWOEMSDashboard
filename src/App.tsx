import React, { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { applyTheme, getCachedPrefs } from "./lib/theme";
import Login from "./pages/Login";
import Enroll from "./pages/Enroll";
import ResetPin from "./pages/ResetPin";
import Home from "./pages/Home";
import ShowTechHome from "./pages/ShowTechHome";
import Admin from "./pages/Admin";
import AdminSchedule from "./pages/AdminSchedule";
import AdminQR from "./pages/AdminQR";
import AdminElijah from "./pages/AdminElijah";
import ShowTechRegister from "./pages/ShowTechRegister";
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
import Procedures from "./pages/Procedures";
import ProcedureView from "./pages/ProcedureView";
import ProcedureBuilder from "./pages/ProcedureBuilder";
import Settings from "./pages/Settings";
import Remote from "./pages/Remote";
import TicketReport from "./pages/TicketReport";
import PublicWorkOrder from "./pages/PublicWorkOrder";
import OfficeDashboard from "./pages/OfficeDashboard";
import XmasTickets from "./pages/XmasTickets";
import XmasTicketNew from "./pages/XmasTicketNew";
import XmasTicketDetail from "./pages/XmasTicketDetail";
import BottomNav from "./components/BottomNav";
import ShowTechNav from "./components/ShowTechNav";
import AskElijah from "./components/AskElijah";
import { isAuthed, clearToken, clearProfile, getRole } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/enroll", "/reset-pin", "/work-order", "/dashboard"];
const ST_ALLOWED = ["/", "/tickets", "/tickets/new", "/shift-log", "/settings"];

/**
 * Global session-expiry handler.
 * Installed exactly once at module load — patches window.fetch so that ANY
 * 401 response from ANY API call, on ANY page (including admin pages,
 * background calls, etc.), immediately clears the session and hard-redirects
 * to /login. This runs independently of React render/mount timing, so a user
 * never sees a half-loaded page or an "Unauthorized" error string — they're
 * bounced to login the instant the server rejects their session.
 */
let _redirecting = false;
const _origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401 && !_redirecting) {
    const path = window.location.pathname;
    // Don't loop if we're already on a public/auth page
    if (!PUBLIC_PATHS.includes(path) && !path.startsWith("/register/")) {
      _redirecting = true;
      clearToken();
      clearProfile();
      // Hard redirect (not client-side nav) guarantees a clean reload of
      // app state — no stale component state, no half-mounted guarded routes.
      window.location.href = `/login?from=${encodeURIComponent(path)}`;
    }
  }
  return res;
};

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const role = getRole();

  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  // Show Tech: block EMS-only routes
  if (role === "show_tech") {
    const allowed = ST_ALLOWED.some(p => loc.pathname === p)
      || loc.pathname.startsWith("/tickets/")
      || loc.pathname.startsWith("/projects/")
      || loc.pathname.startsWith("/procedures");
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

  // Apply cached theme immediately on every render cycle start
  // so there's no flash of unstyled content between sessions
  useEffect(() => {
    const cached = getCachedPrefs();
    if (Object.keys(cached).length > 0) applyTheme(cached);
  }, []);

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
        <Route path="/dashboard" element={<OfficeDashboard />} />

        <Route path="/" element={<RequireAuth><HomeComponent /></RequireAuth>} />

        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/admin/schedule" element={<RequireAdmin><AdminSchedule /></RequireAdmin>} />
        <Route path="/admin/qr" element={<RequireAdmin><AdminQR /></RequireAdmin>} />
        <Route path="/admin/elijah" element={<RequireAdmin><AdminElijah /></RequireAdmin>} />
        <Route path="/admin/report" element={<RequireAdmin><TicketReport /></RequireAdmin>} />
        <Route path="/register/:code" element={<ShowTechRegister />} />
        <Route path="/work-order" element={<PublicWorkOrder />} />

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
        <Route path="/procedures" element={<RequireAuth><Procedures /></RequireAuth>} />
        <Route path="/procedures/new" element={<RequireAuth><ProcedureBuilder /></RequireAuth>} />
        <Route path="/procedures/:id" element={<RequireAuth><ProcedureView /></RequireAuth>} />
        <Route path="/procedures/:id/edit" element={<RequireAuth><ProcedureBuilder /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="/remote" element={<RequireAuth><Remote /></RequireAuth>} />

        <Route path="/christmas" element={<RequireAuth><XmasTickets /></RequireAuth>} />
        <Route path="/christmas/new" element={<RequireAuth><XmasTicketNew /></RequireAuth>} />
        <Route path="/christmas/:id" element={<RequireAuth><XmasTicketDetail /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!isPublic && (isShowTech ? <ShowTechNav /> : <BottomNav />)}
      {!isPublic && isAuthed() && !isShowTech && <AskElijah />}
    </>
  );
}
