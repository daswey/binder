import React, { useState, useEffect } from 'react';
import { Card, CardPrices, EbayComp } from '@binder/shared';
import { apiFetch } from '../api/client';

const CONDITION_ORDER = ['NM', 'LP', 'MP', 'HP', 'Damaged'];
const CONDITION_COLORS: Record<string, string> = {
  NM: 'text-green-400', LP: 'text-teal-400', MP: 'text-amber-400',
  HP: 'text-orange-400', Damaged: 'text-red-500',
};

interface Props {
  card: Card;
  onClose: () => void;
  onSetAlert?: (cardId: string, finishId?: string) => void;
  isPro?: boolean;
}

export function CardPriceSheet({ card, onClose, onSetAlert, isPro }: Props) {
  const [prices, setPrices] = useState<CardPrices | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [showConditions, setShowConditions] = useState(false);
  const [ebayComps, setEbayComps] = useState<EbayComp[] | null>(null);
  const [ebaySearchUrl, setEbaySearchUrl] = useState<string>('');
  const [loadingEbay, setLoadingEbay] = useState(false);
  const [selectedFinishId, setSelectedFinishId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CardPrices>(`/cards/${card.id}/prices`)
      .then(data => {
        setPrices(data);
        if (data.finishes?.length > 0) setSelectedFinishId(data.finishes[0].finish_id);
      })
      .catch(() => {})
      .finally(() => setLoadingPrices(false));
  }, [card.id]);

  async function loadEbayComps() {
    setLoadingEbay(true);
    try {
      const data = await apiFetch<{ comps: EbayComp[]; search_url: string }>(`/cards/${card.id}/ebay-comps`);
      setEbayComps(data.comps);
      setEbaySearchUrl(data.search_url);
    } catch {
      setEbayComps([]);
    } finally {
      setLoadingEbay(false);
    }
  }

  const activeFinish = prices?.finishes?.find(f => f.finish_id === selectedFinishId);
  const displayPrice = activeFinish?.market_price_eur ?? prices?.market_price_eur;
  const displayConditions = activeFinish?.condition_prices ?? prices?.condition_prices ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-gray-900 rounded-t-3xl max-h-[88vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        <div className="px-5 pb-8 space-y-5">
          {/* Header */}
          <div>
            <h3 className="text-lg font-bold text-white">{card.name}</h3>
            <p className="text-xs text-gray-400">{card.set_name} · {card.external_id}</p>
          </div>

          {loadingPrices ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : prices ? (
            <>
              {/* Finish selector */}
              {prices.finishes.length > 0 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                  {prices.finishes.map(f => (
                    <button
                      key={f.finish_id}
                      onClick={() => setSelectedFinishId(f.finish_id)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selectedFinishId === f.finish_id
                          ? 'bg-brand border-brand text-white'
                          : 'border-gray-700 text-gray-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Market price */}
              <div className="bg-gray-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Cardmarket NM Price</p>
                    <p className="text-3xl font-bold text-white">
                      {displayPrice != null ? `€${displayPrice.toFixed(2)}` : '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded-full">Cardmarket</span>
                    {onSetAlert && (
                      <button
                        onClick={() => onSetAlert(card.id, selectedFinishId ?? undefined)}
                        className="text-xs text-amber-400 border border-amber-600/50 bg-amber-900/20 px-2 py-1 rounded-full hover:bg-amber-900/40 transition-colors"
                      >
                        🔔 Alert
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Condition price table */}
              {displayConditions.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowConditions(v => !v)}
                    className="flex items-center gap-2 w-full text-left"
                  >
                    <span className="text-sm font-semibold text-gray-200">Price by Condition</span>
                    <span className="text-gray-500 text-xs ml-auto">{showConditions ? '▲ Hide' : '▼ Show'}</span>
                  </button>
                  {showConditions && (
                    <div className="mt-3 bg-gray-800 rounded-2xl overflow-hidden">
                      {CONDITION_ORDER.map(cond => {
                        const row = displayConditions.find(c => c.condition === cond);
                        if (!row) return null;
                        return (
                          <div key={cond} className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 last:border-0">
                            <span className={`text-sm font-medium ${CONDITION_COLORS[cond]}`}>{cond}</span>
                            <span className="text-sm text-white font-semibold">€{row.price_eur.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* eBay comps */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-200">Recent eBay.de Sales</span>
                  {ebaySearchUrl && (
                    <a
                      href={ebaySearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand underline"
                    >
                      Search eBay ↗
                    </a>
                  )}
                </div>

                {ebayComps === null ? (
                  <button
                    onClick={loadEbayComps}
                    disabled={loadingEbay}
                    className="w-full py-3 bg-gray-800 rounded-2xl text-sm text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-60"
                  >
                    {loadingEbay ? 'Loading…' : 'See recent sales'}
                  </button>
                ) : ebayComps.length === 0 ? (
                  <div className="bg-gray-800 rounded-2xl p-4 text-center text-sm text-gray-400">
                    No recent sales found.{' '}
                    {ebaySearchUrl && (
                      <a href={ebaySearchUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                        Search manually ↗
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-2xl overflow-hidden">
                    {ebayComps.map((comp, i) => (
                      <a
                        key={i}
                        href={comp.url ?? ebaySearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 last:border-0 hover:bg-gray-700/50 transition-colors"
                      >
                        {comp.image_url && (
                          <img src={comp.image_url} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 truncate">{comp.title}</p>
                          {comp.sold_date && (
                            <p className="text-xs text-gray-500">{new Date(comp.sold_date).toLocaleDateString('en-GB')}</p>
                          )}
                        </div>
                        <span className="text-sm font-bold text-green-400 flex-shrink-0">
                          {comp.price_eur != null ? `€${comp.price_eur.toFixed(2)}` : '—'}
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-gray-400 text-sm text-center py-6">Price data unavailable</p>
          )}
        </div>
      </div>
    </div>
  );
}
