import { useState, useEffect } from "react";
import { Database, Plus, Search, Calendar, ChevronRight, FileText, BarChart2, Loader2, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getDatasets } from "../api/datasetApi";
import type { Dataset } from "../types/dataset";

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
        return "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50";
      case "FAILED":
        return "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50";
      case "PROCESSING":
      case "UPLOADED":
        return "bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
      default:
        return "bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-350 border-slate-200 dark:border-slate-800";
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return "bg-green-500";
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
    <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6 md:p-10 transition-colors">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Datasets
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Manage and view analysis metrics for your uploaded datasets.
            </p>
          </div>

          <Link
            to="/upload"
            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl text-sm font-bold shadow-sm transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Upload New</span>
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 mb-6 flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative w-full sm:max-w-xs flex items-center">
            <Search className="h-4 w-4 text-slate-400 absolute left-3" />
            <input
              type="text"
              placeholder="Search datasets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 pl-9 pr-4 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-blue/15 focus:border-brand-blue transition-all"
            />
          </div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 dark:text-slate-500 ml-auto font-medium">
            {!loading && (
              <span>
                Showing {filteredDatasets.length} of {datasets.length} datasets
              </span>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start space-x-3 mb-6">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-red-800 dark:text-red-450">Connection Error</h4>
                <p className="text-xs text-red-700 dark:text-red-500 mt-0.5">{error}</p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900 dark:hover:bg-red-800 text-red-800 dark:text-red-200 rounded-lg text-xs font-bold transition-colors self-start cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Datasets Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/35 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Dataset Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Rows</th>
                  <th className="px-6 py-4">Uploaded By</th>
                  <th className="px-6 py-4">Uploaded Date</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Fetching your datasets...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : filteredDatasets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center py-4">
                        <Database className="h-10 w-10 mb-3 text-slate-300 dark:text-slate-650" />
                        <p className="font-semibold text-slate-500 text-sm">No datasets found</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Try uploading a CSV file to get started.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDatasets.map((ds) => (
                    <tr key={ds.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-3">
                          <div className="bg-brand-blue/10 dark:bg-brand-blue/20 p-2 rounded-lg text-brand-blue dark:text-brand-blue-light">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[240px] sm:max-w-xs">
                              {ds.filename}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                              {ds.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 border rounded-full text-[10px] font-bold ${getStatusStyle(
                            ds.status
                          )}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor(ds.status)}`} />
                          <span>{ds.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium font-mono text-slate-600 dark:text-slate-400">
                        {ds.rowCount !== null ? ds.rowCount.toLocaleString() : "—"}
                      </td>
                      <td className="px-6 py-4">
                        {ds.user ? (
                          <div className="flex items-center space-x-2">
                            <div className="h-6 w-6 rounded-full bg-slate-150 dark:bg-slate-950 flex items-center justify-center text-slate-600 dark:text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-slate-800">
                              {ds.user.fullName.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{ds.user.fullName}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">{ds.user.email}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs font-medium">System / Unknown</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs font-medium">
                        <div className="flex items-center space-x-2">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>
                            {new Date(ds.uploadedAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Link
                            to="/chat"
                            className="inline-flex items-center space-x-1 px-3 py-1.5 bg-brand-blue/5 dark:bg-brand-blue/10 hover:bg-brand-blue hover:text-white text-brand-blue dark:text-brand-blue-light rounded-lg text-xs font-semibold border border-brand-blue/20 dark:border-brand-blue/30 transition-colors cursor-pointer"
                          >
                            <BarChart2 className="h-3.5 w-3.5 mr-0.5" />
                            <span>Analyze</span>
                          </Link>
                          <button className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-350 transition-colors cursor-pointer">
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
      </div>
    </div>
  );
}
