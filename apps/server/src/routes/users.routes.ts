/**
 * Users & roles (Phase 6). Admins create staff here (public registration is closed
 * after the first owner account). Users are never hard-deleted — they're referenced by
 * sales/payments — so removal deactivates. Role rules: only SUPER_ADMIN may grant ADMIN
 * or touch another SUPER_ADMIN; nobody can change their own role or lock themselves out.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";

const router = Router();
router.use(requireAuth);

const ASSIGNABLE = ["ADMIN", "MANAGER", "CASHIER", "ACCOUNTANT"] as const;
const select = { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true } satisfies Prisma.UserSelect;

/** GET /users */
router.get("/", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const where: Prisma.UserWhereInput = search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {};
    const users = await prisma.user.findMany({ where, select, orderBy: { createdAt: "asc" } });
    res.json({ ok: true, data: { users } });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().trim().max(25).nullable().optional(),
  role: z.enum(ASSIGNABLE),
});

/** POST /users — create a staff account */
router.post("/", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    if (body.role === "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only the owner can create an Admin" } });
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({ data: { name: body.name, email: body.email.toLowerCase(), phone: body.phone || null, role: body.role, passwordHash }, select });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "CREATE_USER", entity: "User", entityId: user.id, details: `${user.name} · ${user.role}` } });
    res.status(201).json({ ok: true, data: { user } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    if (err?.code === "P2002") return res.status(409).json({ ok: false, error: { code: "DUPLICATE", message: "A user with that email already exists" } });
    next(err);
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(25).nullable().optional(),
  role: z.enum(ASSIGNABLE).optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /users/:id */
router.patch("/:id", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
    if (target.role === "SUPER_ADMIN" && (body.role !== undefined || body.isActive !== undefined)) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "The owner account's role and status can't be changed" } });
    }
    if (target.id === req.user!.id && (body.role !== undefined || body.isActive === false)) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "You can't change your own role or disable yourself" } });
    }
    if (body.role === "ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only the owner can grant Admin" } });
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { name: body.name, phone: body.phone === undefined ? undefined : body.phone || null, role: body.role, isActive: body.isActive, ...(body.isActive === false ? { refreshToken: null } : {}) },
      select,
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "UPDATE_USER", entity: "User", entityId: user.id, details: `${user.name} · ${user.role}${user.isActive ? "" : " · disabled"}` } });
    res.json({ ok: true, data: { user } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    next(err);
  }
});

/** POST /users/:id/reset-password */
router.post("/:id/reset-password", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const password = z.string().min(8, "Password must be at least 8 characters").parse(req.body?.password);
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true, name: true } });
    if (!target) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
    if (target.role === "SUPER_ADMIN" && req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Only the owner can reset the owner's password" } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash, refreshToken: null } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "RESET_PASSWORD", entity: "User", entityId: target.id, details: target.name } });
    res.json({ ok: true, data: { message: `Password reset for ${target.name}` } });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    next(err);
  }
});

/** DELETE /users/:id — deactivate (never hard-delete; users own history) */
router.delete("/:id", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, role: true } });
    if (!target) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
    if (target.role === "SUPER_ADMIN") return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "The owner account can't be removed" } });
    if (target.id === req.user!.id) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "You can't disable yourself" } });
    await prisma.user.update({ where: { id: target.id }, data: { isActive: false, refreshToken: null } });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: "DEACTIVATE_USER", entity: "User", entityId: target.id, details: target.name } });
    res.json({ ok: true, data: { message: `${target.name} disabled` } });
  } catch (err) {
    next(err);
  }
});

export default router;
