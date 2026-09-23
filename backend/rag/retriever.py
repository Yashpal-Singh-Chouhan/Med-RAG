import chromadb
from rag.ingest import get_embedding_function, CHROMA_PERSIST_DIR


def get_vector_store(collection_name: str = "langchain"):
    """
    Returns a Chroma vector store instance bound to a specific collection.
    """
    from langchain_community.vectorstores import Chroma

    embeddings = get_embedding_function()
    return Chroma(
        collection_name=collection_name,
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=embeddings
    )


def get_retriever(collection_name: str = "langchain", k: int = 4):
    """
    Returns a LangChain retriever for the specified collection.
    """
    vector_store = get_vector_store(collection_name)
    return vector_store.as_retriever(
        search_kwargs={"k": k}
    )


def retrieve_with_scores(collection_name: str = "langchain", query: str = "", k: int = 4):
    """
    Searches the isolated collection and returns a list of (Document, confidence_score_percent).
    Calculates confidence percentage based on cosine similarity from distance.
    """
    vector_store = get_vector_store(collection_name)
    results = vector_store.similarity_search_with_score(query, k=k)

    scored_docs = []
    for doc, distance in results:
        # For normalized sentence-transformers embeddings, squared L2 distance:
        # distance = 2 * (1 - cosine_similarity), so cosine_similarity = 1 - distance / 2
        cosine_sim = 1.0 - (float(distance) / 2.0)
        # Convert to an intuitive percentage between 10% and 99%
        confidence = int(round(max(0.10, min(0.99, cosine_sim)) * 100))
        scored_docs.append((doc, confidence))

    return scored_docs


def delete_vector_collection(collection_name: str) -> bool:
    """
    Permanently deletes a collection and its vectors from ChromaDB.
    """
    try:
        client = chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)
        collections = [col.name for col in client.list_collections()]
        if collection_name in collections:
            client.delete_collection(name=collection_name)
            print(f"ChromaDB collection '{collection_name}' deleted successfully.")
            return True
        else:
            print(f"ChromaDB collection '{collection_name}' not found; nothing to delete.")
            return False
    except Exception as e:
        print(f"Error deleting ChromaDB collection '{collection_name}': {e}")
        return False