import React from 'react';

export const ChartEmptyState: React.FC<{ message?: string }> = ({ message = "No data available for visualization." }) => {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-gray-400">
      <div className="text-center">
        <svg className="mx-auto mb-2 h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">{message}</p>
      </div>
    </div>
  );
};
