import { NextResponse } from "next/server";
import { getNotes, setNotes } from "@/lib/notes-store";
import { reconcileReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const isVercelCron = request.headers.get("user-agent") === "vercel-cron/1.0";
  if ((secret && authorization !== `Bearer ${secret}`) || (!secret && !isVercelCron)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const notes = await getNotes() || {};
    const processed = await reconcileReminders(notes, notes);
    await setNotes(processed);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
