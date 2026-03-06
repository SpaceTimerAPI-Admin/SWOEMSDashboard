import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";
import { badRequest, json, unauthorized } from "./_shared";

export const handler: Handler = async (event) => {
  try {
    // Support both GET (preferred) and POST (backwards-compat with older clients)
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const session = await requireSession(event);
    if (!session) return unauthorized();

    // Newer clients call /projects-get?id=... via GET
    // Older clients may POST { id: "..." }
    let id = event.queryStringParameters?.id;
    if (!id && event.httpMethod === "POST" && event.body) {
      try {
        const body = JSON.parse(event.body);
        if (typeof body?.id === "string") id = body.id;
      } catch {
        // ignore
      }
    }
    if (!id) return badRequest("id required");

    const supabase = supabaseAdmin();

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select(`
        id, title, location, details, tag, status, created_at, sla_due_at, sla_days,
        created_by, source_ticket_id,
        employees!projects_created_by_fkey(name)
      `)
      .eq("id", id)
      .maybeSingle();

    if (pErr || !project) return json({ ok: false, error: "Project not found" }, 404);

    const { data: comments, error: cErr } = await supabase
      .from("project_comments")
      .select(`
        id, project_id, employee_id, comment, status_change, created_at,
        employees!project_comments_employee_id_fkey(name)
      `)
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (cErr) return json({ ok: false, error: cErr.message }, 500);

    const { data: photos, error: phErr } = await supabase
      .from("project_photos")
      .select(
        "id, project_id, storage_path, public_url, created_at, uploaded_by, employees!project_photos_uploaded_by_fkey(name)"
      )
      .eq("project_id", id)
      .order("created_at", { ascending: true });

    if (phErr) return json({ ok: false, error: phErr.message }, 500);

    return json({
      ok: true,
      project: { ...project, created_by_name: (project as any).employees?.name || "Unknown" },
      photos: (photos || []).map((p: any) => ({ ...p, uploaded_by_name: p.employees?.name || "Unknown" })),
      comments: (comments || []).map((c: any) => ({ ...c, employee_name: c.employees?.name || "Unknown" })),
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Server error" }, 500);
  }
};
