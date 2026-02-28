import React from "react";
import { NavLink } from "react-router-dom";

export default function BottomNav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-inner">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Home
        </NavLink>
        <NavLink
          to="/tickets"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Tickets
        </NavLink>
        <NavLink
          to="/projects"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Projects
        </NavLink>
        <NavLink
          to="/eod"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          EOD
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
