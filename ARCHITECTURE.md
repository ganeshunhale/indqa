# Architecture Diagrams — IndQA

> Diagrams for the MCA report: *A Multilingual Retrieval-Augmented Question-Answering
> System for Indian Language Users Using the MERN Stack and Large Language Models.*
>
> **How to view / export:** these are [Mermaid](https://mermaid.js.org) diagrams — they
> render automatically on GitHub and in VS Code's Markdown preview. To get an image for
> your report, copy any ` ```mermaid ` block into <https://mermaid.live> and export it as
> **PNG or SVG**.

---

## 1. High-Level System Architecture

Shows the three tiers — client, server, and external cloud services — and how they
communicate (REST for CRUD, WebSocket for streamed answers).

```mermaid
flowchart TB
    subgraph client["🖥️ Client Tier — Browser"]
        UI["React 18 SPA (Vite)<br/>Chat · Admin · Analytics · Workspace<br/>react-i18next · Socket.IO client"]
    end

    subgraph server["⚙️ Application Tier — Node.js"]
        API["Express 4 REST API<br/>auth · conversations · admin · analytics · workspaces"]
        WS["Socket.IO Server<br/>real-time answer streaming"]
        SVC["Services Layer<br/>qaHandler · gemini · translation · documentProcessor"]
    end

    subgraph external["☁️ External Cloud Services"]
        GEM["Google Gemini API<br/>2.5 Flash + embedding-001"]
        GT["Google Translate<br/>(google-translate-api-x)"]
    end

    subgraph data["🗄️ Data Tier"]
        DB[("MongoDB Atlas<br/>+ Atlas Vector Search<br/>768-dim, cosine")]
    end

    UI -- "HTTPS / REST (JWT)" --> API
    UI -- "WebSocket (ask-question / token)" --> WS
    API --> SVC
    WS --> SVC
    SVC -- "embed + generate" --> GEM
    SVC -- "detect + translate" --> GT
    SVC -- "Mongoose queries + vector search" --> DB
```

---

## 2. RAG Question-Answering Data Flow (Sequence)

The end-to-end lifecycle of a single question, from the user's language back to the
user's language, with retrieval and streaming in between.

```mermaid
sequenceDiagram
    autonumber
    actor U as User (Browser)
    participant R as React SPA
    participant S as Socket.IO / Express
    participant Q as qaHandler
    participant T as Translation Service
    participant G as Gemini API
    participant V as Atlas Vector Search
    participant DB as MongoDB

    U->>R: Type question (in chosen language)
    R->>S: emit "ask-question" {question, language, mode}
    S->>Q: handleQuestion()
    Q->>T: detectLanguage() + translate → English
    Q->>DB: load recent conversation history
    Q->>G: generateEmbedding(question) → 768-dim vector
    G-->>Q: embedding
    Q->>V: $vectorSearch (filter workspaceId, topK=5)
    V-->>Q: top passages + similarity scores
    Q->>Q: drop passages below min score (0.3)
    Q->>G: generateAnswerStream(prompt + passages, strict/hybrid)
    loop token by token
        G-->>S: answer token
        S-->>R: "token" event (partial)
        R-->>U: live "typing" text
    end
    Q->>T: translate answer → user language (if non-English)
    Q->>DB: persist user + assistant messages (+ sources, confidence, latency)
    S-->>R: "answer-complete" {answer, sources, confidence, latencyMs}
    R-->>U: Final answer + citations + confidence
```

---

## 3. Backend Layered Architecture

The request path through the backend layers, showing separation of concerns.

```mermaid
flowchart TB
    IN["Incoming request<br/>(REST call or Socket.IO event)"]

    subgraph mw["Middleware"]
        AUTH["verifyToken (JWT)"]
        RW["resolveWorkspace<br/>(X-Workspace-Id → role)"]
        ADMIN["requireWorkspaceAdmin<br/>(RBAC gate)"]
        VAL["validate (Zod schemas)"]
        ERR["errorHandler + asyncHandler"]
    end

    subgraph routes["Routes"]
        RT["auth · conversations · admin<br/>analytics · workspaces"]
    end

    subgraph services["Services"]
        QA["qaHandler<br/>(RAG orchestration)"]
        GS["gemini<br/>(embed + stream + resilience)"]
        TS["translation<br/>(detect + translate)"]
        DP["documentProcessor<br/>(extract + chunk)"]
        WSVC["workspaceService"]
    end

    subgraph models["Models (Mongoose)"]
        M["User · Workspace · Membership · Invite<br/>Conversation · Message · KnowledgeChunk"]
    end

    DB[("MongoDB Atlas")]

    IN --> AUTH --> RW --> VAL --> RT
    RW --> ADMIN --> RT
    RT --> QA
    RT --> WSVC
    QA --> GS
    QA --> TS
    QA --> DP
    QA --> M
    WSVC --> M
    M --> DB
    ERR -.catches.-> RT
```

---

## 4. Data Model / Entity-Relationship Diagram

The seven MongoDB collections and their relationships. `Membership` is the join entity
that gives users many-to-many access to workspaces with a role.

```mermaid
erDiagram
    USER ||--o{ MEMBERSHIP : "belongs via"
    WORKSPACE ||--o{ MEMBERSHIP : "grants access via"
    USER ||--o{ WORKSPACE : "owns"
    WORKSPACE ||--o{ CONVERSATION : "contains"
    USER ||--o{ CONVERSATION : "starts"
    CONVERSATION ||--o{ MESSAGE : "contains"
    WORKSPACE ||--o{ MESSAGE : "scopes"
    WORKSPACE ||--o{ KNOWLEDGECHUNK : "owns"
    WORKSPACE ||--o{ INVITE : "has pending"

    USER {
        ObjectId _id
        string name
        string email UK
        string password "bcrypt hash"
        string preferredLanguage
        string role "user / admin"
    }
    WORKSPACE {
        ObjectId _id
        string name
        string slug UK
        ObjectId ownerId FK
        string plan "free / pro / enterprise"
        string answerMode "strict / hybrid"
    }
    MEMBERSHIP {
        ObjectId workspaceId FK
        ObjectId userId FK
        string role "owner / admin / member"
    }
    INVITE {
        ObjectId workspaceId FK
        string email
        string role
        string token
        string status "pending / accepted"
    }
    CONVERSATION {
        ObjectId _id
        ObjectId workspaceId FK
        ObjectId userId FK
        string title
        string language
        int messageCount
    }
    MESSAGE {
        ObjectId _id
        ObjectId conversationId FK
        ObjectId workspaceId FK
        string role "user / assistant"
        string originalText
        string englishText
        array retrievedChunks
        number confidence
        number latencyMs
    }
    KNOWLEDGECHUNK {
        ObjectId _id
        ObjectId workspaceId FK
        string text
        string textEnglish
        string source
        string category
        array embedding "768-dim vector"
    }
```

---

## 5. Multi-Tenancy & Role-Based Access Control

How workspace isolation and roles gate what each user can do — including the crucial
detail that isolation is enforced all the way down to vector search.

```mermaid
flowchart LR
    U1["User A"] --> M1["Membership: owner"]
    U1 --> M2["Membership: member"]
    U2["User B"] --> M3["Membership: admin"]

    M1 --> WA["Workspace 1"]
    M3 --> WA
    M2 --> WB["Workspace 2"]

    WA --> KBA["KB + Conversations<br/>+ Analytics (WS1)"]
    WB --> KBB["KB + Conversations<br/>+ Analytics (WS2)"]

    subgraph gate["Role gate (requireWorkspaceAdmin)"]
        OWNER["owner → everything incl. role changes"]
        ADMINR["admin → manage KB, analytics, invites"]
        MEMBER["member → ask questions only"]
    end

    WA -. vector search pre-filtered by workspaceId .-> KBA
    WB -. vector search pre-filtered by workspaceId .-> KBB
```

---

## 6. Document Ingestion Pipeline

How an uploaded document becomes searchable knowledge.

```mermaid
flowchart LR
    A["Admin uploads<br/>PDF / TXT / MD"] --> B["Multer<br/>(upload + size guard)"]
    B --> C["documentProcessor<br/>extract text"]
    C -->|PDF| C1["pdf-parse"]
    C -->|TXT / MD| C2["UTF-8 decode"]
    C1 --> D
    C2 --> D["Semantic chunking<br/>~1000 chars, split on<br/>paragraph → sentence"]
    D --> E["Gemini embedding-001<br/>(sequential, 768-dim)"]
    E --> F[("Store as KnowledgeChunk<br/>in MongoDB Atlas")]
    F --> G["Immediately searchable<br/>by RAG pipeline"]
```

---

## 7. Deployment Architecture

How the system is deployed across free-tier cloud services, with CI.

```mermaid
flowchart TB
    subgraph dev["Developer"]
        GIT["GitHub Repository"]
        CI["GitHub Actions CI<br/>lint · test · build"]
    end

    subgraph fe["Frontend Hosting"]
        VERCEL["Vercel<br/>static SPA (Vite build)<br/>VITE_API_URL / VITE_SOCKET_URL"]
    end

    subgraph be["Backend Hosting"]
        RENDER["Render / Railway / Fly.io<br/>Docker (Node 20)<br/>MONGODB_URI · JWT_SECRET · GEMINI_API_KEY · CLIENT_URL"]
    end

    subgraph cloud["Managed Services"]
        ATLAS[("MongoDB Atlas<br/>+ Vector Search")]
        GOOGLE["Google Gemini +<br/>Google Translate"]
    end

    USER["End User<br/>(Browser)"]

    GIT --> CI
    CI --> VERCEL
    CI --> RENDER
    USER --> VERCEL
    VERCEL -- "REST + WebSocket<br/>(CORS: multi-origin)" --> RENDER
    RENDER --> ATLAS
    RENDER --> GOOGLE
```

---

## 8. Use-Case Overview (Actors & Actions)

A quick view of who does what in the system.

```mermaid
flowchart TB
    subgraph actors["Actors"]
        MEM(("Member"))
        ADM(("Workspace Admin"))
        OWN(("Owner"))
    end

    subgraph uc["Use Cases"]
        Q["Ask multilingual question"]
        H["View conversation history"]
        UP["Upload documents to KB"]
        KB["Add / delete knowledge passages"]
        AN["View analytics dashboard"]
        INV["Invite members"]
        ROLE["Change member roles"]
        MODE["Set workspace answer mode"]
    end

    MEM --> Q
    MEM --> H
    ADM --> Q
    ADM --> H
    ADM --> UP
    ADM --> KB
    ADM --> AN
    ADM --> INV
    ADM --> MODE
    OWN --> ROLE
    OWN --> INV
    OWN --> AN
```
