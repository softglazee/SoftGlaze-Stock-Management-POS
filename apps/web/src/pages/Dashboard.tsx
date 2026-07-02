import { TrendingUp, Wallet, Users, Truck, PackageX, Banknote } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/**
 * Dashboard skeleton — wired to real /reports/dashboard data in Phase 5.
 * Cashiers don't see profit/receivables (matrix in docs/04-FEATURES.md).
 */
const CARDS = [
  { key: "sales", label: "Today's Sales", icon: TrendingUp, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
  { key: "profit", label: "Today's Profit", icon: Banknote, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { key: "receivables", label: "Receivables (Udhaar)", icon: Users, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { key: "payables", label: "Payables to Vendors", icon: Truck, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { key: "cash", label: "Cash in Hand", icon: Wallet, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { key: "lowStock", label: "Low Stock Items", icon: PackageX, roles: ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] },
];

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Salam, {user?.name?.split(" ")[0]} 👋</h1>
        <p className="text-muted text-sm mt-1">
          Here's how the shop is doing today. Live numbers arrive in Phase 5 — for now this is the frame.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.filter((c) => !user || c.roles.includes(user.role)).map((card) => (
          <div key={card.key} className="card p-5 flex items-start justify-between">
            <div>
              <p className="text-muted text-sm">{card.label}</p>
              <p className="money text-2xl font-semibold mt-2">—</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-2 border border-edge flex items-center justify-center text-accent">
              <card.icon size={20} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="card p-5 lg:col-span-2 min-h-64">
          <h2 className="font-semibold mb-1">Sales — last 30 days</h2>
          <p className="text-muted text-sm">Chart (Recharts) mounts here in Phase 5.</p>
        </div>
        <div className="card p-5 min-h-64">
          <h2 className="font-semibold mb-1">Low stock</h2>
          <p className="text-muted text-sm">Products below their minimum level will list here.</p>
        </div>
      </div>
    </div>
  );
}
