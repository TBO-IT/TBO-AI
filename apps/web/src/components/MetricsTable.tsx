import type { PerformanceMetric } from "../types/analytics";

interface Props {
    title: string;
    data: PerformanceMetric[];
}

export default function MetricsTable({
    title,
    data,
}: Props) {
    return (
        <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-6 border-b">
                <h2 className="text-xl font-semibold">
                    {title}
                </h2>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="text-left px-6 py-4">
                                Name
                            </th>

                            <th className="text-left px-6 py-4">
                                Volume
                            </th>

                            <th className="text-left px-6 py-4">
                                Win Rate
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {data.map((row) => (
                            <tr
                                key={row.name}
                                className="border-t hover:bg-slate-50"
                            >
                                <td className="px-6 py-4">
                                    {row.name}
                                </td>

                                <td className="px-6 py-4">
                                    {row.volume}
                                </td>

                                <td className="px-6 py-4 font-medium">
                                    {row.winRate.toFixed(2)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}