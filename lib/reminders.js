const RESEND_URL = "https://api.resend.com/emails";
const MAX_SCHEDULE_AHEAD = 29 * 24 * 60 * 60 * 1000;

const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const sameReminder = (a, b) => Boolean(a && b && a.reminderEnabled === b.reminderEnabled && a.reminderAt === b.reminderAt && a.title === b.title && a.text === b.text && a.category === b.category);

async function resend(path = "", options = {}) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY não configurada");
  const response = await fetch(`${RESEND_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Falha ao comunicar com o Resend");
  return data;
}

async function cancelReminder(emailId) {
  if (!emailId) return;
  try { await resend(`/${emailId}/cancel`, { method: "POST" }); } catch {}
}

async function scheduleReminder(note, noteDate) {
  const recipient = process.env.REMINDER_EMAIL;
  const sender = process.env.REMINDER_FROM || "Minhas Anotações <onboarding@resend.dev>";
  if (!recipient) throw new Error("REMINDER_EMAIL não configurado");
  const when = new Date(note.reminderAt);
  const formatted = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(when);
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#28232f"><div style="background:#7657e8;color:white;padding:22px 26px;border-radius:14px 14px 0 0"><div style="font-size:13px;opacity:.85">Minhas Anotações</div><h1 style="font-size:22px;margin:8px 0 0">${escapeHtml(note.title)}</h1></div><div style="padding:26px;border:1px solid #ece9f2;border-top:0;border-radius:0 0 14px 14px"><p style="font-size:16px;margin-top:0">Oi! Passando para lembrar:</p><p style="line-height:1.6;color:#625d69">${escapeHtml(note.text).replaceAll("\n", "<br>")}</p><p style="font-size:13px;color:#898491;margin:24px 0 0"><strong>Categoria:</strong> ${escapeHtml(note.category)}<br><strong>Programado para:</strong> ${escapeHtml(formatted)}</p></div></div>`;
  return resend("", { method: "POST", headers: { "Idempotency-Key": `juju-${noteDate}-${note.id}-${when.getTime()}` }, body: JSON.stringify({ from: sender, to: [recipient], subject: `Lembrete: ${note.title}`, html, scheduled_at: when.toISOString(), tags: [{ name: "note_id", value: String(note.id).replace(/[^a-zA-Z0-9_-]/g, "_") }] }) });
}

function flatten(notes = {}) {
  const map = new Map();
  Object.entries(notes).forEach(([date, items]) => { if (Array.isArray(items)) items.forEach((note) => map.set(String(note.id), { note, date })); });
  return map;
}

export async function reconcileReminders(previousNotes = {}, incomingNotes = {}) {
  const previous = flatten(previousNotes);
  const incoming = flatten(incomingNotes);
  for (const [id, oldEntry] of previous) if (!incoming.has(id) && oldEntry.note.reminderEmailId) await cancelReminder(oldEntry.note.reminderEmailId);
  const result = {};
  for (const [date, items] of Object.entries(incomingNotes)) {
    if (!Array.isArray(items)) continue;
    result[date] = [];
    for (const rawNote of items) {
      const note = { ...rawNote };
      const old = previous.get(String(note.id))?.note;
      const when = note.reminderAt ? new Date(note.reminderAt) : null;
      const validFuture = when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
      if (!note.reminderEnabled || !validFuture) {
        if (old?.reminderEmailId) await cancelReminder(old.reminderEmailId);
        delete note.reminderEmailId;
        note.reminderStatus = note.reminderEnabled && !validFuture ? "expired" : "disabled";
      } else if (sameReminder(old, note) && old?.reminderEmailId) {
        note.reminderEmailId = old.reminderEmailId;
        note.reminderStatus = "scheduled";
      } else if (when.getTime() - Date.now() > MAX_SCHEDULE_AHEAD) {
        if (old?.reminderEmailId) await cancelReminder(old.reminderEmailId);
        delete note.reminderEmailId;
        note.reminderStatus = "pending";
      } else {
        if (old?.reminderEmailId) await cancelReminder(old.reminderEmailId);
        try {
          const scheduled = await scheduleReminder(note, date);
          note.reminderEmailId = scheduled.id;
          note.reminderStatus = "scheduled";
          delete note.reminderError;
        } catch (error) {
          delete note.reminderEmailId;
          note.reminderStatus = "error";
          note.reminderError = error.message;
        }
      }
      result[date].push(note);
    }
  }
  return result;
}
