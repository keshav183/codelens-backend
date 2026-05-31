import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
dotenv.config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are an expert code reviewer with 10+ years of experience.
Analyze the provided code and return ONLY a valid JSON object (no markdown, no explanation).

The JSON must follow this exact structure:
{
  "summary": "2-3 sentence overall assessment of the code",
  "score": <integer 1-10, where 10 is production-ready>,
  "comments": [
    {
      "line": <line number as integer, or null for general comments>,
      "type": <"bug" | "smell" | "suggestion" | "praise">,
      "message": "clear, actionable explanation"
    }
  ]
}

Guidelines:
- "bug": actual errors, crashes, security vulnerabilities, logic mistakes
- "smell": bad practices, anti-patterns, naming issues, unnecessary complexity  
- "suggestion": improvements, optimizations, better patterns to use
- "praise": genuinely good things worth highlighting (don't skip these)
- Be specific and actionable, not generic
- Max 15 comments total
- Return ONLY the JSON object, nothing else`;

const analyzeCode = async (code, language = "javascript") => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3, // lower = more consistent, structured output
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    const prompt = `Language: ${language}\n\nCode to review:\n\`\`\`${language}\n${code}\n\`\`\``;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse and validate response
    const parsed = JSON.parse(responseText);

    if (!parsed.comments || !Array.isArray(parsed.comments)) {
      throw new Error("Invalid response structure from Gemini");
    }

    // Sanitize: ensure all required fields exist
    parsed.comments = parsed.comments.map((c) => ({
      line: c.line ?? null,
      type: ["bug", "smell", "suggestion", "praise"].includes(c.type) ? c.type : "suggestion",
      message: c.message || "",
    }));

    return {
      summary: parsed.summary || "",
      score: typeof parsed.score === "number" ? Math.min(10, Math.max(1, parsed.score)) : null,
      comments: parsed.comments,
    };
  } catch (error) {
    // If JSON parse fails, Gemini returned something unexpected
    if (error instanceof SyntaxError) {
      throw new Error("AI returned an unexpected response. Please try again.");
    }
    throw error;
  }
};

// Analyze a full PR diff — multiple files, returns per-file comments
const analyzePRDiff = async (files) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
    systemInstruction: `You are an expert code reviewer performing a Pull Request review.
You will receive changed files from a PR diff (only added/modified lines).
Return ONLY a valid JSON object with this exact structure:
{
  "summary": "2-3 sentence overall PR assessment",
  "score": <integer 1-10>,
  "comments": [
    {
      "path": "filename.js",
      "line": <line number in the new file, integer>,
      "type": "bug" | "smell" | "suggestion" | "praise",
      "message": "clear actionable explanation"
    }
  ]
}
Rules:
- Only comment on the CHANGED lines shown, not the entire codebase
- path must exactly match the filename provided
- line must be a valid line number from the diff
- Max 20 comments across all files
- Return ONLY the JSON, nothing else`,
  });

  // Build prompt from all changed files
  const filesText = files
    .map((f) => {
      const lines = f.addedLines.map((l) => `${l.lineNumber}: ${l.content}`).join("\n");
      return `### File: ${f.filename}\n\`\`\`\n${lines}\n\`\`\``;
    })
    .join("\n\n");

  const prompt = `Review these PR changes:\n\n${filesText}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());

    if (!parsed.comments || !Array.isArray(parsed.comments)) {
      throw new Error("Invalid response structure from Gemini");
    }

    parsed.comments = parsed.comments.map((c) => ({
      path: c.path || null,
      line: c.line ?? null,
      type: ["bug", "smell", "suggestion", "praise"].includes(c.type) ? c.type : "suggestion",
      message: c.message || "",
    }));

    return {
      summary: parsed.summary || "",
      score: typeof parsed.score === "number" ? Math.min(10, Math.max(1, parsed.score)) : null,
      comments: parsed.comments,
    };
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("AI returned an unexpected response. Please try again.");
    throw error;
  }
};

export default { analyzeCode, analyzePRDiff };
