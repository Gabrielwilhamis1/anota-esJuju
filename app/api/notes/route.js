import { NextResponse } from "next/server";
import { getNotes, setNotes } from "@/lib/notes-store";
import { reconcileReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ notes: await getNotes() }); }
  catch (error) { return NextResponse.json({ error: error.message }, { status: 503 }); }
}

export async function PUT(request) {
  try {
    const notes = await request.json();
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    if (JSON.stringify(notes).length > 500000) return NextResponse.json({ error: "Limite de armazenamento excedido" }, { status: 413 });
    const previous = await getNotes() || {};
    const processed = await reconcileReminders(previous, notes);
    await setNotes(processed);
    return NextResponse.json({ saved: true, notes: processed });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
