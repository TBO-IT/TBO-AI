import { cn } from '../../lib/utils';

export interface MatrixData {
    dimA: string;
    dimB: string;
    metricLabel: string;
    rows: string[];
    cols: string[];
    data: Record<string, Record<string, number>>;
}

export function HeatmapMatrix({ matrix }: { matrix: MatrixData }) {
    if (!matrix || !matrix.rows || !matrix.cols) return null;

    // Find min and max for color scaling
    let min = Infinity;
    let max = -Infinity;
    
    matrix.rows.forEach(r => {
        matrix.cols.forEach(c => {
            const val = matrix.data[r]?.[c];
            if (val !== undefined && val !== null) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        });
    });

    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 1;

    const getStyle = (val: number | undefined | null) => {
        if (val === undefined || val === null) return {};
        const range = max - min === 0 ? 1 : max - min;
        const normalized = (val - min) / range;
        const alpha = 0.1 + (normalized * 0.7);
        return { backgroundColor: `rgba(16, 185, 129, ${alpha})` };
    };

    return (
        <div className="w-full my-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {matrix.dimA} vs {matrix.dimB}
                </h4>
                <p className="text-xs text-slate-500 mt-1">Showing {matrix.metricLabel}</p>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-max">
                    <thead>
                        <tr>
                            <th className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 border-r text-xs font-semibold text-slate-600 dark:text-slate-400">
                                {matrix.dimA} \ {matrix.dimB}
                            </th>
                            {matrix.cols.map(c => (
                                <th key={c} className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 text-center">
                                    {c}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map(r => (
                            <tr key={r}>
                                <td className="p-3 border-b border-slate-200 dark:border-slate-800 border-r text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/20">
                                    {r}
                                </td>
                                {matrix.cols.map(c => {
                                    const val = matrix.data[r]?.[c];
                                    return (
                                        <td 
                                            key={`${r}-${c}`} 
                                            className="p-3 border-b border-slate-200 dark:border-slate-800 border-r border-r-slate-100 dark:border-r-slate-800/50 text-xs text-center transition-colors hover:opacity-80"
                                            style={getStyle(val)}
                                        >
                                            {val !== undefined && val !== null ? (
                                                <span className={cn(val > (min + (max-min)/2) ? "text-white font-semibold" : "text-slate-700 dark:text-slate-300")}>
                                                    {val.toFixed(1)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-600">-</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
