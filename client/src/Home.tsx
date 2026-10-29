import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import Board from "./Board";
import { initials, avatarColor } from "./ui";
import { connectWorkspace, disconnect, onRealtime } from "./realtime";
import Bell from "./Bell";
import Calendar from "./Calendar";
import Members from "./Members";
import Search from "./Search";
import Meetings from "./Meetings";

type User = { id: number; name: string; email: string };
type Workspace = { id: number; name: string; role: string };
type Project = { id: number; name: string; description: string | null };

export default function Home({ user, onLogout }: { user: User; onLogout: () => void }) {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [wsId, setWsId] = useState<number | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [projectId, setProjectId] = useState<number | null>(null);
    const [newWs, setNewWs] = useState("");
    const [newProject, setNewProject] = useState("");
    const [error, setError] = useState("");
    const [view, setView] = useState<"board" | "calendar" | "members" | "meetings">("board");
    const [focusTask, setFocusTask] = useState<{ id: number; n: number } | null>(null);
    const [focusMeeting, setFocusMeeting] = useState<{ id: number; n: number } | null>(null);

    // a search result was clicked
    function openResult(r: { kind: "task" | "meeting"; id: number; project_id: number | null }) {
        if (r.kind === "task") {
            if (r.project_id) setProjectId(r.project_id);
            setView("board");
            setFocusTask({ id: r.id, n: Date.now() });
        } else {
            setView("meetings");
            setFocusMeeting({ id: r.id, n: Date.now() });
        }
    }

    const workspace = workspaces.find((w) => w.id === wsId);
    const project = projects.find((p) => p.id === projectId);
    const canEdit = workspace?.role === "admin" || workspace?.role === "member";

    useEffect(() => {
        api<Workspace[]>("/workspaces")
            .then((list) => {
                setWorkspaces(list);
                setWsId(list[0]?.id ?? null);
            })
            .catch((e) => setError(e.message));
    }, []);

    useEffect(() => {
        setProjects([]);
        setProjectId(null);
        if (wsId === null) return;
        api<Project[]>(`/workspaces/${wsId}/projects`)
            .then((list) => {
                setProjects(list);
                setProjectId(list[0]?.id ?? null);
            })
            .catch((e) => setError(e.message));
    }, [wsId]);

    // keep one live connection to the selected workspace
    useEffect(() => {
        if (wsId !== null) connectWorkspace(wsId);
    }, [wsId]);
    // if an admin removes me from the workspace I am viewing, reload
    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "removed") window.location.reload();
        });
    }, []);

    // close it when leaving (logout)
    useEffect(() => () => disconnect(), []);

    async function createWorkspace(e: FormEvent) {
        e.preventDefault();
        if (!newWs.trim()) return;
        try {
            const created = await api<Workspace>("/workspaces", {
                method: "POST",
                body: { name: newWs.trim() },
            });
            setWorkspaces((list) => [...list, created]);
            setWsId(created.id);
            setNewWs("");
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
    }

    async function createProject(e: FormEvent) {
        e.preventDefault();
        if (!newProject.trim() || wsId === null) return;
        try {
            const created = await api<Project>(`/workspaces/${wsId}/projects`, {
                method: "POST",
                body: { name: newProject.trim() },
            });
            setProjects((list) => [...list, created]);
            setProjectId(created.id);
            setNewProject("");
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
    }

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    <span className="brand-logo">T</span>
                    Team OS
                </div>
                <Search workspaceId={wsId} onPick={openResult} />
                <div className="topbar-right">
                    <Bell workspaceId={wsId} />
                    <span className="user-name">{user.name}</span>
                    <div className="avatar" style={{ background: avatarColor(user.name) }}>
                        {initials(user.name)}
                    </div>
                    <button className="btn-ghost" onClick={onLogout}>Sign out</button>
                </div>
            </header>

            <div className="body">
                <aside className="sidebar">
                    <div className="side-label">Workspace</div>
                    {workspaces.length > 0 && (
                        <select
                            className="input"
                            style={{ width: "100%" }}
                            value={wsId ?? ""}
                            onChange={(e) => setWsId(Number(e.target.value))}
                        >
                            {workspaces.map((w) => (
                                <option key={w.id} value={w.id}>
                                    {w.name} ({w.role})
                                </option>
                            ))}
                        </select>
                    )}
                    <form className="side-row" onSubmit={createWorkspace}>
                        <input className="input" placeholder="New workspace" value={newWs} onChange={(e) => setNewWs(e.target.value)} />
                        <button type="submit" className="btn">+</button>
                    </form>

                    {workspace && (
                        <>
                            <div className="side-label">Projects</div>
                            {projects.map((p) => (
                                <div
                                    key={p.id}
                                    className={"project-item" + (p.id === projectId ? " active" : "")}
                                    onClick={() => setProjectId(p.id)}
                                >
                                    {p.name}
                                </div>
                            ))}
                            {projects.length === 0 && <div className="side-empty">No projects yet</div>}

                            {canEdit && (
                                <form className="side-row" onSubmit={createProject}>
                                    <input className="input" placeholder="New project" value={newProject} onChange={(e) => setNewProject(e.target.value)} />
                                    <button type="submit" className="btn">+</button>
                                </form>
                            )}
                        </>
                    )}
                </aside>

                <main className="main">
                    {error && <div className="error">{error}</div>}
                    {!workspace && <div className="empty-state">Create a workspace to get started.</div>}

                    {workspace && (
                        <div className="tabs">
                            <button className={"tab" + (view === "board" ? " active" : "")} onClick={() => setView("board")}>
                                Board
                            </button>
                            <button className={"tab" + (view === "calendar" ? " active" : "")} onClick={() => setView("calendar")}>
                                Calendar
                            </button>
                            <button className={"tab" + (view === "members" ? " active" : "")} onClick={() => setView("members")}>
                                Members
                            </button>
                            <button className={"tab" + (view === "meetings" ? " active" : "")} onClick={() => setView("meetings")}>
                                Meetings
                            </button>
                        </div>
                    )}

                    {workspace && view === "board" && !project && (
                        <div className="empty-state">Create a project to get started.</div>
                    )}

                    {workspace && view === "board" && project && (
                        <>
                            <div className="page-head">
                                <h1>{project.name}</h1>
                                <span className="chip">{workspace.role}</span>
                            </div>
                            <Board
                                workspaceId={workspace.id}
                                projectId={project.id}
                                canEdit={canEdit}
                                focus={focusTask}
                                onFocusDone={() => setFocusTask(null)}
                            />
                        </>
                    )}

                    {workspace && view === "calendar" && (
                        <>
                            <div className="page-head">
                                <h1>{workspace.name} calendar</h1>
                                <span className="chip">{workspace.role}</span>
                            </div>
                            <Calendar
                                workspaceId={workspace.id}
                                canEdit={canEdit}
                                userId={user.id}
                                isAdmin={workspace.role === "admin"}
                            />
                        </>
                    )}

                    {workspace && view === "members" && (
                        <>
                            <div className="page-head">
                                <h1>{workspace.name} members</h1>
                                <span className="chip">{workspace.role}</span>
                            </div>
                            <Members
                                workspaceId={workspace.id}
                                currentUserId={user.id}
                                isAdmin={workspace.role === "admin"}
                            />
                        </>
                    )}
                    {workspace && view === "meetings" && (
                        <>
                            <div className="page-head">
                                <h1>{workspace.name} meetings</h1>
                                <span className="chip">{workspace.role}</span>
                            </div>
                            <Meetings
                                workspaceId={workspace.id}
                                canEdit={canEdit}
                                focus={focusMeeting}
                                onFocusDone={() => setFocusMeeting(null)}
                            />
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}