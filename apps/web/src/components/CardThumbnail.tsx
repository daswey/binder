import React from 'react';
import { Card, Condition, Language, Finish, Edition, CONDITION_COLORS, CONDITION_LABELS, FINISH_LABELS, EDITION_LABELS } from '@binder/shared';
import { GamePill } from './GamePill';

interface Props {
  card: Card;
  quantity?: number;
  condition?: Condition | null;
  language?: Language | null;
  finish?: Finish | null;
  edition?: Edition | null;
  notes?: string | null;
  onRemove?: () => void;
  badge?: 'want' | 'have';
}

const CONDITION_DOT: Record<Condition, string> = {
  NM: 'bg-green-400', LP: 'bg-teal-400', MP: 'bg-amber-400', HP: 'bg-orange-400', Damaged: 'bg-red-500',
};

export function CardThumbnail({ card, quantity, condition, language, finish, edition, notes, onRemove, badge }: Props) {
  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-3 group">
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} className="w-12 h-16 object-cover rounded-lg flex-shrink-0 bg-gray-700" loading="lazy" />
      ) : (
        <div className="w-12 h-16 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center text-gray-500 text-xs">?</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-white truncate">{card.name}</span>
          {quantity != null && quantity > 1 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-indigo-900/60 text-indigo-300">×{quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <GamePill game={card.game} />
          <span className="text-xs text-gray-400">{card.set_name || card.external_id}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {condition && (
            <span className="flex items-center gap-1" aria-label={`Condition: ${CONDITION_LABELS[condition]}`}>
              <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[condition]}`} aria-hidden="true" />
              <span className={`text-xs font-semibold ${CONDITION_COLORS[condition]}`}>{condition}</span>
            </span>
          )}
          {finish && finish !== 'standard' && (
            <span className="text-xs text-purple-300">{FINISH_LABELS[finish]}</span>
          )}
          {language && <span className="text-xs text-blue-300">{language}</span>}
          {edition && edition !== 'unlimited' && <span className="text-xs text-gray-500">{EDITION_LABELS[edition]}</span>}
        </div>
        {card.market_price_eur != null && (
          <p className="text-xs text-gray-500 mt-0.5">€{(card.market_price_eur / 100).toFixed(2)}</p>
        )}
        {notes && <p className="text-xs text-gray-500 mt-0.5 italic truncate">{notes}</p>}
      </div>
      {badge && (
        <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${badge === 'want' ? 'bg-blue-900/60 text-blue-300' : 'bg-green-900/60 text-green-300'}`}>
          {badge === 'want' ? 'Want' : 'Have'}
        </span>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove card"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-500 hover:text-red-400 flex-shrink-0 p-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}
