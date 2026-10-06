import { Router, type IRouter } from "express";
import type { AuthenticatedUser } from "../middleware/supabase-auth";
import crmRouter from "./crm";
import healthRouter from "./health";
import warehouseRouter from "./warehouse";
import { requireAuthentication } from "../middleware/supabase-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthentication);
router.get("/auth/me", (_req, res) => {
  const user = res.locals.authUser as AuthenticatedUser;
  res.json({ id: user.id, email: user.email, isAdmin: user.isAdmin });
});
router.use(crmRouter);
router.use(warehouseRouter);

export default router;
