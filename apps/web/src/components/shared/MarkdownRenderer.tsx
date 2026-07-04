import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { HeatmapMatrix } from "./HeatmapMatrix";
import { DynamicChart } from "./DynamicChart";

export function MarkdownRenderer({ text, className }: { text: string; className?: string }) {
    if (!text) return null;

    return (
        <div className={cn("text-[14px] leading-relaxed text-slate-700 dark:text-slate-300", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    table: ({ node, ...props }) => (
                        <div className="w-full overflow-x-auto my-5 rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm bg-white dark:bg-slate-900/50">
                            <table className="w-full text-left border-collapse" {...props} />
                        </div>
                    ),
                    thead: ({ node, ...props }) => (
                        <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700" {...props} />
                    ),
                    th: ({ node, ...props }) => (
                        <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap" {...props} />
                    ),
                    tbody: ({ node, ...props }) => (
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60" {...props} />
                    ),
                    tr: ({ node, ...props }) => (
                        <tr className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400" {...props} />
                    ),
                    h1: ({ node, ...props }) => (
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-6 mb-3 tracking-tight" {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2.5 tracking-tight" {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-4 mb-2" {...props} />
                    ),
                    p: ({ node, ...props }) => (
                        <p className="mb-4 last:mb-0 leading-relaxed" {...props} />
                    ),
                    ul: ({ node, ...props }) => (
                        <ul className="list-disc pl-5 mb-4 space-y-1.5 marker:text-slate-400 dark:marker:text-slate-500" {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                        <ol className="list-decimal pl-5 mb-4 space-y-1.5 marker:text-slate-400 dark:marker:text-slate-500 font-medium" {...props} />
                    ),
                    li: ({ node, ...props }) => (
                        <li className="text-slate-700 dark:text-slate-300 pl-1" {...props} />
                    ),
                    strong: ({ node, ...props }) => (
                        <strong className="font-bold text-slate-900 dark:text-slate-200" {...props} />
                    ),
                    code: ({ node, className, children, ...props }: any) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const isInline = !match && !className;
                        
                        if (!isInline && match && match[1] === 'chart') {
                            try {
                                const strContent = String(children).trim();
                                const config = JSON.parse(strContent);
                                
                                if (config.type === 'matrix') {
                                    return <HeatmapMatrix matrix={config.data} />;
                                }
                                
                                return <DynamicChart config={config} />;
                            } catch (e) {
                                console.error("Failed to parse chart JSON:", e);
                                // Fallback to raw JSON if it fails
                                return (
                                    <div className="my-4 rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm border-red-500 border">
                                        <pre className="p-4 bg-slate-50 dark:bg-[#0c1021] overflow-x-auto text-sm font-mono text-slate-800 dark:text-slate-200">
                                            <code className={className} {...props}>{children}</code>
                                        </pre>
                                    </div>
                                );
                            }
                        }

                        return isInline ? (
                            <code className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-mono" {...props}>
                                {children}
                            </code>
                        ) : (
                            <div className="my-4 rounded-xl overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800 shadow-sm">
                                <pre className="p-4 bg-slate-50 dark:bg-[#0c1021] overflow-x-auto text-sm font-mono text-slate-800 dark:text-slate-200">
                                    <code className={className} {...props}>{children}</code>
                                </pre>
                            </div>
                        );
                    },
                    blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-slate-200 dark:border-slate-700 pl-4 py-1 my-4 text-slate-600 dark:text-slate-400 italic bg-slate-50/50 dark:bg-slate-800/20 rounded-r-lg" {...props} />
                    )
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

export function InlineMarkdown({ text, className }: { text: string; className?: string }) {
    if (!text) return null;

    return (
        <span className={className}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ node, ...props }) => <span {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-slate-900 dark:text-slate-200" {...props} />,
                    em: ({ node, ...props }) => <em className="italic" {...props} />
                }}
            >
                {text}
            </ReactMarkdown>
        </span>
    );
}
