# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test Commands
- Development server: `npm run dev` (runs backend + frontend concurrently)
- Backend only: `npm run dev:backend` 
- Frontend only: `npm run dev:frontend`
- Build production: `npm run build`
- Build development: `npm run build:dev`
- Lint: `npm run lint` (with `npm run lint:fix` for auto-fixes)
- Type checking: `npm run typecheck` (checks both backend and frontend)
- Production start: `npm start` (runs ./start.sh with Redis checks)

## High-Level Architecture

**Synergize** is a multi-model AI collaboration system where multiple LLMs work through structured phases: BRAINSTORM → CRITIQUE → REVISE → SYNTHESIZE → CONSENSUS. The system is built as a monorepo with separate TypeScript frontend and backend.

### Technology Stack
- **Frontend**: React 18 + TypeScript + Vite + Zustand (state) + Tailwind CSS + Server-Sent Events
- **Backend**: Node.js + Express + TypeScript + node-llama-cpp (GGUF models) + Redis + Vector embeddings
- **Communication**: Server-Sent Events (SSE) for real-time token streaming (not WebSocket)
- **Models**: GGUF format local models with context pooling for performance

### Critical Performance Requirement
**THE #1 PRIORITY**: Token streaming must handle 10,000+ tokens without lag. Previous implementations failed due to DOM performance issues. Use browser profiler during development to ensure smooth streaming.

### Project Structure
```
frontend/src/
├── components/          # React components (ConnectionStatus, ModelSelector, etc.)
├── hooks/              # useStreamManager for SSE handling
├── services/           # sseService for server communication  
├── store/              # Zustand global state (collaborationStore)
└── types/              # TypeScript interfaces

backend/src/
├── controllers/        # sseController for streaming endpoints
├── services/           # Core business logic (modelService, collaborationOrchestrator, etc.)
├── models/            # Type definitions and conversation types
└── utils/             # Logging utilities
```

### Key Services & Components
- **Frontend**: `useStreamManager` hook manages SSE connections, `collaborationStore` handles global state
- **Backend**: `collaborationOrchestrator` coordinates model interactions, `modelService` manages GGUF model loading/pooling, `streamingService` handles SSE responses
- **Memory**: Redis with vector embeddings using Xenova transformers for semantic search
- **Models**: Context pooling pattern prevents GPU memory exhaustion

### Environment Configuration
Key variables: `PORT` (8000), `REDIS_URL`, `MODEL_CONTEXT_SIZE` (4096), `MODEL_BATCH_SIZE` (512), `CONTEXTS_PER_MODEL` (4), `MAX_CONCURRENT_INFERENCES` (2)

### Code Style Guidelines  
- TypeScript with strict type checking (`@typescript-eslint/no-explicit-any`: error)
- React functional components with TypeScript interfaces for props
- Imports organized by: React/external → Internal (@/ alias) → Local/relative
- PascalCase for components/types, camelCase for variables/functions
- Path alias: `@/*` points to `./src/*` in frontend
- Explicit function return types required (ESLint rule)

## Key Implementation Details

### Token Management & Context Windows
- Uses **tiktoken** for accurate token counting across all models
- Implements sophisticated token allocation algorithm (Gemini-inspired budget system)
- **contextAllocator.ts** manages phase-specific token budgets to prevent context overflow
- **conversationCompressor.ts** handles memory compression for long conversations
- Token allocation percentages by phase configured in `conversationStateManager.ts`

### Phase Transition System
- **Critical**: Phase transitions controlled by LLMs through `conversationCurator.makePhaseDecision()`
- Implements verification-focused prompts to prevent mathematical/logical errors
- Force CRITIQUE phase when errors detected in model outputs
- Phase sequence: IDLE → BRAINSTORM → CRITIQUE → REVISE → SYNTHESIZE → CONSENSUS → COMPLETE

### Streaming Architecture
- **streamingService** batches tokens for performance (SSE_BATCH_SIZE_TOKENS=10)
- Frontend `useStreamManager` hook renders markdown in real-time
- Synthesis panel receives tokens via special 'synthesis' modelId routing
- Copy buttons implemented for all output containers

### Memory & Embeddings
- Redis vector store for semantic memory search
- Xenova transformers for embeddings (gte-Qwen2-1.5B-instruct model)
- Vector search enables context retrieval for synthesis generation

### Model Management
- GGUF models loaded from `./models` directory
- Context pooling prevents GPU memory exhaustion
- Supports concurrent inference with configurable limits

## Development Notes
- No testing framework currently configured (gap to address)
- Uses SSE streaming instead of WebSocket for real-time communication
- Models directory contains GGUF files, auto-detected on startup
- Redis required for development (checked by start.sh)
- Frontend dev server proxies `/api` requests to backend on port 8000
- Mathematical verification required in all synthesis outputs