import express from "express";
import { getHistory, getStats } from "../controllers/historyController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getHistory);
router.get("/stats", getStats);

export default router;
