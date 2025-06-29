#!/bin/bash

echo "🚀 Starting Synergize..."

# Check and kill any processes using required ports
echo "🔍 Checking for port conflicts..."

# Check port 8000 (backend)
if lsof -ti:8000 >/dev/null 2>&1; then
    echo "   Port 8000 is in use, killing process..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    echo "   ✅ Killed process on port 8000"
else
    echo "   ✅ Port 8000 is free"
fi

# Check port 3000 (frontend dev) - only in development mode
if [ "$NODE_ENV" != "production" ]; then
    if lsof -ti:3000 >/dev/null 2>&1; then
        echo "   Port 3000 is in use, killing process..."
        lsof -ti:3000 | xargs kill -9 2>/dev/null
        echo "   ✅ Killed process on port 3000"
    else
        echo "   ✅ Port 3000 is free"
    fi
fi

# Check if Redis is available
echo "Checking Redis connection..."
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Please start Redis first:"
    echo "   sudo systemctl start redis"
    echo "   or"
    echo "   redis-server"
    exit 1
fi
echo "✅ Redis is running"

# Check if models directory has GGUF files
if [ ! -d "models" ] || [ -z "$(ls -A models/*.gguf 2>/dev/null)" ]; then
    echo "⚠️  No GGUF models found in ./models directory"
    echo "Please add your GGUF model files to the models/ directory"
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "⚠️  No .env file found, using defaults"
    cp .env.example .env 2>/dev/null || true
fi

# Set backend port to match frontend proxy expectations
export PORT=8000

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Build in production mode
if [ "$NODE_ENV" = "production" ]; then
    echo "🧹 Cleaning old build artifacts..."
    rm -rf dist frontend/dist
    
    echo "🔨 Building for production..."
    npm run build
    
    # Start production server
    echo "🌟 Starting production server on port ${PORT:-8000}..."
    node dist/backend/server.js
else
    # Start development server
    echo "🔧 Starting development servers..."
    npm run dev
fi