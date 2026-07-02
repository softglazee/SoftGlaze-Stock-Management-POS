import { NavLink, Outlet } from "react-router-dom";
import {
  Anvil, LayoutDashboard, ShoppingCart, Package, FolderTree, Truck, Users,
  Receipt, Wallet, BarChart3, Settings, LogOut, Banknote, IdCard,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

// Sidebar map — items appear as we build each phase.
// `roles` hides links the user can't use (server still enforces).
const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/pos", label: "POS / New Sale", icon: ShoppingCart, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER"] },
  { to: "/sales", label: "Sales", icon: Receipt, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/products", label: "Products", icon: Package, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/categories", label: "Categories", icon: FolderTree, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/purchases", label: "Purchases", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/customers", label: "Customers", icon: Users, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/vendors", label: "Vendors", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/payments", label: "Payments", icon: Wallet, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { to: "/expenses", label: "Expenses", icon: Banknote, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/employees", label: "Employees", icon: IdCard, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN"] },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-edge bg-surface flex flex-col">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-edge">
          <div className="w-8 h-8 rounded-md bg-accent text-accent-ink flex items-center justify-center">
            <Anvil size={18} />
          </div>
          <span className="font-bold display">SoftGlaze</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.filter((n) => !user || n.roles.includes(user.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
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
              <ThemeToggle />
              <button onClick={logout} className="btn btn-secondary !p-2" title="Logout" aria-label="Logout">
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 p-6">
        <Outlet />
      </main>
    </div>
  );
}
