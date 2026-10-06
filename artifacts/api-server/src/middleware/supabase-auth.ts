import type { NextFunction, Request, Response } from "express";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  appMetadata: Record<string, unknown>;
  isAdmin: boolean;
};

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
  res.locals.authUser = {
    id: data.id,
    email: "email" in data && typeof data.email === "string" ? data.email : null,
    appMetadata,
    isAdmin: appMetadata.role === "admin",
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
