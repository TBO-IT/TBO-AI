import { useState, useEffect, useRef } from "react";
import { Send, Sparkles, Cpu, Loader2, Database, ChevronDown, BookmarkPlus, Copy, Check, Trash2, Square } from "lucide-react";
import { useChatHistory } from "../context/ChatHistoryContext";
import type { ChatMessage } from "../context/ChatHistoryContext";
import { motion, AnimatePresence } from "framer-motion";
import { getDatasets } from "../api/datasetApi";
import type { Dataset } from "../types/dataset";
import { saveReport } from "../api/reportApi";
import { cn } from "../lib/utils";
import { useAuth } from "@clerk/clerk-react";
import { MarkdownRenderer } from "../components/shared/MarkdownRenderer";
import { ExecutiveKPICard, RecommendationCard } from "../components/ExecutiveCards";

// ── Types ──

// Re-export ChatMessage as Message alias for backwards compat within this file
type Message = ChatMessage;

// ── Formatted Text Renderer ──
// Imported from ChatPage

// ── Section Renderer ──

const SECTION_ORDER = [
    "EXECUTIVE SUMMARY",
    "PRIMARY TARGET",
    "RECOMMENDED ACTIONS",
    "EXPECTED IMPACT",
    "KEY TAKEAWAY",
    "LEADERSHIP MESSAGE",
    "SUPPORTING TARGETS",
    "TOP RISKS",
    "TOP OPPORTUNITIES",
    "KEY TRADEOFFS",
    "SCENARIO OUTLOOK",
    "CONFIDENCE ASSESSMENT",
];

const SECTION_ICONS: Record<string, string> = {
    "PRIMARY TARGET": "🎯",
    "SUPPORTING TARGETS": "📌",
    "RECOMMENDED ACTIONS": "✅",
    "EXECUTIVE SUMMARY": "📊",
    "KEY TAKEAWAY": "💡",
    "TOP RISKS": "🔴",
    "TOP OPPORTUNITIES": "🟢",
    "KEY TRADEOFFS": "⚖️",
    "EXPECTED IMPACT": "📈",
    "SCENARIO OUTLOOK": "🔮",
    "CONFIDENCE ASSESSMENT": "🛡️",
    "LEADERSHIP MESSAGE": "👔",
};

function parseExecutiveResponse(raw: string): Record<string, string> | null {
    const sections: Record<string, string> = {};
    const lines = raw.split("\n");
    let currentSection = "";
    let buffer: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // Check if this line is a section header
        const matchedHeader = SECTION_ORDER.find(h => trimmed.toUpperCase() === h || trimmed.toUpperCase().startsWith(h + ":"));
        if (matchedHeader) {
            // Save previous section
            if (currentSection && buffer.length > 0) {
                sections[currentSection] = buffer.join("\n").trim();
            }
            currentSection = matchedHeader;
            // If the header has inline content after ":", grab it
            const colonIdx = trimmed.indexOf(":");
            if (colonIdx !== -1 && colonIdx < trimmed.length - 1) {
                buffer = [trimmed.slice(colonIdx + 1).trim()];
            } else {
                buffer = [];
            }
        } else if (currentSection) {
            buffer.push(line);
        }
    }
    // Flush last section
    if (currentSection && buffer.length > 0) {
        sections[currentSection] = buffer.join("\n").trim();
    }

    return Object.keys(sections).length >= 3 ? sections : null;
}

function parseKPITable(text: string) {
    if (!text.includes("| Metric | Value |")) return null;
    const lines = text.split("\n");
    const data: Record<string, string> = {};
    for (const line of lines) {
        if (!line.includes("|") || line.includes("---|---")) continue;
        const [k, v] = line.split("|").map(s => s.trim()).filter(Boolean);
        if (k && v && k !== "Metric") {
            data[k] = v;
        }
    }
    return Object.keys(data).length > 0 ? data : null;
}

