import type { DatasetSummary } from "../types/analytics";
import KpiCard from "./KpiCard";

interface Props {
    data: DatasetSummary;
}

export default function KpiGrid({ data }: Props) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <KpiCard
                title="Rows Analysed"
                value={data.rowCount}
            />

            <KpiCard
                title="Win Rate"
                value={`${data.winRate.toFixed(2)}%`}
            />

            <KpiCard
                title="Median Price Diff"
                value={`${data.medianPriceDiff.toFixed(2)}%`}
            />
        </div>
    );
}