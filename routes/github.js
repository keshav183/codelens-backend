import express from "express";
import { getAuthUrl, handleCallback, disconnectGithub, getGithubStatus } from "../controllers/githubController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require auth except callback (GitHub redirects here before we have user context in query)
router.get("/auth-url", protect, getAuthUrl);
router.get("/callback", handleCallback);         // GitHub redirects here with ?code=&state=userId
router.get("/status", protect, getGithubStatus);
router.delete("/disconnect", protect, disconnectGithub);

export default router;
