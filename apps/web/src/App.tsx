import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">Loading SoftGlaze…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Temporary placeholder until we build each module in its phase
function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="card p-10 text-center">
      <h1 className="text-xl font-bold mb-2">{title}</h1>
      <p className="text-muted">
        This module is scheduled for <span className="text-accent font-semibold">{phase}</span> in
        docs/01-BUILD-PLAN.md — we'll build it together next.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/pos" element={<ComingSoon title="POS / New Sale" phase="Phase 3" />} />
        <Route path="/sales" element={<ComingSoon title="Sales" phase="Phase 3" />} />
        <Route path="/products" element={<ComingSoon title="Products" phase="Phase 1" />} />
        <Route path="/categories" element={<ComingSoon title="Categories" phase="Phase 1" />} />
        <Route path="/purchases" element={<ComingSoon title="Purchases" phase="Phase 2" />} />
        <Route path="/customers" element={<ComingSoon title="Customers" phase="Phase 1" />} />
        <Route path="/vendors" element={<ComingSoon title="Vendors" phase="Phase 1" />} />
        <Route path="/payments" element={<ComingSoon title="Payments" phase="Phase 4" />} />
        <Route path="/expenses" element={<ComingSoon title="Expenses" phase="Phase 4" />} />
        <Route path="/employees" element={<ComingSoon title="Employees & Salaries" phase="Phase 4" />} />
        <Route path="/reports" element={<ComingSoon title="Reports" phase="Phase 5" />} />
        <Route path="/settings" element={<ComingSoon title="Settings" phase="Phase 6" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
