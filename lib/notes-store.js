const NOTES_KEY = "juju-notes";

function credentials() {
  return { url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN };
}

export async function redis(command) {
  const { url, token } = credentials();
  if (!url || !token) throw new Error("Banco de dados não configurado");
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível acessar o banco de dados");
  return response.json();
}

export async function getNotes() { const { result } = await redis(["GET", NOTES_KEY]); return result ? JSON.parse(result) : null; }
export async function setNotes(notes) { await redis(["SET", NOTES_KEY, JSON.stringify(notes)]); }
