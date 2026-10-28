import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import Board from "./Board";
import { initials, avatarColor } from "./ui";

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
                <input className="search" placeholder="Search (AI search coming soon)" disabled />
                <div className="topbar-right">
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
                    {workspace && !project && <div className="empty-state">Create a project to get started.</div>}
                    {workspace && project && (
                        <>
                            <div className="page-head">
                                <h1>{project.name}</h1>
                                <span className="chip">{workspace.role}</span>
                            </div>
                            <Board workspaceId={workspace.id} projectId={project.id} canEdit={canEdit} />
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}