import React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Info, TrendingUp, AlertCircle, TrendingDown } from "lucide-react";
import type { DeepDiveData } from "../../api/deepDiveApi";

interface DeepDiveDashboardProps {
    data: DeepDiveData;
    children?: React.ReactNode;
}

export default function DeepDiveDashboard({ data, children }: DeepDiveDashboardProps) {
    if (!data.trendData || !data.distribution) return null;

    return (
        <div className="space-y-6 mt-8">
            {/* Trend Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* WoW Win Rate Trend */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-[13px] font-semibold text-slate-300">WoW Win Rate Trend</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>Win Rate (%)</span>
                            <ChevronDownIcon className="h-3 w-3" />
                        </div>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trendData.winRate} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px', color: '#fff' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                                <Line type="monotone" name={data.name} dataKey="current" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }} />
                                <Line type="monotone" name="Market Avg" dataKey="market" stroke="#64748b" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3, fill: '#64748b', strokeWidth: 2, stroke: '#0f172a' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* APW Bucket Trend */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-1.5">
                            <h3 className="text-[13px] font-semibold text-slate-300">APW Bucket Trend (Win Rate)</h3>
                            <Info className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>Win Rate (%)</span>
                            <ChevronDownIcon className="h-3 w-3" />
                        </div>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trendData.apw} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px' }} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                                <Line type="monotone" name="< 10 days" dataKey="d10" stroke="#60a5fa" strokeWidth={2} dot={false} />
                                <Line type="monotone" name="10-15 days" dataKey="d15" stroke="#a78bfa" strokeWidth={2} dot={false} />
                                <Line type="monotone" name="15-30 days" dataKey="d30" stroke="#fbbf24" strokeWidth={2} dot={false} />
                                <Line type="monotone" name="31-45 days" dataKey="d45" stroke="#34d399" strokeWidth={2} dot={false} />
                                <Line type="monotone" name="46-60 days" dataKey="d60" stroke="#f87171" strokeWidth={2} dot={false} />
                                <Line type="monotone" name="60+ days" dataKey="d90" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Price Gap Trend */}
                <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-1.5">
                            <h3 className="text-[13px] font-semibold text-slate-300">Price Gap Trend (Avg. %)</h3>
                            <Info className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span>Avg. Price Gap (%)</span>
                            <ChevronDownIcon className="h-3 w-3" />
                        </div>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trendData.priceGap} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px' }} />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                                <Line type="monotone" name={data.name} dataKey="current" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }} />
                                <Line type="monotone" name="Market Avg" dataKey="market" stroke="#64748b" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3, fill: '#64748b', strokeWidth: 2, stroke: '#0f172a' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Bottom Row (Children + Dist + Key Insights) */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* 1. Children (Top Suppliers/Properties) */}
                <div className="col-span-1">
                    {children}
                </div>

                {/* Price Gap Distribution */}
                <div className="col-span-3">
                    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 h-full">
                        <div className="flex items-center gap-1.5 mb-6">
                            <h3 className="text-[13px] font-semibold tracking-wide uppercase text-slate-400">Price Gap Distribution</h3>
                            <Info className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        
                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50">
                                <p className="text-xs text-slate-400 mb-1">Avg. Win Margin</p>
                                <p className="text-lg font-bold text-emerald-400">+{data.distribution.winMargin.avg}%</p>
                            </div>
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50">
                                <p className="text-xs text-slate-400 mb-1">Median Win Margin</p>
                                <p className="text-lg font-bold text-emerald-400">+{data.distribution.winMargin.median}%</p>
                            </div>
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50">
                                <p className="text-xs text-slate-400 mb-1">Avg. Loss Margin</p>
                                <p className="text-lg font-bold text-red-400">{data.distribution.lossMargin.avg}%</p>
                            </div>
                            <div className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50">
                                <p className="text-xs text-slate-400 mb-1">Median Loss Margin</p>
                                <p className="text-lg font-bold text-red-400">{data.distribution.lossMargin.median}%</p>
                            </div>
                        </div>

                        {/* Stacked Bar */}
                        <div className="flex h-10 w-full rounded-md overflow-hidden mb-3">
                            <div className="bg-emerald-500 flex items-center justify-center text-xs font-bold text-emerald-950" style={{ width: `${data.distribution.segments.winHigh}%` }}>{data.distribution.segments.winHigh}%</div>
                            <div className="bg-emerald-400 flex items-center justify-center text-xs font-bold text-emerald-950" style={{ width: `${data.distribution.segments.winLow}%` }}>{data.distribution.segments.winLow}%</div>
                            <div className="bg-slate-600 flex items-center justify-center text-xs font-bold text-white" style={{ width: `${data.distribution.segments.within}%` }}>{data.distribution.segments.within}%</div>
                            <div className="bg-orange-400 flex items-center justify-center text-xs font-bold text-orange-950" style={{ width: `${data.distribution.segments.lossLow}%` }}>{data.distribution.segments.lossLow}%</div>
                            <div className="bg-red-500 flex items-center justify-center text-xs font-bold text-white" style={{ width: `${data.distribution.segments.lossHigh}%` }}>{data.distribution.segments.lossHigh}%</div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 px-2 gap-y-2">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Winning {'>'} 10%</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400"></div> Winning 0-10%</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-600"></div> Within ±2%</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-orange-400"></div> Losing 0-10%</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> Losing {'>'} 10%</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ChevronDownIcon(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    )
}
