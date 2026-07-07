import React from 'react';

export interface TableDefinition {
  columns: string[];
  rows: any[];
}

interface TableRendererProps {
  table: TableDefinition;
}

export const TableRenderer: React.FC<TableRendererProps> = ({ table }) => {
  if (!table || !table.rows || table.rows.length === 0) return null;

  return (
    <div className="mt-4 w-full overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40 text-sm">
      <table className="w-full text-left text-gray-300">
        <thead className="bg-gray-800/50 text-xs uppercase text-gray-400">
          <tr>
            {table.columns.map((col) => (
              <th key={col} className="px-4 py-3 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {table.rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-800/20">
              {table.columns.map((col) => (
                <td key={col} className="whitespace-nowrap px-4 py-2.5">
                  {typeof row[col] === 'number' 
                    ? Number.isInteger(row[col]) ? row[col] : row[col].toFixed(2)
                    : row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
