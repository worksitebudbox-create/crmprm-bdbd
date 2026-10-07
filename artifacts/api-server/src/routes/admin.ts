import { and, desc, eq, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { adminAuditLogsTable, crmUserAccessTable, db } from "@workspace/db";
import { crmRoles, isCrmRole } from "../lib/crm-access";
import { requireAdmin, type AuthenticatedUser } from "../middleware/supabase-auth";

const router: IRouter = Router();
const updateAccessBody = z.object({
  role: z.enum(crmRoles).optional(),
  team: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
}).strict().refine((value) =>
  value.role !== undefined || value.team !== undefined || value.isActive !== undefined || value.isDeleted !== undefined,
  "Потрібно вказати хоча б одне поле для зміни.",
);

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({
      id: crmUserAccessTable.id,
      userId: crmUserAccessTable.userId,
      email: crmUserAccessTable.email,
      role: crmUserAccessTable.role,
      team: crmUserAccessTable.team,
      isActive: crmUserAccessTable.isActive,
      deletedAt: crmUserAccessTable.deletedAt,
      updatedAt: crmUserAccessTable.updatedAt,
    })
    .from(crmUserAccessTable)
    .orderBy(crmUserAccessTable.email);
  res.json(users.map((user) => ({
    ...user,
    role: isCrmRole(user.role) ? user.role : "manager",
    updatedAt: user.updatedAt.toISOString(),
  })));
});

router.patch("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.params.userId;
  if (typeof userId !== "string" || !userId.trim()) {
    res.status(400).json({ error: "Потрібен ідентифікатор користувача." });
    return;
  }
  const parsed = updateAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const actor = res.locals.authUser as AuthenticatedUser;
  const [target] = await db
    .select()
    .from(crmUserAccessTable)
    .where(eq(crmUserAccessTable.userId, userId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Користувача не знайдено. Він має спочатку увійти в CRM." });
    return;
  }
  if (target.userId === actor.id) {
    res.status(400).json({ error: "Не можна змінити власні роль або доступ." });
    return;
  }
  if (target.deletedAt && parsed.data.isDeleted !== false) {
    res.status(400).json({ error: "Спочатку відновіть доступ цього користувача." });
    return;
  }
  const configuredOwnerEmail = process.env.CRM_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  if (
    target.role === "owner" ||
    (configuredOwnerEmail && target.email.toLocaleLowerCase("en-US") === configuredOwnerEmail) ||
    (parsed.data.role === "owner")
  ) {
    res.status(403).json({ error: "Обліковий запис головного адміністратора не можна змінити з цієї панелі." });
    return;
  }

  const nextRole = parsed.data.role ?? target.role;
  const nextTeam = parsed.data.team === undefined ? target.team : parsed.data.team?.trim() || null;
  const nextIsActive = parsed.data.isDeleted === true
    ? false
    : parsed.data.isDeleted === false
      ? true
      : parsed.data.isActive ?? target.isActive;
  const nextDeletedAt = parsed.data.isDeleted === undefined
    ? target.deletedAt
    : parsed.data.isDeleted
      ? new Date()
      : null;
  const changes = [
    parsed.data.role !== undefined && `роль: ${target.role} → ${nextRole}`,
    parsed.data.team !== undefined && `команда: ${target.team || "не задана"} → ${nextTeam || "не задана"}`,
    parsed.data.isActive !== undefined && (nextIsActive ? "доступ увімкнено" : "доступ вимкнено"),
    parsed.data.isDeleted !== undefined && (parsed.data.isDeleted ? "доступ видалено" : "доступ відновлено"),
  ].filter((value): value is string => Boolean(value));
  const updated = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(crmUserAccessTable)
      .set({
        role: nextRole,
        team: nextTeam,
        isActive: nextIsActive,
        deletedAt: nextDeletedAt,
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(crmUserAccessTable.id, target.id),
        ne(crmUserAccessTable.role, "owner"),
      ))
      .returning({
        id: crmUserAccessTable.id,
        userId: crmUserAccessTable.userId,
        email: crmUserAccessTable.email,
        role: crmUserAccessTable.role,
        team: crmUserAccessTable.team,
        isActive: crmUserAccessTable.isActive,
        deletedAt: crmUserAccessTable.deletedAt,
        updatedAt: crmUserAccessTable.updatedAt,
      });
    if (!user) return null;
    await tx.insert(adminAuditLogsTable).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "update_access",
      entityType: "user_access",
      entityId: target.id,
      summary: `${target.email}: ${changes.join("; ")}`,
    });
    return user;
  });
  if (!updated) {
    res.status(409).json({ error: "Не вдалося змінити доступ. Оновіть список користувачів." });
    return;
  }
  res.json({ ...updated, updatedAt: updated.updatedAt.toISOString() });
});

router.delete("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.params.userId;
  if (typeof userId !== "string" || !userId.trim()) {
    res.status(400).json({ error: "Потрібен ідентифікатор користувача." });
    return;
  }
  const actor = res.locals.authUser as AuthenticatedUser;
  const [target] = await db
    .select()
    .from(crmUserAccessTable)
    .where(eq(crmUserAccessTable.userId, userId))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Користувача не знайдено." });
    return;
  }
  if (target.userId === actor.id || target.role === "owner") {
    res.status(403).json({ error: "Не можна видалити власний доступ або доступ головного адміністратора." });
    return;
  }
  const configuredOwnerEmail = process.env.CRM_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  if (configuredOwnerEmail && target.email.toLocaleLowerCase("en-US") === configuredOwnerEmail) {
    res.status(403).json({ error: "Обліковий запис головного адміністратора не можна видалити." });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    const [user] = await tx
      .update(crmUserAccessTable)
      .set({
        isActive: false,
        deletedAt: new Date(),
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(and(
        eq(crmUserAccessTable.id, target.id),
        ne(crmUserAccessTable.role, "owner"),
      ))
      .returning({ id: crmUserAccessTable.id });
    if (!user) return false;
    await tx.insert(adminAuditLogsTable).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: "delete_access",
      entityType: "user_access",
      entityId: target.id,
      summary: `${target.email}: доступ до CRM видалено`,
    });
    return true;
  });
  if (!deleted) {
    res.status(409).json({ error: "Не вдалося видалити доступ. Оновіть список користувачів." });
    return;
  }
  res.status(204).end();
});

router.get("/admin/audit", requireAdmin, async (req, res): Promise<void> => {
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 200)) : 100;
  const rows = await db
    .select()
    .from(adminAuditLogsTable)
    .orderBy(desc(adminAuditLogsTable.createdAt))
    .limit(limit);
  res.json(rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })));
});

export default router;
