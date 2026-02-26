import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Enroll from "./pages/Enroll";
import Home from "./pages/Home";
import Tickets from "./pages/Tickets";
import Projects from "./pages/Projects";
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
  const showNav = !["/login", "/enroll"].includes(loc.pathname);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/enroll" element={<Enroll />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/tickets" element={<RequireAuth><Tickets /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
        <Route path="/eod" element={<RequireAuth><EOD /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showNav ? <BottomNav /> : null}
    </>
  );
}
