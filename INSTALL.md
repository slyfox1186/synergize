# Installation Guide

This guide will help you install and run Synergize on your local machine.

## 📋 Prerequisites

Before installing Synergize, ensure you have:

- **Node.js** 18.0 or higher ([Download](https://nodejs.org/))
- **npm** 9.0 or higher (comes with Node.js)
- **Redis** 6.0 or higher ([Download](https://redis.io/download/))
- **Git** (for cloning the repository)
- **16GB RAM** minimum (recommended 32GB for optimal performance)
- **10GB free disk space** (for models and dependencies)

### Optional but Recommended

- **NVIDIA GPU** with CUDA support for faster inference
- **CUDA Toolkit** 12.4+ ([Download](https://developer.nvidia.com/cuda-downloads))

## 🚀 Quick Install

```bash
# Clone the repository
git clone https://github.com/slyfox1186/synergize.git
cd synergize

# Install dependencies
npm install

# Download required models (automated script)
npm run download-models

# Start Redis
redis-server

# Start the application
npm run dev
```

## 📦 Detailed Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/slyfox1186/synergize.git
cd synergize
```

### Step 2: Install Dependencies

```bash
# Install all dependencies (frontend + backend)
npm install

# If you encounter issues, try:
npm install --legacy-peer-deps
```

### Step 3: Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your preferred settings (optional)
nano .env  # or use your favorite editor
```

Default environment settings:
```env
# Server Configuration
PORT=8000
REDIS_URL=redis://localhost:6379

# Frontend Configuration  
VITE_PORT=3000
VITE_API_URL=http://localhost:8000

# Model Configuration
MODEL_CONTEXT_SIZE=4096
MODEL_BATCH_SIZE=512
CONTEXTS_PER_MODEL=4
MAX_CONCURRENT_INFERENCES=2

# Features
ENABLE_CONVERSATION_COMPRESSION=true
```

### Step 4: Set Up Redis

#### macOS
```bash
# Install Redis using Homebrew
brew install redis
brew services start redis
```

#### Ubuntu/Debian
```bash
# Install Redis
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Windows
Download and install Redis from [Redis for Windows](https://github.com/tporadowski/redis/releases)

#### Verify Redis is Running
```bash
redis-cli ping
# Should return: PONG
```

### Step 5: Download AI Models

Create the models directory and download required GGUF models:

```bash
# Create models directory
mkdir -p models

# Download models (choose one method)

# Method 1: Using wget
wget -P models/ https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf/resolve/main/gemma-3-12b-it-q4-0.gguf
wget -P models/ https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/qwen3-14b-ud-q4-k-xl.gguf

# Method 2: Using curl
curl -L -o models/gemma-3-12b-it-q4-0.gguf https://huggingface.co/google/gemma-3-12b-it-qat-q4_0-gguf/resolve/main/gemma-3-12b-it-q4-0.gguf
curl -L -o models/qwen3-14b-ud-q4-k-xl.gguf https://huggingface.co/unsloth/Qwen3-14B-GGUF/resolve/main/qwen3-14b-ud-q4-k-xl.gguf
```

**Note**: These files are large (5-8GB each). Download time depends on your internet connection.

### Step 6: Verify Installation

```bash
# Check Node.js version
node --version  # Should be 18.0 or higher

# Check npm version
npm --version   # Should be 9.0 or higher

# Check Redis
redis-cli ping  # Should return PONG

# Check models exist
ls -la models/  # Should show both .gguf files
```

## 🏃 Running Synergize

### Development Mode
```bash
# Start both frontend and backend in development mode
npm run dev

# Or run them separately:
npm run dev:backend   # Backend only on port 8000
npm run dev:frontend  # Frontend only on port 3000
```

### Production Mode
```bash
# Build the application
npm run build

# Start production server
npm start
```

### Access the Application
Open your browser and navigate to: `http://localhost:3000`

## 🔧 Troubleshooting

### Common Issues

#### Redis Connection Error
```bash
Error: Redis connection to localhost:6379 failed
```
**Solution**: Ensure Redis is running: `redis-server`

#### Model Loading Error
```bash
Error: Model file not found: gemma-3-12b-it-q4-0.gguf
```
**Solution**: Verify models are in the `models/` directory

#### Port Already in Use
```bash
Error: listen EADDRINUSE: address already in use :::8000
```
**Solution**: 
- Change the port in `.env` file
- Or kill the process: `lsof -ti:8000 | xargs kill -9`

#### GPU/CUDA Issues
```bash
Warning: GPU not detected, falling back to CPU
```
**Solution**: 
- Ensure CUDA is installed and configured
- Check GPU availability: `nvidia-smi`
- Set `MODEL_GPU_LAYERS=0` in `.env` to force CPU mode

### Performance Issues

If you experience lag during token streaming:

1. **Check System Resources**
   ```bash
   # Monitor CPU and memory usage
   top  # or htop
   ```

2. **Reduce Model Context**
   ```env
   MODEL_CONTEXT_SIZE=2048  # Reduce from 4096
   ```

3. **Limit Concurrent Inferences**
   ```env
   MAX_CONCURRENT_INFERENCES=1  # Reduce from 2
   ```

## 🐳 Docker Installation (Alternative)

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

## 📱 System Requirements

### Minimum Requirements
- **CPU**: 4 cores (8 threads)
- **RAM**: 16GB
- **Storage**: 10GB free space
- **OS**: Windows 10+, macOS 10.15+, Ubuntu 20.04+

### Recommended Requirements
- **CPU**: 8+ cores (16+ threads)
- **RAM**: 32GB
- **GPU**: NVIDIA RTX 3060 or better
- **Storage**: 20GB free space (SSD preferred)

## 🔄 Updating Synergize

```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm install

# Rebuild if needed
npm run build
```

## 🆘 Getting Help

- **Documentation**: Check the [README](README.md) for usage instructions
- **Issues**: Report bugs on [GitHub Issues](https://github.com/slyfox1186/synergize/issues)
- **Discussions**: Join our [GitHub Discussions](https://github.com/slyfox1186/synergize/discussions)

## ✅ Next Steps

After successful installation:

1. Read the [Usage Guide](README.md#-usage) to learn how to use Synergize
2. Try the example prompts to see the system in action
3. Explore the [API Documentation](README.md#-api-endpoints) for advanced usage
4. Consider contributing to the project!

---

**Need help?** Open an issue with your installation logs and system details.