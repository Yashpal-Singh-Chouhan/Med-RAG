import json
import logging
import os
from typing import Generator
import google.generativeai as genai
from dotenv import load_dotenv

from rag.retriever import retrieve_with_scores

load_dotenv()
logger = logging.getLogger("medrag")

genai.configure(
    api_key=os.getenv("GEMINI_API_KEY")
)

model = genai.GenerativeModel(
    "gemini-2.5-flash"
)

# ------------------------------------------------------------------
# System prompt — the heart of medical RAG safety
# ------------------------------------------------------------------
SYSTEM_PROMPT = """You are MedRAG, a medical document retrieval assistant.

YOUR ROLE:
You help users understand the content of medical documents they have uploaded.
You are NOT a doctor. You are a document search and retrieval tool.

STRICT RULES:

1. ANSWER ONLY FROM THE PROVIDED CONTEXT.
   - Every claim you make must come from the context passages below.
   - If you cannot find the answer in the context, respond with:
     "I could not find this information in the provided document. Try rephrasing your question or uploading a document that covers this topic."
   - NEVER invent, guess, or use your general medical knowledge to fill gaps.

2. CITE YOUR SOURCES.
   - When you reference information, mention the page number in your answer.
   - Example: "According to the document (Page 27), the danger signs include..."

3. MEDICAL SAFETY.
   - Do NOT make diagnoses or suggest treatments.
   - Do NOT say "you should take" or "you have" — you are not treating a patient.
   - If a user asks for a diagnosis, respond:
     "I can help you find information in your document, but I cannot provide medical diagnoses. Please consult a qualified healthcare professional."
   - Use hedging language: "According to the document...", "The text states...", "Based on the provided material..."

4. HONESTY AND TRANSPARENCY.
   - If the context is ambiguous or incomplete, say so.
   - If multiple interpretations are possible, present them.
   - Do not oversimplify medical information in ways that could be dangerous.

5. FORMAT.
   - Use clear, organized responses.
   - Use bullet points for lists.
   - Keep responses concise but thorough.
   - Use simple language when possible, but preserve medical terminology when it matters.
"""

REFORMULATION_PROMPT = """You are an AI assistant helping a medical document retrieval system.
Given the conversation history and a follow-up question from the user, rewrite the follow-up question to be a standalone, self-contained medical query that can be used to search a vector database.

STRICT RULES:
1. Resolve any pronouns (like "it", "they", "that", "these symptoms", "the medication") using the context of prior messages.
2. If the user asks for a simplification (e.g., "explain that more simply", "summarize in 3 bullets"), include the medical topic being discussed.
3. If the user question is ALREADY standalone and does not depend on prior messages, output it EXACTLY as is.
4. DO NOT answer the question.
5. Output ONLY the rewritten standalone question, nothing else.
"""


def reformulate_question(question: str, chat_history: list | None = None) -> str:
    """
    Rewrites a follow-up question into a standalone vector query if conversation history is present.
    """
    if not chat_history or len(chat_history) == 0:
        return question.strip()

    # Take up to the last 6 messages for context
    recent_history = chat_history[-6:]
    history_lines = []
    for msg in recent_history:
        role = "User" if msg.get("role") == "user" else "MedRAG"
        content = msg.get("content", "").strip()
        if content:
            # Truncate very long past messages to avoid token bloat
            truncated = content[:300] + "..." if len(content) > 300 else content
            history_lines.append(f"{role}: {truncated}")

    history_str = "\n".join(history_lines)

    prompt = f"""{REFORMULATION_PROMPT}

CONVERSATION HISTORY:
{history_str}

USER FOLLOW-UP QUESTION:
{question}

STANDALONE QUESTION:"""

    try:
        response = model.generate_content(prompt)
        rewritten = response.text.strip() if response and response.text else question
        # If the model echoed extra quotes or prefixes, clean them
        if rewritten.lower().startswith("standalone question:"):
            rewritten = rewritten[len("standalone question:"):].strip()
        rewritten = rewritten.strip('"`')
        logger.info(f"Query reformulated: '{question}' -> '{rewritten}'")
        return rewritten if rewritten else question
    except Exception as e:
        logger.warning(f"Query reformulation failed: {e}. Falling back to original question.")
        return question.strip()


