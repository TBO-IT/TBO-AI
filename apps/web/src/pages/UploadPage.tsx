import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../api/client";
import PageShell from "../components/layout/PageShell";
import PageHeader from "../components/layout/PageHeader";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [datasetId, setDatasetId] = useState("");
    const [error, setError] = useState("");

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            if (!selected.name.endsWith(".csv")) {
                setError("Only CSV files are supported.");
                setFile(null);
                return;
            }
            if (selected.size > 50 * 1024 * 1024) {
                setError("File size exceeds the 50MB limit. Please upload a smaller dataset.");
                setFile(null);
                return;
            }
            setFile(selected);
            setError("");
            setDatasetId("");
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        try {
            setUploading(true);
            setError("");
            setDatasetId("");

            const formData = new FormData();
            formData.append("file", file);

            const response = await api.post("/upload", formData);

            if (response.data && response.data.datasetId) {
                setDatasetId(response.data.datasetId);
                setFile(null);
            } else {
                throw new Error("Invalid response from server");
            }
        } catch (err: any) {
            console.error(err);
            const errData = err.response?.data?.error;
            const errMsg = typeof errData === "string" ? errData : (errData?.message || JSON.stringify(errData));
            setError(
                errMsg ||
                "Failed to upload the dataset. Please check backend server status."
            );
        } finally {
            setUploading(false);
        }
    };

    return (
        <PageShell variant="default">
            <PageHeader
                title="Upload Dataset"
                description="Import raw CSV data to analyze performance, risks, and strategic opportunities."
            />

            {/* Upload Container Card */}
            <div className="bg-white dark:bg-slate-900/50 rounded-[10px] border border-slate-200 dark:border-slate-800/80 p-8 flex flex-col items-center transition-colors">

                {/* Visual Drop Area */}
                <div className="w-full max-w-xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-accent/50 dark:hover:border-accent/50 rounded-xl p-10 flex flex-col items-center text-center transition-colors bg-slate-50/50 dark:bg-slate-950/20 group relative">
                    <input
                        type="file"
                        accept=".csv"
                        id="file-upload"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />

                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm text-slate-400 group-hover:text-accent group-hover:scale-105 transition-all duration-200 mb-4">
                        <Upload className="h-6 w-6" />
                    </div>

                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Select or Drop CSV Dataset
                    </h3>
                    <p className="text-[13px] text-slate-500 max-w-xs">
                        Supports CSV files containing analytical dimension metrics (e.g. hotel, supplier, win rate, price difference).
                    </p>

                    {file && (
                        <div className="mt-6 p-3 bg-accent/5 border border-accent/20 rounded-[10px] flex items-center gap-3 text-left w-full z-20 relative">
                            <div className="bg-accent/10 p-2 rounded-lg text-accent">
                                <FileText className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                                <p className="text-[11px] text-slate-500 font-medium">
                                    {(file.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Button */}
                <div className="mt-8 w-full max-w-xl flex justify-end">
                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className={cn(
                            "px-6 py-2.5 rounded-lg text-[13px] font-medium transition-all flex items-center justify-center gap-2 cursor-pointer",
                            file && !uploading
                                ? "bg-accent hover:bg-accent-hover text-white shadow-sm"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                        )}
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Uploading...</span>
                            </>
                        ) : (
                            <>
                                <Upload className="h-4 w-4" />
                                <span>Upload & Process</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Notifications */}
            {(datasetId || error) && (
                <div className="mt-6">
                    {datasetId && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-[10px] p-5 flex items-start gap-4">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Dataset Uploaded Successfully</h4>
                                <p className="text-[13px] text-emerald-700 dark:text-emerald-300 mt-1 mb-3">
                                    Your data has been parsed and is ready for analysis.
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-950/50 border border-emerald-200/50 dark:border-emerald-800/50 rounded-md px-3 py-1.5">
                                        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">ID</span>
                                        <code className="text-[12px] font-mono text-slate-700 dark:text-slate-300 select-all">
                                            {datasetId}
                                        </code>
                                    </div>
                                    <Link
                                        to="/copilot"
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[13px] font-medium transition-colors"
                                    >
                                        Go to Copilot
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-[10px] p-5 flex items-start gap-4">
                            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Upload Failed</h4>
                                <p className="text-[13px] text-red-700 dark:text-red-300 mt-1">{error}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </PageShell>
    );
}