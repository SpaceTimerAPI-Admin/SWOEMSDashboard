export async function postGroupMe(text: string) {
  const botId = process.env.GROUPME_BOT_ID;
  if (!botId) throw new Error("Missing GROUPME_BOT_ID");

  const res = await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bot_id: botId, text }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GroupMe post failed: ${res.status} ${t}`);
  }
}
