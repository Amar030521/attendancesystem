import React from "react";

export function Pagination({ currentPage, totalPages, onPageChange, totalItems, pageSize }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) pages.push(i);

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3">
      <p className="text-xs text-gray-500">
        Showing {from}–{to} of {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
          ← Prev
        </button>
        {start > 1 && <><button onClick={() => onPageChange(1)} className="w-8 h-8 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">1</button>{start > 2 && <span className="text-gray-400 text-xs px-1">…</span>}</>}
        {pages.map(p => (
          <button key={p} onClick={() => onPageChange(p)}
            className={`w-8 h-8 rounded-lg text-xs font-semibold ${p === currentPage ? "bg-blue-600 text-white border-blue-600" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {p}
          </button>
        ))}
        {end < totalPages && <>{end < totalPages - 1 && <span className="text-gray-400 text-xs px-1">…</span>}<button onClick={() => onPageChange(totalPages)} className="w-8 h-8 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">{totalPages}</button></>}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
          Next →
        </button>
      </div>
    </div>
  );
}
