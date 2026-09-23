import os
import google.generativeai as genai
from dotenv import load_dotenv
from langchain_core.embeddings import Embeddings
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

CHROMA_PERSIST_DIR = "./chroma_db"
GEMINI_EMBEDDING_MODEL = "models/gemini-embedding-001"

class GeminiEmbeddings(Embeddings):

    """
    Lightweight, cloud-native embeddings using the Gemini API.
    Zero local memory footprint (runs comfortably in under 80MB on Render's 512MB free tier).
    """
    def __init__(self, model_name: str = GEMINI_EMBEDDING_MODEL):
        self.model_name = model_name

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # Process in batches of 40 to stay well within API payload limits
        embeddings = []
        batch_size = 40
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            res = genai.embed_content(model=self.model_name, content=batch)
            embeddings.extend(res["embedding"])
        return embeddings

    def embed_query(self, text: str) -> list[float]:
        res = genai.embed_content(model=self.model_name, content=text)
        return res["embedding"]

_embeddings = None

def get_embedding_function():
    global _embeddings
    if _embeddings is None:
        _embeddings = GeminiEmbeddings()
    return _embeddings



def create_vector_database(pdf_path: str, collection_name: str = "langchain", doc_id: str | None = None):
    """
    Ingests a PDF file into an isolated ChromaDB collection.
    
    Args:
        pdf_path: Path to the PDF file on disk.
        collection_name: Name of the Chroma collection (e.g. 'doc_abc123').
        doc_id: Optional unique document identifier.
        
    Returns:
        dict: Ingestion statistics including page_count and chunk_count.
    """
    print(f"Loading PDF from: {pdf_path}")
    loader = PyMuPDFLoader(pdf_path)
    documents = loader.load()
    page_count = len(documents)
    print(f"Loaded {page_count} pages from {os.path.basename(pdf_path)}")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )

    chunks = splitter.split_documents(documents)
    chunk_count = len(chunks)
    print(f"Created {chunk_count} chunks for collection '{collection_name}'")

    # Enrich metadata on all chunks
    source_filename = os.path.basename(pdf_path)
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_index"] = i
        chunk.metadata["filename"] = source_filename
        if doc_id:
            chunk.metadata["doc_id"] = doc_id

    embeddings = get_embedding_function()

    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=collection_name,
        persist_directory=CHROMA_PERSIST_DIR
    )

    vector_store.persist()
    print(f"Vector Database collection '{collection_name}' persisted successfully")

    return {
        "page_count": page_count,
        "chunk_count": chunk_count,
        "collection_name": collection_name
    }