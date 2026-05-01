import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bakeryRouter from "./bakery";
import todosRouter from "./todos";
import packagingRouter from "./packaging";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bakeryRouter);
router.use(todosRouter);
router.use(packagingRouter);

export default router;
