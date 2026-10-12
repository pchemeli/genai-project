import { Router, type IRouter } from "express";
import healthRouter from "./health";
import libraryRouter from "./library";
import textRouter from "./text";
import agentRouter from "./agent";

const router: IRouter = Router();

router.use(healthRouter);
router.use(libraryRouter);
router.use(textRouter);
router.use(agentRouter);

export default router;
