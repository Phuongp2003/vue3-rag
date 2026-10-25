# vue3-rag

A high-performance Vue 3.5 Documentation Retrieval-Augmented Generation (RAG) educational system and playground with hybrid lexical/semantic vector search, tiered storage architecture, and autonomous tool-calling AI agent.

**Author:** [phuongp2003](https://github.com/phuongp2003)  
**Live Demo:** [https://vue.fynx.io.vn](https://vue.fynx.io.vn) *(Protected by HTTP Basic Auth &mdash; credentials provided in release notes / private channel)*

---

## 1. Educational Foundations: What is RAG & How LLMs Work?

This project is built as an open demonstration for engineers and learners looking to understand the fundamentals of Modern Machine Learning, Large Language Models (LLM), and Retrieval-Augmented Generation (RAG).

### 1.1 How LLMs Generate Tokens (The Input-Output Context Window)
A Large Language Model (e.g. GPT-4, Claude, LLaMA) does not "think" or "look up facts" like a database. At its mathematical core, an LLM is a next-token probability distribution engine:

$$P(w_{t} \mid w_1, w_2, \dots, w_{t-1})$$

- **Token Context Constraint:** The model predicts the next word/token based exclusively on the tokens currently in its context window.
- **Knowledge Cutoff & Hallucination:** If the context lacks up-to-date facts (such as new Vue 3.5 macros like `useTemplateRef()` or `useId()`), the model calculates plausible-sounding tokens that might be completely fabricated (hallucinations).

### 1.2 What is RAG (Retrieval-Augmented Generation)?
Instead of fine-tuning or re-training an entire model (costly and static), **RAG** bridges the gap by fetching authoritative documents from an external storage layer and injecting them directly into the context window before generation:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#f8fafc", "primaryBorderColor": "#42b883", "lineColor": "#475569", "textColor": "#0f172a", "mainBkg": "#0f172a", "nodeBorder": "#334155"}}}%%
flowchart LR
  classDef default fill:#0f172a,stroke:#94a3b8,stroke-width:1px,color:#f8fafc;
  classDef core fill:#0f172a,stroke:#42b883,stroke-width:2px,color:#f8fafc;
  classDef data fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#f8fafc;

  Q["User Query (Natural Language)"]:::default --> R["Retriever (Fuzzy + Vector Cosine)"]:::core
  DB["Knowledge Base (MongoDB + SQLite)"]:::data <--> R
  R -->|"Top-K Context Snippets"| P["Augmented Prompt Assembly"]:::core
  P --> L["LLM Generator (OpenAI / Claude / Ollama)"]:::core
  L --> A["Grounded Accurate Output"]:::default
```

### 1.3 From Words to Geometry: What is Vector Embedding & Cosine Similarity?
Computers cannot compute similarity directly on characters. Embeddings map strings of text into a high-dimensional mathematical vector space ($D$-dimensional coordinates):

$$\text{Text} \xrightarrow{\text{Embedding Model}} \vec{V} = [v_1, v_2, \dots, v_D] \in \mathbb{R}^D$$

- **Semantic Closeness:** Synonyms and related concepts point in almost the same geometric direction even if they do not share any words (e.g., *"render outside root"* and *"<Teleport>"*).
- **Cosine Similarity:** The degree of alignment is evaluated by computing the angle $\theta$ between the query vector $\vec{Q}$ and document vector $\vec{D}$:

$$\cos(\theta) = \frac{\vec{Q} \cdot \vec{D}}{\|\vec{Q}\| \|\vec{D}\|} = \frac{\sum_{i=1}^D Q_i D_i}{\sqrt{\sum_{i=1}^D Q_i^2} \sqrt{\sum_{i=1}^D D_i^2}}$$

---

## 2. System Architecture & Module Decomposition

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#1e293b", "primaryTextColor": "#f8fafc", "primaryBorderColor": "#42b883", "lineColor": "#475569", "textColor": "#0f172a", "mainBkg": "#0f172a", "nodeBorder": "#334155"}}}%%
flowchart TD
  classDef default fill:#0f172a,stroke:#94a3b8,stroke-width:1px,color:#f8fafc;
  classDef core fill:#0f172a,stroke:#42b883,stroke-width:2px,color:#f8fafc;
  classDef storage fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#f8fafc;
  classDef view fill:#0f172a,stroke:#f59e0b,stroke-width:1.5px,color:#f8fafc;

  subgraph PresentationLayer["Presentation Layer (src/ejs-templates)"]
    DocView["Wiki & Search Interface (/documents)"]:::view
    ChatView["AI Chat & Live Turning Trace (/chat)"]:::view
    SettingsView["Embedding & System Config (/settings)"]:::view
  end

  subgraph CoreLayer["Domain Services (Level 2)"]
    VueRepo["VueDocumentRepository (src/vue3-documents)"]:::core
    ToolReg["ToolRegistry (src/tools)"]:::core
    LLMCaller["Universal LLM Caller (src/llm-caller)"]:::core
  end

  subgraph DataLayer["Storage Architecture (Level 1)"]
    direction LR
    Mongo["MongoDB Atlas (Raw Markdown & Dual Code Store)"]:::storage
    SQLite["SQLite presets.db (Dense Vector Space & Cache)"]:::storage
  end

  DocView -->|"Query & Filter"| VueRepo
  ChatView -->|"SSE Turn Request"| ToolReg
  SettingsView -->|"Configure Embeddings"| VueRepo
  ToolReg -->|"Autonomous Search"| VueRepo
  ToolReg -->|"Stream Tokens"| LLMCaller
  VueRepo -->|"Fetch Full Documentation"| Mongo
  VueRepo -->|"Cosine & Lexical Matching"| SQLite
```

### Module Responsibilities:
- **`src/db/` (Level 1 Infrastructure):** Prisma client singleton connecting to MongoDB Atlas for raw document presentation (`vue_documents`).
- **`src/llm-caller/` (Level 1 Infrastructure):** Pure JavaScript SQLite preset store (`presets.db`) and unified OpenAI/Anthropic protocol caller with SSE streaming.
- **`src/vue3-documents/` (Level 2 Domain):** Implements `VueDocumentRepository`, text embedding extraction, Cosine Similarity, and dual-syntax Vue 3 data representation.
- **`src/tools/` (Level 2 Tool Engine):** Agentic tool registry offering `search_vue3_knowledge_base` and `get_vue3_syntax_comparison` with autonomous intent compacting.
- **`src/ejs-templates/` (Level 1 Presentation):** Clean dark UI views with fixed layouts, real-time Marked.js markdown streaming, and a 75% sliding turning trace panel.

---

## 3. Tiered Storage Strategy (Why MongoDB + SQLite?)

| Storage Engine | Purpose | Data Held | Rationale |
|---|---|---|---|
| **MongoDB Atlas** | **Raw Content & Presentation Store** | Full markdown documentation, Composition API `<script setup>` snippets, Options API snippets, source URLs, timestamps | Scalable document storage that keeps memory light and handles polymorphic schemas easily. |
| **SQLite (`presets.db`)** | **Search Index & Dense Vectors** | Document IDs, Slugs, Titles, Categories, Use-case intents, Dense 3072/56-dim embedding vectors, Providers, Models, Settings | Sub-millisecond Cosine Similarity and lexical ranking calculated locally in-memory without external network latency. |

---

## 4. Sequence Workflows

### Sequence 1: Autonomous Intent Turning & Hybrid RAG Chat
When a user describes an architectural problem in natural language (e.g., *"How do I keep my filter state in component A while rendering the controller onto the global navbar?"*):

```mermaid
%%{init: {"theme": "base", "sequence": {"mirrorActors": false}, "themeVariables": {"actorBkg": "#0f172a", "actorBorder": "#42b883", "actorTextColor": "#f8fafc", "actorLineColor": "#64748b", "signalColor": "#cbd5e1", "signalTextColor": "#0f172a", "labelBoxBkgColor": "#0f172a", "labelBoxBorderColor": "#334155", "labelTextColor": "#f8fafc", "loopTextColor": "#f8fafc", "noteBorderColor": "#38bdf8", "noteBkgColor": "#1e293b", "noteTextColor": "#f8fafc"}}}%%
sequenceDiagram
  autonumber
  actor User as Developer
  participant Server as HTTP Gateway (server.ts)
  participant Agent as Intent Planner (ToolRegistry)
  participant Search as VueDocumentRepository
  participant SQLite as SQLite Vector Index
  participant Mongo as MongoDB Atlas
  participant LLM as Active Model (LLM Caller)

  User->>Server: POST /api/chat/stream (Raw problem description)
  Server->>Agent: compactUserIntent(rawPrompt)
  Agent-->>Server: Compacted Plan ("render outside root teleport portal", category: components)
  Server-->>User: SSE event: turn_start (INTENT_PLANNING)
  Server->>Search: searchDocuments(compactQuery, mode: hybrid)
  Search->>SQLite: Cosine Similarity on query embedding vs document vectors
  SQLite-->>Search: Top-K matching IDs (Teleport top score: 1.0)
  Search->>Mongo: Batch fetch matching full documents by IDs
  Mongo-->>Search: Full documents (Composition + Options code)
  Search-->>Server: Injected Context Payload
  Server-->>User: SSE event: tool_trace (search_vue3_knowledge_base)
  Server->>LLM: Stream prompt with injected Vue 3 knowledge
  LLM-->>Server: Token stream
  Server-->>User: SSE event: token (Real-time Markdown stream)
  Server-->>User: SSE event: turn_end
```

---

### Sequence 2: Multi-Mode Search with Top-K Debugging (`/documents`)

```mermaid
%%{init: {"theme": "base", "sequence": {"mirrorActors": false}, "themeVariables": {"actorBkg": "#0f172a", "actorBorder": "#42b883", "actorTextColor": "#f8fafc", "actorLineColor": "#64748b", "signalColor": "#cbd5e1", "signalTextColor": "#0f172a", "labelBoxBkgColor": "#0f172a", "labelBoxBorderColor": "#334155", "labelTextColor": "#f8fafc", "loopTextColor": "#f8fafc", "noteBorderColor": "#38bdf8", "noteBkgColor": "#1e293b", "noteTextColor": "#f8fafc"}}}%%
sequenceDiagram
  autonumber
  actor User as Developer
  participant Client as Web Browser
  participant API as /api/documents
  participant Repo as VueDocumentRepository
  participant SQLite as SQLite presets.db
  participant Mongo as MongoDB Atlas

  User->>Client: Types search query + adjusts Semantic Slider (0% to 100%)
  Client->>API: GET /api/documents?q=query&mode=hybrid&weight=0.5
  API->>Repo: searchDocuments({ query, mode, hybridWeight })
  Repo->>Repo: Calculate Fuzzy Scores via exact word boundaries
  Repo->>Repo: Calculate Semantic Scores via Cosine Similarity
  Repo->>Repo: Score = (1 - w) * Fuzzy + w * Semantic
  Repo->>SQLite: Get Top-K candidates for Fuzzy, Semantic, and Hybrid
  Repo->>Mongo: Fetch paginated document cards
  Mongo-->>Repo: Document items
  Repo-->>API: Return { results, debug: { topKFuzzy, topKSemantic, topKHybrid } }
  API-->>Client: Render Top-K Debug Panel & Document List
  User->>Client: Clicks document
  Client->>API: GET /api/documents/:id
  API->>Mongo: Fetch full doc
  Mongo-->>API: Raw doc details
  API-->>Client: Render Vue 3 spec sheet with dual code blocks
```

---

## 5. Setup & Running

### Prerequisites
- Node.js >= 16.x (v22+ recommended)
- MongoDB instance (Atlas or local)

### Installation
```bash
git clone https://github.com/phuongp2003/vue3-rag.git
cd vue3-rag
npm install
npx prisma generate
```

### Environment Configuration
Copy `.env.example` to `.env` and fill your MongoDB connection string:
```bash
cp .env.example .env
```

### Build & Start
```bash
npm run build
npm start
```
Access the application at `http://localhost:3000`.

- `/documents`: Browse Vue 3 specification wiki, test Fuzzy/Semantic/Hybrid searches, inspect Top-K debug metrics.
- `/chat`: Real-time AI chat with 75% hover turning trace and autonomous RAG tool calls.
- `/providers`: Add/Edit/Delete LLM and embedding providers.
- `/settings`: Choose active embedding model and trigger complete re-indexing.

---

## 6. License

- Documentation content referenced from [vuejs.org](https://vuejs.org) (CC BY 4.0).
- Source code released under [MIT License](https://opensource.org/licenses/MIT) by [@phuongp2003](https://github.com/phuongp2003).
