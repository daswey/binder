import React from 'react';

export function StarRating({ score, count }: { score: number; count: number }) {
  if (count === 0) return (
    <span className="text-xs text-gray-400 italic">New trader</span>
  );
  return (
    <span className="flex items-center gap-1 text-sm">
      <span className="text-yellow-400">★</span>
      <span className="font-semibold text-white">{score.toFixed(1)}</span>
      <span className="text-gray-400 text-xs">({count})</span>
    </span>
  );
}
