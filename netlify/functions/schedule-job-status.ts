/**
 * GET /api/schedule-job-status?id=<job_id>
 *
 * Returns job status so the frontend can poll after uploading a schedule.
 * Response: { status: "pending" | "done" | "error", result?, error? }
 */
import type { Handler } from "@netlify/functions";
import { requireSession } from "./_auth";
import { supabaseAdmin } from "./_supabase";

export const handler: Handler = async (event) => {
  const session = await requireSession(event);
  if (!session) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: "Unauthorized" }) };
  }

  const job_id = event.queryStringParameters?.id || "";
  if (!job_id) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "id required" }) };
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("schedule_upload_jobs")
    .select("id, status, result, error, created_at, updated_at")
    .eq("id", job_id)
    .single();

  if (error || !data) {
    return { statusCode: 404, body: JSON.stringify({ ok: false, error: "Job not found" }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      status: data.status,
      result: data.result || null,
      error: data.error || null,
    }),
  };
};
