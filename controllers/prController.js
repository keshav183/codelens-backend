import User from "../models/User.js";
import Review from "../models/Review.js";
import { getUserRepos, getOpenPRs, getPRDiff, postPRComments } from "../services/githubService.js";
import geminiService from "../services/geminiService.js";

// Helper — get user with GitHub token, throw if not connected
const getGithubUser = async (userId) => {
  const user = await User.findById(userId).select("+githubAccessToken");
  if (!user.githubConnected || !user.githubAccessToken) {
    const err = new Error("GitHub account not connected. Please connect GitHub first.");
    err.status = 403;
    throw err;
  }
  return user;
};

// GET /api/pr/repos
export const listRepos = async (req, res) => {
  try {
    const user = await getGithubUser(req.user._id);
    const repos = await getUserRepos(user.githubAccessToken);
    res.json({ success: true, repos });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// GET /api/pr/repos/:owner/:repo/pulls
export const listPRs = async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const user = await getGithubUser(req.user._id);
    const prs = await getOpenPRs(user.githubAccessToken, owner, repo);
    res.json({ success: true, prs });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// POST /api/pr/review
// Body: { owner, repo, prNumber }
export const reviewPR = async (req, res) => {
  try {
    const { owner, repo, prNumber } = req.body;

    if (!owner || !repo || !prNumber) {
      return res.status(400).json({ success: false, message: "owner, repo, and prNumber are required" });
    }

    const user = await getGithubUser(req.user._id);

    // 1. Fetch PR diff from GitHub
    const { pr, files } = await getPRDiff(user.githubAccessToken, owner, repo, Number(prNumber));

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "No reviewable code files found in this PR. Only source code files can be reviewed.",
      });
    }

    // 2. Send diff to Gemini
    const aiResult = await geminiService.analyzePRDiff(files);

    // 3. Build code snapshot (all changed lines joined) for storage
    const codeSnapshot = files
      .map((f) => `// ${f.filename}\n${f.addedLines.map((l) => l.content).join("\n")}`)
      .join("\n\n");

    // 4. Detect dominant language from file extensions
    const language = detectDominantLanguage(files);

    // 5. Map comments — add path field for PR comments
    const comments = aiResult.comments.map((c) => ({
      line: c.line ?? null,
      type: c.type,
      message: c.message,
      path: c.path ?? null,  // file path for PR inline comments
    }));

    // 6. Save review to MongoDB
    const review = await Review.create({
      user: req.user._id,
      title: `PR #${pr.number}: ${pr.title}`,
      code: codeSnapshot,
      language,
      comments,
      summary: aiResult.summary,
      score: aiResult.score,
      source: "github_pr",
      github: {
        owner,
        repo,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.url,
        commitSha: pr.commitSha,
        postedToGithub: false,
      },
    });

    res.status(201).json({
      success: true,
      review: {
        id: review._id,
        title: review.title,
        language: review.language,
        comments: review.comments,
        summary: review.summary,
        score: review.score,
        source: review.source,
        github: review.github,
        filesReviewed: files.map((f) => ({ filename: f.filename, additions: f.additions })),
      },
    });
  } catch (error) {
    console.error("PR review error:", error.message);
    if (error.status === 403) {
      return res.status(403).json({ success: false, message: error.message });
    }
    // GitHub 404 — repo or PR not found
    if (error.message?.includes("Not Found") || error.status === 404) {
      return res.status(404).json({ success: false, message: "PR or repo not found. Check permissions." });
    }
    res.status(500).json({ success: false, message: error.message || "Failed to review PR" });
  }
};

// POST /api/pr/post-comments
// Post AI review comments back to GitHub PR
export const postCommentsToGithub = async (req, res) => {
  try {
    const { reviewId } = req.body;

    const review = await Review.findOne({ _id: reviewId, user: req.user._id });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (review.source !== "github_pr") return res.status(400).json({ success: false, message: "Not a PR review" });
    if (review.github.postedToGithub) return res.status(400).json({ success: false, message: "Already posted to GitHub" });

    const user = await getGithubUser(req.user._id);

    const result = await postPRComments(
      user.githubAccessToken,
      review.github.owner,
      review.github.repo,
      review.github.prNumber,
      review.github.commitSha,
      review.comments
    );

    // Mark as posted
    review.github.postedToGithub = true;
    await review.save();

    res.json({
      success: true,
      message: `Posted ${result.posted} comments to GitHub PR`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || "Failed to post comments" });
  }
};

// ── Helper ─────────────────────────────────────────────────────────────────
const EXT_LANG_MAP = {
  ".js": "javascript", ".jsx": "javascript", ".ts": "typescript",
  ".tsx": "typescript", ".py": "python", ".java": "java",
  ".go": "go", ".rs": "rust", ".cpp": "cpp", ".c": "c",
  ".cs": "csharp", ".rb": "ruby", ".php": "php",
  ".swift": "swift", ".kt": "kotlin",
};

const detectDominantLanguage = (files) => {
  const counts = {};
  files.forEach((f) => {
    const ext = "." + f.filename.split(".").pop();
    const lang = EXT_LANG_MAP[ext] || "javascript";
    counts[lang] = (counts[lang] || 0) + f.additions;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "javascript";
};
