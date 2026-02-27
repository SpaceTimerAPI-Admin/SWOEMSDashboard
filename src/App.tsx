import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import LoginPin from "./pages/LoginPin";
import ResetPin from "./pages/ResetPin";
import Enroll from "./pages/Enroll";
import Home from "./pages/Home";
import Tickets from "./pages/Tickets";
import TicketNew from "./pages/TicketNew";
import TicketDetail from "./pages/TicketDetail";
import Projects from "./pages/Projects";
import ProjectNew from "./pages/ProjectNew";
import ProjectDetail from "./pages/ProjectDetail";
import EOD from "./pages/EOD";
import Settings from "./pages/Settings";
import BottomNav from "./components/BottomNav";
import { isAuthed } from "./lib/auth";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  if (!isAuthed()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const loc = useLocation();
  const showNav = !["/login", "/login-pin", "/reset-pin", "/enroll"].includes(loc.pathname);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/login-pin" element={<LoginPin />} />
        <Route path="/reset-pin" element={<ResetPin />} />
        <Route path="/enroll" element={<Enroll />} />

        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />

        <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
        <Route path="/tickets/new" element={<RequireAuth><TicketNew /></RequireAuth>} />
        <Route path="/tickets/:id" element={<RequireAuth><TicketDetail /></RequireAuth>} />

        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="/projects/new" element={<RequireAuth><ProjectNew /></RequireAuth>} />
        <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />

        <Route path="/eod" element={<RequireAuth><EOD /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {showNav ? <BottomNav /> : null}
    </>
  );
}
