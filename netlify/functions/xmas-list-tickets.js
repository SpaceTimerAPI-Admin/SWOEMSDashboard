const { createClient } = require("@supabase/supabase-js");
exports.handler = async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from("xmas_tickets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { statusCode: 500, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Failed to fetch tickets" }) };
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tickets: data }) };
};
