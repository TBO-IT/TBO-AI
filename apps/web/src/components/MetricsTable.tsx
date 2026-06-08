import type { PerformanceMetric } from "../types/analytics";

interface Props {
    title: string;
    data: PerformanceMetric[];
    columnLabel: string
}

export default function MetricsTable({
    title,
    data,
    columnLabel
}: Props) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-xl font-semibold">
                    {title}
                </h2>
            </div>

            <table className="w-full">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-sm font-medium text-slate-600">
                            {columnLabel}
                        </th>

                        <th className="px-6 py-3 text-left text-sm font-medium text-slate-600">
                            Volume
                        </th>

                        <th className="px-6 py-3 text-left text-sm font-medium text-slate-600">
                            Win Rate
                        </th>
                    </tr>
                </thead>

                <tbody>
                    {data.map((row) => (
                        <tr
                            key={row.name}
                            className="border-t border-slate-100 hover:bg-slate-50"
                        >
                            <td className="px-6 py-4 font-medium">
                                {row.name}
                            </td>

                            <td className="px-6 py-4">
                                {row.volume.toLocaleString()}
                            </td>

                            <td className="px-6 py-4">
                                <span
                                    className="
                  inline-flex
                  rounded-full
                  bg-green-100
                  px-3
                  py-1
                  text-sm
                  font-medium
                  text-green-700
                "
                                >
                                    {row.winRate.toFixed(2)}%
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}