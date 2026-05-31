import Review from "../models/Review.js";

// GET /api/history
export const getHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ user: req.user._id })
        .select("-code")               // don't send full code in list view (heavy)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments({ user: req.user._id }),
    ]);

    res.json({
      success: true,
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch history" });
  }
};

// GET /api/history/stats
export const getStats = async (req, res) => {
  try {
    const stats = await Review.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgScore: { $avg: "$score" },
          totalComments: { $sum: { $size: "$comments" } },
          bugCount: {
            $sum: {
              $size: {
                $filter: { input: "$comments", as: "c", cond: { $eq: ["$$c.type", "bug"] } },
              },
            },
          },
          languageBreakdown: { $push: "$language" },
        },
      },
    ]);

    if (!stats.length) {
      return res.json({ success: true, stats: { totalReviews: 0, avgScore: 0, totalComments: 0, bugCount: 0, topLanguage: null } });
    }

    const s = stats[0];

    // Count language frequency
    const langCount = s.languageBreakdown.reduce((acc, lang) => {
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {});
    const topLanguage = Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0];

    res.json({
      success: true,
      stats: {
        totalReviews: s.totalReviews,
        avgScore: s.avgScore ? Math.round(s.avgScore * 10) / 10 : 0,
        totalComments: s.totalComments,
        bugCount: s.bugCount,
        topLanguage,
        languageBreakdown: langCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
};
