import React from 'react';
import { Game } from '@binder/shared';

export function GamePill({ game }: { game: Game | 'all' }) {
  if (game === 'pokemon') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-teal-900/60 text-teal-300">Pokémon</span>
  );
  if (game === 'one_piece') return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-900/60 text-purple-300">One Piece</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-700 text-gray-300">All</span>
  );
}
