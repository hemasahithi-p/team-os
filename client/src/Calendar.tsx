import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import { today } from "./ui";
import TaskPanel from "./TaskPanel";
import type { Task } from "./Board";

type CalEvent = {
    id: number;
    title: string;
    event_date: string;
    start_time: string | null;
    description: string | null;
    created_by: number;
    creator_name: string;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_COLOR: Record<Task["status"], string> = {
    todo: "#8a8a8a",
    in_progress: "#0f6cbd",
    blocked: "#c4314b",
    done: "#237b4b",
};

function fmt(y: number, m: number, d: number) {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function Calendar({
    workspaceId,
    canEdit,
    userId,
    isAdmin,
}: {
    workspaceId: number;
    canEdit: boolean;
    userId: number;
    isAdmin: boolean;
}) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [tasks, setTasks] = useState<Task[]>([]);
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [error, setError] = useState("");
    const [openId, setOpenId] = useState<number | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);

    // new event form
    const [evTitle, setEvTitle] = useState("");
    const [evDate, setEvDate] = useState(today());
    const [evTime, setEvTime] = useState("");

    async function loadTasks() {
        try {
            setTasks(await api<Task[]>(`/workspaces/${workspaceId}/tasks`));
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function loadEvents() {
        try {
            setEvents(await api<CalEvent[]>(`/workspaces/${workspaceId}/events`));
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setTasks([]);
        setEvents([]);
        setOpenId(null);
        loadTasks();
        loadEvents();
    }, [workspaceId]);

    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed") {
                loadTasks();
                loadEvents();
            }
            if (ev.type === "tasks.changed") loadTasks();
            if (ev.type === "events.changed") loadEvents();
        });
    }, [workspaceId]);

    async function addEvent(e: FormEvent) {
        e.preventDefault();
        if (!evTitle.trim() || !evDate) return;
        try {
            await api(`/workspaces/${workspaceId}/events`, {
                method: "POST",
                body: {
                    title: evTitle.trim(),
                    eventDate: evDate,
                    ...(evTime ? { startTime: evTime } : {}),
                },
            });
            setEvTitle("");
            setEvTime("");
            setError("");
            await loadEvents();
        } catch (err: any) {
            setError(err.message);
        }
    }

    async function removeEvent(ev: CalEvent) {
        if (!confirm(`Delete event "${ev.title}"?`)) return;
        try {
            await api(`/workspaces/${workspaceId}/events/${ev.id}`, { method: "DELETE" });
            setError("");
            await loadEvents();
        } catch (err: any) {
            setError(err.message);
        }
    }

    function shift(delta: number) {
        const d = new Date(year, month + delta, 1);
        setYear(d.getFullYear());
        setMonth(d.getMonth());
        setExpanded(null);
    }

    function goToday() {
        const d = new Date();
        setYear(d.getFullYear());
        setMonth(d.getMonth());
        setExpanded(null);
    }

    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: total }, (_, i) => {
        const d = new Date(year, month, 1 - offset + i);
        return {
            date: fmt(d.getFullYear(), d.getMonth(), d.getDate()),
            day: d.getDate(),
            inMonth: d.getMonth() === month,
        };
    });

    const tasksByDate: Record<string, Task[]> = {};
    tasks.forEach((t) => {
        if (t.due_date) (tasksByDate[t.due_date] ??= []).push(t);
    });
    const eventsByDate: Record<string, CalEvent[]> = {};
    events.forEach((e) => (eventsByDate[e.event_date] ??= []).push(e));
    const unscheduled = tasks.filter((t) => !t.due_date);

    const todayStr = today();
    const openTask = tasks.find((t) => t.id === openId);

    function taskChip(t: Task) {
        const overdue = !!t.due_date && t.due_date < todayStr && t.status !== "done";
        return (
            <div
                key={"t" + t.id}
                className={"cal-chip" + (overdue ? " overdue" : "") + (t.status === "done" ? " done" : "")}
                style={{ borderLeftColor: STATUS_COLOR[t.status] }}
                onClick={() => setOpenId(t.id)}
                title={`${t.title}${t.assignee_name ? " · " + t.assignee_name : ""}`}
            >
                {t.title}
            </div>
        );
    }

    function eventChip(e: CalEvent) {
        const canDelete = isAdmin || e.created_by === userId;
        return (
            <div
                key={"e" + e.id}
                className="cal-chip event"
                onClick={() => canDelete && removeEvent(e)}
                title={`${e.title}${e.start_time ? " at " + e.start_time.slice(0, 5) : ""} · by ${e.creator_name}${canDelete ? " · click to delete" : ""
                    }`}
            >
                {e.start_time ? e.start_time.slice(0, 5) + " " : ""}
                {e.title}
            </div>
        );
    }

    return (
        <div>
            {canEdit && (
                <form className="task-form" onSubmit={addEvent}>
                    <input
                        className="input title-input"
                        placeholder="Add a team event (meeting, review, demo...)"
                        value={evTitle}
                        onChange={(e) => setEvTitle(e.target.value)}
                    />
                    <input className="input" type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                    <input className="input" type="time" value={evTime} onChange={(e) => setEvTime(e.target.value)} />
                    <button type="submit" className="btn btn-primary">Add event</button>
                </form>
            )}

            <div className="cal-toolbar">
                <button className="btn" onClick={() => shift(-1)}>←</button>
                <button className="btn" onClick={() => shift(1)}>→</button>
                <button className="btn" onClick={goToday}>Today</button>
                <h2 className="cal-title">
                    {new Date(year, month, 1).toLocaleDateString([], { month: "long", year: "numeric" })}
                </h2>
            </div>

            {error && <div className="error">{error}</div>}

            <div className="cal-grid">
                {DAYS.map((d) => (
                    <div key={d} className="cal-dow">{d}</div>
                ))}

                {cells.map((c) => {
                    const items = [
                        ...(eventsByDate[c.date] ?? []).map(eventChip),
                        ...(tasksByDate[c.date] ?? []).map(taskChip),
                    ];
                    const showAll = expanded === c.date;
                    const visible = showAll ? items : items.slice(0, 3);
                    return (
                        <div
                            key={c.date}
                            className={
                                "cal-cell" + (c.inMonth ? "" : " outside") + (c.date === todayStr ? " today" : "")
                            }
                        >
                            <div className="cal-day">{c.day}</div>
                            {visible}
                            {items.length > 3 && (
                                <button className="link-btn" onClick={() => setExpanded(showAll ? null : c.date)}>
                                    {showAll ? "Show less" : `+${items.length - 3} more`}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {unscheduled.length > 0 && (
                <div className="unscheduled">
                    <div className="panel-section-title">No due date ({unscheduled.length})</div>
                    <div className="unscheduled-list">{unscheduled.map(taskChip)}</div>
                </div>
            )}

            {openTask && (
                <TaskPanel
                    workspaceId={workspaceId}
                    task={openTask}
                    canEdit={canEdit}
                    onClose={() => setOpenId(null)}
                />
            )}
        </div>
    );
}