import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Input, toast } from "@kansha/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { notifyError } from "../lib/notifications";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const [admin, setAdmin] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await api("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
      } else if (admin) {
        await api("/auth/admin-login", { method: "POST", body: JSON.stringify({ email, password }) });
      } else {
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      }
      await refresh();
      toast.success(mode === "signup" ? "Account created" : "Signed in");
      navigate(admin ? "/admin" : "/dashboard");
    } catch (err) {
      const message = notifyError(err, "Authentication failed");
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <Link to="/" className="text-sm font-semibold text-teal-800">
          Kansha Monitor
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">{mode === "signup" ? "Create account" : "Sign in"}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {mode === "signup" ? "Add monitored locations and connect Telegram." : "Open your monitoring dashboard."}
        </p>

        {mode === "login" && (
          <div className="mt-5 grid grid-cols-2 rounded-md bg-slate-100 p-1 text-sm">
            <button className={!admin ? "rounded bg-white py-2 shadow-sm" : "py-2 text-slate-600"} onClick={() => setAdmin(false)}>
              User
            </button>
            <button className={admin ? "rounded bg-white py-2 shadow-sm" : "py-2 text-slate-600"} onClick={() => setAdmin(true)}>
              Admin
            </button>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "signup" && <Input placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />}
          <Input placeholder="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <Input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button className="w-full" disabled={loading}>
            {loading ? "Working..." : mode === "signup" ? "Sign up" : admin ? "Admin sign in" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-600">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <Link className="font-medium text-teal-800" to="/login">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link className="font-medium text-teal-800" to="/signup">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
