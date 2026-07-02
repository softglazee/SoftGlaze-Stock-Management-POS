import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.routes";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

// Product images etc.
app.use("/uploads", express.static(path.join(process.cwd(), process.env.UPLOAD_DIR ?? "uploads")));

// Protect auth endpoints from brute force
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true });

app.get("/api/v1/health", (_req, res) => res.json({ ok: true, data: { status: "up", ts: Date.now() } }));

app.use("/api/v1/auth", authLimiter, authRoutes);

// ── Module routes get mounted here as we build each phase ──
// app.use("/api/v1/categories", categoryRoutes);   // Phase 1
// app.use("/api/v1/products", productRoutes);      // Phase 1
// app.use("/api/v1/customers", customerRoutes);    // Phase 1
// app.use("/api/v1/vendors", vendorRoutes);        // Phase 1
// app.use("/api/v1/purchases", purchaseRoutes);    // Phase 2
// app.use("/api/v1/sales", saleRoutes);            // Phase 3
// app.use("/api/v1/payments", paymentRoutes);      // Phase 4
// app.use("/api/v1/expenses", expenseRoutes);      // Phase 4
// app.use("/api/v1/reports", reportRoutes);        // Phase 5
// app.use("/api/v1/users", userRoutes);            // Phase 6
// app.use("/api/v1/settings", settingRoutes);      // Phase 6

// 404 + error handler
app.use((_req, res) => res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({
    ok: false,
    error: { code: err.code ?? "SERVER_ERROR", message: err.message ?? "Something went wrong" },
  });
});

export default app;
