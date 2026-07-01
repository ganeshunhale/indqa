# IndQA — Multilingual Retrieval-Augmented Question-Answering System for Indian Languages

> **Academic project title:** *A Multilingual Retrieval-Augmented Question-Answering System for Indian Language Users Using the MERN Stack and Large Language Models*

A full-stack **MERN** application that answers questions in **9 major Indian languages** by combining a **Large Language Model** (Google Gemini) with **semantic vector search** in a **Retrieval-Augmented Generation (RAG)** pipeline — delivering source-grounded, real-time-streamed answers over multi-tenant workspaces.

**100% free to run** — no paid APIs required.

## Features

- 🌐 **9 Indian languages** + English, with a fully localised UI (react-i18next)
- 🏢 **Multi-tenant workspaces** — each workspace has an isolated knowledge base, conversations, and analytics; users belong to many workspaces with per-workspace roles (owner / admin / member) and email invites
- 🔎 **RAG pipeline** — semantic retrieval over a knowledge base via Atlas Vector Search (filtered per workspace), grounded answers with source citations and confidence scores
- ⚡ **Real-time streaming** answers over Socket.IO (Gemini token streaming)
- 🔐 **JWT authentication** with bcrypt password hashing and request validation (Zod)
- 🛡️ **Resilient Gemini calls** — timeout + exponential-backoff retry, graceful handling of free-tier quota (429) errors
- 🧑‍💼 **Admin panel** — manage the knowledge base and **upload documents** (`.txt` / `.md` / `.pdf`) that are auto-chunked and embedded
- 📊 **Analytics dashboard** — questions per language, average latency/confidence, RAG-vs-direct ratio, activity over time
- 🌗 **Dark mode**, accessible UI, responsive layout
- ✅ **Automated tests** (Vitest + Supertest + Testing Library) and **CI** (GitHub Actions)

## Supported Languages
Hindi (हिन्दी) · Marathi (मराठी) · Bengali (বাংলা) · Tamil (தமிழ்) · Telugu (తెలుగు) · Kannada (ಕನ್ನಡ) · Gujarati (ગુજરાતી) · Punjabi (ਪੰਜਾਬੀ) · Malayalam (മലയാളം)

## Architecture
```
User (React) → Express + Socket.IO → Google Translate (→ English)
    → Gemini Embeddings → MongoDB Atlas Vector Search (retrieve passages)
    → Gemini 2.5 Flash (generate grounded answer, streamed)
    → Google Translate (→ user's language) → Socket.IO stream → User
```

