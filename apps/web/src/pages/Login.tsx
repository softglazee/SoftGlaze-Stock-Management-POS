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
  const [totpNeeded, setTotpNeeded] = useState(false); // H3 — 2FA challenge
  const [totpCode, setTotpCode] = useState("");
  const [shop, setShop] = useState<{ name: string; logo?: string }>({ name: "SoftGlaze" });

  // If no user exists yet (fresh install), send owner to Register
  useEffect(() => {
    api<{ needsSetup: boolean }>("/auth/setup-status")
      .then((d) => setNeedsSetup(d.needsSetup))
      .catch(() => {});
    api<{ settings: Record<string, string> }>("/settings/public")
      .then((d) =>
        setShop({ name: d.settings.shop_name || "SoftGlaze", logo: d.settings.shop_logo_thumb || d.settings.shop_logo })
      )
      .catch(() => {});
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password, totpNeeded ? totpCode : undefined);
    } catch (err) {
      const e = err as ApiError;
      if (e.code === "TOTP_REQUIRED") { setTotpNeeded(true); setError(null); }
      else if (e.code === "TOTP_INVALID") { setTotpNeeded(true); setError(e.message); }
      else setError(e.message ?? "Login failed");
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
          {shop.logo ? (
            <img src={shop.logo} alt="" className="w-11 h-11 rounded-lg object-cover border border-edge" />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-accent text-accent-ink flex items-center justify-center">
              <Anvil size={24} />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{shop.name}</h1>
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

            {totpNeeded && (
              <div>
                <label className="label" htmlFor="totp">Authenticator code</label>
                <input id="totp" inputMode="numeric" autoComplete="one-time-code" className="input mono tracking-widest text-center" placeholder="123456"
                  value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus />
                <p className="text-muted text-xs mt-1">Enter the 6-digit code from your authenticator app.</p>
              </div>
            )}

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
