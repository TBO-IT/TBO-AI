import { useState, useEffect } from "react";
import { FileText, Calendar, Search, Loader2, Database, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import PageShell from "../components/layout/PageShell";
import PageHeader from "../components/layout/PageHeader";
import EmptyState from "../components/shared/EmptyState";
import { getReports, type Report } from "../api/reportApi";

export default function ReportsPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            try {
                const data = await getReports();
                setReports(data);
            } catch (err) {
                console.error(err);
                setError("Failed to load reports");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const filteredReports = reports.filter(r => 
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.datasetName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <PageShell variant="wide">
                <PageHeader title="Reports" description="Saved executive briefings and analysis reports." />
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
                    <span className="text-sm">Loading reports...</span>
                </div>
            </PageShell>
        );
    }

    if (error) {
        return (
            <PageShell variant="wide">
                <PageHeader title="Reports" description="Saved executive briefings and analysis reports." />
                <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-sm">
                    {error}
                </div>
            </PageShell>
        );
    }

    if (reports.length === 0) {
        return (
            <PageShell variant="wide">
                <PageHeader title="Reports" description="Saved executive briefings and analysis reports." />
                <EmptyState
                    icon={FileText}
                    title="No reports yet"
                    description="Reports are created when you save an executive response from the Copilot. Ask a question first, then save the response as a report."
                    action={
                        <Link to="/copilot" className="mt-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
                            Go to Copilot
                        </Link>
                    }
                />
            </PageShell>
        );
    }

    return (
        <PageShell variant="wide">
            <PageHeader title="Reports" description="Saved executive briefings and analysis reports." />

            {/* Search */}
            <div className="bg-white dark:bg-slate-900/50 rounded-[10px] border border-slate-200 dark:border-slate-800/80 p-4 mb-6 flex items-center gap-3">
                <div className="relative w-full sm:max-w-md flex items-center">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3" />
                    <input
                        type="text"
                        placeholder="Search reports by title or dataset..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-lg py-2 pl-9 pr-4 text-[13px] text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50 transition-all"
                    />
                </div>
                <div className="text-[13px] text-slate-400 font-medium ml-auto">
                    {filteredReports.length} {filteredReports.length === 1 ? 'report' : 'reports'}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredReports.map(report => (
                    <div 
                        key={report.id}
                        onClick={() => navigate(`/reports/${report.id}`)}
                        className="group flex flex-col bg-white dark:bg-slate-900/50 rounded-[12px] border border-slate-200 dark:border-slate-800/80 p-5 hover:border-accent/50 dark:hover:border-accent/50 hover:shadow-md cursor-pointer transition-all"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="p-2.5 bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-brand-blue-light rounded-lg">
                                <FileText className="h-5 w-5" />
                            </div>
                            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                {new Date(report.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-tight mb-2 group-hover:text-accent transition-colors line-clamp-2">
                            {report.title}
                        </h3>
                        
                        {report.datasetName && (
                            <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mb-6">
                                <Database className="h-3.5 w-3.5" />
                                <span className="truncate">{report.datasetName}</span>
                            </div>
                        )}
                        
                        <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[12px] font-medium text-slate-400 group-hover:text-accent transition-colors">
                            <span>View Executive Report</span>
                            <ArrowRight className="h-4 w-4" />
                        </div>
                    </div>
                ))}
            </div>
            
            {filteredReports.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    No reports match your search query.
                </div>
            )}
        </PageShell>
    );
}
