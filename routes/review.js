import express from "express";
import { createReview, getReview, deleteReview } from "../controllers/reviewController.js";
import protect from "../middleware/authMiddleware.js";
import { reviewLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// All review routes require auth
router.use(protect);

router.post("/", reviewLimiter, createReview);
router.get("/:id", getReview);
router.delete("/:id", deleteReview);

export default router;
