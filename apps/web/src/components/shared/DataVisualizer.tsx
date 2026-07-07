import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp, Activity, AlertTriangle } from "lucide-react";
import { ChartRenderer } from "../charts/ChartRenderer";
import { TableRenderer } from "../charts/TableRenderer";

export function DataVisualizer({ payload }: { payload: any }) {
    if (!payload) return null;

    const { queryResults, executivePack, chart, table } = payload;
    
    // Tier-0 Structured Response Handling
    if (chart || table) {
        return (
            <div className="my-4 space-y-4">
                {chart && <ChartRenderer chart={chart} />}
                {table && <TableRenderer table={table} />}
            </div>
        );
    }

    // Legacy Fallback for LLM Responses
    if (!queryResults || queryResults.length === 0) {
        return null;
    }

    // Find numeric columns and categorical columns
    const keys = Object.keys(queryResults[0] || {});
    const numericKeys = keys.filter(k => typeof queryResults[0][k] === 'number');
    const categoricalKeys = keys.filter(k => typeof queryResults[0][k] === 'string');
    
    const xKey = categoricalKeys.length > 0 ? categoricalKeys[0] : keys[0];
    const yKey = numericKeys.length > 0 ? numericKeys[0] : keys[1];

    // Limit to top 10 for charting
    const chartData = queryResults.slice(0, 10);

    return (
        <div className="my-4 space-y-4">
            {/* Executive Summary Card (Renders instantly before text stream) */}
            {executivePack && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start space-x-3">
                        <div className="mt-0.5 bg-brand-blue/10 p-1.5 rounded-lg text-brand-blue">
                            {executivePack.headline?.toLowerCase().includes("risk") || executivePack.headline?.toLowerCase().includes("gap") 
                                ? <AlertTriangle className="h-4 w-4" /> 
                                : <TrendingUp className="h-4 w-4" />}
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                {executivePack.headline || "Data Insight"}
                            </h4>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                {executivePack.executiveSummary || "Analysis complete. Generating narrative..."}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Instant Chart */}
            {numericKeys.length > 0 && chartData.length > 1 && (
                <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm h-64">
                    <div className="flex items-center justify-between mb-4">
                        <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <Activity className="h-3.5 w-3.5" />
                            {yKey} by {xKey}
                        </h5>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey={xKey} 
                                tick={{ fontSize: 10, fill: '#888' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(val) => String(val).length > 10 ? String(val).substring(0, 10) + '...' : val}
                            />
                            <YAxis 
                                tick={{ fontSize: 10, fill: '#888' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(val) => {
                                    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'm';
                                    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
                                    return val;
                                }}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                            />
                            <Bar dataKey={yKey} radius={[4, 4, 0, 0]}>
                                {chartData.map((_: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? "#FF5A1F" : "#1e293b"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
