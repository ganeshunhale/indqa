# Project Summary — IndQA

> Report-ready academic summary for MCA final-year submission. Every technical claim
> below reflects the actual implemented codebase (`client/` + `server/`).

---

## Project Title

**A Multilingual Retrieval-Augmented Question-Answering System for Indian Language
Users Using the MERN Stack and Large Language Models**

*Subtitle (for the cover page):* A RAG-based multilingual knowledge assistant powered
by Google Gemini and MongoDB Atlas Vector Search.

**Short name / product name:** IndQA

---

## Abstract

IndQA is a full-stack web application that enables users to ask questions in **nine
major Indian languages (plus English)** and receive accurate, source-grounded answers
in their own language. It is built on the **MERN stack** (MongoDB, Express, React,
Node.js) and applies the **Retrieval-Augmented Generation (RAG)** paradigm, which
combines a **Large Language Model (Google Gemini 2.5 Flash)** with **semantic vector
search** so that answers are grounded in a curated knowledge base rather than produced
purely from the model's memory — significantly reducing hallucination.

When a user asks a question, the system detects the language, translates it to English
for uniform processing, converts it into a 768-dimension embedding, and retrieves the
most relevant passages from a **MongoDB Atlas Vector Search** index. These passages are
supplied to Gemini, which generates a grounded answer that is streamed back
**token-by-token in real time** over Socket.IO, translated into the user's language,
and displayed with **source citations and a confidence score**. The platform is
**multi-tenant**: each workspace has an isolated knowledge base, conversations, and
analytics, with role-based access control (owner / admin / member) and email invites.
Administrators can grow the knowledge base by uploading PDF/TXT/MD documents that are
automatically chunked and embedded, and can monitor usage through an analytics
dashboard. The system runs entirely on free-tier services and is production-hardened
with automated tests, CI, and Docker deployment.

---

## Objectives

1. Provide an accurate question-answering experience for **Indian-language users**,
   removing English as a barrier to information access.
2. Apply **Retrieval-Augmented Generation (RAG)** to keep answers **grounded in a
   verifiable knowledge base**, with citations and confidence scores.
3. Support **nine Indian languages + English** end-to-end (input, retrieval, answer,
   and UI), using automatic language detection and translation.
4. Allow **domain knowledge to be added easily** by uploading documents that are
   automatically processed into a searchable knowledge base.
5. Enable **multi-tenant, collaborative use** through isolated workspaces with
   role-based access control and member invitations.
6. Deliver a **responsive, real-time** user experience with streamed answers and a
   localized, accessible interface.
7. Provide **administrative insight** into usage and answer quality through an
   analytics dashboard.

---

## Scope

**In scope:** multilingual conversational Q&A; RAG over an admin-managed knowledge
base; document ingestion (PDF/TXT/MD); multi-tenant workspaces with RBAC and invites;
strict vs. hybrid answering modes; real-time streaming; analytics; authentication;
and free-tier cloud deployment.

**Out of scope / assumptions:** the quality of answers depends on the knowledge base
supplied by administrators; translation and language detection cover the nine
supported Indian scripts; the system relies on the availability of Google Gemini and
MongoDB Atlas free tiers.

---

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite 6, React Router v6 (lazy-loaded pages), react-i18next (10-language UI), Socket.IO client (streaming), Axios, lucide-react icons, custom CSS design system with dark mode |
| **Backend** | Node.js, Express 4, Socket.IO, Mongoose 8, JSON Web Tokens (JWT), bcryptjs, Zod (validation), Helmet, CORS, express-rate-limit, Multer (uploads), Winston (rotating logs) |
| **AI / NLP** | Google **Gemini 2.5 Flash** (answer generation, streamed) · **gemini-embedding-001** (768-dim embeddings) · google-translate-api-x (translation + offline Unicode script language detection) · pdf-parse (document text extraction) |
| **Database** | MongoDB Atlas (M0 free tier) with **Atlas Vector Search** (`$vectorSearch`, cosine similarity, 768 dimensions) |
| **Testing / Quality** | Vitest, Supertest, mongodb-memory-server, React Testing Library, ESLint, Prettier |
| **DevOps / Deployment** | GitHub Actions (CI), Docker + docker-compose + nginx, Vercel (frontend), Render/Railway/Fly.io (backend) |

---

## System Architecture & Data Flow

