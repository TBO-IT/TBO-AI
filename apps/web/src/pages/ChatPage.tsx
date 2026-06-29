import { useState, useEffect } from "react";
import { Send, Sparkles, MessageSquare, Plus, ChevronDown, Database, Cpu, Loader2 } from "lucide-react";
import { getDatasets } from "../api/datasetApi";
import type { Dataset } from "../types/dataset";
import { api } from "../api/client";
import { useAuth } from "@clerk/clerk-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  stage?: string;
}

export default function ChatPage() {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [isThinking, setIsThinking] = useState(false);
  const [loadingStage, setLoadingStage] = useState("Analyzing your data…");

  useEffect(() => {
    async function load() {
      try {
        const data = await getDatasets();
        setDatasets(data);
        if (data && data.length > 0) {
          setSelectedDataset(data[0]);
        }
      } catch (error) {
        console.error("Failed to load datasets for chat:", error);
      } finally {
        setLoadingDatasets(false);
      }
    }
    load();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !selectedDataset || isThinking) return;
    const currentInput = input;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: currentInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);
    setLoadingStage("Analyzing your data…");

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: "assistant",
      content: "",
      stage: "Analyzing your data…",
      timestamp: new Date(),
    }]);

    try {
      const token = await getToken();
      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          datasetId: selectedDataset.id,
          message: currentInput,
        })
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch(e) {}
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
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantId ? { ...msg, stage: data.stage } : msg
                ));
              }
            } else if (eventType === "token") {
              rawContent += data.text;
              setMessages(prev => prev.map(msg => 
                msg.id === assistantId ? { ...msg, content: rawContent, stage: undefined } : msg
              ));
            } else if (eventType === "complete") {
              let finalAns = rawContent;
              if (data.response?.answer) finalAns = data.response.answer;
              else if (data.response?.narrative) finalAns = data.response.narrative;
              else if (data.answer) finalAns = data.answer;
              else if (data.narrative) finalAns = data.narrative;
              else if (data.text) finalAns = data.text;
              else finalAns = data.response ? JSON.stringify(data.response) : finalAns;

              rawContent = finalAns;
              setMessages(prev => prev.map(msg => 
                msg.id === assistantId ? { ...msg, content: rawContent, stage: undefined } : msg
              ));
              break;
            } else if (eventType === "error") {
              throw new Error(data.message || "Streaming error");
            }
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      const errorContent = error.message || "Failed to contact backend.";
      setMessages(prev => prev.map(msg => 
        msg.id === assistantId ? { ...msg, content: errorContent, stage: undefined } : msg
      ));
    } finally {
      setIsThinking(false);
      setLoadingStage("Analyzing your data…");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  const quickPrompts = [
    "Show me the supplier win rate breakdown.",
    "Which chains have the highest volume?",
    "Calculate the median price difference by chain.",
    "Give me key insights on win/loss status."
  ];

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Top Header Section */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between z-10 transition-colors">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Context Dataset:</span>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={loadingDatasets}
                className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-slate-700 disabled:opacity-55 cursor-pointer"
              >
                {loadingDatasets ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                ) : (
                  <Database className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                )}
                <span>
                  {selectedDataset
                    ? selectedDataset.filename
                    : loadingDatasets
                      ? "Loading datasets..."
                      : "No datasets uploaded"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {isDropdownOpen && datasets.length > 0 && (
                <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 z-20 max-h-60 overflow-y-auto">
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      onClick={() => {
                        setSelectedDataset(ds);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer ${selectedDataset?.id === ds.id
                        ? "font-semibold text-brand-blue dark:text-brand-blue-light bg-brand-blue/5 dark:bg-brand-blue/10"
                        : "text-slate-700 dark:text-slate-300"
                        }`}
                    >
                      <span className="truncate mr-2">{ds.filename}</span>
                      {selectedDataset?.id === ds.id && <div className="h-1.5 w-1.5 bg-brand-orange rounded-full flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 px-2.5 py-1 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50 rounded-full text-xs font-semibold">
              <span className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse mr-1" />
              AI Agent Online
            </span>
          </div>
        </header>

        {/* Conversation Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6">
          {messages.length === 0 ? (
            <div className="max-w-2xl mx-auto mt-12 md:mt-20 text-center flex flex-col items-center">
              <div className="bg-brand-blue/10 dark:bg-brand-blue/20 p-4 rounded-full text-brand-blue dark:text-brand-blue-light mb-6 animate-pulse">
                <Cpu className="h-10 w-10" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
                How can I help you analyze your data today?
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-8">
                Select a dataset and ask questions in natural language. I can analyze columns, extract performance metrics, and build custom insights.
              </p>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(prompt)}
                    className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-brand-orange/40 hover:shadow-sm text-left text-sm text-slate-700 dark:text-slate-300 font-medium transition-all duration-200 group cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span>{prompt}</span>
                      <Sparkles className="h-3.5 w-3.5 text-slate-400 group-hover:text-brand-orange transition-colors ml-2 flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex space-x-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-lg bg-brand-blue text-white flex items-center justify-center shadow-sm flex-shrink-0 mt-0.5">
                      <Cpu className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-5 py-3.5 text-sm shadow-sm max-w-[85%] leading-relaxed ${msg.role === "user"
                      ? "bg-slate-900 dark:bg-slate-800 text-white rounded-tr-none"
                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none"
                      }`}
                  >
                    {msg.stage ? (
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 text-brand-blue animate-spin" />
                        <span className="text-slate-500">{msg.stage}</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-line">{msg.content}</p>
                    )}
                    <span className="text-[10px] block mt-1.5 text-right text-slate-400 dark:text-slate-500">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-lg bg-slate-800 dark:bg-slate-750 text-slate-200 dark:text-slate-300 flex items-center justify-center shadow-sm flex-shrink-0 mt-0.5 font-semibold text-xs">
                      ME
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Input Area */}
        <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 transition-colors">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder={selectedDataset ? `Ask a question about ${selectedDataset.filename}...` : "Select a dataset to begin..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl py-3.5 pl-4 pr-14 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue transition-all shadow-inner"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`absolute right-2.5 p-2 rounded-lg text-white shadow-sm transition-all cursor-pointer ${input.trim()
                  ? "bg-brand-blue hover:bg-brand-blue-dark"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                  }`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span>Press Enter to send</span>
              <span className="flex items-center space-x-1">
                <Sparkles className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                <span>Powered by DuckDB & Claude.</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat History Panel Placeholder (Right-side/Collapsible style panel) */}
      <aside className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full hidden lg:flex transition-colors">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-2">
            <MessageSquare className="h-4 w-4 text-slate-500 dark:text-slate-450" />
            <span>Chat History</span>
          </h3>
          <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors cursor-pointer">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs text-slate-400 dark:text-slate-550 font-medium px-2 py-1">Recent Sessions</div>

          <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all text-xs font-medium text-slate-700 dark:text-slate-300 group flex items-start space-x-3 cursor-pointer">
            <MessageSquare className="h-3.5 w-3.5 text-brand-orange mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-200 group-hover:text-brand-blue transition-colors">
                Hotel competitiveness breakdown
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Hotel Competitiveness Q2</p>
            </div>
          </button>

          <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all text-xs font-medium text-slate-700 dark:text-slate-300 group flex items-start space-x-3 cursor-pointer">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-200 group-hover:text-brand-blue transition-colors">
                Supplier win rates & pricing
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Hotel Competitiveness Q2</p>
            </div>
          </button>

          <button className="w-full text-left p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-100 dark:hover:border-slate-800 transition-all text-xs font-medium text-slate-700 dark:text-slate-300 group flex items-start space-x-3 cursor-pointer">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-200 group-hover:text-brand-blue transition-colors">
                APW Bucket insights
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Supplier Metrics Dec 2025</p>
            </div>
          </button>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm text-center">
            <Cpu className="h-5 w-5 text-brand-blue dark:text-brand-blue-light mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">DuckDB Server Status</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-450 mt-1">In-Memory Database Connected</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
