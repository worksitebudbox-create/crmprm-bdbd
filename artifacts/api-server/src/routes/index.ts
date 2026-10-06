import { Router, type IRouter } from "express";
import crmRouter from "./crm";
import healthRouter from "./health";
import warehouseRouter from "./warehouse";
import { requireAuthentication } from "../middleware/supabase-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuthentication);
router.use(crmRouter);
router.use(warehouseRouter);

export default router;
