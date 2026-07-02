import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Anvil, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, ApiError } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // If no user exists yet (fresh install), send owner to Register
  useEffect(() => {
    api<{ needsSetup: boolean }>("/auth/setup-status")
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as ApiError).message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-11 h-11 rounded-lg bg-accent text-accent-ink flex items-center justify-center">
            <Anvil size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">SoftGlaze</h1>
            <p className="text-muted text-xs">Stock Management &amp; POS</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-1">Sign in</h2>
          <p className="text-muted text-sm mb-5">Enter your account details to open the shop.</p>

          {needsSetup && (
            <div className="mb-4 text-sm rounded-lg border border-edge bg-surface-2 p-3">
              Fresh installation detected —{" "}
              <button onClick={() => navigate("/register")} className="text-accent font-semibold underline">
                create the owner (admin) account
              </button>{" "}
              first.
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input" placeholder="owner@shop.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" className="input" placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            <button className="btn btn-primary w-full" disabled={busy}>
              <LogIn size={16} />
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-muted text-xs text-center mt-4">
          First time here? <Link to="/register" className="text-accent">Create owner account</Link>
        </p>
      </div>
    </div>
  );
}
