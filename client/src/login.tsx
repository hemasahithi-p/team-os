import { useState } from "react";
import type { FormEvent } from "react";
import { api, setToken } from "./api";

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
    const [mode, setMode] = useState<"login" | "signup">("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    async function submit(e: FormEvent) {
        e.preventDefault();
        setError("");
        try {
            if (mode === "signup") {
                await api("/auth/signup", { method: "POST", body: { name, email, password } });
            }
            const data = await api<{ token: string }>("/auth/login", {
                method: "POST",
                body: { email, password },
            });
            setToken(data.token);
            onLoggedIn();
        } catch (err: any) {
            setError(err.message);
        }
    }

    const input = { padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 15 };

    return (
        <div style={{ maxWidth: 340, margin: "80px auto", fontFamily: "sans-serif" }}>
            <h1>Team OS</h1>
            <p style={{ color: "#666" }}>
                {mode === "login" ? "Log in to your workspace" : "Create your account"}
            </p>

            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {mode === "signup" && (
                    <input style={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                )}
                <input style={input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input style={input} type="password" placeholder="Password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && <div style={{ color: "crimson" }}>{error}</div>}
                <button type="submit" style={{ ...input, background: "#111", color: "#fff", cursor: "pointer" }}>
                    {mode === "login" ? "Log in" : "Sign up"}
                </button>
            </form>

            <p style={{ marginTop: 16 }}>
                {mode === "login" ? "New here? " : "Already have an account? "}
                <a
                    href="#"
                    onClick={(e) => {
                        e.preventDefault();
                        setMode(mode === "login" ? "signup" : "login");
                    }}
                >
                    {mode === "login" ? "Sign up" : "Log in"}
                </a>
            </p>
        </div>
    );
}