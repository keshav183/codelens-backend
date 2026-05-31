# AI Code Reviewer — Backend

## Setup

```bash
cd server
npm install
cp .env.example .env
# Fill in your MONGO_URI and GEMINI_API_KEY in .env
npm run dev
```

## Get your Gemini API key
Go to https://aistudio.google.com/app/apikey — it's free.

## API Endpoints

### Auth
| Method | Route | Auth | Body |
|--------|-------|------|------|
| POST | /api/auth/register | ❌ | `{ username, email, password }` |
| POST | /api/auth/login | ❌ | `{ email, password }` |
| GET | /api/auth/me | ✅ | — |

### Review
| Method | Route | Auth | Body |
|--------|-------|------|------|
| POST | /api/review | ✅ | `{ code, language, title? }` |
| GET | /api/review/:id | ✅ | — |
| DELETE | /api/review/:id | ✅ | — |

### History
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/history | ✅ | Paginated list (`?page=1&limit=10`) |
| GET | /api/history/stats | ✅ | Aggregated stats |

## Auth header
```
Authorization: Bearer <token>
```

## Example: Create a review
```bash
curl -X POST http://localhost:5000/api/review \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "language": "javascript",
    "title": "My first review",
    "code": "function add(a,b){ return a+b }"
  }'
```

## Response shape
```json
{
  "success": true,
  "review": {
    "id": "...",
    "title": "javascript review",
    "language": "javascript",
    "summary": "Clean and functional...",
    "score": 7,
    "comments": [
      { "line": 1, "type": "suggestion", "message": "Add JSDoc comments..." },
      { "line": null, "type": "smell", "message": "No input validation..." }
    ]
  }
}
```
