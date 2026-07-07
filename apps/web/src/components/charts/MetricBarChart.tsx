import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CHART_COLORS, COMMON_AXIS_CONFIG } from './theme';

interface MetricBarChartProps {
  data: any[];
  config: {
    valueLabel: string;
    valueFormat: "percent" | "currency" | "number";
  };
}

export const MetricBarChart: React.FC<MetricBarChartProps> = ({ data, config }) => {
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
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              <span className="text-gray-400">{config.valueLabel}:</span>
              <span className="font-medium text-white">{formatValue(payload[0].value)}</span>
            </div>
            {/* If there's volume data available in the payload, show it. Wait, the API only sends 'value', but we can check if there are other keys */}
            {payload[0].payload.volume && (
               <div className="flex items-center gap-2">
                 <span className="h-2 w-2 rounded-full bg-gray-500"></span>
                 <span className="text-gray-400">Sample Size:</span>
                 <span className="font-medium text-white">{payload[0].payload.volume.toLocaleString()}</span>
               </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-72 w-full pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
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
            cursor={{ fill: '#374151', opacity: 0.4 }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
