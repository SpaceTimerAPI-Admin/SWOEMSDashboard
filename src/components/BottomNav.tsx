import React from "react";
import { NavLink } from "react-router-dom";

export default function BottomNav() {
  return (
    <div className="nav">
      <div className="nav-inner">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>Home</NavLink>
        <NavLink to="/tickets" className={({ isActive }) => (isActive ? "active" : "")}>Tickets</NavLink>
        <NavLink to="/projects" className={({ isActive }) => (isActive ? "active" : "")}>Projects</NavLink>
        <NavLink to="/eod" className={({ isActive }) => (isActive ? "active" : "")}>EOD</NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>Settings</NavLink>
      </div>
    </div>
  );
}
