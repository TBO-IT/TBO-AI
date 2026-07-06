// ─── ChatHistoryContext ────────────────────────────────────────────────────────
//
// Provides a global chat history store so messages persist when the user
// navigates away from the Copilot page and comes back.
//
// Storage strategy:
//   • In-memory (React state) → instant access, no serialisation overhead
//   • sessionStorage → survives route changes; cleared when the tab is closed
//
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string; // ISO string for easy JSON serialization
    sections?: Record<string, string>;
    stage?: string;
    dataPayload?: any;
}

interface ChatHistoryContextValue {
    messages: ChatMessage[];
    /** Add a new message or replace an existing one by id */
    upsertMessage: (msg: ChatMessage) => void;
    /** Append text to an existing assistant message during streaming */
    updateMessageContent: (id: string, content: string, sections?: Record<string, string>, stage?: string, dataPayload?: any) => void;
    clearHistory: () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────

const ChatHistoryContext = createContext<ChatHistoryContextValue | null>(null);

const SESSION_KEY = "tbo_copilot_chat_history";

function loadFromSession(): ChatMessage[] {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as ChatMessage[];
    } catch {
        return [];
    }
}

function saveToSession(messages: ChatMessage[]) {
    try {
        // Limit to last 100 messages to prevent runaway storage
        const trimmed = messages.slice(-100);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(trimmed));
    } catch {
        // sessionStorage quota exceeded — silently swallow
    }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function ChatHistoryProvider({ children }: { children: ReactNode }) {
    const [messages, setMessages] = useState<ChatMessage[]>(() => loadFromSession());

    // Persist to sessionStorage on every change
    useEffect(() => {
        saveToSession(messages);
    }, [messages]);

    const upsertMessage = useCallback((msg: ChatMessage) => {
        setMessages(prev => {
            const existingIdx = prev.findIndex(m => m.id === msg.id);
            if (existingIdx === -1) {
                return [...prev, msg];
            }
            const next = [...prev];
            next[existingIdx] = msg;
            return next;
        });
    }, []);

    const updateMessageContent = useCallback((
        id: string,
        content: string,
        sections?: Record<string, string>,
        stage?: string,
        dataPayload?: any
    ) => {
        setMessages(prev => prev.map(m =>
            m.id === id
                ? { ...m, content, sections, stage, ...(dataPayload !== undefined && { dataPayload }) }
                : m
        ));
    }, []);

    const clearHistory = useCallback(() => {
        setMessages([]);
        sessionStorage.removeItem(SESSION_KEY);
    }, []);

    return (
        <ChatHistoryContext.Provider value={{ messages, upsertMessage, updateMessageContent, clearHistory }}>
            {children}
        </ChatHistoryContext.Provider>
    );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useChatHistory() {
    const ctx = useContext(ChatHistoryContext);
    if (!ctx) {
        throw new Error("useChatHistory must be used inside <ChatHistoryProvider>");
    }
    return ctx;
}
