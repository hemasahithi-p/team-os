import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "./api";
import { onRealtime } from "./realtime";
import { initials, avatarColor } from "./ui";

type Member = { id: number; name: string; email: string; role: string };

export default function Members({
    workspaceId,
    currentUserId,
    isAdmin,
}: {
    workspaceId: number;
    currentUserId: number;
    isAdmin: boolean;
}) {
    const [members, setMembers] = useState<Member[]>([]);
    const [error, setError] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("member");

    async function load() {
        try {
            setMembers(await api<Member[]>(`/workspaces/${workspaceId}/members`));
        } catch (e: any) {
            setError(e.message);
        }
    }

    useEffect(() => {
        setMembers([]);
        load();
    }, [workspaceId]);

    useEffect(() => {
        return onRealtime((ev) => {
            if (ev.type === "subscribed" || ev.type === "members.changed") load();
        });
    }, [workspaceId]);

    async function invite(e: FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        try {
            await api(`/workspaces/${workspaceId}/members`, {
                method: "POST",
                body: { email: email.trim(), role },
            });
            setEmail("");
            setError("");
            await load();
        } catch (err: any) {
            setError(err.message);
        }
    }

    async function changeRole(m: Member, newRole: string) {
        try {
            await api(`/workspaces/${workspaceId}/members/${m.id}`, {
                method: "PATCH",
                body: { role: newRole },
            });
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
        await load();
    }

    async function remove(m: Member) {
        if (!confirm(`Remove ${m.name} from this workspace? Their tasks become unassigned.`)) return;
        try {
            await api(`/workspaces/${workspaceId}/members/${m.id}`, { method: "DELETE" });
            setError("");
        } catch (err: any) {
            setError(err.message);
        }
        await load();
    }

    return (
        <div>
            {isAdmin && (
                <form className="task-form" onSubmit={invite}>
                    <input
                        className="input title-input"
                        placeholder="Invite by email (they must have signed up)"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="btn btn-primary">Invite</button>
                </form>
            )}

            {error && <div className="error">{error}</div>}

            <div className="members">
                {members.map((m) => (
                    <div className="member-row" key={m.id}>
                        <span className="avatar" style={{ background: avatarColor(m.name) }}>
                            {initials(m.name)}
                        </span>
                        <div className="member-info">
                            <div>
                                <strong>{m.name}</strong>
                                {m.id === currentUserId && <span className="chip" style={{ marginLeft: 8 }}>You</span>}
                            </div>
                            <div className="member-email">{m.email}</div>
                        </div>

                        {isAdmin ? (
                            <>
                                <select
                                    className="input"
                                    value={m.role}
                                    onChange={(e) => changeRole(m, e.target.value)}
                                >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                                <button className="btn" onClick={() => remove(m)}>Remove</button>
                            </>
                        ) : (
                            <span className="chip">{m.role}</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}