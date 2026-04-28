import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bakeryRouter from "./bakery";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bakeryRouter);

export default router;
