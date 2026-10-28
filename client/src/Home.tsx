import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";

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

    // load my workspaces once
    useEffect(() => {
        api<Workspace[]>("/workspaces")
            .then((list) => {
                setWorkspaces(list);
                setWsId(list[0]?.id ?? null);
            })
            .catch((e) => setError(e.message));
    }, []);

    // load projects whenever the selected workspace changes
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

    const box = { padding: 8, border: "1px solid #ccc", borderRadius: 6, fontSize: 14 };
    const label = { fontSize: 12, color: "#666", margin: "16px 0 6px", textTransform: "uppercase" as const };

    return (
        <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
            {/* sidebar */}
            <aside style={{ width: 260, background: "#fff", borderRight: "1px solid #ddd", padding: 16 }}>
                <h2 style={{ margin: 0 }}>Team OS</h2>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{user.name}</div>
                <button onClick={onLogout} style={{ ...box, marginTop: 8, cursor: "pointer" }}>
                    Log out
                </button>

                <div style={label}>Workspace</div>
                {workspaces.length > 0 && (
                    <select
                        style={{ ...box, width: "100%" }}
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
                <form onSubmit={createWorkspace} style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <input
                        style={{ ...box, flex: 1, minWidth: 0 }}
                        placeholder="New workspace"
                        value={newWs}
                        onChange={(e) => setNewWs(e.target.value)}
                    />
                    <button type="submit" style={{ ...box, cursor: "pointer" }}>+</button>
                </form>

                {workspace && (
                    <>
                        <div style={label}>Projects</div>
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                onClick={() => setProjectId(p.id)}
                                style={{
                                    padding: "8px 10px",
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    marginBottom: 2,
                                    background: p.id === projectId ? "#111" : "transparent",
                                    color: p.id === projectId ? "#fff" : "#111",
                                }}
                            >
                                {p.name}
                            </div>
                        ))}
                        {projects.length === 0 && <div style={{ color: "#888", fontSize: 14 }}>No projects yet</div>}

                        {canEdit && (
                            <form onSubmit={createProject} style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                <input
                                    style={{ ...box, flex: 1, minWidth: 0 }}
                                    placeholder="New project"
                                    value={newProject}
                                    onChange={(e) => setNewProject(e.target.value)}
                                />
                                <button type="submit" style={{ ...box, cursor: "pointer" }}>+</button>
                            </form>
                        )}
                    </>
                )}
            </aside>

            {/* main area */}
            <main style={{ flex: 1, padding: 24 }}>
                {error && <div style={{ color: "crimson", marginBottom: 12 }}>{error}</div>}
                {!workspace && <p>Create a workspace to get started.</p>}
                {workspace && !project && <p>Create a project to get started.</p>}
                {workspace && project && (
                    <>
                        <h1 style={{ marginTop: 0 }}>{project.name}</h1>
                        <p style={{ color: "#666" }}>Board comes in the next part.</p>
                    </>
                )}
            </main>
        </div>
    );
}