> 📐 See **[ARCHITECTURE.md](ARCHITECTURE.md)** for the full set of diagrams (system
> architecture, RAG sequence, ER model, multi-tenancy/RBAC, ingestion pipeline, and
> deployment) — ready to export as images for the report.

The application follows a decoupled **client–server** architecture. A React
single-page app communicates with an Express/Socket.IO backend over both REST
(for CRUD) and WebSockets (for streamed answers). All AI processing and data access
happen server-side.

**End-to-end path of a single question:**

```
User (React)                    → asks question in their language (Socket.IO)
  └─ Backend (Express + Socket.IO)
       1. Detect language        (offline Unicode script detection)
       2. Translate → English    (google-translate-api-x)
       3. Load recent history    (for follow-up / pronoun resolution)
       4. Embed the question      (Gemini gemini-embedding-001, 768-dim)
       5. Vector search           (MongoDB Atlas Vector Search, filtered by workspace)
       6. Gate by min score       (drop low-relevance passages)
       7. Generate answer         (Gemini 2.5 Flash — strict or hybrid prompt)
       8. Translate → user lang   (if input was non-English)
       9. Persist messages        (user + assistant turns, with metadata)
  └─ Stream tokens back           (token / status / answer-complete events)
User (React)                    → sees streamed answer + sources + confidence
```

**Layered structure (backend):** routes → middleware (auth, workspace resolution,
role checks, validation, error handling) → services (RAG orchestration, Gemini,
translation, document processing) → Mongoose models. Configuration is centralized and
validated on startup; failures produce clear, actionable messages.

---

## Modules & Features (Detailed)

### 1. Multilingual Real-Time Chat
The core user-facing module. It supports **10 languages** — Hindi, Marathi, Bengali,
Tamil, Telugu, Kannada, Gujarati, Punjabi, Malayalam, and English. Input language is
identified by **offline Unicode script detection** (no external call), the query is
translated to English for uniform retrieval and generation, and the answer is
translated back to the user's language. Answers are **streamed token-by-token** over
Socket.IO (`token`, `status`, `answer-complete`, and `error` events), giving a live
"typing" experience. Recent conversation history is included in the prompt so
follow-up questions such as "who is he?" resolve correctly. Each answer bubble shows
its **source citations, a confidence score, and response latency**, and non-English
answers include a collapsible English version.
*Key files:* `server/services/qaHandler.js`, `server/services/translation.js`,
`server/services/gemini.js`, `client/src/pages/ChatPage.jsx`, `client/src/i18n/i18n.js`.

### 2. Retrieval-Augmented Generation (RAG) Pipeline
The technical heart of the project. The English question (optionally combined with the
previous user turn for context) is embedded into a **768-dimension vector** using
Gemini's `gemini-embedding-001` model. That vector queries a **MongoDB Atlas Vector
Search** index (`embedding_index`, cosine similarity) to retrieve the top-K most
similar knowledge chunks (default K=5, from 50 candidates). Passages below a minimum
similarity score (default 0.3) are discarded as noise. The surviving passages are
injected into the LLM prompt so the answer is **grounded in real content with
citations**, and a confidence score is derived from retrieval quality. Gemini calls are
wrapped in a **resilience layer** — a 30-second timeout, exponential-backoff retry
(3 attempts), and graceful handling of free-tier quota (HTTP 429) errors.
*Key files:* `server/services/qaHandler.js`, `server/services/gemini.js`.

### 3. Hybrid vs. Strict Answer Modes
The system offers two answering behaviours:
- **Strict mode** answers **only** from the knowledge base. If retrieval is inadequate
  it explicitly refuses ("I don't have enough information…") and every answer must cite
  its context passages. Confidence equals the top retrieval score (0.5 when no context
  is found). This mode is ideal for closed-domain, high-trust use.
- **Hybrid mode** (default) acts as a **general assistant that references the knowledge
  base when relevant**, citing sources as `[Source N]`. Confidence is reported only when
  the answer actually cited the knowledge base.

The active mode is resolved in the order: explicit per-question setting → the
workspace's default `answerMode` → hybrid. Users can toggle the mode per session from
the chat header, while admins set the workspace-wide default.
*Key files:* `server/services/qaHandler.js` (`buildStrictPrompt` / `buildHybridPrompt`),
`client/src/pages/WorkspaceSettingsPage.jsx`, `client/src/pages/ChatPage.jsx`.

