import React from "react";
import { Link } from "react-router-dom";

type TileProps = {
  to: string;
  icon: string;
  title: string;
  desc: string;
  accent?: string;
  wide?: boolean;
};

function Tile({ to, icon, title, desc, accent = "rgba(92,107,255,0.15)", wide }: TileProps) {
  return (
    <Link to={to} className={`home-tile${wide ? " wide" : ""}`}>
      <div className="tile-icon" style={{ background: accent }}>
        {icon}
      </div>
      <div className="tile-title">{title}</div>
      <div className="tile-desc">{desc}</div>
    </Link>
  );
}

export default function Home() {
  return (
    <div className="page fade-up">
      <div style={{ marginBottom: 4 }}>
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">SWOEMS Operations Center</div>
      </div>

      <div className="home-grid">
        <Tile
          to="/tickets/new"
          icon="🎫"
          title="Log a Call"
          desc="Create a work order (SLA 1h)"
          accent="rgba(92,107,255,0.18)"
        />
        <Tile
          to="/tickets"
          icon="📋"
          title="Tickets"
          desc="View & manage all tickets"
          accent="rgba(46,232,160,0.12)"
        />
        <Tile
          to="/projects"
          icon="📐"
          title="Projects"
          desc="Track longer-term items (SLA 14d)"
          accent="rgba(255,182,39,0.12)"
        />
        <Tile
          to="/eod"
          icon="📝"
          title="EOD Report"
          desc="Generate & email today's recap"
          accent="rgba(255,84,84,0.12)"
        />
        <Tile
          to="/settings"
          icon="⚙️"
          title="Settings"
          desc="Account & preferences"
          accent="rgba(255,255,255,0.06)"
        />
      </div>
    </div>
  );
}
