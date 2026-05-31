import Review from "../models/Review.js";
import geminiService from "../services/geminiService.js";

const SUPPORTED_LANGUAGES = [
  "javascript", "typescript", "python", "java", "c", "cpp",
  "go", "rust", "php", "ruby", "kotlin", "swift", "csharp",
];

// POST /api/review
export const createReview = async (req, res) => {
  try {
    const { code, language = "javascript", title } = req.body;

    if (!code || code.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Code is required" });
    }

    if (code.length > 20000) {
      return res.status(400).json({ success: false, message: "Code too long (max 20,000 characters)" });
    }

    const lang = language.toLowerCase();
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(", ")}`,
      });
    }

    // Call Gemini
    const aiResult = await geminiService.analyzeCode(code, lang);

    // Save to MongoDB
    const review = await Review.create({
      user: req.user._id,
      title: title || `${lang} review`,
      code,
      language: lang,
      comments: aiResult.comments,
      summary: aiResult.summary,
      score: aiResult.score,
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
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    console.error("Review creation error:", error.message);

    // Gemini quota/API errors
    if (error.message?.includes("quota") || error.message?.includes("429")) {
      return res.status(429).json({ success: false, message: "AI API quota exceeded. Try again shortly." });
    }

    res.status(500).json({ success: false, message: error.message || "Failed to analyze code" });
  }
};

// GET /api/review/:id
export const getReview = async (req, res) => {
  try {
    const review = await Review.findOne({ _id: req.params.id, user: req.user._id });

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, review });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid review ID" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE /api/review/:id
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    res.json({ success: true, message: "Review deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};
