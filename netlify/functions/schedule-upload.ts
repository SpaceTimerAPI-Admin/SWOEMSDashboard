/**
 * POST /api/schedule-upload
 * Body: { image_base64: string, content_type: string }
 *
 * Creates a job row in schedule_upload_jobs, fires the background worker,
 * and returns { ok: true, job_id } immediately.
 *
 * The background worker (schedule-upload-background) does the AI work
 * and updates the job row when done.
 *
 * Frontend polls /api/schedule-job-status?id=<job_id> every 3s.
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) {
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Unauthorized" }),
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  let body: any = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const image_base64 = String(body.image_base64 || "").trim();
  const content_type = String(body.content_type || "image/jpeg").trim();

  if (!image_base64) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "image_base64 required" }),
    };
  }

  const supabase = supabaseAdmin();
  const uploadedBy = session.employee?.id || null;

  // Create job row
  const { data: job, error: jobErr } = await supabase
    .from("schedule_upload_jobs")
    .insert({ status: "pending" })
    .select("id")
    .single();

  if (jobErr || !job?.id) {
    // Table may not exist yet — return a clear error
    console.error("[schedule-upload] Failed to create job row:", jobErr?.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: jobErr?.message?.includes("does not exist")
          ? "schedule_upload_jobs table not found — run the Supabase migration first"
          : (jobErr?.message || "Could not create job"),
      }),
    };
  }

  const job_id: string = job.id;

  // Fire the background worker — don't await; ignore errors (Netlify background function)
  // The background function URL follows Netlify's convention
  const proto = event.headers["x-forwarded-proto"] || "https";
  const host = event.headers["host"] || "";
  const bgUrl = `${proto}://${host}/.netlify/functions/schedule-upload-background`;

  fetch(bgUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No auth header — background function doesn't require session
    body: JSON.stringify({ job_id, image_base64, content_type, uploaded_by: uploadedBy }),
  }).catch((err) => {
    console.error("[schedule-upload] Background trigger failed:", err?.message);
    // Best-effort: mark job as error so the frontend doesn't poll forever
    supabase.from("schedule_upload_jobs")
      .update({ status: "error", error: "Background worker could not be started", updated_at: new Date().toISOString() })
      .eq("id", job_id)
      .then(() => {});
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, job_id }),
  };
};
