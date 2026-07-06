import { cn, formatDelta } from "../../lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
    title: string;
    value: string | number;
    delta?: number;
    trend?: "up" | "down" | "flat";
    format?: "percentage" | "number" | "currency";
}

export default function MetricCard({ title, value, delta, trend, format = "number" }: MetricCardProps) {
    const isPositive = trend === "up";
    const isNegative = trend === "down";
    
    // Some metrics are "good" when they go down (like risks), but for most standard metrics (win rate, volume), up is good.
    // In a real system, you'd pass an invertColors prop if down is actually positive.
    
    return (
        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800/80 p-5 flex flex-col justify-between">
            <h4 className="text-[13px] font-medium text-slate-500 mb-2">{title}</h4>
            
            <div className="flex items-end justify-between">
                <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {format === "percentage" ? `${value}%` : value}
                </span>
                
                {delta !== undefined && trend !== undefined && (
                    <div className={cn(
                        "flex items-center gap-1 text-[12px] font-medium px-2 py-0.5 rounded-md",
                        isPositive && "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400",
                        isNegative && "text-red-600 bg-red-50 dark:bg-red-500/10 dark:text-red-400",
                        trend === "flat" && "text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400"
                    )}>
                        {trend === "up" && <TrendingUp className="h-3.5 w-3.5" />}
                        {trend === "down" && <TrendingDown className="h-3.5 w-3.5" />}
                        {trend === "flat" && <Minus className="h-3.5 w-3.5" />}
                        <span>{formatDelta(delta)}{format === "percentage" ? "pp" : "%"}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
