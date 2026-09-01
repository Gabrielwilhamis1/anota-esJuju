import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NOTES_KEY = "juju-notes";

function credentials() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN,
  };
}

async function redis(command) {
  const { url, token } = credentials();
  if (!url || !token) throw new Error("Banco de dados não configurado");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("Não foi possível acessar o banco de dados");
  return response.json();
}

export async function GET() {
  try {
    const { result } = await redis(["GET", NOTES_KEY]);
    return NextResponse.json({ notes: result ? JSON.parse(result) : null });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

export async function PUT(request) {
  try {
    const notes = await request.json();
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const value = JSON.stringify(notes);
    if (value.length > 500000) {
      return NextResponse.json({ error: "Limite de armazenamento excedido" }, { status: 413 });
    }

    await redis(["SET", NOTES_KEY, value]);
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
