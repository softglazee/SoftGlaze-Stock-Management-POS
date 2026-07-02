import { useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Anvil, LayoutDashboard, ShoppingCart, Package, FolderTree, Truck, Users,
  Receipt, Wallet, BarChart3, Settings, LogOut, Banknote, IdCard, Ruler, Tag, Boxes, Landmark, UserCog, Menu, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import ThemeToggle from "./ThemeToggle";
import Calculator from "./Calculator";
import NotificationBell from "./NotificationBell";

// Sidebar map — items appear as we build each phase.
// `roles` hides links the user can't use (server still enforces).
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/pos", label: "POS / New Sale", icon: ShoppingCart, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"] },
  { to: "/sales", label: "Sales", icon: Receipt, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/products", label: "Products", icon: Package, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/categories", label: "Categories", icon: FolderTree, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/brands", label: "Brands", icon: Tag, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/units", label: "Units", icon: Ruler, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/purchases", label: "Purchases", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/stock", label: "Stock", icon: Boxes, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/vendors", label: "Vendors", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/accounts", label: "Accounts & Cash", icon: Landmark, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/payments", label: "Payments", icon: Wallet, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/expenses", label: "Expenses", icon: Banknote, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/employees", label: "Employees", icon: IdCard, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/users", label: "Users & Roles", icon: UserCog, roles: ["SUPER_ADMIN", "ADMIN"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  // First run: the owner picks a Business Type before anything else
  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: Record<string, string> }>("/settings"),
    staleTime: 60_000,
  });
  if (
    settingsData &&
    settingsData.settings.onboarding_done !== "1" &&
    user?.role === "SUPER_ADMIN"
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  const shopName = settingsData?.settings.shop_name || "SoftGlaze";
  const shopLogo = settingsData?.settings.shop_logo_thumb || settingsData?.settings.shop_logo;

  return (
    <div className="min-h-screen flex">
      {/* Mobile top bar */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-surface border-b border-edge flex items-center gap-3 px-3">
        <button
          className="btn btn-secondary !p-2"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
        {shopLogo ? (
          <img src={shopLogo} alt="" className="w-7 h-7 rounded-md object-cover border border-edge" />
        ) : (
          <div className="w-7 h-7 rounded-md bg-accent text-accent-ink flex items-center justify-center">
            <Anvil size={16} />
          </div>
        )}
        <span className="font-bold display truncate">{shopName}</span>
        <div className="flex-1" />
        <NotificationBell />
      </header>
      {navOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setNavOpen(false)} />
      )}

      {/* Sidebar — fixed drawer on mobile, static on desktop */}
      <aside
        className={`w-60 shrink-0 border-r border-edge bg-surface flex flex-col
          fixed inset-y-0 left-0 z-50 transition-transform duration-200
          ${navOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:translate-x-0`}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-edge">
          {shopLogo ? (
            <img src={shopLogo} alt="" className="w-8 h-8 rounded-md object-cover border border-edge" />
          ) : (
            <div className="w-8 h-8 rounded-md bg-accent text-accent-ink flex items-center justify-center">
              <Anvil size={18} />
            </div>
          )}
          <span className="font-bold display flex-1 truncate">{shopName}</span>
          <button
            className="lg:hidden text-muted hover:text-ink"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.filter((n) => !user || n.roles.includes(user.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-surface-2 text-ink font-semibold border border-edge"
                    : "text-muted hover:text-ink hover:bg-surface-2"
                }`
              }
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-edge">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted">{user?.role}</p>
            </div>
            <div className="flex gap-1.5">
              <NotificationBell />
              <ThemeToggle />
              <button onClick={logout} className="btn btn-secondary !p-2" title="Logout" aria-label="Logout">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 p-4 lg:p-6 pt-18 lg:pt-6">
        <Outlet />
      </main>

      {/* Global calculator (also available inside POS) */}
      <Calculator />
    </div>
  );
}
