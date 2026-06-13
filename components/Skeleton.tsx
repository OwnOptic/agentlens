import React from 'react';

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 ${className}`}
    >
      <div className="space-y-3">
        <div className="h-5 w-1/3 animate-pulse rounded-lg bg-slate-700" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded-lg bg-slate-700" />
          <div className="h-3 w-2/3 animate-pulse rounded-lg bg-slate-700" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rowCount = 5 }: { rowCount?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/50">
      <table className="w-full">
        <thead className="border-b border-slate-800 bg-slate-950/50">
          <tr>
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="px-6 py-3">
                <div className="h-3 w-20 animate-pulse rounded bg-slate-700" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, row) => (
            <tr
              key={row}
              className="border-b border-slate-800/60"
            >
              {Array.from({ length: 6 }).map((_, col) => (
                <td key={col} className="px-6 py-3">
                  <div className={`h-3 animate-pulse rounded bg-slate-700 ${
                    col === 0 ? 'w-24' : col === 5 ? 'w-16' : 'w-full'
                  }`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
