import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bakeryRouter from "./bakery";
import todosRouter from "./todos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bakeryRouter);
router.use(todosRouter);

export default router;
