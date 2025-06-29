# Synergize - Multi-Model AI Collaboration System

## Project Overview

Synergize enables multiple LLMs to collaborate through structured phases (BRAINSTORM → CRITIQUE → REVISE → SYNTHESIZE → CONSENSUS) to produce superior outputs. Two models work in parallel, critique each other's work, and synthesize their best ideas into a final response.

## Core Architecture Requirements

### Backend System
- **Technology Stack**: Node.js with Express server, TypeScript for type safety
- **WebSocket Support**: Real-time bidirectional communication for token streaming
- **Model Loading**: Support for GGUF format models with eager loading at startup
- **Context Management**: Implement a context pool pattern to prevent GPU memory exhaustion
- **Model Support**: Must handle multiple model types (Qwen with ChatML format, Gemma with custom settings)
- **Port**: Default to 8000 with environment variable override

### Frontend System
- **Technology Stack**: React with TypeScript, Vite for build tooling
- **UI Framework**: Tailwind CSS with a JARVIS-style futuristic theme
- **State Management**: Zustand for global state management
- **WebSocket Client**: Custom hook with auto-reconnection and exponential backoff
- **Layout**: Static left-right layout for model responses with synthesis display below

## CRITICAL: Token Streaming Performance

**THE #1 REQUIREMENT**: Stream tokens smoothly without lag, even after 10,000+ tokens.

### Performance Requirements
- Must handle continuous token streaming for extended periods
- No performance degradation as content grows
- Smooth 60fps visual updates during streaming
- Minimal memory allocation during streaming
- Browser profiler should show minimal time in JavaScript/React during streaming

### Known Performance Issues to Solve
- Previous implementation started lagging after ~100 tokens
- Performance degraded exponentially as more tokens arrived
- Firefox profiler showed 18% time in Style computation, 23% in styles
- Streaming would eventually freeze completely

## System Features

### Phase-based Collaboration
1. **BRAINSTORM**: Initial ideation phase where models generate creative solutions
2. **CRITIQUE**: Models analyze and critique each other's outputs
3. **REVISE**: Refinement phase based on critiques
4. **SYNTHESIZE**: Combining best ideas into coherent solution
5. **CONSENSUS**: Final agreement and polished output

### Memory and Learning
- Redis integration with vector search capabilities
- Semantic memory storage using 1024-dimensional embeddings
- Cross-session learning and context persistence
- Xenova transformers for embedding generation

### Model Management
- Automatic detection of GGUF files in models directory
- Context pooling with configurable pool size per model
- Timeout handling (60 seconds per generation)
- Error isolation - individual model failures don't crash system
- Parallel inference support with configurable limits

## WebSocket Protocol Design

### Message Types
- `synergy_request`: Initiate collaboration session
- `synergy_update`: Real-time phase and token updates
- `synergy_complete`: Final synthesis with consensus
- `synergy_error`: Error notifications
- `models`: Available models list on connection

### Streaming Format
Messages should include:
- `modelId`: Unique identifier for the model
- `phase`: Current collaboration phase
- `token`: Individual token (NOT accumulated content)
- `isComplete`: Boolean for stream completion

## Frontend Component Architecture

### Component Hierarchy
```
App
├── Connection Status Manager
└── SynergizerArena
    ├── Model Selection UI
    ├── Prompt Input
    ├── ModelCollaboration
    │   ├── StaticModelResponse (Left - Gemma)
    │   ├── StaticModelResponse (Right - Qwen)
    │   └── SynthesisDisplay
    └── Phase Progress Indicator
```

### Critical Component: Streaming Display
**This component determines success or failure of the entire system**

Requirements:
- Display markdown-formatted content with syntax highlighting
- Update smoothly as new tokens arrive
- Handle thousands of tokens without performance degradation
- Maintain security (no XSS vulnerabilities)
- Support standard markdown features (code blocks, lists, tables, etc.)

## Environment Configuration

### Backend Environment Variables
- `PORT`: Server port (default: 8000)
- `MODEL_CONTEXT_SIZE`: Token window (default: 4096)
- `MODEL_BATCH_SIZE`: Inference batch size (default: 512)
- `MODEL_THREADS`: CPU thread count (default: 4)
- `MODEL_GPU_LAYERS`: GPU layers (default: max available)
- `CONTEXTS_PER_MODEL`: Pool size per model (default: 4)
- `MAX_CONCURRENT_INFERENCES`: Parallel limit (default: 2)
- `REDIS_URL`: Redis connection (default: redis://localhost:6379)
- `EMBEDDING_MODEL`: Xenova model (default: Xenova/gte-Qwen2-1.5B-instruct)

## Build and Development Setup

### Scripts Required
- Development: Concurrent backend and frontend dev servers
- Build: Production builds for both frontend and backend
- Lint: ESLint with TypeScript support
- Start: Production server startup with dependency checks

### Startup Script (`start.sh`)
Should handle:
1. Redis availability check
2. Dependency installation if needed
3. Backend and frontend startup
4. Health checks

## Testing Requirements

### Performance Testing
- Must verify smooth streaming up to 10,000+ tokens
- Monitor for memory leaks during long sessions
- Profile DOM update frequency
- Ensure no React re-render storms

### Browser Compatibility
- Test in Chrome, Firefox, Safari
- Verify WebSocket reconnection logic
- Check streaming performance across browsers

## Performance Testing Criteria

1. **Token Count Test**: Stream 10,000 tokens continuously - must remain smooth throughout
2. **Profiler Test**: Browser DevTools performance profiler should show even time distribution
3. **Memory Test**: Memory usage should grow linearly, not exponentially
4. **Visual Test**: No stuttering, freezing, or lag visible to users
5. **Stress Test**: Multiple models streaming simultaneously should not impact performance

## Success Criteria

1. Smooth token-by-token streaming without any lag
2. Support for 10,000+ tokens without performance degradation  
3. Clean phase transitions with visual feedback
4. Robust error handling and recovery
5. Memory-efficient model management
6. Professional JARVIS-style UI appearance

## Build Priorities

1. **Start with Performance**: Get token streaming working smoothly first
2. **Test Early**: Verify performance with thousands of tokens before adding features
3. **Profile Continuously**: Use browser DevTools to catch performance issues early
4. **Keep It Simple**: The best solution is often the simplest one

## Success Metrics

- Smooth streaming of 10,000+ tokens without any lag
- Consistent 60fps during active streaming
- Memory usage under control (no leaks)
- Clean, maintainable code that future developers can understand

Remember: If streaming performance fails, nothing else matters. Users will abandon the system if it freezes during use.