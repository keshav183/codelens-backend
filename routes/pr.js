import express from "express";
import { listRepos, listPRs, reviewPR, postCommentsToGithub } from "../controllers/prController.js";
import protect from "../middleware/authMiddleware.js";
import { reviewLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.use(protect);

router.get("/repos", listRepos);
router.get("/repos/:owner/:repo/pulls", listPRs);
router.post("/review", reviewLimiter, reviewPR);
router.post("/post-comments", postCommentsToGithub);

export default router;