def build_context_block(scored_docs):
    """
    Build a structured context block from retrieved documents.
    Each chunk is labeled with its page number and relevance score.
    """
    context_parts = []
    for i, (doc, score) in enumerate(scored_docs, 1):
        page = doc.metadata.get("page", "Unknown")
        display_page = page + 1 if isinstance(page, int) else page
        context_parts.append(
            f"[Source {i} — Page {display_page} (Match Confidence: {score}%)]\n{doc.page_content}"
        )

    return "\n\n---\n\n".join(context_parts)


def extract_best_excerpt(chunk_text, max_length=250):
    """
    Extract the most meaningful excerpt from a chunk.
    Takes the first complete sentence(s) that fit within max_length.
    """
    sentences = []
    current = ""
    for char in chunk_text:
        current += char
        if char in ".!?" and len(current.strip()) > 10:
            sentences.append(current.strip())
            current = ""

    if current.strip():
        sentences.append(current.strip())

    excerpt = ""
    for sentence in sentences:
        if len(excerpt) + len(sentence) + 1 <= max_length:
            excerpt += (" " if excerpt else "") + sentence
        else:
            break

    if not excerpt:
        excerpt = chunk_text[:max_length].strip()
        if len(chunk_text) > max_length:
            excerpt += "..."

    return excerpt


def build_sources_list(scored_docs):
    """
    Deduplicates and formats source citations with confidence scores.
    """
    sources = []
    seen_pages = set()

    for doc, score in scored_docs:
        page = doc.metadata.get("page", "Unknown")
        display_page = page + 1 if isinstance(page, int) else page

        if display_page in seen_pages:
            continue
        seen_pages.add(display_page)

        excerpt = extract_best_excerpt(doc.page_content)
        source_name = doc.metadata.get("source") or doc.metadata.get("filename") or "Uploaded Document"
        if "/" in source_name or "\\" in source_name:
            source_name = source_name.replace("\\", "/").split("/")[-1]

        sources.append({
            "page": display_page,
            "excerpt": excerpt,
            "document": source_name,
            "confidence": score
        })

    return sources


def build_final_prompt(question: str, context: str, chat_history: list | None = None) -> str:
    """
    Assembles the final prompt with system instructions, context, history, and user question.
    """
    history_block = ""
    if chat_history and len(chat_history) > 0:
        recent = chat_history[-6:]
        lines = []
        for msg in recent:
            role = "User" if msg.get("role") == "user" else "MedRAG"
            lines.append(f"{role}: {msg.get('content', '')}")
        history_block = "\n--- RECENT CONVERSATION HISTORY ---\n" + "\n".join(lines) + "\n--- END OF HISTORY ---\n"

    return f"""{SYSTEM_PROMPT}

--- CONTEXT FROM UPLOADED DOCUMENT ---

{context}

--- END OF CONTEXT ---
{history_block}
USER QUESTION: {question}

Provide a grounded answer using ONLY the context above. Cite page numbers where applicable."""


def ask_medrag(question: str, collection_name: str = "langchain", chat_history: list | None = None):
    """
    Synchronous / non-streaming answer generation.
    """
    standalone_query = reformulate_question(question, chat_history)
    scored_docs = retrieve_with_scores(collection_name=collection_name, query=standalone_query, k=4)

    context = build_context_block(scored_docs)
    sources = build_sources_list(scored_docs)
    prompt = build_final_prompt(question, context, chat_history)

    response = model.generate_content(prompt)

    return {
        "answer": response.text,
        "sources": sources,
        "standalone_query": standalone_query
    }


def ask_medrag_stream(
    question: str, collection_name: str = "langchain", chat_history: list | None = None
) -> Generator[str, None, None]:
    """
    Server-Sent Events (SSE) generator for real-time token streaming.
    Yields formatted lines: data: <json_string>\n\n
    """
    try:
        standalone_query = reformulate_question(question, chat_history)
        scored_docs = retrieve_with_scores(collection_name=collection_name, query=standalone_query, k=4)
        sources = build_sources_list(scored_docs)
        context = build_context_block(scored_docs)
        prompt = build_final_prompt(question, context, chat_history)

        # Emit initial metadata with sources & reformulated query
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources, 'standalone_query': standalone_query})}\n\n"

        # Stream LLM tokens
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield f"data: {json.dumps({'type': 'token', 'token': chunk.text})}\n\n"

        # Emit completion signal
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"Streaming error in ask_medrag_stream: {e}", exc_info=True)
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"