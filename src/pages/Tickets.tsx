import React from "react";

export default function Tickets() {
  return (
    <div className="container">
      <div className="h1">Tickets</div>
      <div className="card">
        <div className="muted">
          Scaffold only. Next steps:
          <ul>
            <li>Create ticket form (Log A Call)</li>
            <li>Ticket list sorted by SLA</li>
            <li>Ticket detail + comments + close + convert-to-project</li>
            <li>GroupMe event posts via /api/notify-event</li>
          </ul>
        </div>
      </div>
      <div className="spacer" />
    </div>
  );
}
