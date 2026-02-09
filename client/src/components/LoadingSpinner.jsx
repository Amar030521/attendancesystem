import React from "react";

export function LoadingSpinner({ label }) {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="h-6 w-6 border-4 border-primary border-t-transparent rounded-full animate-spin mr-3" />
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </div>
  );
}