## Prerequisites
- **Node.js** v18+
- **MongoDB Atlas** account (free M0 tier — required for Vector Search)
- **Google Gemini API** key (free at https://aistudio.google.com/apikey)

Google Translate requires no API key.

## Quick Start

### 1. Install everything (one command from the repo root)
```bash
npm run install:all
```

### 2. Configure environment
```bash
cd server && cp .env.example .env
```
Edit `server/.env` with your `MONGODB_URI`, `JWT_SECRET`, and `GEMINI_API_KEY`.

> 🔒 **Security:** `.env` holds live secrets and is gitignored — never commit it. Generate a strong secret with
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. The server validates these variables on
> startup and exits early with a clear message if any are missing.

Optionally, copy `client/.env.example` to `client/.env` (defaults work for local dev).

### 3. Create the Atlas Vector Search index
In the Atlas UI: cluster → Browse Collections → `indqa.knowledgechunks` → **Search Indexes** → **Create Index** → JSON Editor:
```json
{
  "type": "vectorSearch",
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "workspaceId" }
  ]
}
```
Name it `embedding_index`. The `workspaceId` **filter** field is required for multi-tenant isolation — retrieval pre-filters chunks to the active workspace.

### 4. (Upgrading an existing single-tenant deployment) Run the workspace migration
If you already have data from a pre-workspaces version, backfill it into a default workspace:
```bash
cd server && node scripts/migrate-workspaces.js
```
Idempotent. Creates a "Default Workspace", makes existing users members (first admin = owner), and stamps existing chunks/conversations/messages with its `workspaceId`. Fresh installs can skip this — every new user automatically gets a personal workspace at registration.

### 5. Seed the knowledge base
```bash
npm run seed
```
Seeds sample passages into your default/first workspace. (Idempotent — safe to re-run; already-embedded passages are skipped.) Register a user first so a workspace exists to seed into.

### 5. Run both apps (one command)
```bash
npm run dev
```
Frontend → http://localhost:5173 · Backend → http://localhost:4000

## Admin & Analytics

1. Register a normal account in the app.
2. Promote it to admin:
   ```bash
   cd server && npm run make-admin -- your@email.com
   ```
3. Reload the app — **Admin** and **Analytics** links appear in the sidebar.
   - **Admin** — add knowledge passages or upload a `.txt` / `.md` / `.pdf` document (auto-chunked + embedded into the RAG knowledge base).
   - **Analytics** — live usage metrics aggregated from your data.

## Testing & Quality
```bash
npm test            # run backend + frontend test suites
npm run test:server # backend (Vitest + Supertest + in-memory MongoDB)
npm run test:client # frontend (Vitest + React Testing Library)
npm run lint        # ESLint across the monorepo
npm run format      # Prettier
```

## Docker
The database stays on Atlas (Vector Search requirement). With `server/.env` configured:
```bash
docker compose up --build
```
→ App at http://localhost:8080 (nginx serves the client and proxies `/api` + `/socket.io` to the backend).

## Deployment
- **Backend** → Render / Railway / Fly.io. Set `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `CLIENT_URL`, `NODE_ENV=production`.
- **Frontend** → Vercel / Netlify. Build with `npm run build`; set `VITE_API_URL` and `VITE_SOCKET_URL` to the backend URL.
- CI (`.github/workflows/ci.yml`) lints, tests, and builds on every push/PR.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, React Router, Socket.IO Client, react-i18next, Lucide |
| Backend | Express 4, Socket.IO, JWT, Helmet, express-rate-limit, Zod, Winston (rotating logs) |
| Database | MongoDB Atlas (M0) + Atlas Vector Search |
| Translation | Google Translate (`google-translate-api-x`) |
| LLM / Embeddings | Google Gemini 2.5 Flash · `gemini-embedding-001` (768 dims) |
| Document ingestion | Multer + pdf-parse |
| Testing / Tooling | Vitest, Supertest, mongodb-memory-server, Testing Library, ESLint, Prettier |

## Project Structure
```
indqa/
├── client/                       # React frontend (Vite)
│   └── src/
│       ├── contexts/AuthContext.jsx
│       ├── i18n/i18n.js          # 10-language translation resources
│       ├── pages/                # LoginPage, ChatPage, AdminPage, AnalyticsPage
│       ├── styles/global.css     # incl. dark theme
│       └── App.jsx, main.jsx
├── server/                       # Express + Socket.IO backend
│   ├── config/index.js           # env validation + central config
│   ├── middleware/               # auth, requireAdmin, validate, errorHandler
│   ├── models/                   # User, Conversation, Message, KnowledgeChunk
│   ├── routes/                   # auth, conversations, admin, analytics
│   ├── services/                 # gemini, translation, qaHandler, documentProcessor
│   ├── validators/schemas.js     # Zod schemas
│   ├── utils/                    # logger, AppError
│   ├── scripts/makeAdmin.js
│   ├── tests/                    # Vitest suites
│   ├── app.js, seed.js
│   └── .env.example
├── .github/workflows/ci.yml
├── docker-compose.yml
└── package.json                  # root scripts (dev, seed, test, lint)
```

## Author
Ganesh Unhale — Amity University Online, MCA

## License
[MIT](LICENSE)
