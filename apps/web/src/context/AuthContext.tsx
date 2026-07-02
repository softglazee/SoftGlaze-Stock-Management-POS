import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, setTokens, getRefreshToken } from "../lib/api";

export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "CASHIER" | "ACCOUNTANT";
export type User = { id: string; name: string; email: string; role: Role; phone?: string | null };

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>(null as never);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Restore session on refresh
  useEffect(() => {
    (async () => {
      if (!getRefreshToken()) return setLoading(false);
      try {
        const data = await api<{ user: User }>("/auth/me");
        setUser(data.user);
      } catch {
        setTokens(null, null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    navigate("/");
  }

  async function register(name: string, email: string, password: string, phone?: string) {
    const data = await api<{ user: User; accessToken: string; refreshToken: string }>("/auth/register", {
      method: "POST",
      body: { name, email, password, phone },
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    navigate("/");
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* already invalid — fine */
    }
    setTokens(null, null);
    setUser(null);
    navigate("/login");
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
