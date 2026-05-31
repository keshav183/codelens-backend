import mongoose from "mongoose";

const commentSchema = new mongoose.Schema({
  line: { type: Number, default: null },       // null = general comment
  type: {
    type: String,
    enum: ["bug", "smell", "suggestion", "praise"],
    required: true,
  },
  message: { type: String, required: true },
});

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      default: "Untitled review",
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Code is required"],
      maxlength: [20000, "Code too long (max 20,000 chars)"],
    },
    language: {
      type: String,
      required: true,
      default: "javascript",
      lowercase: true,
    },
    comments: [commentSchema],
    summary: { type: String, default: "" },
    score: { type: Number, min: 0, max: 10 },
    // GitHub PR fields (optional — only set for PR reviews)
    source: { type: String, enum: ["manual", "github_pr"], default: "manual" },
    github: {
      owner: String,
      repo: String,
      prNumber: Number,
      prTitle: String,
      prUrl: String,
      commitSha: String,
      postedToGithub: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Index for fast user history queries
reviewSchema.index({ user: 1, createdAt: -1 });

const Review = mongoose.model("Review", reviewSchema);
export default Review;