function parseRecommendations(text: string) {
    const lines = text.split("\n");
    const recs: { title: string; why: string; outcome: string }[] = [];
    let currentRec: any = null;
    for (const line of lines) {
        const titleMatch = line.match(/^\*\*(.*?)\*\*/);
        if (titleMatch) {
            if (currentRec) recs.push(currentRec);
            currentRec = { title: titleMatch[1], why: "", outcome: "" };
        } else if (currentRec) {
            const whyMatch = line.match(/^\*Why:\*\s*(.*)/i);
            const outcomeMatch = line.match(/^\*Expected Outcome:\*\s*(.*)/i);
            if (whyMatch) {
                currentRec.why = whyMatch[1];
            } else if (outcomeMatch) {
                currentRec.outcome = outcomeMatch[1];
            }
        }
    }
    if (currentRec) recs.push(currentRec);
    return recs.length > 0 ? recs : null;
}

function SectionCard({ title, content, defaultOpen = false }: { title: string; content: string; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const icon = SECTION_ICONS[title] || "📌";

    // Always open key sections
    const alwaysOpen = title === "PRIMARY TARGET" || title === "EXECUTIVE SUMMARY" || title === "RECOMMENDED ACTIONS" || title === "LEADERSHIP MESSAGE";

    // Attempt parsing structured data
    let renderedContent: React.ReactNode = null;
    if (title === "PRIMARY TARGET") {
        const kpiData = parseKPITable(content);
        if (kpiData) {
            renderedContent = <ExecutiveKPICard data={kpiData} />;
        }
    } else if (title === "RECOMMENDED ACTIONS") {
        const recData = parseRecommendations(content);
        if (recData) {
            renderedContent = (
                <div className="space-y-0">
                    {recData.map((rec, idx) => (
                        <RecommendationCard key={idx} index={idx + 1} title={rec.title} why={rec.why} outcome={rec.outcome} />
                    ))}
                </div>
            );
        }
    }

    if (!renderedContent) {
        renderedContent = <MarkdownRenderer text={content} />;
    }

    return (
        <div className={cn(
            "rounded-xl transition-colors mb-4",
            !alwaysOpen && "border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 shadow-sm"
        )}>
            {!alwaysOpen && (
                <button
                    onClick={() => setOpen(!open)}
                    className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors"
                    )}
                >
                    <span className="text-sm">{icon}</span>
                    <span className="text-[12px] font-semibold tracking-wide uppercase text-slate-600 dark:text-slate-300 flex-1">
                        {title}
                    </span>
                    <ChevronDown className={cn(
                        "h-4 w-4 text-slate-400 transition-transform duration-200",
                        open && "rotate-180"
                    )} />
                </button>
            )}

            {alwaysOpen && (
                <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="text-[12px] font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
                        {icon} {title}
                    </span>
                </div>
            )}

            <AnimatePresence initial={false}>
                {(open || alwaysOpen) && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className={cn(
                            "text-[13px] leading-relaxed text-slate-700 dark:text-slate-300",
                            !alwaysOpen ? "px-4 pb-4 pt-1" : "px-0"
                        )}>
                            {renderedContent}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── Main Page ──

export default function CopilotPage() {
    const { getToken } = useAuth();
    const { messages, upsertMessage, updateMessageContent, clearHistory } = useChatHistory();
    const [input, setInput] = useState("");
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [loadingDatasets, setLoadingDatasets] = useState(true);
    const [isThinking, setIsThinking] = useState(false);
    const [, setLoadingStage] = useState("Analyzing your data…");
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [savingReportId, setSavingReportId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const data = await getDatasets();
                setDatasets(data);
                if (data?.length > 0) setSelectedDataset(data[0]);
            } catch (error) {
                console.error("Failed to load datasets:", error);
            } finally {
                setLoadingDatasets(false);
            }
        }
        load();
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages, isThinking]);

    const handleSend = async () => {
        if (!input.trim() || !selectedDataset || isThinking) return;
        const currentInput = input;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: currentInput,
            timestamp: new Date().toISOString(),
        };
        upsertMessage(userMessage);
        setInput("");
        setIsThinking(true);
        setLoadingStage("Analyzing your data…");

        const assistantId = (Date.now() + 1).toString();
        upsertMessage({
            id: assistantId,
            role: "assistant",
            content: "",
            stage: "Analyzing your data…",
            timestamp: new Date().toISOString(),
        });

        try {
            const token = await getToken();
            const response = await fetch(`${import.meta.env.VITE_API_URL}/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    datasetId: selectedDataset.id,
                    message: currentInput,
                })
            });

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                } catch (e) { }
                throw { response: { status: response.status, data: errorData } };
            }
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let done = false;
            let buffer = "";
            let rawContent = "";

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                }

                const lines = buffer.split("\n\n");
                buffer = lines.pop() || "";

                for (const block of lines) {
                    const eventMatch = block.match(/^event:\s*(.*)$/m);
                    const dataMatch = block.match(/^data:\s*(.*)$/m);

                    if (eventMatch && dataMatch) {
                        const eventType = eventMatch[1].trim();
                        const rawData = dataMatch[1].trim();
                        let data;
                        try {
                            data = JSON.parse(rawData);
                        } catch (e) {
                            continue;
                        }

                        if (eventType === "status") {
                            if (data.stage) {
                                setLoadingStage(data.stage);
                                updateMessageContent(assistantId, rawContent, undefined, data.stage);
                            }
                        } else if (eventType === "token") {
                            rawContent += data.text;
                            const sections = parseExecutiveResponse(rawContent);
                            updateMessageContent(assistantId, rawContent, sections || undefined, undefined);
                        } else if (eventType === "complete") {
                            let finalAns = rawContent;
                            if (data.response?.answer) finalAns = data.response.answer;
                            else if (data.response?.narrative) finalAns = data.response.narrative;
                            else if (data.answer) finalAns = data.answer;
                            else if (data.narrative) finalAns = data.narrative;
                            else if (data.text) finalAns = data.text;
                            else finalAns = data.response ? JSON.stringify(data.response) : finalAns;

                            rawContent = finalAns;
                            const sections = parseExecutiveResponse(rawContent);
                            updateMessageContent(assistantId, rawContent, sections || undefined, undefined);
                            break;
                        } else if (eventType === "error") {
                            throw new Error(data.message || "Streaming error");
                        }
                    }
                }
            }
        } catch (err: any) {
            if (err.name === "AbortError") {
                console.log("Fetch aborted");
                return;
            }
            console.error("[PIPELINE_FATAL]", err);

            let errorContent = "Internal Processing Error: An unknown error occurred.";

            if (err.response?.status === 422 && err.response?.data?.errors) {
                const validationErrors = err.response.data.errors.join("\n- ");
                const suggestions = err.response.data.suggestions?.join("\n- ") || "";
                errorContent = `**Question Validation Failed**\n\n- ${validationErrors}`;
                if (suggestions) {
                    errorContent += `\n\n**Suggestions:**\n- ${suggestions}`;
                }
            } else if (err.response?.data?.detail) {
                errorContent = `Internal Processing Error:\n${err.response.data.detail}`;
            } else if (err.response?.data?.error) {
                errorContent = `Internal Processing Error:\n${err.response.data.error}`;
            } else if (err.message) {
                errorContent = `Internal Processing Error:\n${err.message}`;
            }

            updateMessageContent(assistantId, errorContent, undefined, undefined);
        } finally {
            setIsThinking(false);
            setLoadingStage("Analyzing your data…");
        }
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsThinking(false);
        setLoadingStage("Analyzing your data…");
    };

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleSaveReport = async (msg: Message) => {
        if (savingReportId) return;

        try {
            setSavingReportId(msg.id);
            // Derive a title from the preceding user question, or fall back
            const msgIndex = messages.findIndex((m: Message) => m.id === msg.id);
            const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;
            const title = userMsg?.content.slice(0, 100) || "Executive Report";

            await saveReport({
                title: title,
                content: msg.content,
                datasetId: selectedDataset?.id
            });

            // Show brief success state on button
            setTimeout(() => setSavingReportId(null), 2000);
        } catch (error) {
            console.error("Failed to save report:", error);
            setSavingReportId(null);
        }
    };

    const quickPrompts = [
        "Why did win rate decline this period?",
        "What is the biggest risk to future performance?",
        "What should leadership focus on most?",
        "What is our biggest growth opportunity?",
    ];

    // ── Empty State ──
    if (messages.length === 0 && !isThinking) {
        return (
            <div className="flex-1 flex flex-col h-full">
                {/* Top bar */}
                <header className="h-[52px] border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0c1021]/80 backdrop-blur-md px-5 flex items-center justify-between flex-shrink-0">
                    <DatasetSelector
                        datasets={datasets}
                        selected={selectedDataset}
                        loading={loadingDatasets}
                        isOpen={isDropdownOpen}
                        setIsOpen={setIsDropdownOpen}
                        onSelect={(ds) => { setSelectedDataset(ds); setIsDropdownOpen(false); }}
                    />
                    <StatusBadge />
                </header>

                {/* Hero */}
                <div className="flex-1 flex flex-col items-center justify-center px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="text-center max-w-xl"
                    >
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 dark:from-accent/15 dark:to-accent/5 flex items-center justify-center mx-auto mb-6 ring-1 ring-accent/20">
                            <Cpu className="h-6 w-6 text-accent" />
                        </div>
                        <h2 className="text-[28px] font-bold tracking-tight text-slate-900 dark:text-white mb-2">
                            Executive Intelligence
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-10">
                            Ask strategic questions about your data. Get executive-level insights with risks, opportunities, scenarios, and recommendations.
                        </p>

                        {/* Quick prompts */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
                            {quickPrompts.map((prompt, i) => (
                                <motion.button
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.15 + i * 0.06 }}
                                    onClick={() => setInput(prompt)}
                                    className="group p-3.5 rounded-[10px] border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:border-accent/30 dark:hover:border-accent/30 text-left text-[13px] text-slate-600 dark:text-slate-300 font-medium transition-all cursor-pointer"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span>{prompt}</span>
                                        <Sparkles className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 group-hover:text-accent transition-colors flex-shrink-0" />
                                    </div>
                                </motion.button>
                            ))}
                        </div>

                        {/* Input */}
                        <div className="max-w-lg mx-auto">
                            <InputBar
                                value={input}
                                onChange={setInput}
                                onSend={handleSend}
                                disabled={!selectedDataset}
                                placeholder={selectedDataset ? `Ask about ${selectedDataset.filename}…` : "Select a dataset to begin…"}
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        );
    }

    // ── Active Conversation ──
    return (
        <div className="flex-1 flex flex-col h-full">
            {/* Top bar */}
            <header className="h-[52px] border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0c1021]/80 backdrop-blur-md px-5 flex items-center justify-between flex-shrink-0 z-10">
                <DatasetSelector
                    datasets={datasets}
                    selected={selectedDataset}
                    loading={loadingDatasets}
                    isOpen={isDropdownOpen}
                    setIsOpen={setIsDropdownOpen}
                    onSelect={(ds) => { setSelectedDataset(ds); setIsDropdownOpen(false); }}
                />
                <div className="flex items-center gap-3">
                    <button
                        onClick={clearHistory}
                        title="Clear conversation"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-800/40 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-all cursor-pointer"
                    >
                        <Trash2 className="h-3 w-3" />
                        <span>Clear</span>
                    </button>
                    <StatusBadge />
                </div>
            </header>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
                <div className="max-w-3xl mx-auto space-y-5">
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                        >
                            {msg.role === "assistant" && (
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-brand-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Cpu className="h-3.5 w-3.5 text-white" />
                                </div>
                            )}

                            <div className={cn(
                                "max-w-[85%]",
                                msg.role === "user"
                                    ? "rounded-2xl rounded-tr-md px-4 py-3 bg-slate-900 dark:bg-slate-800 text-white text-[13px]"
                                    : "flex-1 max-w-2xl"
                            )}>
                                {msg.role === "user" ? (
                                    <p>{msg.content}</p>
                                ) : msg.stage ? (
                                    <div className="flex items-center gap-2 px-4 py-3 rounded-2xl rounded-tl-md bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80">
                                        <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />
                                        <span className="text-[12px] text-slate-400">{msg.stage}</span>
                                    </div>
                                ) : msg.sections ? (
                                    /* Structured executive response */
                                    <div className="space-y-2">
                                        {SECTION_ORDER.map(section => {
                                            const content = msg.sections![section];
                                            if (!content) return null;
                                            const alwaysOpen = section === "PRIMARY TARGET" || section === "EXECUTIVE SUMMARY" || section === "KEY TAKEAWAY" || section === "LEADERSHIP MESSAGE";
                                            return (
                                                <SectionCard
                                                    key={section}
                                                    title={section}
                                                    content={content}
                                                    defaultOpen={alwaysOpen}
                                                />
                                            );
                                        })}
                                        {/* Actions */}
                                        <div className="flex items-center gap-2 pt-2">
                                            <button
                                                onClick={() => handleCopy(msg.id, msg.content)}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                                            >
                                                {copiedId === msg.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                                {copiedId === msg.id ? "Copied" : "Copy"}
                                            </button>
                                            <button
                                                onClick={() => handleSaveReport(msg)}
                                                disabled={savingReportId === msg.id}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                {savingReportId === msg.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <BookmarkPlus className="h-3 w-3" />
                                                )}
                                                {savingReportId === msg.id ? "Saving..." : "Save Report"}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* Plain text fallback */
                                    <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-[13px] text-slate-700 dark:text-slate-300">
                                        <MarkdownRenderer text={msg.content} />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Bottom input */}
            <div className="border-t border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#0c1021]/80 backdrop-blur-md px-5 py-4">
                <div className="max-w-3xl mx-auto flex flex-col items-center">
                    {isThinking && (
                        <button
                            onClick={handleStop}
                            className="mb-3 flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors shadow-sm cursor-pointer"
                        >
                            <Square className="h-3 w-3 fill-slate-400 text-slate-400" /> Stop generating
                        </button>
                    )}
                    <div className="w-full">
                        <InputBar
                            value={input}
                            onChange={setInput}
                            onSend={handleSend}
                            disabled={!selectedDataset || isThinking}
                            placeholder={selectedDataset ? "Follow-up question…" : "Select a dataset…"}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Sub-components ──

function InputBar({ value, onChange, onSend, disabled, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    disabled: boolean;
    placeholder: string;
}) {
    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    return (
        <div className="relative">
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKey}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                    "w-full rounded-xl border py-3 pl-4 pr-12 text-[13px] transition-all",
                    "bg-slate-50 dark:bg-slate-900/60",
                    "border-slate-200 dark:border-slate-800/80",
                    "text-slate-800 dark:text-slate-100",
                    "placeholder:text-slate-400 dark:placeholder:text-slate-500",
                    "focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
            />
            <button
                onClick={onSend}
                disabled={!value.trim() || disabled}
                className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all cursor-pointer",
                    value.trim() && !disabled
                        ? "bg-accent hover:bg-accent-hover text-white shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                )}
            >
                <Send className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

function DatasetSelector({ datasets, selected, loading, isOpen, setIsOpen, onSelect }: {
    datasets: Dataset[];
    selected: Dataset | null;
    loading: boolean;
    isOpen: boolean;
    setIsOpen: (v: boolean) => void;
    onSelect: (ds: Dataset) => void;
}) {
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50 cursor-pointer"
            >
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                ) : (
                    <Database className="h-3.5 w-3.5 text-slate-400" />
                )}
                <span className="max-w-[200px] truncate">
                    {selected ? selected.filename : loading ? "Loading…" : "No datasets"}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>

            {isOpen && datasets.length > 0 && (
                <div className="absolute left-0 mt-1.5 w-64 rounded-[10px] border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0f1629] shadow-lg py-1 z-30 max-h-48 overflow-y-auto">
                    {datasets.map((ds) => (
                        <button
                            key={ds.id}
                            onClick={() => onSelect(ds)}
                            className={cn(
                                "w-full text-left px-3 py-2 text-[12px] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex items-center justify-between",
                                selected?.id === ds.id
                                    ? "font-semibold text-accent bg-accent/5"
                                    : "text-slate-600 dark:text-slate-300"
                            )}
                        >
                            <span className="truncate">{ds.filename}</span>
                            {selected?.id === ds.id && (
                                <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusBadge() {
    return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            AI Online
        </span>
    );
}
