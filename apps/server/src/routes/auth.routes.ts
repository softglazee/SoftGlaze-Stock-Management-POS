import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, signAccessToken, signRefreshToken } from "../middleware/auth";
import { getPermissionsForRole } from "../lib/permissions";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(u: { id: string; name: string; email: string; role: any; phone?: string | null }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, phone: u.phone ?? null };
}

async function issueTokens(user: { id: string; name: string; email: string; role: any }) {
  const accessToken = signAccessToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  const refreshToken = signRefreshToken(user.id);
  const refreshHash = await bcrypt.hash(refreshToken, 8);
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken: refreshHash } });
  return { accessToken, refreshToken };
}

/**
 * POST /auth/register
 * The FIRST user ever created becomes SUPER_ADMIN (shop owner).
 * After that, registration is closed — Admin creates staff from the Users screen.
 */
router.post("/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Registration is closed. Ask your admin to create your account." },
      });
    }
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email.toLowerCase(), phone: body.phone, passwordHash, role: "SUPER_ADMIN" },
    });
    const tokens = await issueTokens(user);
    await prisma.auditLog.create({ data: { userId: user.id, action: "REGISTER", details: "Owner (SUPER_ADMIN) created" } });
    const permissions = await getPermissionsForRole(user.role);
    res.status(201).json({ ok: true, data: { user: publicUser(user), permissions, ...tokens } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    }
    next(err);
  }
});

/** GET /auth/setup-status — tells the login page whether to show "create first account" */
router.get("/setup-status", async (_req, res, next) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ ok: true, data: { needsSetup: userCount === 0 } });
  } catch (err) {
    next(err);
  }
});

/** POST /auth/login */
router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const badCreds = () =>
      res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Wrong email or password" } });

    if (!user) return badCreds();
    if (!user.isActive) {
      return res
        .status(403)
        .json({ ok: false, error: { code: "FORBIDDEN", message: "This account is disabled. Contact your admin." } });
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) return badCreds();

    const tokens = await issueTokens(user);
    await prisma.auditLog.create({ data: { userId: user.id, action: "LOGIN", ip: req.ip } });
    const permissions = await getPermissionsForRole(user.role);
    res.json({ ok: true, data: { user: publicUser(user), permissions, ...tokens } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: err.errors[0].message } });
    }
    next(err);
  }
});

/** POST /auth/refresh  { refreshToken } — rotates the refresh token */
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: { code: "VALIDATION", message: "refreshToken required" } });
    }
    let payload: { id: string };
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { id: string };
    } catch {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Session expired" } });
    }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive || !user.refreshToken) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Session expired" } });
    }
    const matches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!matches) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED", message: "Session expired" } });
    }
    const tokens = await issueTokens(user);
    const permissions = await getPermissionsForRole(user.role);
    res.json({ ok: true, data: { user: publicUser(user), permissions, ...tokens } });
  } catch (err) {
    next(err);
  }
});

/** GET /auth/me */
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "User not found" } });
    const permissions = await getPermissionsForRole(user.role);
    res.json({ ok: true, data: { user: publicUser(user), permissions } });
  } catch (err) {
    next(err);
  }
});

/** POST /auth/logout */
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.user!.id }, data: { refreshToken: null } });
    res.json({ ok: true, data: { message: "Logged out" } });
  } catch (err) {
    next(err);
  }
});

export default router;
