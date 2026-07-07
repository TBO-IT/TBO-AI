import React from 'react';
import { ChartEmptyState } from './ChartEmptyState';
import { MetricBarChart } from './MetricBarChart';
import { MetricLineChart } from './MetricLineChart';
import { MetricPieChart } from './MetricPieChart';

export interface ChartDefinition {
  type: "bar" | "line" | "pie";
  data: any[];
  config: {
    valueLabel: string;
    valueFormat: "percent" | "currency" | "number";
  };
}

interface ChartRendererProps {
  chart: ChartDefinition;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ chart }) => {
  if (!chart.data || chart.data.length === 0) {
    return <ChartEmptyState />;
  }

  // Add aria labels to charts
  const ariaLabel = \`\${chart.type} chart showing \${chart.config.valueLabel}\`;

  return (
    <div className="mb-6 w-full rounded-xl border border-gray-800 bg-gray-900/40 p-4" role="region" aria-label={ariaLabel}>
      {chart.type === 'bar' && <MetricBarChart data={chart.data} config={chart.config} />}
      {chart.type === 'line' && <MetricLineChart data={chart.data} config={chart.config} />}
      {chart.type === 'pie' && <MetricPieChart data={chart.data} config={chart.config} />}
    </div>
  );
};
