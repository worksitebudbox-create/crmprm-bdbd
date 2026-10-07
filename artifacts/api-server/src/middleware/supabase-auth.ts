import type { NextFunction, Request, Response } from "express";
import { eq, or } from "drizzle-orm";
import { crmUserAccessTable, db } from "@workspace/db";
import type { CrmAccessUser, CrmRole } from "../lib/crm-access";
import { isCrmRole } from "../lib/crm-access";

export type AuthenticatedUser = CrmAccessUser;

export async function requireAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({ error: "Supabase Auth is not configured on the API server." });
    return;
  }

  const authorization = req.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Sign in to access the CRM." });
    return;
  }

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    req.log.error({ err: error }, "Supabase Auth verification request failed");
    res.status(503).json({ error: "Could not verify the Supabase session." });
    return;
  }

  if (!response.ok) {
    res.status(401).json({ error: "The Supabase session is invalid or expired." });
    return;
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    req.log.error("Supabase Auth returned an invalid user response");
    res.status(502).json({ error: "Supabase Auth returned an invalid user response." });
    return;
  }
  const appMetadata = "app_metadata" in data && data.app_metadata && typeof data.app_metadata === "object"
    ? data.app_metadata as Record<string, unknown>
    : {};
  const configuredAdminEmail = process.env.CRM_ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  const userEmail = "email" in data && typeof data.email === "string" ? data.email : null;
  if (!userEmail?.trim()) {
    res.status(403).json({ error: "CRM access requires an authenticated email address." });
    return;
  }
  const normalizedEmail = userEmail.trim().toLocaleLowerCase("en-US");
  const isConfiguredOwner = Boolean(configuredAdminEmail && normalizedEmail === configuredAdminEmail);
  const isMetadataOwner = appMetadata.role === "admin";
  const isAdmin = isConfiguredOwner || isMetadataOwner;
  let [access] = await db
    .select()
    .from(crmUserAccessTable)
    .where(eq(crmUserAccessTable.userId, data.id))
    .limit(1);
  if (!access) {
    [access] = await db
      .insert(crmUserAccessTable)
      .values({
        userId: data.id,
        email: normalizedEmail,
        role: isAdmin ? "owner" : "manager",
        createdBy: isAdmin ? "system" : null,
        updatedBy: isAdmin ? "system" : null,
      })
      .onConflictDoNothing()
      .returning();
  }
  if (access?.deletedAt && !isAdmin) {
    res.status(403).json({ error: "CRM access for this account has been removed. Contact the administrator." });
    return;
  }
  if (!access) {
    const matchingAccess = await db
      .select()
      .from(crmUserAccessTable)
      .where(or(
        eq(crmUserAccessTable.userId, data.id),
        eq(crmUserAccessTable.email, normalizedEmail),
      ))
      .limit(2);
    const byUserId = matchingAccess.find((candidate) => candidate.userId === data.id);
    const byEmail = matchingAccess.find((candidate) => candidate.email === normalizedEmail);
    if (byUserId && byEmail && byUserId.id !== byEmail.id) {
      req.log.error({ userId: data.id }, "CRM user ID and email belong to different access records");
      res.status(409).json({ error: "CRM access identity conflicts with another account. Contact the administrator." });
      return;
    }
    const existing = byUserId ?? byEmail;
    if (existing) {
      const [updated] = await db
        .update(crmUserAccessTable)
        .set({
          userId: data.id,
          email: normalizedEmail,
          updatedAt: new Date(),
        })
        .where(eq(crmUserAccessTable.id, existing.id))
        .returning();
      access = updated;
    }
  } else if (access.email !== normalizedEmail) {
    const [conflictingEmail] = await db
      .select({ id: crmUserAccessTable.id })
      .from(crmUserAccessTable)
      .where(eq(crmUserAccessTable.email, normalizedEmail))
      .limit(1);
    if (conflictingEmail && conflictingEmail.id !== access.id) {
      req.log.error({ userId: data.id }, "CRM user email belongs to a different access record");
      res.status(409).json({ error: "CRM access identity conflicts with another account. Contact the administrator." });
      return;
    }
    const [updated] = await db
      .update(crmUserAccessTable)
      .set({ email: normalizedEmail, updatedAt: new Date() })
      .where(eq(crmUserAccessTable.id, access.id))
      .returning();
    if (updated) access = updated;
  }
  if (!access) {
    req.log.error({ userId: data.id }, "Could not register authenticated CRM user");
    res.status(500).json({ error: "Could not load CRM user access." });
    return;
  }
  if (isAdmin && access.role !== "owner") {
    const [promoted] = await db
      .update(crmUserAccessTable)
      .set({ role: "owner", updatedAt: new Date() })
      .where(eq(crmUserAccessTable.id, access.id))
      .returning();
    if (promoted) access = promoted;
  } else if (!isAdmin && access.role === "owner") {
    const [demoted] = await db
      .update(crmUserAccessTable)
      .set({ role: "manager", updatedAt: new Date() })
      .where(eq(crmUserAccessTable.id, access.id))
      .returning();
    if (demoted) access = demoted;
  }
  if (!access.isActive && !isAdmin) {
    res.status(403).json({ error: "CRM access for this account has been disabled. Contact the administrator." });
    return;
  }
  const role: CrmRole = isAdmin ? "owner" : isCrmRole(access.role) ? access.role : "manager";
  res.locals.authUser = {
    id: data.id,
    email: normalizedEmail,
    appMetadata,
    isAdmin,
    role,
    team: access.team,
    accessRecordId: access.id,
  } satisfies AuthenticatedUser;
  next();
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.authUser as AuthenticatedUser | undefined;
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Administrator permission is required." });
    return;
  }
  next();
}
