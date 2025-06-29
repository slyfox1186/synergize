# Synergize 🤝

A multi-model AI collaboration system where Large Language Models work together through structured phases to solve complex problems. Features real-time token streaming, sophisticated context management, and a React UI optimized for handling 10,000+ tokens without performance degradation.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)
![Node](https://img.shields.io/badge/Node.js-18+-green.svg)
![React](https://img.shields.io/badge/React-18+-61DAFB.svg)

## 📸 Screenshots

#### PHASE: `BRAINSTORM`
![Screenshot 01](https://i.imgur.com/CZ2Zkfg.png)
#### PHASE: `CRITIQUE`
![Screenshot 02](https://i.imgur.com/7kAYjt5.png)
#### PHASE: `REVISE`
![Screenshot 03](https://i.imgur.com/IbdPAu8.png)
#### PHASE: `CONSENSUS`
![Screenshot 04](https://i.imgur.com/QfvhOpE.png)

## 🌟 Key Features

- **Multi-Phase Collaboration**: LLMs progress through phases: `BRAINSTORM → CRITIQUE → REVISE → SYNTHESIZE → CONSENSUS`
- **Dual-Model Architecture**: Gemma (12B) and Qwen (14B) models work together with specialized roles
- **Real-Time Streaming**: Server-Sent Events (SSE) for smooth token streaming with batching optimization
- **Advanced Context Management**: Gemini-inspired token allocation algorithm prevents context overflow
- **Memory System**: Redis vector store with semantic search using Xenova embeddings
- **Performance First**: Handles 10,000+ tokens without UI lag through optimized rendering
- **Context Pooling**: Prevents GPU memory exhaustion with intelligent model context management
- **Mathematical Verification**: Built-in verification system catches calculation and logic errors

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
├──────────────────────────────────────────────────────────────┤
│                          SSE Stream                          │
├──────────────────────────────────────────────────────────────┤
│                    Backend (Express + TS)                    │
├──────────────────────────────────────────────────────────────┤
│  CollaborationOrchestrator │ ModelService │ StreamingService │
├──────────────────────────────────────────────────────────────┤
│   ConversationStateManager │ ContextAllocator │ TokenCounter │
├──────────────────────────────────────────────────────────────┤
│        Redis Vector Store  │  GGUF Models  │  Embeddings     │
└──────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

See our comprehensive [Installation Guide](INSTALL.md) for detailed setup instructions.

### Prerequisites

- Node.js 18+ and npm
- Redis server
- 16GB+ RAM recommended
- GGUF model files (5-8GB each)

### Quick Install

```bash
# Clone and install
git clone https://github.com/slyfox1186/synergize.git
cd synergize
npm install

# Download models (see INSTALL.md for details)
mkdir -p models
# Download the GGUF files to models/ directory

# Start Redis and run
redis-server
npm run dev
```

Open `http://localhost:3000` to access the application.

### Models

Download these GGUF models and place them in the `models/` directory:

1. **Gemma 3 12B IT Q4_0** (Primary model)
   - Filename: `gemma-3-12b-it-q4-0.gguf`
   - Quantization: 4-bit (Q4_0)
   - Role: Participant and curator
   
2. **Qwen 3 14B UD Q4_K_XL** (Secondary model)  
   - Filename: `qwen3-14b-ud-q4-k-xl.gguf`
   - Quantization: 4-bit K-quant extra large (Q4_K_XL)
   - Role: Verification and critique

Download the specific quantized models from:
- **Qwen 3 14B UD Q4_K_XL**: https://huggingface.co/unsloth/Qwen3-14B-GGUF
- **Gemma 3 12B IT Q4_0**: https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf

## 📖 Usage

1. **Start the application**: Run `npm run dev`
2. **Open the UI**: Navigate to `http://localhost:3000`
3. **Select models**: Choose Gemma and Qwen from the dropdowns
4. **Enter your prompt**: Type a complex question or problem
5. **Initiate collaboration**: Click the button and watch the models work together

### Example Prompts

- "Calculate the compound interest on $10,000 at 5% annually for 10 years"
- "Design a REST API for a task management system with authentication"
- "Explain quantum entanglement and its applications in computing"

## 🛠️ Configuration

### Environment Variables

```env
# Server
PORT=8000
REDIS_URL=redis://localhost:6379

# Frontend
VITE_PORT=3000
VITE_API_URL=http://localhost:8000

# Model Settings
MODEL_CONTEXT_SIZE=4096
MODEL_BATCH_SIZE=512
CONTEXTS_PER_MODEL=2
MAX_CONCURRENT_INFERENCES=2

# Features
ENABLE_CONVERSATION_COMPRESSION=true
```

### Token Allocation

The system uses sophisticated token budgeting per phase:
- BRAINSTORM: 30% of context
- CRITIQUE: 25% of context
- REVISE: 20% of context
- SYNTHESIZE: 15% of context
- CONSENSUS: 10% of context

## 🧪 Development

### Commands

```bash
npm run dev          # Start development server (frontend + backend)
npm run build        # Build for production
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run typecheck    # Run TypeScript type checking
npm start            # Start production server
```

### Project Structure

```
synergize/
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── hooks/      # Custom React hooks
│   │   ├── services/   # API services
│   │   └── store/      # Zustand state management
├── backend/            # Express backend
│   ├── src/
│   │   ├── controllers/# Request handlers
│   │   ├── services/   # Business logic
│   │   ├── models/     # Type definitions
│   │   └── utils/      # Utilities
├── models/             # GGUF model files (gitignored)
└── CLAUDE.md          # AI assistant instructions
```

## 🔧 API Endpoints

### REST API

- `POST /api/synergize/initiate` - Start a new collaboration session
- `GET /api/synergize/stream/:sessionId` - SSE endpoint for token streaming
- `GET /api/models` - List available models
- `GET /health` - Health check

### SSE Message Types

- `TOKEN_CHUNK` - Streaming tokens from models
- `PHASE_UPDATE` - Phase transition notifications
- `SYNTHESIS_UPDATE` - Final synthesis tokens
- `STATUS_UPDATE` - System status messages
- `ERROR` - Error notifications

## 🧠 How It Works

1. **Initialization**: User prompt triggers collaboration session
2. **Phase Progression**: Models advance through structured phases
3. **Token Streaming**: Real-time updates via SSE with batching
4. **Context Management**: Dynamic token allocation prevents overflow
5. **Memory Enhancement**: Vector search retrieves relevant context
6. **Verification**: Qwen validates mathematical/logical accuracy
7. **Synthesis**: Final answer combines best insights from all phases

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) for GGUF model support
- Uses [Xenova Transformers](https://github.com/xenova/transformers.js) for embeddings
- Inspired by collaborative AI research and multi-agent systems

## ⚠️ Known Issues

- First model load can take 30-60 seconds
- Requires significant RAM for larger models
- Redis must be running for the application to start

## 🔮 Future Enhancements

- [ ] Support for additional models
- [ ] Persistent conversation history
- [ ] Model fine-tuning interface
- [ ] Distributed model serving
- [ ] WebSocket support as alternative to SSE
- [ ] Comprehensive test suite

---

Made with ❤️ by the Synergize team
