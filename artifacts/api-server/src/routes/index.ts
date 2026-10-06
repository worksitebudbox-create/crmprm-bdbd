import { Router, type IRouter } from "express";
import type { AuthenticatedUser } from "../middleware/supabase-auth";
import crmRouter from "./crm";
import healthRouter from "./health";
import warehouseRouter from "./warehouse";
import { requireAuthentication } from "../middleware/supabase-auth";
import adminRouter from "./admin";
import { isAllowedCrmRequest } from "../lib/crm-access";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthentication);
router.get("/auth/me", (_req, res) => {
  const user = res.locals.authUser as AuthenticatedUser;
  res.json({
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    role: user.role,
    team: user.team,
  });
});
router.use(adminRouter);
router.use((req, res, next) => {
  const user = res.locals.authUser as AuthenticatedUser;
  if (!isAllowedCrmRequest(user.role, req.method, req.path, req.body)) {
    res.status(403).json({ error: "Ця дія недоступна для вашої ролі." });
    return;
  }
  next();
});
router.use(crmRouter);
router.use(warehouseRouter);

export default router;
