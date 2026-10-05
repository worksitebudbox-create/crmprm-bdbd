import { Router, type IRouter } from "express";
import crmRouter from "./crm";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(crmRouter);

export default router;
