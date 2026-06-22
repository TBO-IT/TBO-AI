import { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { ChevronLeft, AlertTriangle, Building, Activity, LineChart, Target, ShieldAlert, Link as LinkIcon } from "lucide-react";
import PageShell from "../components/layout/PageShell";
import MetricCard from "../components/shared/MetricCard";
import { getChainDeepDive, type DeepDiveData } from "../api/deepDiveApi";

export default function ChainDeepDivePage() {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const datasetId = searchParams.get("datasetId") || "";

    const [data, setData] = useState<DeepDiveData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        async function load() {
            if (!id) {
                setError("Missing chain ID");
                setLoading(false);
                return;
            }
            try {
                const result = await getChainDeepDive(id, datasetId || "demo");
                setData(result);
            } catch (err) {
                console.error(err);
                setError("Failed to load chain profile");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id, datasetId]);

    if (loading) {
        return (
            <PageShell>
                <div className="flex items-center justify-center py-20 text-slate-400">Loading profile...</div>
            </PageShell>
        );
    }

    if (error || !data) {
        return (
            <PageShell>
                <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-6 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5" />
                    <span>{error || "Chain not found."}</span>
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell variant="default">
            {/* Nav */}
            <Link 
                to="/deep-dives" 
                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-6"
            >
                <ChevronLeft className="h-4 w-4" />
                Back to Deep Dives
            </Link>

            {/* Header */}
            <div className="flex items-start gap-4 mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <LinkIcon className="h-8 w-8 text-purple-500" />
                </div>
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {data.name}
                        </h1>
                        <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold tracking-wider uppercase text-slate-600 dark:text-slate-300">
                            Chain Profile
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                        <Activity className="h-4 w-4" /> Analyzed from latest dataset • Aggregate Performance
                    </p>
                </div>
            </div>

            {/* Opportunity Banner */}
            {data.opportunityAssessment && (
                <div className="mb-8 p-5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <div>
                        <h4 className="text-[13px] font-bold text-emerald-900 dark:text-emerald-300 mb-1">
                            Executive Opportunity: {data.opportunityAssessment.level}
                        </h4>
                        <p className="text-sm text-emerald-800 dark:text-emerald-200/80 leading-relaxed">
                            {data.opportunityAssessment.primaryOpportunity}
                        </p>
                    </div>
                </div>
            )}

            {/* Key Metrics */}
            <div className="mb-10">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                    <LineChart className="h-4 w-4" /> Aggregate Metrics
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard 
                        title="Overall Win Rate" 
                        value={data.metrics.winRate.value} 
                        delta={data.metrics.winRate.delta} 
                        trend={data.metrics.winRate.trend}
                        format="percentage"
                    />
                    <MetricCard 
                        title="Price Competitiveness" 
                        value={data.metrics.priceCompetitiveness.value} 
                        delta={data.metrics.priceCompetitiveness.delta} 
                        trend={data.metrics.priceCompetitiveness.trend}
                        format="percentage"
                    />
                    <MetricCard 
                        title="Volume Share" 
                        value={data.metrics.volumeShare.value} 
                        delta={data.metrics.volumeShare.delta} 
                        trend={data.metrics.volumeShare.trend}
                        format="percentage"
                    />
                    <MetricCard 
                        title="Total Queries" 
                        value={data.metrics.totalQueries.value.toLocaleString()} 
                        delta={data.metrics.totalQueries.delta} 
                        trend={data.metrics.totalQueries.trend}
                        format="number"
                    />
                </div>
            </div>

            {/* Top Properties */}
            {data.topProperties && data.topProperties.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                        <Target className="h-4 w-4" /> Top Properties
                    </h3>
                    <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 overflow-hidden">
                        <table className="w-full text-left text-[13px]">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 text-slate-500 dark:text-slate-400">
                                    <th className="font-medium py-3 px-5">Property Name</th>
                                    <th className="font-medium py-3 px-5">Win Rate</th>
                                    <th className="font-medium py-3 px-5 text-right">Volume Share</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.topProperties.map((prop, idx) => (
                                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/40 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="py-3 px-5 font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                            <Building className="h-3.5 w-3.5 text-slate-400" />
                                            {prop.name}
                                        </td>
                                        <td className="py-3 px-5 text-slate-600 dark:text-slate-300">
                                            <span className="font-medium">{prop.winRate}%</span>
                                        </td>
                                        <td className="py-3 px-5 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <span className="font-medium text-slate-600 dark:text-slate-300">{prop.share}%</span>
                                                <div className="w-24 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                    <div className="h-full bg-accent rounded-full" style={{ width: `${prop.share}%` }} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </PageShell>
    );
}
