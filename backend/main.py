import json
import logging
import os
import shutil
import time
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from rag.ingest import create_vector_database
from rag.retriever import delete_vector_collection
from rag.chatbot import ask_medrag, ask_medrag_stream

# ------------------------------------------------------------------
# Logging setup
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("medrag-api")

app = FastAPI(
    title="MedRAG API",
    description="Medical Retrieval-Augmented Generation Assistant with Multi-Document & Conversation Memory",
    version="2.0.0"
)

# ------------------------------------------------------------------
# CORS — allows the Next.js frontend (local and deployed on Vercel)
# ------------------------------------------------------------------
origins_env = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
if origins_env and origins_env != "*":
    allowed_origins.extend([o.strip() for o in origins_env.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if origins_env == "*" else allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------
# Document Registry (Persisted to ./data/documents.json)
# ------------------------------------------------------------------
UPLOAD_DIR = "./data"
REGISTRY_FILE = os.path.join(UPLOAD_DIR, "documents.json")
os.makedirs(UPLOAD_DIR, exist_ok=True)

documents: dict[str, dict[str, Any]] = {}


def load_registry():
    """Loads document metadata from JSON file on disk."""
    global documents
    if os.path.exists(REGISTRY_FILE):
        try:
            with open(REGISTRY_FILE, "r", encoding="utf-8") as f:
                documents = json.load(f)
            logger.info(f"Loaded {len(documents)} document(s) from registry file.")
        except Exception as e:
            logger.error(f"Failed to read registry file: {e}")
            documents = {}
    else:
        documents = {}


def save_registry():
    """Saves document metadata to JSON file on disk."""
    try:
        with open(REGISTRY_FILE, "w", encoding="utf-8") as f:
            json.dump(documents, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save registry file: {e}")


# Initialize registry on import
load_registry()


# ------------------------------------------------------------------
# Request / Response models
# ------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'ai' / 'assistant'")
    content: str = Field(..., description="Message text content")


class QuestionRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="User question")
    document_id: Optional[str] = Field(None, description="Target document ID")
    chat_history: Optional[List[ChatMessage]] = Field(default_factory=list, description="Recent conversation turns")
    stream: Optional[bool] = Field(False, description="Whether to stream response via SSE")


# ------------------------------------------------------------------
# Health & Status Endpoints
# ------------------------------------------------------------------
@app.get("/")
def home():
    return {
        "name": "MedRAG API",
        "version": "2.0.0",
        "status": "running",
        "documents_available": len(documents)
    }


@app.get("/health")
def health():
    """Health check endpoint used by frontend to monitor connectivity and document state."""
    return {
        "status": "ok",
        "documents_loaded": len(documents),
        "documents": [
            {
                "id": doc_id,
                "filename": info["filename"],
                "page_count": info.get("page_count", 0),
                "chunk_count": info.get("chunk_count", 0),
                "upload_time": info.get("upload_time", ""),
                "status": info.get("status", "ready")
            }
            for doc_id, info in documents.items()
        ]
    }


# ------------------------------------------------------------------
# Document Management Endpoints (Stage 4)
# ------------------------------------------------------------------
@app.get("/documents")
def list_documents():
    """Returns the list of all registered medical documents."""
    return [
        {
            "id": doc_id,
            "filename": info["filename"],
            "collection_name": info["collection_name"],
            "page_count": info.get("page_count", 0),
            "chunk_count": info.get("chunk_count", 0),
            "upload_time": info.get("upload_time", ""),
            "status": info.get("status", "ready")
        }
        for doc_id, info in documents.items()
    ]


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Accepts a PDF upload, extracts text, chunks it, embeds it into a per-document Chroma collection,
    and returns document metadata.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents are supported (.pdf)."
        )

    # Generate isolated ID and collection name
    doc_id = str(uuid.uuid4())[:8]
    collection_name = f"doc_{doc_id}"
    safe_filename = f"{doc_id}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Save PDF to disk
    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save file: {str(e)}"
        )

    # Register initial processing state
    upload_timestamp = datetime.now(timezone.utc).isoformat()
    documents[doc_id] = {
        "id": doc_id,
        "filename": file.filename,
        "file_path": file_path,
        "collection_name": collection_name,
        "upload_time": upload_timestamp,
        "status": "processing"
    }
    save_registry()

    # Run ingestion pipeline
    try:
        stats = create_vector_database(
            pdf_path=file_path,
            collection_name=collection_name,
            doc_id=doc_id
        )
        documents[doc_id].update({
            "status": "ready",
            "page_count": stats.get("page_count", 0),
            "chunk_count": stats.get("chunk_count", 0),
        })
        save_registry()
        logger.info(f"Document '{file.filename}' processed successfully (ID: {doc_id})")
    except Exception as e:
        documents[doc_id]["status"] = "failed"
        save_registry()
        logger.error(f"Document ingestion failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process document: {str(e)}"
        )

    return {
        "document_id": doc_id,
        "filename": file.filename,
        "collection_name": collection_name,
        "page_count": documents[doc_id].get("page_count", 0),
        "chunk_count": documents[doc_id].get("chunk_count", 0),
        "upload_time": upload_timestamp,
        "status": "ready",
        "message": "Document processed and indexed successfully."
    }


@app.delete("/documents/{document_id}")
def delete_document(document_id: str):
    """
    Deletes a document from the registry, removes its ChromaDB vector collection,
    and removes the file from disk.
    """
    if document_id not in documents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found."
        )

    doc_info = documents[document_id]
    collection_name = doc_info.get("collection_name", f"doc_{document_id}")
    file_path = doc_info.get("file_path")

    # 1. Remove vector collection from Chroma
    delete_vector_collection(collection_name)

    # 2. Remove file from disk
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info(f"Removed file {file_path}")
        except Exception as e:
            logger.warning(f"Failed to delete file {file_path}: {e}")

    # 3. Remove from registry and persist
    del documents[document_id]
    save_registry()
    logger.info(f"Document {document_id} deleted successfully.")

    return {
        "success": True,
        "message": f"Document '{doc_info.get('filename')}' and its vector index were removed.",
        "id": document_id
    }


# ------------------------------------------------------------------
# Query / Ask Endpoints (Stage 4, 5 & 6)
# ------------------------------------------------------------------
@app.post("/ask")
def ask_question(data: QuestionRequest):
    """
    Queries MedRAG with question, target document_id, and conversation history.
    Supports both JSON response and SSE streaming (when stream=True).
    """
    # Resolve target collection
    collection_name = "langchain"  # default fallback
    if data.document_id:
        if data.document_id not in documents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID '{data.document_id}' not found."
            )
        collection_name = documents[data.document_id].get("collection_name", f"doc_{data.document_id}")
    elif len(documents) == 1:
        # If only 1 document is uploaded, default to it
        single_doc = next(iter(documents.values()))
        collection_name = single_doc.get("collection_name", "langchain")

    history_dicts = [m.model_dump() for m in (data.chat_history or [])]

    if data.stream:
        return StreamingResponse(
            ask_medrag_stream(
                question=data.question,
                collection_name=collection_name,
                chat_history=history_dicts
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming JSON response
    result = ask_medrag(
        question=data.question,
        collection_name=collection_name,
        chat_history=history_dicts
    )
    return result


@app.post("/ingest")
def ingest():
    """Legacy endpoint — processes the hardcoded PDF. Kept for backward compatibility."""
    stats = create_vector_database(
        pdf_path="./data/HBprelims.pdf",
        collection_name="langchain"
    )
    return {
        "message": "Vector DB Created",
        "stats": stats
    }