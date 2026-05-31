import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./utils/connectDB.js";
import authRoutes from "./routes/auth.js";
import reviewRoutes from "./routes/review.js";
import historyRoutes from "./routes/history.js";
import githubRoutes from "./routes/github.js";
import prRoutes from "./routes/pr.js";

dotenv.config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/review", reviewRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/pr", prRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "AI Code Reviewer API running" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
