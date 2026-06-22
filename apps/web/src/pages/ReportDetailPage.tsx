import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Calendar, Database, Share2, Download, Check, AlertCircle } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import { getReport, type Report } from "../api/reportApi";
import { cn } from "../lib/utils";

const SECTION_ORDER = [
    "EXECUTIVE SUMMARY",
    "KEY TAKEAWAY",
    "TOP RISKS",
    "TOP OPPORTUNITIES",
    "KEY TRADEOFFS",
    "RECOMMENDED ACTIONS",
    "EXPECTED IMPACT",
    "SCENARIO OUTLOOK",
    "CONFIDENCE ASSESSMENT",
    "LEADERSHIP MESSAGE",
];

function parseExecutiveResponse(raw: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = raw.split("\n");
    let currentSection = "";
    let buffer: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        const matchedHeader = SECTION_ORDER.find(h => trimmed.toUpperCase() === h || trimmed.toUpperCase().startsWith(h + ":"));
        if (matchedHeader) {
            if (currentSection && buffer.length > 0) {
                sections[currentSection] = buffer.join("\n").trim();
            }
            currentSection = matchedHeader;
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
    if (currentSection && buffer.length > 0) {
        sections[currentSection] = buffer.join("\n").trim();
    }
    return sections;
}

export default function ReportDetailPage() {
    const { id } = useParams();
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function load() {
            if (!id) return;
            try {
                const data = await getReport(id);
                setReport(data);
            } catch (err) {
                console.error(err);
                setError("Failed to load report");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <PageShell>
                <div className="flex items-center justify-center py-20 text-slate-400">Loading report...</div>
            </PageShell>
        );
    }

    if (error || !report) {
        return (
            <PageShell>
                <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-6 rounded-xl flex items-center gap-3">
                    <AlertCircle className="h-5 w-5" />
                    <span>{error || "Report not found."}</span>
                </div>
            </PageShell>
        );
    }

    const sections = parseExecutiveResponse(report.content);

    return (
        <PageShell variant="default">
            {/* Nav */}
            <Link 
                to="/reports" 
                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-6"
            >
                <ChevronLeft className="h-4 w-4" />
                Back to Reports
            </Link>

            {/* Header */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-6 sm:p-8 mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
                    {report.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-[13px] font-medium text-slate-500 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        {new Date(report.createdAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    {report.datasetName && (
                        <div className="flex items-center gap-1.5">
                            <Database className="h-4 w-4" />
                            {report.datasetName}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleCopyUrl}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[13px] font-medium transition-colors"
                    >
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
                        {copied ? "Link Copied" : "Share Report"}
                    </button>
                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-medium transition-colors cursor-not-allowed opacity-50">
                        <Download className="h-4 w-4" />
                        Export PDF
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-6 sm:p-10 shadow-sm">
                <div className="max-w-[700px] mx-auto space-y-12">
                    {SECTION_ORDER.map(section => {
                        const content = sections[section];
                        if (!content) return null;
                        
                        return (
                            <section key={section} className="break-inside-avoid">
                                <h2 className={cn(
                                    "text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-3",
                                    (section === "EXECUTIVE SUMMARY" || section === "KEY TAKEAWAY" || section === "LEADERSHIP MESSAGE") 
                                        ? "text-accent dark:text-accent-hover" 
                                        : ""
                                )}>
                                    {section}
                                </h2>
                                <div className={cn(
                                    "text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line",
                                    section === "KEY TAKEAWAY" && "text-lg sm:text-xl font-medium text-slate-900 dark:text-white leading-snug",
                                    section === "LEADERSHIP MESSAGE" && "p-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 font-medium italic"
                                )}>
                                    {content}
                                </div>
                            </section>
                        );
                    })}
                    
                    {Object.keys(sections).length === 0 && (
                        <div className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-line">
                            {report.content}
                        </div>
                    )}
                </div>
            </div>
        </PageShell>
    );
}
