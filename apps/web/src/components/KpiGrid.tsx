import type { DatasetSummary } from "../types/analytics";
import KpiCard from "./KpiCard";

import {
    Database,
    Trophy,
    DollarSign,
} from "lucide-react";

interface Props {
    data: DatasetSummary;
}

export default function KpiGrid({
    data,
}: Props) {
    const medianDiffColor =
        data.medianPriceDiff >= 0
            ? "text-green-600"
            : "text-red-600";
    return (
        <div
            className="
        grid
        grid-cols-1
        md:grid-cols-3
        gap-6
        mb-10
      "
        >
            <KpiCard
                title="Rows Analysed"
                value={data.rowCount.toLocaleString()}
                icon={Database}
            />

            <KpiCard
                title="Win Rate"
                value={`${data.winRate.toFixed(2)}%`}
                icon={Trophy}
            />

            <KpiCard
                title="Median Price Diff"
                value={`${data.medianPriceDiff.toFixed(2)}%`}
                icon={DollarSign}
                valueClassName={medianDiffColor}
            />
        </div>
    );
}