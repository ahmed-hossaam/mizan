import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import authRouter from "./auth";
import budgetsRouter from "./budgets";
import categoriesRouter from "./categories";
import healthRouter from "./health";
import statsRouter from "./stats";
import transactionsRouter from "./transactions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireAuth);
router.use(authRouter);
router.use(transactionsRouter);
router.use(categoriesRouter);
router.use(budgetsRouter);
router.use(statsRouter);

export default router;
