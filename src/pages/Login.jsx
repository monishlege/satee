import React, { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { setToken, setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const NODE_URL = import.meta.env.VITE_NODE_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3000");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const resp = await fetch(`${NODE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const ct = resp.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const text = await resp.text();
        throw new Error(text.slice(0, 200) || "Invalid response from server");
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Login failed");
      setToken(data.token);
      setUser(data.user);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 bg-white rounded-lg shadow p-6">
      <div className="text-xl font-semibold mb-4">Sign in</div>
      {error && <div className="mb-3 text-red-600">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-600">Username</label>
          <input value={username} onChange={e=>setUsername(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm text-gray-600">Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>
        <button className="w-full bg-blue-600 text-white rounded px-3 py-2">Sign in</button>
      </form>
    </div>
  );
}
