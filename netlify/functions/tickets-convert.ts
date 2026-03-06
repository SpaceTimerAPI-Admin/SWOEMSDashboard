import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";
import { postGroupMe } from "./_groupme";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const session = await requireSession(event);
    if (!session) return unauthorized();

    const body = event.body ? JSON.parse(event.body) : {};
    const ticket_id = String(body.ticket_id || body.id || "").trim();
    if (!ticket_id) return badRequest("ticket_id required");

    const supabase = supabaseAdmin();

    // 1. Fetch the full ticket
    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .select("id, title, location, details, tag, created_by, created_at, status")
      .eq("id", ticket_id)
      .maybeSingle();

    if (tErr || !ticket) return json({ ok: false, error: "Ticket not found" }, 404);

    // 2. Fetch all comments on the ticket
    const { data: comments } = await supabase
      .from("ticket_comments")
      .select("*")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    // 3. Fetch all photos on the ticket
    const { data: photos } = await supabase
      .from("ticket_photos")
      .select("*")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true });

    // 4. Determine SLA — default 14 days from now
    const sla_days = 14;
    const sla_due_at = new Date(Date.now() + sla_days * 24 * 60 * 60 * 1000).toISOString();

    // 5. Create the project with all original ticket data
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        title: ticket.title,
        location: ticket.location,
        details: ticket.details,
        tag: ticket.tag || null,
        status: "open",
        created_by: ticket.created_by,  // keep original author
        created_at: ticket.created_at,   // preserve original creation time
        sla_days,
        sla_due_at,
        source_ticket_id: null,          // ticket is being deleted, no ref needed
      })
      .select("id")
      .single();

    if (pErr || !project) return json({ ok: false, error: pErr?.message || "Failed to create project" }, 500);

    // 6. Migrate ticket comments → project comments
    if (comments && comments.length > 0) {
      const projectComments = comments.map((c: any) => ({
        project_id: project.id,
        employee_id: c.employee_id,
        comment: c.comment,
        status_change: c.status_change ?? null,
        created_at: c.created_at,
      }));
      await supabase.from("project_comments").insert(projectComments);
    }

    // 7. Migrate ticket photos → project photos
    if (photos && photos.length > 0) {
      const base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
      const projectPhotos = photos.map((p: any) => {
        // Photos live in ticket-photos bucket; we re-record them under project_photos
        // pointing to the same storage path (no need to copy files in storage)
        const public_url = base
          ? `${base}/storage/v1/object/public/ticket-photos/${p.storage_path}`
          : p.public_url;
        return {
          project_id: project.id,
          storage_path: p.storage_path,
          public_url,
          uploaded_by: p.uploaded_by,
          created_at: p.created_at,
        };
      });
      await supabase.from("project_photos").insert(projectPhotos);
    }

    // 8. Add a conversion note as the first project comment (after migrated ones)
    await supabase.from("project_comments").insert({
      project_id: project.id,
      employee_id: session.employee.id,
      comment: `Converted from ticket by ${session.employee.name}`,
      created_at: new Date().toISOString(),
    });

    // 9. Hard delete the ticket (cascades to ticket_comments and ticket_photos via FK)
    await supabase.from("ticket_photos").delete().eq("ticket_id", ticket_id);
    await supabase.from("ticket_comments").delete().eq("ticket_id", ticket_id);
    await supabase.from("tickets").delete().eq("id", ticket_id);

    // 10. GroupMe notification
    try {
      const base = (process.env.SITE_BASE_URL || "").replace(/\/$/, "");
      const pLink = base ? `${base}/projects/${project.id}` : "";
      await postGroupMe(`📁 Converted to Project: ${ticket.title} @ ${ticket.location} — by ${session.employee.name}${pLink ? ` — ${pLink}` : ""}`);
    } catch {}

    return json({ ok: true, project_id: project.id });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
