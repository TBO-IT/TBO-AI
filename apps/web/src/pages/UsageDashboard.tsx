import { useQuery } from "@tanstack/react-query";
import { 
    AreaChart, 
    Area, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend
} from "recharts";
import { Activity, CircleDollarSign, Hash, Zap } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import PageHeader from "../components/layout/PageHeader";
import { getUsageData } from "../api/usageApi";

export default function UsageDashboard() {
    const { data, isLoading, error } = useQuery({
        queryKey: ["api-usage"],
        queryFn: getUsageData,
    });

    if (isLoading) {
        return (
            <PageShell variant="default">
                <PageHeader title="API Usage" description="Track Claude API usage and costs over time." />
                <div className="flex items-center justify-center h-64 text-slate-500">
                    Loading usage data...
                </div>
            </PageShell>
        );
    }

    if (error || !data) {
        return (
            <PageShell variant="default">
                <PageHeader title="API Usage" description="Track Claude API usage and costs over time." />
                <div className="flex items-center justify-center h-64 text-red-500">
                    Failed to load usage data.
                </div>
            </PageShell>
        );
    }

    const { timeline, summary } = data;

    return (
        <PageShell variant="default">
            <PageHeader 
                title="API Usage" 
                description="Track Claude API usage and costs over time." 
            />

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Cost</h3>
                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                            <CircleDollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${summary.totalCost.toFixed(4)}
                    </div>
                </div>

                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Tokens</h3>
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {summary.totalTokens.toLocaleString()}
                    </div>
                </div>

                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">API Requests</h3>
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        {summary.totalRequests.toLocaleString()}
                    </div>
                </div>
                
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Cost / Req</h3>
                        <div className="p-2 bg-orange-500/10 rounded-lg">
                            <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${summary.totalRequests > 0 ? (summary.totalCost / summary.totalRequests).toFixed(4) : "0.0000"}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Cost Chart */}
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">Daily Cost ($)</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12, fill: '#64748b' }} 
                                    dy={10}
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return `${d.getMonth()+1}/${d.getDate()}`;
                                    }}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    formatter={(value: any) => [`$${Number(value).toFixed(4)}`, 'Cost']}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="estimatedCost" 
                                    stroke="#10b981" 
                                    strokeWidth={2}
                                    fillOpacity={1} 
                                    fill="url(#colorCost)" 
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Tokens Chart */}
                <div className="rounded-[10px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c101b] p-6 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-6">Token Usage</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12, fill: '#64748b' }} 
                                    dy={10}
                                    tickFormatter={(val) => {
                                        const d = new Date(val);
                                        return `${d.getMonth()+1}/${d.getDate()}`;
                                    }}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="inputTokens" name="Input Tokens" stackId="a" fill="#3b82f6" radius={[0, 0, 4, 4]} />
                                <Bar dataKey="outputTokens" name="Output Tokens" stackId="a" fill="#f5a623" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </PageShell>
    );
}
