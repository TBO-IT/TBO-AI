import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export type ChartType = 'bar' | 'line' | 'area';

export interface ChartDataConfig {
    type: ChartType;
    title?: string;
    data: any[];
    xAxisKey: string;
    series: Array<{
        key: string;
        name: string;
        color?: string;
    }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export function DynamicChart({ config }: { config: ChartDataConfig }) {
    if (!config || !config.data || config.data.length === 0) return null;

    const renderChart = () => {
        switch (config.type) {
            case 'bar':
                return (
                    <BarChart data={config.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey={config.xAxisKey} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        {config.series.map((s, idx) => (
                            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color || COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
                        ))}
                    </BarChart>
                );
            case 'line':
                return (
                    <LineChart data={config.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey={config.xAxisKey} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        {config.series.map((s, idx) => (
                            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || COLORS[idx % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                        ))}
                    </LineChart>
                );
            case 'area':
                return (
                    <AreaChart data={config.data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey={config.xAxisKey} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        {config.series.map((s, idx) => (
                            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} fill={s.color || COLORS[idx % COLORS.length]} stroke={s.color || COLORS[idx % COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
                        ))}
                    </AreaChart>
                );
            default:
                return null;
        }
    };

    return (
        <div className="w-full my-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
            {config.title && (
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">{config.title}</h4>
            )}
            <div className="w-full h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    {renderChart()}
                </ResponsiveContainer>
            </div>
        </div>
    );
}