### 4. Knowledge Base
The retrieval corpus. Each entry is a **`KnowledgeChunk`** storing the original text,
its English version, a source label, a **category** (government / education / health /
agriculture / general), the language, a **768-dimension embedding vector**, and
metadata (title, URL, date added). Chunks are made searchable through the Atlas Vector
Search index, which is **pre-filtered by `workspaceId`** so tenants never see each
other's data. A seed script populates roughly 30 sample passages for demonstration.
Administrators can list, add, and delete chunks (embeddings are generated automatically
on insert and excluded from list responses for efficiency).
*Endpoints:* `GET/POST /api/admin/knowledge`, `DELETE /api/admin/knowledge/:id`.
*Key files:* `server/models/KnowledgeChunk.js`, `server/routes/admin.js`,
`server/seed.js`.

### 5. Document / Data File Upload (Ingestion Pipeline)
Lets administrators grow the knowledge base **without manual copy-paste**. An admin
uploads a **PDF, TXT, or MD** file (handled by Multer with size limits). The
`documentProcessor` extracts text (via **pdf-parse** for PDFs, UTF-8 decoding
otherwise) and performs **semantic chunking** — splitting first on paragraph
boundaries, then on sentences, with a target chunk size of ~1000 characters (minimum
40) to preserve meaning. Each chunk is embedded **sequentially** (to respect Gemini
free-tier rate limits) and stored as a `KnowledgeChunk`, becoming immediately
searchable by the RAG pipeline.
*Endpoint:* `POST /api/admin/knowledge/upload`.
*Key files:* `server/services/documentProcessor.js`, `server/routes/admin.js`,
`client/src/pages/AdminPage.jsx`.

### 6. Multi-Tenant Workspaces
Turns the app into a **collaborative, isolated-per-tenant** platform. Each
**`Workspace`** owns its knowledge base, conversations, messages, and analytics —
nothing leaks across workspaces. A user can belong to many workspaces via
**`Membership`** records. Requests carry an `X-Workspace-Id` header; the
`resolveWorkspace` middleware verifies membership and falls back to a sensible default
workspace when none is specified. Crucially, **isolation reaches the RAG layer** —
vector search pre-filters candidate chunks by `workspaceId` — so tenants can never
retrieve each other's documents. A new user automatically receives a personal
workspace at registration.
*Key files:* `server/models/Workspace.js`, `server/models/Membership.js`,
`server/middleware/resolveWorkspace.js`, `server/services/workspaceService.js`,
`client/src/components/WorkspaceSwitcher.jsx`.

### 7. Invite Members & Role-Based Access Control (RBAC)
Governs **who can do what** within a workspace, with three roles:
- **Owner** — full control, including changing other members' roles.
- **Admin** — manage the knowledge base, view analytics, invite members.
- **Member** — ask questions only.

Admins invite people **by email**: if the invitee already has an account, a
`Membership` is created immediately; otherwise a **pending `Invite`** is stored and
**auto-claimed** the next time that person registers or logs in. Sensitive routes are
protected by the `requireWorkspaceAdmin` gate, and role changes are restricted to the
owner.
*Endpoints:* `POST /api/workspaces/:id/invites`, `GET /api/workspaces/:id/members`,
`PATCH /api/workspaces/:id/members/:userId`, `DELETE /api/workspaces/:id/members/:userId`.
*Key files:* `server/models/Invite.js`, `server/models/Membership.js`,
`server/routes/workspaces.js`, `client/src/pages/WorkspaceSettingsPage.jsx`.

### 8. Analytics Dashboard
Gives admins **insight into usage and answer quality**, scoped to the current
workspace. It aggregates: total users, conversations, messages, and knowledge chunks;
**average response latency**; **average confidence**; the **grounding ratio** (the
share of answers actually backed by the knowledge base, using a confidence threshold);
a **questions-per-language** distribution; and a **7-day activity trend**
(messages per day). The frontend presents these as animated stat cards and horizontal
bar charts.
*Endpoint:* `GET /api/analytics` (admin-only).
*Key files:* `server/routes/analytics.js`, `client/src/pages/AnalyticsPage.jsx`.

