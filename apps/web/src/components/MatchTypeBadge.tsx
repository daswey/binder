import React from 'react';
import { MatchType } from '@binder/shared';

export function MatchTypeBadge({ type }: { type: MatchType }) {
  if (type === 'perfect') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-900/60 text-green-300">Perfect match</span>
  );
  if (type === 'partial') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-900/60 text-purple-300">Partial match</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-900/60 text-amber-300">Value gap</span>
  );
}
