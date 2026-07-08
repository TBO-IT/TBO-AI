import { useState, useEffect } from "react";
import { 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    Legend
} from "recharts";
import { 
    TrendingUp, 
    TrendingDown, 
    Percent, 
    Activity, 
    AlertCircle, 
    Sparkles, 
    Database, 
    ArrowUpRight, 
    ArrowDownRight,
    HelpCircle,
    Info,
    Calendar,
    ChevronRight,
    BarChart3
} from "lucide-react";
import PageShell from "../components/layout/PageShell";
import PageHeader from "../components/layout/PageHeader";
import { getDatasets } from "../api/datasetApi";
import { getWeeklyComparison, type WeeklyComparisonResponse } from "../api/deepDiveApi";
import type { Dataset } from "../types/dataset";
import { cn } from "../lib/utils";

export default function WeeklyComparisonPage() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedDataset, setSelectedDataset] = useState<string>("");
    const [threshold, setThreshold] = useState<number>(5); // Default 5%
    const [loadingDatasets, setLoadingDatasets] = useState(true);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState("");
    const [data, setData] = useState<WeeklyComparisonResponse | null>(null);

    // Load available datasets
    useEffect(() => {
        async function load() {
            try {
                const list = await getDatasets();
                // Filter to completed competitiveness datasets or fallback
                setDatasets(list);
                if (list.length > 0) {
                    setSelectedDataset(list[0].id);
                }
            } catch (err) {
                console.error(err);
                setError("Failed to load datasets. Please check backend connection.");
            } finally {
                setLoadingDatasets(false);
            }
        }
        load();
    }, []);

    // Load WoW comparison data when dataset or threshold changes
    useEffect(() => {
        if (!selectedDataset) return;

        async function fetchData() {
            setLoadingData(true);
            setError("");
            try {
                const res = await getWeeklyComparison(selectedDataset, threshold);
                if (res.success) {
                    setData(res);
                } else {
                    setError("Failed to fetch weekly comparison details.");
                }
            } catch (err: any) {
                console.error(err);
                const errMsg = err.response?.data?.error || "Error loading WoW statistics.";
                setError(errMsg);
                setData(null);
            } finally {
                setLoadingData(false);
            }
        }

        fetchData();
    }, [selectedDataset, threshold]);

    // Format WoW delta badge
    const renderDelta = (value: number, isPercentage: boolean = true, invertGoodBad: boolean = false) => {
        if (value === 0) {
            return (
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                    0.0{isPercentage ? "%" : ""}
                </span>
            );
        }

        // Standard: positive is good, negative is bad.
        // Invert (e.g. price diff): negative is good (cheaper), positive is bad.
        const isPositive = value > 0;
        const isGood = invertGoodBad ? !isPositive : isPositive;

        return (
            <span className={cn(
                "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors",
                isGood 
                    ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" 
                    : "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
            )}>
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <span>
                    {isPositive ? "+" : ""}{value.toFixed(1)}{isPercentage ? "%" : ""}
                </span>
            </span>
        );
    };

    return (
        <PageShell variant="wide">
            <PageHeader 
                title="Weekly Competitiveness Trends" 
                description="Compare latest week results vs previous week and assess pricing strategies dynamically."
            />

            {/* Selector and Slider Control */}
            <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-6 mb-8 transition-colors">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    
                    {/* Dataset Dropdown */}
                    <div className="flex flex-col">
                        <label className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                            <Database className="h-4 w-4 text-slate-400" />
                            Select Dataset Context
                        </label>
                        <select
                            value={selectedDataset}
                            onChange={(e) => setSelectedDataset(e.target.value)}
                            disabled={loadingDatasets}
                            className="w-full h-11 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/60 rounded-lg px-4 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50 transition-all outline-none"
                        >
                            {loadingDatasets && <option value="">Loading datasets...</option>}
                            {!loadingDatasets && datasets.length === 0 && <option value="">No datasets found</option>}
                            {datasets.map(ds => (
                                <option key={ds.id} value={ds.id}>{ds.filename}</option>
                            ))}
                        </select>
                    </div>

                    {/* Threshold Slider */}
                    <div className="flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <HelpCircle className="h-4 w-4 text-slate-400" />
                                TBO Pricing Advantage Threshold
                            </label>
                            <span className="text-sm font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-md">
                                TBO is at least {threshold}% cheaper
                            </span>
                        </div>
                        <div className="flex items-center gap-4">
                            <input 
                                type="range" 
                                min="0" 
                                max="15" 
                                step="0.5" 
                                value={threshold} 
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                            <div className="flex justify-between text-[11px] text-slate-400 font-medium w-12 text-right">
                                {threshold.toFixed(1)}%
                            </div>
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                            Defines custom win rate as the % of records where TBO price is lower than competition by at least the specified threshold percentage.
                        </span>
                    </div>

                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start space-x-3 mb-8 transition-all">
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-semibold text-red-800 dark:text-red-400">Analysis Error</h4>
                        <p className="text-[13px] text-red-700 dark:text-red-300 mt-0.5">{error}</p>
                    </div>
                </div>
            )}

            {/* Loading Data */}
            {loadingData && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Activity className="h-8 w-8 animate-spin text-accent mb-4" />
                    <span className="text-sm font-medium">Recalculating WoW competitiveness statistics...</span>
                </div>
            )}

            {/* Main Stats Area */}
            {!loadingData && data && (
                <div className="space-y-8">

                    {/* Trend Banner */}
                    <div className={cn(
                        "rounded-xl border p-5 flex items-start gap-4 transition-all shadow-sm",
                        data.trends.overallTrend === "positive" 
                            ? "bg-emerald-50/50 dark:bg-emerald-950/5 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                            : "bg-red-50/50 dark:bg-red-950/5 border-red-200/60 dark:border-red-900/40 text-red-800 dark:text-red-300"
                    )}>
                        <div className={cn(
                            "p-2.5 rounded-lg flex-shrink-0",
                            data.trends.overallTrend === "positive" 
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-red-500/10 text-red-600 dark:text-red-400"
                        )}>
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-1">
                                {data.trends.overallTrend === "positive" ? "Positive Trend Suggestion" : "Caution: Negative Trend Suggestion"}
                            </h3>
                            <p className="text-[13px] leading-relaxed opacity-90">
                                {data.trends.suggestion}
                            </p>
                        </div>
                    </div>

                    {/* KPI Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        
                        {/* Custom Win Rate Card */}
                        <div className="bg-white dark:bg-[#0c101b] rounded-xl border border-slate-200 dark:border-slate-800/80 p-5 shadow-sm transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custom Win Rate</h4>
                                    <span className="text-[10px] text-slate-500 font-medium">({threshold}% threshold)</span>
                                </div>
                                <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                                    <TrendingUp className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {data.latestWeek.customWinRate}%
                                </span>
                                {data.previousWeek && renderDelta(data.trends.customWinRateDelta)}
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                Previous Week: {data.previousWeek ? `${data.previousWeek.customWinRate}%` : "N/A"}
                            </div>
                        </div>

                        {/* Standard Win Rate Card */}
                        <div className="bg-white dark:bg-[#0c101b] rounded-xl border border-slate-200 dark:border-slate-800/80 p-5 shadow-sm transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Standard Win Rate</h4>
                                    <span className="text-[10px] text-slate-500 font-medium">(Cheaper at all)</span>
                                </div>
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                    <Activity className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {data.latestWeek.winRate}%
                                </span>
                                {data.previousWeek && renderDelta(data.trends.standardWinRateDelta)}
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                Previous Week: {data.previousWeek ? `${data.previousWeek.winRate}%` : "N/A"}
                            </div>
                        </div>

                        {/* Price Difference Card */}
                        <div className="bg-white dark:bg-[#0c101b] rounded-xl border border-slate-200 dark:border-slate-800/80 p-5 shadow-sm transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Avg Price Diff</h4>
                                    <span className="text-[10px] text-slate-500 font-medium">(Negative is better)</span>
                                </div>
                                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                    <Percent className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {data.latestWeek.avgPriceDiff}%
                                </span>
                                {data.previousWeek && renderDelta(data.trends.priceDiffDelta, true, true)}
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                Previous Week: {data.previousWeek ? `${data.previousWeek.avgPriceDiff}%` : "N/A"}
                            </div>
                        </div>

                        {/* Volume Card */}
                        <div className="bg-white dark:bg-[#0c101b] rounded-xl border border-slate-200 dark:border-slate-800/80 p-5 shadow-sm transition-colors">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Queries</h4>
                                    <span className="text-[10px] text-slate-500 font-medium">(Interaction count)</span>
                                </div>
                                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                                    <Calendar className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {data.latestWeek.totalQueries.toLocaleString()}
                                </span>
                                {data.previousWeek && renderDelta(data.latestWeek.totalQueries - data.previousWeek.totalQueries, false)}
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                Previous Week: {data.previousWeek ? data.previousWeek.totalQueries.toLocaleString() : "N/A"}
                            </div>
                        </div>

                    </div>

                    {/* Chart & Tables */}
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        
                        {/* Weekly Comparison Chart */}
                        <div className="xl:col-span-2 bg-white dark:bg-[#0c101b] border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col transition-colors">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                                <BarChart3 className="w-4.5 h-4.5 text-accent" />
                                Win Rate Trend over Weeks (%)
                            </h3>
                            <div className="w-full h-80 flex-1">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data.weeklyHistory} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} />
                                        <XAxis 
                                            dataKey="week" 
                                            stroke="#64748b" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={false} 
                                            dy={10}
                                        />
                                        <YAxis 
                                            stroke="#64748b" 
                                            fontSize={11} 
                                            tickLine={false} 
                                            axisLine={false}
                                            domain={[0, 'auto']}
                                        />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                                            labelClassName="text-[12px] font-bold text-slate-300"
                                            itemStyle={{ fontSize: "12px" }}
                                        />
                                        <Legend verticalAlign="top" height={36} iconType="circle" />
                                        <Line 
                                            type="monotone" 
                                            dataKey="winRate" 
                                            name="Standard Win Rate (%)" 
                                            stroke="#3b82f6" 
                                            strokeWidth={3}
                                            activeDot={{ r: 6 }} 
                                            dot={{ strokeWidth: 2 }}
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="customWinRate" 
                                            name={`Custom Win Rate (${threshold}%)`} 
                                            stroke="#f97316" 
                                            strokeWidth={3}
                                            activeDot={{ r: 6 }} 
                                            dot={{ strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Detailed Table comparison */}
                        <div className="bg-white dark:bg-[#0c101b] border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm flex flex-col transition-colors">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                                <Info className="w-4.5 h-4.5 text-accent" />
                                WoW Comparison Details
                            </h3>

                            <div className="space-y-4 flex-1">
                                
                                {/* Dates display */}
                                <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800/50 rounded-lg flex justify-between text-xs text-slate-500 font-medium">
                                    <div>
                                        <span className="text-[10px] text-slate-400 uppercase block font-bold">Latest Week</span>
                                        <span className="text-slate-800 dark:text-slate-200 mt-0.5 block">{data.latestWeek.date}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] text-slate-400 uppercase block font-bold">Previous Week</span>
                                        <span className="text-slate-800 dark:text-slate-200 mt-0.5 block">{data.previousWeek ? data.previousWeek.date : "N/A"}</span>
                                    </div>
                                </div>

                                <div className="space-y-3.5 text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-6">
                                    
                                    {/* Custom Win Rate Row */}
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                                        <span>Custom Win Rate</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? `${data.previousWeek.customWinRate}%` : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">{data.latestWeek.customWinRate}%</span>
                                        </div>
                                    </div>

                                    {/* Standard Win Rate Row */}
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                                        <span>Standard Win Rate</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? `${data.previousWeek.winRate}%` : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">{data.latestWeek.winRate}%</span>
                                        </div>
                                    </div>

                                    {/* Avg Price Diff Row */}
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                                        <span>Avg Price Difference</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? `${data.previousWeek.avgPriceDiff}%` : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">{data.latestWeek.avgPriceDiff}%</span>
                                        </div>
                                    </div>

                                    {/* Avg Prices Row */}
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                                        <span>Avg TBO Price</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? `$${data.previousWeek.avgTboPrice.toFixed(2)}` : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">${data.latestWeek.avgTboPrice.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/50">
                                        <span>Avg Comp Price</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? `$${data.previousWeek.avgCompPrice.toFixed(2)}` : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">${data.latestWeek.avgCompPrice.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    {/* Total Queries Row */}
                                    <div className="flex items-center justify-between pb-3">
                                        <span>Interaction Volume</span>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-mono text-slate-500">{data.previousWeek ? data.previousWeek.totalQueries.toLocaleString() : "N/A"}</span>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-900 dark:text-white font-mono">{data.latestWeek.totalQueries.toLocaleString()}</span>
                                        </div>
                                    </div>

                                </div>

                            </div>
                        </div>

                    </div>

                </div>
            )}
            
            {/* Empty state when no data and not loading */}
            {!loadingData && !data && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <AlertCircle className="h-10 w-10 text-slate-500 mb-4" />
                    <span className="text-sm font-medium">Select a dataset context to begin week-over-week analysis.</span>
                </div>
            )}
        </PageShell>
    );
}
