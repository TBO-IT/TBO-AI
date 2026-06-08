import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../api/client";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [datasetId, setDatasetId] = useState("");
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.name.endsWith(".csv")) {
        setFile(selected);
        setError("");
        setDatasetId("");
      } else {
        setError("Only CSV files are supported.");
        setFile(null);
      }
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
        setFile(null); // Clear selected file upon success
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error || 
        "Failed to upload the dataset. Please check backend server status."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 md:p-10 transition-colors">
      <div className="max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Upload Dataset
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Import raw CSV data to analyze hotel competitiveness, win rates, and supplier pricing.
          </p>
        </div>

        {/* Upload Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 flex flex-col items-center transition-colors">
          
          {/* Visual Drop Area */}
          <div className="w-full max-w-xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-brand-orange/50 dark:hover:border-brand-orange/30 rounded-2xl p-10 flex flex-col items-center text-center transition-colors bg-slate-50/50 dark:bg-slate-950/20 group relative">
            <input
              type="file"
              accept=".csv"
              id="file-upload"
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm text-slate-400 dark:text-slate-500 group-hover:text-brand-orange dark:group-hover:text-brand-orange-light group-hover:scale-105 transition-all duration-300 mb-4">
              <Upload className="h-8 w-8" />
            </div>
            
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select or Drop CSV Dataset
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">
              Supports CSV files with columns like Competitive Status, price_diff_perc, suppliername, etc.
            </p>

            {file && (
              <div className="mt-6 p-3 bg-blue-50 dark:bg-blue-950/25 border border-blue-100 dark:border-blue-900/40 rounded-xl flex items-center space-x-3 text-left w-full">
                <div className="bg-brand-blue/10 p-2 rounded-lg text-brand-blue dark:text-brand-blue-light">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{file.name}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
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
              className={`w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                file && !uploading
                  ? "bg-brand-blue hover:bg-brand-blue-dark text-white"
                  : "bg-slate-100 dark:bg-slate-950 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-850"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading Dataset...</span>
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

        {/* Notifications (Success or Error) */}
        {(datasetId || error) && (
          <div className="mt-6 max-w-3xl">
            {datasetId && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-xl p-5 flex items-start space-x-4">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-green-800 dark:text-green-400">Dataset Uploaded Successfully!</h4>
                  <p className="text-xs text-green-700 dark:text-green-500 mt-1">
                    Your data has been parsed and loaded into the DuckDB instance. You can now reference this dataset inside the chat interface.
                  </p>
                  <div className="mt-3 flex items-center space-x-3 bg-white dark:bg-slate-950 border border-green-100 dark:border-green-900/30 rounded-lg p-2 max-w-md">
                    <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider pl-1.5">ID:</span>
                    <code className="text-xs font-mono font-bold text-slate-700 dark:text-slate-350 break-all select-all">
                      {datasetId}
                    </code>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-5 flex items-start space-x-4">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-800 dark:text-red-400">Upload Failed</h4>
                  <p className="text-xs text-red-700 dark:text-red-500 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}