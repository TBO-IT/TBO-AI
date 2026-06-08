import { useEffect, useState } from "react";
import { getAnalysis } from "../api/analyticsApi";
import { useAuth } from "@clerk/clerk-react";

import type {
  DatasetSummary,
} from "../types/analytics";

import KpiGrid from "../components/KpiGrid";
import MetricsTable from "../components/MetricsTable";

export default function Dashboard() {
  const [data, setData] =
    useState<DatasetSummary | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result =
          await getAnalysis();

        setData(result);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <h2>Loading...</h2>;
  }

  if (!data) {
    return <h2>No data found.</h2>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto p-8">
        <h1 className="text-4xl font-bold mb-8">
          Hotel Competitiveness Dashboard
        </h1>

        <KpiGrid data={data} />

        <div className="space-y-8">
          <MetricsTable
            title="APW Breakdown"
            data={data.apwBreakdown}
            columnLabel="Bucket"
          />

          <MetricsTable
            title="Chain Performance"
            data={data.chainPerformance}
            columnLabel="Chain"
          />

          <MetricsTable
            title="Supplier Performance"
            data={data.supplierPerformance}
            columnLabel="Supplier"
          />
        </div>
      </div>
    </div>
  );
}