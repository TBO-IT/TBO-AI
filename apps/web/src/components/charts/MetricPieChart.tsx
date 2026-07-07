import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from './theme';

interface MetricPieChartProps {
  data: any[];
  config: {
    valueLabel: string;
    valueFormat: "percent" | "currency" | "number";
  };
}

export const MetricPieChart: React.FC<MetricPieChartProps> = ({ data, config }) => {
  const formatValue = (val: any) => {
    if (config.valueFormat === "percent") return `${val}%`;
    if (config.valueFormat === "currency") return `$${Number(val).toLocaleString()}`;
    return Number(val).toLocaleString();
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: data.payload.fill }}></span>
            <span className="font-semibold text-gray-200">{data.name}:</span>
            <span className="font-medium text-white">{formatValue(data.value)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-72 w-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            formatter={(value) => <span className="text-sm text-gray-300">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
