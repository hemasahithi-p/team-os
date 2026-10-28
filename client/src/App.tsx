import { useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";
import Login from "./Login";

type User = { id: number; name: string; email: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadUser() {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setToken(null); // token expired or invalid
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUser();
  }, []);

  function logout() {
    setToken(null);
    setUser(null);
  }

  if (loading) return <p style={{ padding: 24 }}>Loading...</p>;
  if (!user) return <Login onLoggedIn={loadUser} />;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Team OS</h1>
      <p>
        Welcome, {user.name} ({user.email})
      </p>
      <button onClick={logout}>Log out</button>
    </div>
  );
}