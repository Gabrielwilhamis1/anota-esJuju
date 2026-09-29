"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell, BookOpen, CalendarBlank, CaretLeft, CaretRight, CheckCircle,
  Clock, House, List, MagnifyingGlass, NotePencil, Plus, Sparkle,
  Star, Trash, X
} from "@phosphor-icons/react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COLORS = ["#7657e8", "#fe9f6d", "#55b993", "#4f8fee", "#ec6a8e"];

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const INITIAL_NOTES = {
  [keyOf(new Date())]: [
    { id: 1, title: "Revisar conteúdo da semana", text: "Organizar os principais tópicos e separar dúvidas para a próxima aula.", category: "Faculdade", time: "09:30", color: "#7657e8" }
  ]
};

function formatLong(key) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(parseKey(key));
}

function toLocalInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function reminderLabel(note) {
  if (!note.reminderEnabled || !note.reminderAt) return null;
  if (new Date(note.reminderAt) <= new Date()) return "Enviado";
  if (note.reminderStatus === "error") return "Erro no lembrete";
  if (note.reminderStatus === "pending") return "Aguardando agendamento";
  return `Lembrete ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(note.reminderAt))}`;
}

export default function Home() {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(keyOf(today));
  const [notes, setNotes] = useState(INITIAL_NOTES);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("overview");
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadNotes(firstLoad = false) {
      let localNotes = INITIAL_NOTES;
      try {
        const saved = localStorage.getItem("juju-notes");
        if (saved) localNotes = JSON.parse(saved);

        const response = await fetch("/api/notes", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;

        if (data.notes) {
          setNotes(data.notes);
        } else if (firstLoad) {
          setNotes(localNotes);
          await fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(localNotes) });
        }
      } catch {
        if (active && firstLoad) setNotes(localNotes);
      } finally {
        if (active && firstLoad) setLoaded(true);
      }
    }

    loadNotes(true);
    const interval = setInterval(() => loadNotes(false), 5000);
    const refresh = () => loadNotes(false);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("juju-notes", JSON.stringify(notes));
  }, [notes, loaded]);

  const days = useMemo(() => {
    const first = month.getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const previous = new Date(month.getFullYear(), month.getMonth(), 0).getDate();
    return Array.from({ length: 42 }, (_, i) => {
      const raw = i - first + 1;
      const date = raw < 1
        ? new Date(month.getFullYear(), month.getMonth() - 1, previous + raw)
        : raw > count
          ? new Date(month.getFullYear(), month.getMonth() + 1, raw - count)
          : new Date(month.getFullYear(), month.getMonth(), raw);
      return { date, key: keyOf(date), current: date.getMonth() === month.getMonth() };
    });
  }, [month]);

  const allNotes = Object.entries(notes).flatMap(([date, items]) => items.map((item) => ({ ...item, date })));
  const viewLabels = { notes: "Anotações", subjects: "Matérias", favorites: "Favoritos" };
  const filteredNotes = query.trim()
    ? allNotes.filter((n) => `${n.title} ${n.text} ${n.category}`.toLowerCase().includes(query.toLowerCase()))
    : view === "notes" || view === "subjects"
      ? allNotes
      : view === "favorites"
        ? allNotes.filter((n) => n.favorite)
        : view.startsWith("folder:")
          ? allNotes.filter((n) => n.category === view.slice(7))
          : null;
  const selectedNotes = notes[selected] || [];

  function chooseDay(day) {
    setSelected(day.key);
    if (!day.current) setMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
  }

  function openEditor(note = null) {
    setEditing(note);
    setModalOpen(true);
  }

  function updateNotes(updater) {
    setNotes((old) => {
      const next = updater(old);
      try {
        localStorage.setItem("juju-notes", JSON.stringify(next));
      } catch {}
      fetch("/api/notes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = await response.json();
          if (data.notes) {
            setNotes(data.notes);
            localStorage.setItem("juju-notes", JSON.stringify(data.notes));
          }
        })
        .catch(() => {});
      return next;
    });
  }

  function saveNote(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reminderEnabled = data.get("reminderEnabled") === "on";
    const reminderValue = data.get("reminderAt");
    const reminderAt = reminderEnabled && reminderValue ? new Date(reminderValue).toISOString() : null;
    if (reminderEnabled && (!reminderAt || new Date(reminderAt) <= new Date())) {
      window.alert("Escolha uma data e um horário futuros para o lembrete.");
      return;
    }
    const item = {
      id: editing?.id || Date.now(),
      title: data.get("title").trim(),
      text: data.get("text").trim(),
      category: data.get("category"),
      time: data.get("time"),
      color: editing?.color || COLORS[allNotes.length % COLORS.length],
      favorite: editing?.favorite || false,
      reminderEnabled,
      reminderAt,
      reminderStatus: reminderEnabled ? "saving" : "disabled"
    };
    updateNotes((old) => ({
      ...old,
      [selected]: editing ? (old[selected] || []).map((n) => n.id === editing.id ? item : n) : [...(old[selected] || []), item]
    }));
    setModalOpen(false);
    setEditing(null);
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3500);
  }

  function removeNote(id) {
    updateNotes((old) => ({ ...old, [selected]: (old[selected] || []).filter((n) => n.id !== id) }));
  }

  function changeMonth(delta) {
    setMonth((old) => new Date(old.getFullYear(), old.getMonth() + delta, 1));
  }

  function selectView(nextView) {
    setView(nextView);
    setQuery("");
    setMobileNav(false);
    if (nextView === "calendar") requestAnimationFrame(() => document.querySelector(".calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleFavorite(id, date = selected) {
    updateNotes((old) => ({ ...old, [date]: (old[date] || []).map((note) => note.id === id ? { ...note, favorite: !note.favorite } : note) }));
  }

  const stats = [
    { icon: NotePencil, label: "Anotações", value: allNotes.length, className: "purple" },
    { icon: CheckCircle, label: "Esta semana", value: allNotes.filter((n) => Math.abs(parseKey(n.date) - today) < 604800000).length, className: "blue" },
    { icon: BookOpen, label: "Matérias", value: new Set(allNotes.map((n) => n.category)).size, className: "green" }
  ];

  return (
    <main className="app-shell">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand"><span><NotePencil weight="fill" /></span> Minhas Anotações</div>
        <button className="new-button" onClick={() => { openEditor(); setMobileNav(false); }}><Plus weight="bold" /> Nova anotação</button>
        <nav>
          <button className={view === "overview" ? "active" : ""} onClick={() => selectView("overview")}><House /> Visão geral</button>
          <button className={view === "calendar" ? "active" : ""} onClick={() => selectView("calendar")}><CalendarBlank /> Calendário</button>
          <button className={view === "notes" ? "active" : ""} onClick={() => selectView("notes")}><NotePencil /> Anotações</button>
          <button className={view === "subjects" ? "active" : ""} onClick={() => selectView("subjects")}><BookOpen /> Matérias</button>
          <button className={view === "favorites" ? "active" : ""} onClick={() => selectView("favorites")}><Star /> Favoritos</button>
        </nav>
        <div className="folders">
          <small>PASTAS</small>
          {[["Faculdade", "purple-dot"], ["Trabalhos", "orange-dot"], ["Pessoal", "green-dot"], ["Projetos", "blue-dot"]].map(([folder, color]) => <button key={folder} className={view === `folder:${folder}` ? "active" : ""} onClick={() => selectView(`folder:${folder}`)}><i className={`dot ${color}`} /> {folder}</button>)}
        </div>
        <div className="profile"><span>J</span><div><b>Juju</b><small>Estudante</small></div></div>
      </aside>

      <section className="content">
        <header>
          <button className="menu-button" onClick={() => setMobileNav(!mobileNav)}><List /></button>
          <div><h1>Oi, momo! <span>❤️</span></h1><p>Organize sua rotina e deixe suas ideias fluírem.</p></div>
          <div className="header-actions">
            <label className="search"><MagnifyingGlass /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar anotações..." /></label>
            <button className="icon-button"><Bell /></button>
          </div>
        </header>

        <div className="stats">
          {stats.map(({ icon: Icon, label, value, className }) => <article key={label}><div className={`stat-icon ${className}`}><Icon weight="duotone" /></div><div><small>{label}</small><strong>{value}</strong><p>Organizadas</p></div></article>)}
        </div>

        {filteredNotes ? (
          <section className="search-results card"><div className="section-title"><div><h2>{query.trim() ? "Resultados da busca" : view.startsWith("folder:") ? view.slice(7) : viewLabels[view]}</h2><p>{filteredNotes.length} anotações encontradas</p></div><button onClick={() => { setQuery(""); setView("overview"); }}><X /> Limpar</button></div><div className="result-grid">{filteredNotes.map((note) => <article key={`${note.date}-${note.id}`} className="note-card" onClick={() => { setSelected(note.date); setMonth(new Date(parseKey(note.date).getFullYear(), parseKey(note.date).getMonth(), 1)); setQuery(""); setView("overview"); }}><i style={{ background: note.color }} /><button className={`favorite ${note.favorite ? "active" : ""}`} aria-label={note.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={(event) => { event.stopPropagation(); toggleFavorite(note.id, note.date); }}><Star weight={note.favorite ? "fill" : "regular"} /></button><small>{new Intl.DateTimeFormat("pt-BR").format(parseKey(note.date))} · {note.category}</small><h3>{note.title}</h3><p>{note.text}</p></article>)}</div></section>
        ) : (
          <div className="dashboard-grid">
            <section className="calendar-card card">
              <div className="calendar-head"><div><h2>{MONTHS[month.getMonth()]} <span>{month.getFullYear()}</span></h2><p>Escolha um dia para ver ou criar anotações</p></div><div><button onClick={() => changeMonth(-1)} aria-label="Mês anterior"><CaretLeft /></button><button className="today-button" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(keyOf(today)); }}>Hoje</button><button onClick={() => changeMonth(1)} aria-label="Próximo mês"><CaretRight /></button></div></div>
              <div className="calendar-grid weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
              <div className="calendar-grid days">{days.map((day) => { const count = notes[day.key]?.length || 0; return <button key={day.key} className={`${!day.current ? "muted" : ""} ${selected === day.key ? "selected" : ""} ${day.key === keyOf(today) ? "is-today" : ""}`} onClick={() => chooseDay(day)}><span>{day.date.getDate()}</span>{count > 0 && <div className="note-dots">{notes[day.key].slice(0, 3).map((n) => <i key={n.id} style={{ background: n.color }} />)}</div>}</button>; })}</div>
            </section>

            <section className="day-panel card">
              <div className="day-head"><div><span className="eyebrow">ANOTAÇÕES DO DIA</span><h2>{formatLong(selected)}</h2><p>{selectedNotes.length ? `${selectedNotes.length} ${selectedNotes.length === 1 ? "anotação" : "anotações"}` : "Seu dia está livre"}</p></div><button className="add-round" onClick={() => openEditor()}><Plus /></button></div>
              <div className="notes-list">
                {selectedNotes.length ? selectedNotes.map((note) => <article className="day-note" key={note.id}><i style={{ background: note.color }} /><div className="note-body" onClick={() => openEditor(note)}><div><span>{note.category}</span>{note.time && <small><Clock /> {note.time}</small>}</div><h3>{note.title}</h3><p>{note.text}</p>{reminderLabel(note) && <div className={`reminder-status ${note.reminderStatus === "error" ? "error" : ""}`}><Bell weight="fill" /> {reminderLabel(note)}</div>}</div><button className={`favorite ${note.favorite ? "active" : ""}`} onClick={() => toggleFavorite(note.id)} aria-label={note.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}><Star weight={note.favorite ? "fill" : "regular"} /></button><button className="delete" onClick={() => removeNote(note.id)} aria-label="Excluir"><Trash /></button></article>) : <div className="empty"><span><Sparkle weight="duotone" /></span><h3>Nada por aqui ainda</h3><p>Registre uma aula, tarefa, lembrete ou uma ideia para este dia.</p><button onClick={() => openEditor()}><Plus /> Criar anotação</button></div>}
              </div>
            </section>
          </div>
        )}
      </section>

      {savedMessage && <div className="saved-message" role="status">Anotação feita, te amo! ❤️</div>}
      {modalOpen && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModalOpen(false)}><div className="modal"><div className="modal-title"><div><span><NotePencil /></span><div><h2>{editing ? "Editar anotação" : "Nova anotação"}</h2><p>{formatLong(selected)}</p></div></div><button onClick={() => setModalOpen(false)}><X /></button></div><form onSubmit={saveNote}><label>Título<input name="title" defaultValue={editing?.title} placeholder="Ex: Revisar matéria de Cálculo" required autoFocus /></label><label>Anotação<textarea name="text" defaultValue={editing?.text} placeholder="Escreva aqui tudo o que precisa lembrar..." rows="6" required /></label><div className="form-row"><label>Categoria<select name="category" defaultValue={editing?.category || "Faculdade"}><option>Faculdade</option><option>Trabalhos</option><option>Pessoal</option><option>Projetos</option></select></label><label>Horário<input type="time" name="time" defaultValue={editing?.time || ""} /></label></div><div className="reminder-box"><label className="reminder-toggle"><input type="checkbox" name="reminderEnabled" defaultChecked={editing?.reminderEnabled} /><span><Bell weight="fill" /></span><div><strong>Enviar lembrete por e-mail</strong><small>O e-mail será criado automaticamente com esta anotação.</small></div></label><label>Data e hora do lembrete<input type="datetime-local" name="reminderAt" defaultValue={toLocalInput(editing?.reminderAt)} /></label></div><div className="modal-actions"><button type="button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="save-button" type="submit">{editing ? "Salvar alterações" : "Criar anotação"}</button></div></form></div></div>}
    </main>
  );
}
