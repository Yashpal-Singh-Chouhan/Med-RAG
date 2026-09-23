"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

// ---- SVG Icon Components ----
const Icons = {
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  Plus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Sparkle: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18M5.636 5.636l12.728 12.728M3 12h18M5.636 18.364L18.364 5.636" />
    </svg>
  ),
  Copy: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  ChevronDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  Send: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  ),
  Paperclip: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  ),
  ArrowDown: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  Trash: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  UploadCloud: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16l-4-4-4 4M12 12v9" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
};

// ---- Suggested Questions ----
const SUGGESTED_QUESTIONS = [
  "Summarize this document in key points",
  "What are the main findings or conclusions?",
  "List any danger signs, risks, or warnings",
  "What treatments or clinical protocols are recommended?",
];

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
let toastCounter = 0;

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type} ${t.exiting ? "toast-exit" : ""}`}
        >
          <span className="toast-icon">
            {t.type === "error" ? "⚠️" : t.type === "success" ? "✅" : "ℹ️"}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================
function MessageBubble({ message, isStreaming = false }) {
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  if (message.role === "user") {
    return (
      <div className="message message-user">
        <div className="message-avatar">👤</div>
        <div className="message-content">
          <div className="message-header">
            <div className="message-label">You</div>
          </div>
          <div className="message-body">{message.content}</div>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="message message-ai">
      <div className="message-avatar">🤖</div>
      <div className="message-content">
        <div className="message-header">
          <div className="message-label">MedRAG</div>
          {message.content && !isStreaming && (
            <button
              className={`copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
              title="Copy response"
            >
              {copied ? <Icons.Check /> : <Icons.Copy />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>

        <div className="markdown-body">
          {message.content ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          ) : isStreaming ? (
            <span className="streaming-placeholder">Analyzing medical document...</span>
          ) : null}
          {isStreaming && <span className="streaming-cursor" />}
        </div>

        {/* Sources toggle with confidence scores */}
        {message.sources && message.sources.length > 0 && (
          <div className="sources-container">
            <button
              className="sources-toggle"
              onClick={() => setShowSources(!showSources)}
            >
              <Icons.Paperclip />
              <span>
                {message.sources.length} Source
                {message.sources.length > 1 ? "s" : ""}
              </span>
              <span className={`sources-toggle-arrow ${showSources ? "open" : ""}`}>
                ▼
              </span>
            </button>

            {showSources && (
              <div className="sources-list">
                {message.sources.map((src, i) => {
                  const conf = src.confidence || 0;
                  const confClass =
                    conf >= 80 ? "conf-high" : conf >= 60 ? "conf-med" : "conf-low";

                  return (
                    <div key={i} className="source-card">
                      <div className="source-card-header">
                        <div className="source-page">
                          <Icons.File />
                          <span>Page {src.page ?? "N/A"}</span>
                          {src.document && (
                            <span className="source-doc-name">— {src.document}</span>
                          )}
                        </div>
                        {conf > 0 && (
                          <span className={`confidence-badge ${confClass}`}>
                            {conf}% Match
                          </span>
                        )}
                      </div>
                      {src.excerpt && (
                        <div className="source-excerpt">"{src.excerpt}"</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN APPLICATION
// ============================================================
export default function Home() {
  // ---- Document State (Stage 4) ----
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // ---- Chat State & Conversation Memory (Stage 5) ----
  // Keyed by document_id: { [doc_id]: Message[] }
  const [conversations, setConversations] = useState({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);

  // ---- UI State ----
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [showScrollFab, setShowScrollFab] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Confirm delete modal state
  const [docToDelete, setDocToDelete] = useState(null);

  // Refs
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Current active document object
  const activeDocument = documents.find((d) => d.id === selectedDocId) || null;
  // Current active messages
  const activeMessages = (selectedDocId && conversations[selectedDocId]) || [];

  // ---- Toast Helpers ----
  const addToast = useCallback((message, type = "info") => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  // ---- Initial Load: Persistence & Documents List ----
  useEffect(() => {
    // 1. Load cached conversations from localStorage
    try {
      const savedConvs = localStorage.getItem("medrag_conversations_v2");
      if (savedConvs) {
        setConversations(JSON.parse(savedConvs));
      }
    } catch (e) {
      console.error("Failed to load cached conversations", e);
    }

    // 2. Fetch documents from backend
    fetchDocuments();
  }, []);

  // Sync conversations to localStorage
  useEffect(() => {
    try {
      if (Object.keys(conversations).length > 0) {
        localStorage.setItem(
          "medrag_conversations_v2",
          JSON.stringify(conversations)
        );
      }
    } catch (e) {
      console.error("Failed to save conversations to localStorage", e);
    }
  }, [conversations]);

  // Fetch document list from backend
  async function fetchDocuments(preferredSelectId = null) {
    try {
      const res = await fetch(`${API_URL}/documents`);
      if (res.ok) {
        const docList = await res.json();
        setDocuments(docList);
        setBackendConnected(true);

        // Determine which document should be selected
        if (preferredSelectId && docList.some((d) => d.id === preferredSelectId)) {
          setSelectedDocId(preferredSelectId);
        } else if (docList.length > 0) {
          // If no doc selected or selected doc no longer exists, select first one
          setSelectedDocId((prev) => {
            if (prev && docList.some((d) => d.id === prev)) return prev;
            return docList[0].id;
          });
        } else {
          setSelectedDocId(null);
        }
      }
    } catch {
      setBackendConnected(false);
    }
  }

  // ---- Connection Heartbeat ----
  useEffect(() => {
    let mounted = true;
    async function checkHealth() {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3500) });
        if (mounted) setBackendConnected(res.ok);
      } catch {
        if (mounted) setBackendConnected(false);
      }
    }

    const interval = setInterval(checkHealth, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, loading, streamingMessageId]);

  // Scroll FAB visibility
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    function handleScroll() {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollFab(distanceFromBottom > 150);
    }

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [selectedDocId]);

  function scrollToBottom() {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // ---- File Upload (Stage 4) ----
  async function handleFileUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      addToast("Please upload a valid PDF document.", "error");
      return;
    }

    setUploading(true);
    setUploadProgress(15);

    const formData = new FormData();
    formData.append("file", file);

    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 7 : prev));
    }, 400);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      clearInterval(progressTimer);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(err.detail || "Upload failed");
      }

      const data = await response.json();
      setUploadProgress(100);

      // Re-fetch document list and auto-select newly uploaded doc
      await fetchDocuments(data.document_id);

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        addToast(`"${data.filename}" processed and ready (${data.page_count} pages)!`, "success");
        inputRef.current?.focus();
      }, 500);
    } catch (err) {
      clearInterval(progressTimer);
      addToast(err.message || "Failed to upload document.", "error");
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileUpload(file);
  }

  // ---- Delete Document (Stage 4) ----
  async function confirmDeleteDocument() {
    if (!docToDelete) return;
    const docId = docToDelete.id;
    const filename = docToDelete.filename;
    setDocToDelete(null);

    try {
      const res = await fetch(`${API_URL}/documents/${docId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete document from server.");
      }

      // Remove from conversations
      setConversations((prev) => {
        const updated = { ...prev };
        delete updated[docId];
        return updated;
      });

      // Update documents list
      setDocuments((prev) => prev.filter((d) => d.id !== docId));

      // Switch selection if active document was deleted
      if (selectedDocId === docId) {
        const remaining = documents.filter((d) => d.id !== docId);
        setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
      }

      addToast(`"${filename}" was deleted successfully.`, "success");
    } catch (err) {
      addToast(err.message || "Failed to delete document.", "error");
    }
  }

  // ---- New Chat for Current Document (Stage 5) ----
  function handleNewChat() {
    if (!selectedDocId) return;
    setConversations((prev) => ({
      ...prev,
      [selectedDocId]: [],
    }));
    addToast("Started new conversation for this document.", "info");
    inputRef.current?.focus();
  }

  // ---- Ask Question with SSE Streaming & Memory (Stage 5 & 6) ----
  async function handleAsk(e) {
    if (e) e.preventDefault();
    const questionText = input.trim();
    if (!questionText || loading || !selectedDocId) return;

    const userMessage = { role: "user", content: questionText };
    const tempAiId = Date.now().toString();

    // Prepare current history for memory prompt
    const currentHistory = (conversations[selectedDocId] || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add user message and empty AI streaming placeholder to state
    setConversations((prev) => ({
      ...prev,
      [selectedDocId]: [
        ...(prev[selectedDocId] || []),
        userMessage,
        { id: tempAiId, role: "ai", content: "", sources: [] },
      ],
    }));

    setInput("");
    setLoading(true);
    setStreamingMessageId(tempAiId);

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          document_id: selectedDocId,
          chat_history: currentHistory,
          stream: true,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(err.detail || `Server error (${response.status})`);
      }

      // Stream SSE chunks
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      let receivedSources = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.replace(/^data:\s*/, "");
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);

            if (parsed.type === "sources") {
              receivedSources = parsed.sources || [];
              setConversations((prev) => {
                const docMsgs = prev[selectedDocId] || [];
                return {
                  ...prev,
                  [selectedDocId]: docMsgs.map((m) =>
                    m.id === tempAiId
                      ? { ...m, sources: receivedSources }
                      : m
                  ),
                };
              });
            } else if (parsed.type === "token") {
              accumulatedContent += parsed.token;
              setConversations((prev) => {
                const docMsgs = prev[selectedDocId] || [];
                return {
                  ...prev,
                  [selectedDocId]: docMsgs.map((m) =>
                    m.id === tempAiId
                      ? { ...m, content: accumulatedContent, sources: receivedSources }
                      : m
                  ),
                };
              });
            } else if (parsed.type === "error") {
              const errMsg = parsed.message || "Failed during response generation";
              accumulatedContent = `⚠️ *${errMsg}*`;
              setConversations((prev) => {
                const docMsgs = prev[selectedDocId] || [];
                return {
                  ...prev,
                  [selectedDocId]: docMsgs.map((m) =>
                    m.id === tempAiId
                      ? { ...m, content: accumulatedContent, sources: receivedSources }
                      : m
                  ),
                };
              });
              addToast(errMsg, "error");
            }
          } catch (jsonErr) {
            // ignore malformed SSE line
          }
        }
      }

      // If stream ended without text content
      if (!accumulatedContent) {
        setConversations((prev) => {
          const docMsgs = prev[selectedDocId] || [];
          return {
            ...prev,
            [selectedDocId]: docMsgs.map((m) =>
              m.id === tempAiId && !m.content
                ? {
                    ...m,
                    content:
                      "I could not find specific details for this query in the retrieved document passages. Try rephrasing or asking about a particular section.",
                    sources: receivedSources,
                  }
                : m
            ),
          };
        });
      }
    } catch (err) {
      addToast(err.message || "Something went wrong. Is the backend running?", "error");

      // Remove failed placeholder or update with error notice
      setConversations((prev) => {
        const docMsgs = prev[selectedDocId] || [];
        return {
          ...prev,
          [selectedDocId]: docMsgs.map((m) =>
            m.id === tempAiId
              ? {
                  ...m,
                  content:
                    "⚠️ *Failed to generate answer. Please verify the backend connection and try again.*",
                }
              : m
          ),
        };
      });
    } finally {
      setLoading(false);
      setStreamingMessageId(null);
      inputRef.current?.focus();
    }
  }

  function handleSuggestedQuestion(q) {
    if (loading || !selectedDocId) return;
    setInput(q);
    setTimeout(() => {
      handleAsk(null);
    }, 50);
  }

  // ============================================================
  // RENDER UI
  // ============================================================
  return (
    <div className="app-layout">
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="modal-backdrop" onClick={() => setDocToDelete(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Document?</h3>
            </div>
            <p className="modal-body">
              Are you sure you want to delete <strong>"{docToDelete.filename}"</strong>?
              This will remove its vector embeddings and associated chat history.
            </p>
            <div className="modal-actions">
              <button
                className="modal-btn-cancel"
                onClick={() => setDocToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="modal-btn-delete"
                onClick={confirmDeleteDocument}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Hidden File Input for Sidebar or Drag&Drop */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="upload-input"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleFileUpload(e.target.files[0]);
            e.target.value = "";
          }
        }}
      />

      {/* ========== SIDEBAR (Stage 4 Multi-Doc & Memory) ========== */}
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">🏥</div>
          <div className="sidebar-title">
            <h1>MedRAG</h1>
            <p>Clinical Intelligence System</p>
          </div>
        </div>

        {/* New Chat Button */}
        {activeDocument && (
          <button className="new-chat-btn" onClick={handleNewChat} disabled={loading}>
            <Icons.Plus />
            New Chat
          </button>
        )}

        {/* Documents Management Section (Stage 4) */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">
              Documents ({documents.length})
            </span>
            <button
              className="sidebar-add-doc-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload another PDF"
              disabled={uploading}
            >
              <Icons.Plus />
              Add PDF
            </button>
          </div>

          <div className="sidebar-doc-list">
            {documents.length === 0 ? (
              <div className="sidebar-no-docs">No documents uploaded yet</div>
            ) : (
              documents.map((doc) => {
                const isSelected = doc.id === selectedDocId;
                return (
                  <div
                    key={doc.id}
                    className={`sidebar-doc-item ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      if (!loading) setSelectedDocId(doc.id);
                    }}
                  >
                    <div className="sidebar-doc-item-icon">
                      <Icons.File />
                    </div>
                    <div className="sidebar-doc-item-info">
                      <div className="sidebar-doc-item-title" title={doc.filename}>
                        {doc.filename}
                      </div>
                      <div className="sidebar-doc-item-meta">
                        <span className="doc-pages-badge">
                          {doc.page_count ? `${doc.page_count} pages` : "Indexed"}
                        </span>
                        {isSelected && <span className="doc-active-dot" />}
                      </div>
                    </div>
                    <button
                      className="sidebar-doc-item-del"
                      title="Delete document"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocToDelete(doc);
                      }}
                    >
                      <Icons.Trash />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Suggested Questions Section */}
        {activeDocument && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Suggested Inquiries</div>
            <div className="suggested-questions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="suggested-q-btn"
                  onClick={() => handleSuggestedQuestion(q)}
                  disabled={loading}
                >
                  <Icons.Sparkle />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar Footer — Status indicator */}
        <div className="sidebar-footer">
          <div className="connection-status">
            <span
              className={`connection-dot ${
                backendConnected ? "connected" : "disconnected"
              }`}
            />
            <span>{backendConnected ? "Backend Connected" : "Backend Offline"}</span>
          </div>
        </div>
      </aside>

      {/* ========== MAIN CONTENT AREA ========== */}
      <main className="main-content">
        {/* Top Header Bar */}
        <header className="top-bar">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle sidebar"
          >
            <Icons.Menu />
          </button>
          <div className="top-bar-title">
            <h2>
              {activeDocument
                ? activeDocument.filename
                : uploading
                ? "Processing Document..."
                : "Medical Document Assistant"}
            </h2>
            <p>
              {activeDocument
                ? `${activeMessages.length} message${activeMessages.length !== 1 ? "s" : ""} • ${activeDocument.page_count || "?"} pages • Per-Document Isolated ChromaDB`
                : "Upload a medical document or PDF report to begin"}
            </p>
          </div>
          {activeDocument && (
            <button
              className="top-bar-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload another document"
            >
              <Icons.UploadCloud />
              <span>Upload PDF</span>
            </button>
          )}
        </header>

        {/* Upload Dropzone (When no document selected or uploaded) */}
        {!activeDocument && !uploading && (
          <div className="upload-container">
            <div
              className={`upload-zone ${dragOver ? "drag-over" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <span className="upload-icon">📄</span>
              <h3>Upload Medical Document</h3>
              <p>
                Drag and drop a PDF here, or click to browse files.
                <br />
                MedRAG isolates each document in its own vector namespace with
                contextual conversation memory.
              </p>
              <div className="upload-zone-hint">
                Supported: Clinical guidelines, diagnostic handbooks, research papers (.pdf)
              </div>
            </div>
          </div>
        )}

        {/* Upload Processing Progress */}
        {uploading && (
          <div className="upload-container">
            <div className="upload-zone processing">
              <span className="upload-icon">⚙️</span>
              <h3>Processing & Vectorizing...</h3>
              <p>
                Extracting clinical text, generating semantic embeddings, and
                registering isolated Chroma collection.
              </p>
              <div className="processing-bar">
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="processing-text">
                  {uploadProgress < 35
                    ? "Extracting PDF pages..."
                    : uploadProgress < 70
                    ? "Splitting into overlapping medical chunks..."
                    : uploadProgress < 95
                    ? "Generating sentence embeddings..."
                    : "Finalizing vector store..."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Chat Section (When document is selected) */}
        {activeDocument && (
          <section className="chat-section">
            <div className="chat-messages" ref={chatContainerRef}>
              {activeMessages.length === 0 && !loading && (
                <div className="empty-chat">
                  <div className="empty-chat-icon">💬</div>
                  <h3>Ready for Medical Questions</h3>
                  <p>
                    <strong>"{activeDocument.filename}"</strong> is loaded and indexed.
                    Ask any question, or test conversation follow-ups like:
                    <br />
                    <em>"What are the primary symptoms?"</em> followed by <em>"Can you explain that more simply?"</em>
                  </p>
                </div>
              )}

              {activeMessages.map((msg, i) => (
                <MessageBubble
                  key={msg.id || i}
                  message={msg}
                  isStreaming={msg.id === streamingMessageId}
                />
              ))}

              <div ref={chatEndRef} />
            </div>

            {/* Scroll-to-bottom FAB */}
            <button
              className={`scroll-fab ${showScrollFab ? "visible" : ""}`}
              onClick={scrollToBottom}
              title="Scroll to bottom"
            >
              <Icons.ArrowDown />
            </button>

            {/* Input Bar */}
            <div className="input-section">
              <form className="input-bar" onSubmit={handleAsk}>
                <div className="input-wrapper">
                  <textarea
                    ref={inputRef}
                    className="input-field"
                    placeholder={`Ask about "${activeDocument.filename}" (supports follow-up memory)...`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk(e);
                      }
                    }}
                    disabled={loading}
                    rows={1}
                  />
                </div>
                <button
                  type="submit"
                  className="send-button"
                  disabled={loading || !input.trim()}
                  title="Send message"
                >
                  <span>Ask</span>
                  <Icons.Send />
                </button>
              </form>
            </div>

            {/* Medical Disclaimer */}
            <footer className="disclaimer">
              <p>
                <span className="disclaimer-icon">⚕️</span>
                <strong>Medical Safety Notice:</strong> MedRAG retrieves and cites
                excerpts strictly from your uploaded document. It does not provide
                diagnoses or prescriptive medical treatments. Always consult a licensed physician.
              </p>
            </footer>
          </section>
        )}
      </main>
    </div>
  );
}
