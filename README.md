# High-Performance Embedding API

FastAPI application with optimized parallel processing for embeddings using the `togethercomputer/m2-bert-80M-32k-retrieval` model. Optimized for both MPS (Apple Silicon) and CPU with insane parallel processing capabilities.

## Features

- **768-dimensional embeddings** from m2-bert-80M-32k-retrieval
- **MPS & CPU optimized** - automatically selects best device
- **Parallel batch processing** - process multiple queries simultaneously
- **Async processing** - non-blocking with thread pool execution
- **Mean pooling** with attention masking
- **L2 normalization** - all embeddings are normalized
- **Production-ready** - includes health checks and comprehensive API docs

## Performance

- **~50ms per query** on Apple Silicon (MPS)
- **~152ms for 3 queries** processed in parallel
- Supports up to 32k token context length

## API Endpoints

### POST `/embed`
Generate embeddings for single or multiple queries.

**Request:**
```json
{
  "query": "What is machine learning?"
}
```

Or batch:
```json
{
  "query": ["Query 1", "Query 2", "Query 3"]
}
```

**Response:**
```json
{
  "embeddings": [[...768 floats...]],
  "dimension": 768,
  "count": 1
}
```

### POST `/embed/batch`
Alternative batch endpoint that accepts a direct list of strings.

**Request:**
```json
["Query 1", "Query 2", "Query 3"]
```

### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "model": "togethercomputer/m2-bert-80M-32k-retrieval",
  "device": "mps",
  "embedding_dimension": 768
}
```

## Local Development

### Prerequisites
- Python 3.10+
- pip

### Setup

1. Create virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
python api.py
```

The API will be available at `http://localhost:8000`

Interactive docs: `http://localhost:8000/docs`

## Deploy to Railway

### Quick Deploy

1. **Create a Railway account** at [railway.app](https://railway.app)

2. **Create a new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account and select this repository

3. **Railway will automatically:**
   - Detect the `Procfile` and `railway.json`
   - Install dependencies from `requirements.txt`
   - Start the server with uvicorn
   - Assign a public URL

4. **Environment Variables** (optional):
   - No environment variables required by default
   - Railway automatically provides `$PORT`

5. **Monitor your deployment:**
   - Check logs in Railway dashboard
   - Visit your public URL at `https://your-app.up.railway.app`
   - Test the API at `https://your-app.up.railway.app/docs`

### Railway Configuration

The deployment is configured via:
- `Procfile` - defines the web process command
- `railway.json` - Railway-specific build and deploy settings
- `.railwayignore` - excludes unnecessary files from deployment

### Resource Requirements

Recommended Railway plan:
- **Memory:** 4GB minimum (model loading + inference)
- **CPU:** 2+ cores for optimal parallel processing
- **Storage:** 2GB minimum for model cache

**Note:** Railway's free tier may be insufficient for this application. Consider the Hobby or Pro plan for production use.

## Testing

### Single Query
```bash
curl -X POST "http://localhost:8000/embed" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is machine learning?"}'
```

### Batch Queries
```bash
curl -X POST "http://localhost:8000/embed" \
  -H "Content-Type: application/json" \
  -d '{"query": ["What is machine learning?", "How does deep learning work?", "Explain neural networks"]}'
```

### Health Check
```bash
curl http://localhost:8000/health
```

## Architecture

### Components

1. **EmbeddingService** (`embedings.py`):
   - Device optimization (MPS/CUDA/CPU)
   - Batch processing with configurable batch size
   - Thread pool for parallel execution
   - Mean pooling with attention masking
   - L2 normalization

2. **FastAPI App** (`api.py`):
   - Async endpoint handlers
   - Request/response validation with Pydantic
   - Lifespan management for model loading
   - Comprehensive error handling

### Optimizations

- **Device Selection:** Automatically uses MPS (Apple Silicon), CUDA (NVIDIA), or CPU
- **Parallel Processing:** Thread pool executor for concurrent batch processing
- **Async/Await:** Non-blocking request handling
- **Mean Pooling:** Efficient token-level to sequence-level aggregation
- **Inference Mode:** PyTorch inference mode for reduced memory and faster inference

## License

MIT

## Model Information

This API uses the `togethercomputer/m2-bert-80M-32k-retrieval` model from Hugging Face.

- **Model Size:** 80M parameters
- **Context Length:** 32k tokens
- **Embedding Dimension:** 768
- **License:** Check model card on Hugging Face
