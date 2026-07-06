# TBO AI - Executive Analytics Platform

TBO AI is an intelligent, scalable executive analytics platform designed to provide conversational insights, deep-dive dashboards, and automated narratives for TBO's commercial operations. It leverages Large Language Models (LLMs) securely paired with a high-performance cloud analytical warehouse.

---

## 🏗 System Architecture

The platform follows a modern decoupled architecture:
- **Frontend**: A React SPA built with Vite, TailwindCSS, and Framer Motion for a premium, native-feeling user experience.
- **Backend**: A robust Node.js Express server acting as the orchestrator between the UI, the analytical database, and the AI models.
- **Analytical Engine**: MotherDuck (Cloud DuckDB) for massively parallel, stateless execution of SQL queries against raw CSV datasets.

---

## 🔌 Core Services & Connections

### 1. Clerk (Authentication)
**Purpose**: Manages user identity, sessions, and security.
- **Connection**: Integrated on the frontend via `@clerk/clerk-react` and verified on the backend via `@clerk/express`. 
- **Usage**: Protects all API endpoints. The `currentUser` middleware validates the JWT tokens on every request.

### 2. Supabase (Storage & Postgres)
**Purpose**: Serves as the primary data lake and operational database.
- **Connection**: Accessed via `@supabase/supabase-js`.
- **Usage**: 
  - **Storage**: Holds the raw CSV datasets (e.g., pricing intelligence reports).
  - **Database**: Stores user prompts, conversation histories, and dataset metadata. 

### 3. MotherDuck & DuckDB (Analytical Engine)
**Purpose**: Executes complex analytical queries blazingly fast without crashing the Node.js server.
- **Connection**: Integrated via the native `duckdb` Node bindings using a `md:?motherduck_token=...` connection string.
- **Usage**: When a user queries a dataset, the backend dynamically generates a Supabase Signed URL for the CSV and instructs MotherDuck to query it (`read_csv_auto`). MotherDuck executes the query in the cloud and streams the lightweight JSON results back to the backend.

### 4. Upstash Redis (Caching & Rate Limiting)
**Purpose**: Enhances performance and protects the API from abuse.
- **Connection**: Connected via `@upstash/redis` using HTTP REST.
- **Usage**: Caches dataset metadata, schema ontologies, and generated narratives to prevent redundant API calls to Supabase or Anthropic.

### 5. Doppler (Secrets Management)
**Purpose**: Manages all environment variables centrally.
- **Connection**: Injected at runtime using the `doppler run --` CLI command in `package.json`.
- **Usage**: Ensures that API keys (Anthropic, Clerk, Supabase, MotherDuck) are never hardcoded and can be rotated easily.

### 6. Claude AI (Intelligence)
**Purpose**: Powers the conversational interface, translates natural language to SQL, and generates contextual narratives.
- **Connection**: `@anthropic-ai/sdk` connecting to Claude 3.5 Sonnet and Haiku.
- **Usage**: The backend uses an advanced `hybridQuestionParser` to classify questions and generate DuckDB-compatible SQL queries tailored to the dataset's specific schema.

---

## 🔄 Data Flow & Request Lifecycle

1. **User Request**: The user asks a question in the frontend chat interface (e.g., "What is our win rate for Hilton in London?").
2. **Authentication**: The request is sent to the backend with a Clerk Bearer token. The backend verifies the session.
3. **Intent Parsing**: The `chatOrchestrator` passes the user's question to Claude to extract the semantic intent and generate a DuckDB SQL query.
4. **Execution**: The backend passes the generated SQL to MotherDuck. If it's the first time the dataset is queried, MotherDuck fetches the CSV from the Supabase Signed URL and creates a cached columnar table in the cloud.
5. **Response**: MotherDuck returns the aggregate numbers (e.g., `win_rate: 45%`).
6. **Narrative Generation**: The backend passes the raw numbers back to Claude to generate a human-readable executive summary.
7. **Delivery**: The JSON (and potentially a streaming text response) is returned to the frontend and rendered in the chat UI.

---

## 🛠 Maintenance Guidelines

### Adding New Features
- **Frontend**: Always prioritize the premium aesthetic. Use `Sidebar.tsx` and the `ThemeContext` for navigation and mode switching. Any new metrics should utilize the reusable `MetricCard.tsx` component.
- **Backend**: Place core business logic in the `services/` directory, route definitions in `routes/`, and AI logic in `ai/`. 

### Handling Schema Changes
- The AI is highly dependent on `datasetSchema.ts` and `schemaClassifier.ts`. If the underlying data engineering team changes the column names in the CSV reports, you **must** update the aliases in these configuration files so Claude knows how to query them correctly.

### Dependency Management
- The project uses `pnpm` workspaces. Ensure you run `pnpm install` from the root directory.
- Test the application using `npm run dev` in both the `apps/web` and `apps/api` directories, prefixed with `doppler run --` to ensure secrets are injected.

---

## ⚠️ Current Limitations

1. **Schema Rigidity**: The system currently relies on hardcoded ontology mappings (e.g., mapping "tbo_hotelname" to "Hotel"). If a completely foreign dataset is uploaded without these standard columns, the AI will fail to generate valid SQL.
2. **Context Window Limits**: Extremely complex questions that require returning thousands of rows from MotherDuck back to the Node server will blow up the Claude context window when generating the narrative.
3. **Stateless Conversational Memory**: The conversational history is not persistently injected into the SQL generation prompt, making complex multi-turn analytical follow-ups occasionally unreliable.

---

## 🚀 Future Improvements

1. **Dynamic Ontology Mapping**: Implement an AI step during dataset upload that automatically profiles the CSV columns and dynamically builds the ontology mapping, allowing the system to accept *any* CSV shape.
2. **Vector Embeddings (RAG)**: For unstructured datasets (e.g., text reviews, PDF reports), integrate a vector database (like Supabase pgvector or Pinecone) alongside MotherDuck to support semantic search.
3. **Advanced Streaming (Phase 2)**: Implement Server-Sent Events (SSE) across the entire pipeline so the UI updates instantly as the SQL query executes and the narrative generates, reducing perceived latency.
4. **Automated Alerts**: Utilize a background worker (e.g., Upstash QStash) to run scheduled queries on MotherDuck and send email alerts if a critical metric (like Win Rate) drops below a defined threshold.
