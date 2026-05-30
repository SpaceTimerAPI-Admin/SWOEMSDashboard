import React from "react";
import { Link } from "react-router-dom";

function Tile({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <div className="card">
        <div className="h2">{title}</div>
        <div className="muted">{desc}</div>
      </div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="container">
      <div className="h1">Dashboard</div>
      <div className="grid">
        <Tile to="/tickets/new" title="Log A Call" desc="Create a work order ticket (SLA 1 hour)." />
        <Tile to="/tickets" title="Ticket Dashboard" desc="View tickets prioritized by SLA." />
        <Tile to="/projects" title="Projects" desc="Track longer-term items (SLA 14 days)." />
        <Tile to="/eod" title="End of Day Report" desc="Generate and email the team recap for today." />
        <Tile to="/settings" title="Open / Close Park" desc="Step-by-step opening and closing procedures." />
      </div>
      <div className="spacer" />
    </div>
  );
}
