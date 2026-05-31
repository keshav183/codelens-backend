import User from "../models/User.js";
import { exchangeCodeForToken, getGithubUser } from "../services/githubService.js";
import generateToken from "../utils/generateToken.js";

// GET /api/github/auth-url
// Returns the GitHub OAuth URL for the frontend to redirect to
export const getAuthUrl = (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_REDIRECT_URI,
    scope: "repo,read:user,pull_requests",  // repo scope needed to post PR comments
    state: req.user._id.toString(),          // use userId as CSRF state
  });
  const url = `https://github.com/login/oauth/authorize?${params}`;
  res.json({ success: true, url });
};

// GET /api/github/callback?code=...&state=...
// GitHub redirects here after user approves OAuth
export const handleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect(`${process.env.CLIENT_URL}/review?github=error&msg=no_code`);
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);

    // Get GitHub user info
    const githubUser = await getGithubUser(accessToken);

    // Find user by state (userId) and update with GitHub info
    const userId = state;
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL}/review?github=error&msg=user_not_found`);
    }

    // Check if this GitHub account is already linked to another user
    const existing = await User.findOne({ githubId: githubUser.githubId, _id: { $ne: userId } });
    if (existing) {
      return res.redirect(`${process.env.CLIENT_URL}/review?github=error&msg=already_linked`);
    }

    user.githubId = githubUser.githubId;
    user.githubUsername = githubUser.githubUsername;
    user.githubAvatar = githubUser.githubAvatar;
    user.githubAccessToken = accessToken;
    user.githubConnected = true;
    await user.save();

    // Redirect back to frontend with success
    res.redirect(`${process.env.CLIENT_URL}/review?github=connected&username=${githubUser.githubUsername}`);
  } catch (error) {
    console.error("GitHub callback error:", error.message);
    res.redirect(`${process.env.CLIENT_URL}/review?github=error&msg=${encodeURIComponent(error.message)}`);
  }
};

// DELETE /api/github/disconnect
export const disconnectGithub = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      githubId: null,
      githubUsername: null,
      githubAvatar: null,
      githubAccessToken: null,
      githubConnected: false,
    });
    res.json({ success: true, message: "GitHub disconnected" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to disconnect GitHub" });
  }
};

// GET /api/github/status
export const getGithubStatus = async (req, res) => {
  const user = await User.findById(req.user._id).select("+githubAccessToken");
  res.json({
    success: true,
    connected: user.githubConnected || false,
    username: user.githubUsername || null,
    avatar: user.githubAvatar || null,
  });
};
