import { Target, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import { FormattedText } from "../pages/ChatPage";

interface KPIProps {
    data: Record<string, string>;
}

export function ExecutiveKPICard({ data }: KPIProps) {
    const target = data["Target"] || "Unknown Target";
    const metric = data["Business Metric"] || "Metric";
    const impact = data["Business Impact"] || "0";
    const volume = data["Volume"] || "Unknown";
    const roi = data["Expected ROI"] || "TBD";

    const isPositive = !impact.includes("-") && !impact.includes("decline") && !impact.includes("lower");

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1423] p-5 shadow-sm mb-4">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "p-2 rounded-lg",
                        isPositive ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                    )}>
                        {isPositive ? <TrendingUp className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                    </div>
                    <div>
                        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">Primary Target</div>
                        <div className="text-base font-bold text-slate-900 dark:text-slate-100"><FormattedText text={target} /></div>
                    </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400"><FormattedText text={metric} /></div>
                    <div className={cn(
                        "text-lg font-bold",
                        isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    )}>
                        <FormattedText text={impact} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Volume</div>
                    <div className="text-[13px] font-medium text-slate-800 dark:text-slate-200"><FormattedText text={volume} /></div>
                </div>
                <div className="space-y-1">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Expected ROI</div>
                    <div className="text-[13px] font-medium text-slate-800 dark:text-slate-200"><FormattedText text={roi} /></div>
                </div>
            </div>
        </div>
    );
}

interface RecProps {
    title: string;
    why: string;
    outcome: string;
    index: number;
}

export function RecommendationCard({ title, why, outcome, index }: RecProps) {
    return (
        <div className="group relative rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0c1021] p-4 shadow-sm hover:shadow-md transition-all mb-3 overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-accent opacity-70"></div>
            
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-bold mt-0.5">
                    {index}
                </div>
                
                <div className="flex-1 space-y-3">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        <FormattedText text={title} />
                    </h4>
                    
                    <div className="grid gap-2 text-[12px]">
                        <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                            <Target className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <span className="font-semibold text-slate-700 dark:text-slate-200 block mb-0.5">Rationale</span>
                                <FormattedText text={why} />
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <span className="font-semibold text-slate-700 dark:text-slate-200 block mb-0.5">Expected Outcome</span>
                                <FormattedText text={outcome} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
