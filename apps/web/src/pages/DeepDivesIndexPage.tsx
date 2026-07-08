import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Building2, Building, Database, Link as LinkIcon, MapPin, TrendingUp, ArrowRight } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import { getDatasets } from "../api/datasetApi";
import type { Dataset } from "../types/dataset";
import { cn } from "../lib/utils";

export default function DeepDivesIndexPage() {
    const navigate = useNavigate();
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<string>("");
    
    const [hotelQuery, setHotelQuery] = useState("");
    const [supplierQuery, setSupplierQuery] = useState("");
    const [chainQuery, setChainQuery] = useState("");
    const [destinationQuery, setDestinationQuery] = useState("");

    useEffect(() => {
        getDatasets().then(data => {
            setDatasets(data);
            if (data.length > 0) {
                setSelectedDataset(data[0].id);
            }
        }).catch(console.error);
    }, []);

    const handleDestinationSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (destinationQuery.trim() && selectedDataset) {
            navigate(`/deep-dives/destination/${encodeURIComponent(destinationQuery.trim())}?datasetId=${selectedDataset}`);
        }
    };

    const handleHotelSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (hotelQuery.trim() && selectedDataset) {
            navigate(`/deep-dives/hotel/${encodeURIComponent(hotelQuery.trim())}?datasetId=${selectedDataset}`);
        }
    };

    const handleSupplierSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (supplierQuery.trim() && selectedDataset) {
            navigate(`/deep-dives/supplier/${encodeURIComponent(supplierQuery.trim())}?datasetId=${selectedDataset}`);
        }
    };

    const handleChainSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (chainQuery.trim() && selectedDataset) {
            navigate(`/deep-dives/chain/${encodeURIComponent(chainQuery.trim())}?datasetId=${selectedDataset}`);
        }
    };

    return (
        <PageShell variant="default">
            <div className="max-w-4xl mx-auto py-10">
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-3">
                        Entity Deep Dives
                    </h1>
                    <p className="text-slate-500 max-w-xl mx-auto">
                        Query the database to analyze specific performance, risks, and opportunities for any individual hotel or supplier.
                    </p>
                </div>

                {/* Weekly WoW Preset Banner */}
                <div
                    onClick={() => navigate("/weekly-comparison")}
                    className="group cursor-pointer mb-8 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/10 border border-orange-200/60 dark:border-orange-800/30 rounded-xl p-5 flex items-center gap-4 hover:border-orange-300 dark:hover:border-orange-700/50 hover:shadow-md transition-all"
                >
                    <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-500/15 border border-orange-200 dark:border-orange-500/20 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="h-6 w-6 text-orange-500" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-0.5">
                            Weekly WoW Competitiveness Trends
                            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-md">New Preset</span>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Compare latest week vs previous week. View TBO win rates defined by a custom pricing advantage threshold and assess if trends are positive.
                        </p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-orange-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>

                <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 mb-8">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                        <Database className="h-4 w-4" /> Select Dataset Context
                    </label>
                    <select
                        value={selectedDataset}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        className="w-full h-11 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-accent outline-none"
                    >
                        {datasets.length === 0 && <option value="">Loading datasets...</option>}
                        {datasets.map(d => (
                            <option key={d.id} value={d.id}>{d.filename}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                    {/* Destination Search */}
                    <form onSubmit={handleDestinationSubmit} className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center mb-4">
                            <MapPin className="h-6 w-6 text-blue-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Destination Analysis</h2>
                        <p className="text-sm text-slate-500 mb-6">Enter a destination name to view its win rate, pricing trends, and top properties.</p>
                        
                        <div className="mt-auto relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="e.g. Dubai..."
                                value={destinationQuery}
                                onChange={(e) => setDestinationQuery(e.target.value)}
                                className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-accent outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!destinationQuery.trim() || !selectedDataset}
                            className={cn(
                                "mt-4 w-full h-10 rounded-lg font-medium text-sm transition-colors",
                                destinationQuery.trim() && selectedDataset
                                    ? "bg-blue-500 hover:bg-blue-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            Analyze Destination
                        </button>
                    </form>

                    {/* Hotel Search */}
                    <form onSubmit={handleHotelSubmit} className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col">
                        <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center mb-4">
                            <Building2 className="h-6 w-6 text-indigo-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Hotel Analysis</h2>
                        <p className="text-sm text-slate-500 mb-6">Enter a hotel name to view its win rate, volume share, and top connected suppliers.</p>
                        
                        <div className="mt-auto relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="e.g. Hilton London..."
                                value={hotelQuery}
                                onChange={(e) => setHotelQuery(e.target.value)}
                                className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-accent outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!hotelQuery.trim() || !selectedDataset}
                            className={cn(
                                "mt-4 w-full h-10 rounded-lg font-medium text-sm transition-colors",
                                hotelQuery.trim() && selectedDataset
                                    ? "bg-indigo-500 hover:bg-indigo-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            Analyze Hotel
                        </button>
                    </form>

                    {/* Supplier Search */}
                    <form onSubmit={handleSupplierSubmit} className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col">
                        <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mb-4">
                            <Building className="h-6 w-6 text-emerald-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Supplier Analysis</h2>
                        <p className="text-sm text-slate-500 mb-6">Enter a supplier name to identify opportunities and view its top hotel distribution.</p>
                        
                        <div className="mt-auto relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="e.g. Expedia..."
                                value={supplierQuery}
                                onChange={(e) => setSupplierQuery(e.target.value)}
                                className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-accent outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!supplierQuery.trim() || !selectedDataset}
                            className={cn(
                                "mt-4 w-full h-10 rounded-lg font-medium text-sm transition-colors",
                                supplierQuery.trim() && selectedDataset
                                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            Analyze Supplier
                        </button>
                    </form>

                    {/* Chain Search */}
                    <form onSubmit={handleChainSubmit} className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 flex flex-col">
                        <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center mb-4">
                            <LinkIcon className="h-6 w-6 text-purple-500" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Chain Analysis</h2>
                        <p className="text-sm text-slate-500 mb-6">Enter a chain name to view aggregate performance and top properties.</p>
                        
                        <div className="mt-auto relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="e.g. Marriott..."
                                value={chainQuery}
                                onChange={(e) => setChainQuery(e.target.value)}
                                className="w-full h-11 pl-10 pr-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-accent outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!chainQuery.trim() || !selectedDataset}
                            className={cn(
                                "mt-4 w-full h-10 rounded-lg font-medium text-sm transition-colors",
                                chainQuery.trim() && selectedDataset
                                    ? "bg-purple-500 hover:bg-purple-600 text-white"
                                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                            )}
                        >
                            Analyze Chain
                        </button>
                    </form>
                </div>
            </div>
        </PageShell>
    );
}
