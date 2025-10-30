from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Union
from embedings import OptimizedEmbeddingService
import asyncio
from contextlib import asynccontextmanager


# Global service instance
embedding_service = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    global embedding_service

    # Startup: Initialize the embedding service
    print("Initializing embedding service...")
    embedding_service = OptimizedEmbeddingService(
        model_name="togethercomputer/m2-bert-80M-32k-retrieval",
        max_workers=None,  # Auto-detect optimal workers
        batch_size=32,
        max_length=512,
    )
    print(f"Embedding dimension: {embedding_service.get_embedding_dimension()}")
    print("Service ready!")

    yield

    # Shutdown: Cleanup
    print("Shutting down...")
    del embedding_service


# Create FastAPI app with lifespan management
app = FastAPI(
    title="Optimized Embedding API",
    description="High-performance embedding API with MPS/CPU optimization and parallel processing",
    version="1.0.0",
    lifespan=lifespan
)


# Request/Response models
class EmbeddingRequest(BaseModel):
    """Request model for embedding generation."""
    query: Union[str, List[str]] = Field(
        ...,
        description="Single query string or list of query strings to embed"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "query": "What is the capital of France?"
                },
                {
                    "query": [
                        "What is the capital of France?",
                        "How does photosynthesis work?",
                        "Explain quantum computing"
                    ]
                }
            ]
        }
    }


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation."""
    embeddings: Union[List[float], List[List[float]]] = Field(
        ...,
        description="Embedding vector(s) for the input query/queries"
    )
    dimension: int = Field(
        ...,
        description="Dimension of the embedding vectors"
    )
    count: int = Field(
        ...,
        description="Number of embeddings returned"
    )


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model: str
    device: str
    embedding_dimension: int


# API Endpoints
@app.get("/", response_model=dict)
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Optimized Embedding API",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    if embedding_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    return HealthResponse(
        status="healthy",
        model=embedding_service.model_name,
        device=str(embedding_service.device),
        embedding_dimension=embedding_service.get_embedding_dimension()
    )


@app.post("/embed", response_model=EmbeddingResponse)
async def embed(request: EmbeddingRequest):
    """
    Generate embeddings for query/queries with optimized parallel processing.

    This endpoint supports both single query strings and batches of queries.
    Batching is highly optimized with automatic parallelization.
    """
    if embedding_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    try:
        # Generate embeddings asynchronously
        embeddings = await embedding_service.embed_async(request.query)

        # Determine count and dimension
        if isinstance(embeddings[0], list):
            count = len(embeddings)
            dimension = len(embeddings[0])
        else:
            count = 1
            dimension = len(embeddings)

        return EmbeddingResponse(
            embeddings=embeddings,
            dimension=dimension,
            count=count
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating embeddings: {str(e)}"
        )


@app.post("/embed/batch", response_model=EmbeddingResponse)
async def embed_batch(queries: List[str]):
    """
    Optimized batch embedding endpoint for multiple queries.

    This is an alternative endpoint that accepts a direct list of strings
    for convenience when you know you'll be processing multiple queries.
    """
    if embedding_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    if not queries:
        raise HTTPException(status_code=400, detail="Query list cannot be empty")

    try:
        # Generate embeddings asynchronously
        embeddings = await embedding_service.embed_async(queries)

        return EmbeddingResponse(
            embeddings=embeddings,
            dimension=len(embeddings[0]),
            count=len(embeddings)
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating embeddings: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        reload=False,  # Disable reload for production
        workers=1,  # Use 1 worker to share model in memory
        log_level="info"
    )
