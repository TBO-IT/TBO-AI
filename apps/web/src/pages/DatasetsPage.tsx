import { useState, useEffect } from "react";
import { Database, Plus, Search, Calendar, ChevronRight, FileText, BarChart2, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getDatasets } from "../api/datasetApi";
import type { Dataset } from "../types/dataset";
import PageShell from "../components/layout/PageShell";
import { cn } from "../lib/utils";

export default function DatasetsPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadData = async () => {
        try {
            setLoading(true);
            setError("");
            const data = await getDatasets();
            setDatasets(data);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || "Failed to load datasets. Please check server connection.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filteredDatasets = datasets.filter((ds) =>
        ds.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getStatusStyle = (status: string) => {
        switch (status.toUpperCase()) {
            case "COMPLETED":
                return "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
            case "FAILED":
                return "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50";
            case "PROCESSING":
            case "UPLOADED":
                return "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
            default:
                return "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800";
        }
    };

    const getStatusDotColor = (status: string) => {
        switch (status.toUpperCase()) {
            case "COMPLETED":
                return "bg-emerald-500";
            case "FAILED":
                return "bg-red-500";
            case "PROCESSING":
            case "UPLOADED":
                return "bg-amber-500";
            default:
                return "bg-slate-400";
        }
    };

    return (
        <PageShell variant="wide">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                        Datasets
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Manage and view analysis metrics for your uploaded datasets.
                    </p>
                </div>

                <Link
                    to="/datasets/upload"
                    className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium shadow-sm transition-all self-start sm:self-auto cursor-pointer"
                >
                    <Plus className="h-4 w-4" />
                    <span>Upload New</span>
                </Link>
            </div>

            {/* Search and Filters */}
            <div className="bg-white dark:bg-slate-900/50 rounded-[10px] border border-slate-200 dark:border-slate-800/80 p-4 mb-6 flex flex-col sm:flex-row items-center gap-3 transition-colors">
                <div className="relative w-full sm:max-w-xs flex items-center">
                    <Search className="h-4 w-4 text-slate-400 absolute left-3" />
                    <input
                        type="text"
                        placeholder="Search datasets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-lg py-2 pl-9 pr-4 text-[13px] text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50 transition-all"
                    />
                </div>
                <div className="flex items-center space-x-2 text-[13px] text-slate-400 dark:text-slate-500 ml-auto font-medium">
                    {!loading && (
                        <span>
                            Showing {filteredDatasets.length} of {datasets.length} datasets
                        </span>
                    )}
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-[10px] p-4 flex items-start space-x-3 mb-6">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                            <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Connection Error</h4>
                            <p className="text-[13px] text-red-700 dark:text-red-300 mt-0.5">{error}</p>
                        </div>
                        <button
                            onClick={loadData}
                            className="px-3 py-1.5 bg-white/50 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800 text-red-800 dark:text-red-200 rounded-md text-[13px] font-medium border border-red-200/50 dark:border-red-800/50 transition-colors self-start cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Datasets Table */}
            <div className="bg-white dark:bg-slate-900/50 rounded-[10px] border border-slate-200 dark:border-slate-800/80 overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                <th className="px-5 py-3">Dataset Name</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Rows</th>
                                <th className="px-5 py-3">Uploaded By</th>
                                <th className="px-5 py-3">Uploaded Date</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[13px] text-slate-700 dark:text-slate-300">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-16 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center space-y-3">
                                            <Loader2 className="h-6 w-6 animate-spin text-accent" />
                                            <span className="font-medium text-slate-500 dark:text-slate-400">
                                                Fetching datasets...
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredDatasets.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center justify-center py-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center mb-4">
                                                <Database className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <p className="font-medium text-slate-900 dark:text-slate-200 text-sm mb-1">No datasets found</p>
                                            <p className="text-slate-500">
                                                Try uploading a CSV file to get started.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredDatasets.map((ds) => (
                                    <tr key={ds.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-md text-slate-500 dark:text-slate-400 group-hover:text-accent transition-colors">
                                                    <FileText className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-slate-200 truncate max-w-[240px]">
                                                        {ds.filename}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                                        {ds.id}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-md text-[11px] font-medium", getStatusStyle(ds.status))}
                                            >
                                                <span className={cn("h-1.5 w-1.5 rounded-full", getStatusDotColor(ds.status))} />
                                                <span>{ds.status}</span>
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 font-mono text-slate-500">
                                            {ds.rowCount !== null ? ds.rowCount.toLocaleString() : "—"}
                                        </td>
                                        <td className="px-5 py-3">
                                            {ds.user ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 text-[10px] font-semibold border border-slate-200 dark:border-slate-700">
                                                        {ds.user.fullName.charAt(0)}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-slate-800 dark:text-slate-200">{ds.user.fullName}</span>
                                                        <span className="text-[11px] text-slate-400">{ds.user.email}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 font-medium">System</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 text-slate-500">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                                <span>
                                                    {new Date(ds.uploadedAt).toLocaleDateString(undefined, {
                                                        year: "numeric",
                                                        month: "short",
                                                        day: "numeric",
                                                    })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link
                                                    to="/copilot"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                                >
                                                    <BarChart2 className="h-3.5 w-3.5" />
                                                    <span>Analyze</span>
                                                </Link>
                                                <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                                                    <ChevronRight className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageShell>
    );
}
