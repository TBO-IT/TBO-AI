import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_COLORS, COMMON_AXIS_CONFIG } from './theme';

interface MetricLineChartProps {
  data: any[];
  config: {
    valueLabel: string;
    valueFormat: "percent" | "currency" | "number";
  };
}

export const MetricLineChart: React.FC<MetricLineChartProps> = ({ data, config }) => {
  const formatValue = (val: any) => {
    if (config.valueFormat === "percent") return `${val}%`;
    if (config.valueFormat === "currency") return `$${Number(val).toLocaleString()}`;
    return Number(val).toLocaleString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-xl">
          <p className="mb-1 font-semibold text-gray-200">{label}</p>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[0] }}></span>
              <span className="text-gray-400">{config.valueLabel}:</span>
              <span className="font-medium text-white">{formatValue(payload[0].value)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-72 w-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
          <XAxis 
            dataKey="name" 
            {...COMMON_AXIS_CONFIG}
            tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis 
            {...COMMON_AXIS_CONFIG}
            tickFormatter={formatValue}
            width={60}
          />
          <Tooltip 
            content={<CustomTooltip />}
            cursor={{ stroke: '#4b5563', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke={CHART_COLORS[0]} 
            strokeWidth={3}
            dot={{ fill: CHART_COLORS[0], r: 4, strokeWidth: 2, stroke: '#1f2937' }}
            activeDot={{ r: 6, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
