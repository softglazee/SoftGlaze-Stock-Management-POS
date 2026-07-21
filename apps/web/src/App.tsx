import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Branding from "./components/Branding";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Units from "./pages/Units";
import Categories from "./pages/Categories";
import Products from "./pages/Products";
import Brands from "./pages/Brands";
import Purchases from "./pages/Purchases";
import Stock from "./pages/Stock";
import POS from "./pages/POS";
import Sales from "./pages/Sales";
import Customers from "./pages/Customers";
import Vendors from "./pages/Vendors";
import PriceGroups from "./pages/PriceGroups";
import Accounts from "./pages/Accounts";
import Payments from "./pages/Payments";
import Promises from "./pages/Promises";
import Cheques from "./pages/Cheques";
import Bookings from "./pages/Bookings";
import Estimator from "./pages/Estimator";
import Expenses from "./pages/Expenses";
import Employees from "./pages/Employees";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import SettingsPage from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Messages from "./pages/Messages";

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

export default function App() {
  return (
    <>
    <Branding />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/onboarding"
        element={
          <Protected>
            <Onboarding />
          </Protected>
        }
      />
      {/* POS is full-screen (outside the sidebar layout) */}
      <Route
        path="/pos"
        element={
          <Protected>
            <POS />
          </Protected>
        }
      />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/products" element={<Products />} />
        <Route path="/brands" element={<Brands />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/units" element={<Units />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/price-groups" element={<PriceGroups />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/promises" element={<Promises />} />
        <Route path="/cheques" element={<Cheques />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/estimator" element={<Estimator />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/users" element={<Users />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
