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

    return (
        <div className="login-wrap">
            <div className="login-card">
                <div className="brand-logo" style={{ color: "#fff" }}>T</div>
                <h1>Team OS</h1>
                <p className="login-sub">
                    {mode === "login" ? "Sign in to your workspace" : "Create your account"}
                </p>

                <form onSubmit={submit}>
                    {mode === "signup" && (
                        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                    )}
                    <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <input className="input" type="password" placeholder="Password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
                    {error && <div className="error" style={{ margin: 0 }}>{error}</div>}
                    <button type="submit" className="btn btn-primary">
                        {mode === "login" ? "Sign in" : "Sign up"}
                    </button>
                </form>

                <div className="login-switch">
                    {mode === "login" ? "No account? " : "Already have an account? "}
                    <a
                        href="#"
                        onClick={(e) => {
                            e.preventDefault();
                            setMode(mode === "login" ? "signup" : "login");
                        }}
                    >
                        {mode === "login" ? "Sign up" : "Sign in"}
                    </a>
                </div>
            </div>
        </div>
    );
}