### 9. Authentication & Security
Stateless **JWT authentication** with **bcrypt**-hashed passwords. All request bodies
are validated at runtime with **Zod** schemas. The server hardens HTTP with **Helmet**
security headers, **CORS** restricted to configured origins (supporting multiple
comma-separated client URLs), **rate limiting** on the API, structured **Winston**
logging with daily rotation, and a central error handler that hides internal details
in production.
*Key files:* `server/middleware/auth.js`, `server/middleware/validate.js`,
`server/middleware/errorHandler.js`, `server/validators/schemas.js`,
`server/utils/logger.js`.

---

## Data Models (MongoDB / Mongoose)

| Model | Purpose |
|-------|---------|
| **User** | Account, hashed password, preferred language, global role |
| **Workspace** | Tenant boundary — name, owner, plan, default answer mode |
| **Membership** | Links a user to a workspace with a role (owner/admin/member) |
| **Invite** | Pending email invitation to a workspace (auto-claimed on signup) |
| **Conversation** | A chat thread within a workspace |
| **Message** | A single turn — original + English text, sources, confidence, latency |
| **KnowledgeChunk** | A retrievable passage with its 768-dim embedding vector |

---

## Enhancements Over the Base Version

The original project — *"An NLP-Powered Question-Answering System for Indian Language
Users Using MERN Stack"* — was a basic multilingual chatbot. The current system adds
the capabilities that justify the updated, RAG- and LLM-centric title:

| Area | Original | Now |
|------|----------|-----|
| Answer method | Direct/NLP responses | **RAG** — retrieval + LLM with grounded, cited answers |
| Reasoning engine | — | **Google Gemini 2.5 Flash** (LLM) + Gemini embeddings |
| Retrieval | — | **MongoDB Atlas Vector Search** (semantic, 768-dim) |
| Answer control | Single behaviour | **Strict vs. Hybrid** grounding modes with confidence scores |
| Knowledge input | Static | **Document upload** (PDF/TXT/MD) auto-chunked + embedded |
| Multi-user model | Single tenant | **Multi-tenant workspaces** with **RBAC** + email invites |
| Insight | — | **Analytics dashboard** (usage, latency, confidence, grounding) |
| Delivery | Request/response | **Real-time token streaming** over Socket.IO |
| Engineering | Minimal | **Automated tests, CI, Docker, structured logging, validation** |

These upgrades move the project from a simple translation-based Q&A tool to a
**production-grade, knowledge-grounded, multi-tenant AI platform**.

---

## Testing & Quality Assurance

- **Backend:** Vitest + Supertest with **mongodb-memory-server** for isolated,
  in-memory database tests (no external DB needed in CI).
- **Frontend:** Vitest + React Testing Library.
- **Tooling:** ESLint and Prettier enforce a consistent code style across the monorepo.
- **CI:** GitHub Actions lints, tests, and builds on every push and pull request.
- Run all suites from the repo root with `npm test`.

---

## Deployment

- **Frontend** deploys to **Vercel** as a static SPA (with an SPA rewrite rule); it
  reads the backend URL from `VITE_API_URL` / `VITE_SOCKET_URL`.
- **Backend** deploys as a **Docker** image to Render / Railway / Fly.io; it reads
  `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, and `CLIENT_URL` (which supports
  multiple comma-separated origins for CORS).
- **Database** is MongoDB Atlas (Vector Search requires Atlas; local MongoDB cannot be
  used for retrieval).
- A **docker-compose** setup runs the full stack locally behind nginx.

---

## Future Scope

1. Add **speech input/output** (STT/TTS) for low-literacy and accessibility use cases.
2. Support **more Indian languages** and dialects, and improve translation quality.
3. Introduce **hybrid keyword + vector (BM25 + semantic) search** and re-ranking for
   even more precise retrieval.
4. Add **user feedback (thumbs up/down)** to continuously improve answer quality and
   surface knowledge gaps.
5. Provide an **API / embeddable widget** so the assistant can be integrated into other
   government or educational portals.

---

## Conclusion

IndQA demonstrates a complete, modern application of **Retrieval-Augmented Generation**
on the **MERN stack**, tailored to the real need of **Indian-language information
access**. By grounding a Large Language Model in a workspace-isolated, admin-curated
knowledge base and delivering cited answers in the user's own language in real time, it
combines strong engineering practices (testing, CI, containerization, security) with a
socially meaningful goal — making information accessible across India's linguistic
diversity.
