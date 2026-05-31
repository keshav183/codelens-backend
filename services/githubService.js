import { Octokit } from "@octokit/rest";

// Create an authenticated Octokit instance for a user
const getOctokit = (accessToken) => new Octokit({ auth: accessToken });

// Get all repos the user has access to (with open PRs)
export const getUserRepos = async (accessToken) => {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "pushed",
    per_page: 50,
    affiliation: "owner,collaborator",
  });
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    private: r.private,
    language: r.language,
    openIssues: r.open_issues_count,
    url: r.html_url,
  }));
};

// Get open PRs for a repo
export const getOpenPRs = async (accessToken, owner, repo) => {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    per_page: 30,
    sort: "updated",
  });
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user.login,
    authorAvatar: pr.user.avatar_url,
    url: pr.html_url,
    branch: pr.head.ref,
    baseBranch: pr.base.ref,
    commitSha: pr.head.sha,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  }));
};

// Get the diff of a PR — returns parsed file diffs
export const getPRDiff = async (accessToken, owner, repo, prNumber) => {
  const octokit = getOctokit(accessToken);

  // Get changed files with patches
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 30,
  });

  // Get PR metadata
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

  const parsedFiles = files
    .filter((f) => f.status !== "removed") // skip deleted files
    .filter((f) => f.patch) // must have a diff
    .filter((f) => isReviewableFile(f.filename))
    .map((f) => ({
      filename: f.filename,
      status: f.status, // added | modified | renamed
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch, // raw unified diff
      addedLines: extractAddedLines(f.patch), // only the + lines
    }));

  return {
    pr: {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user.login,
      commitSha: pr.head.sha,
      base: pr.base.ref,
      head: pr.head.ref,
    },
    files: parsedFiles,
  };
};

// Post review comments back to GitHub PR
export const postPRComments = async (accessToken, owner, repo, prNumber, commitSha, comments) => {
  const octokit = getOctokit(accessToken);
  const posted = [];
  const failed = [];

  // Post a general PR review with summary
  const generalComments = comments.filter((c) => !c.path || !c.line);
  const lineComments = comments.filter((c) => c.path && c.line);

  const body = generalComments.map((c) => `**[${c.type.toUpperCase()}]** ${c.message}`).join("\n\n") || "CodeLens AI Review complete.";

  // Create review with inline comments
  try {
    const reviewComments = lineComments.map((c) => ({
      path: c.path,
      line: c.line,
      body: `**[${c.type.toUpperCase()}]** ${c.message}`,
    }));

    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitSha,
      body: `## 🔍 CodeLens AI Review\n\n${body}`,
      event: "COMMENT",
      comments: reviewComments.slice(0, 10), // GitHub limits inline comments per review
    });

    posted.push(...lineComments);
  } catch (err) {
    console.error("Failed to post GitHub review:", err.message);
    failed.push(...lineComments);
  }

  return { posted: posted.length, failed: failed.length };
};

// Exchange OAuth code for access token
export const exchangeCodeForToken = async (code) => {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || "GitHub OAuth failed");
  return data.access_token;
};

// Get GitHub user info with access token
export const getGithubUser = async (accessToken) => {
  const octokit = getOctokit(accessToken);
  const { data } = await octokit.users.getAuthenticated();
  return {
    githubId: String(data.id),
    githubUsername: data.login,
    githubAvatar: data.avatar_url,
    email: data.email,
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

// Only review code files — skip assets, lockfiles etc.
const REVIEWABLE_EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go",
  ".rs", ".cpp", ".c", ".cs", ".rb", ".php", ".swift",
  ".kt", ".vue", ".svelte",
];

const SKIP_PATTERNS = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  ".min.js", ".min.css", "dist/", "build/", "__snapshots__",
];

const isReviewableFile = (filename) => {
  if (SKIP_PATTERNS.some((p) => filename.includes(p))) return false;
  return REVIEWABLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
};

// Parse unified diff patch and extract only added lines with their line numbers
const extractAddedLines = (patch) => {
  if (!patch) return [];
  const lines = patch.split("\n");
  const result = [];
  let currentLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old +new,count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1]) - 1;
      continue;
    }
    if (line.startsWith("-")) continue; // removed line, skip
    if (line.startsWith("+")) {
      currentLine++;
      result.push({ lineNumber: currentLine, content: line.slice(1) }); // strip leading +
    } else {
      currentLine++; // context line
    }
  }
  return result;
};
