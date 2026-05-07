import React, { useState, useEffect } from 'react';
import { UserCard, CardGradedPrices, GradingPopulation } from '@binder/shared';
import { apiFetch, apiPatch } from '../api/client';
import { GradeBadge } from './shared/GradeBadge';
import { GamePill } from './GamePill';

function cardImageUrl(url: string) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `/api/img/bandai?url=${encodeURIComponent(url)}`;
}

function gemRateColor(rate: number | null): string {
  if (rate == null) return 'text-gray-400';
  if (rate < 10) return 'text-green-400';
  if (rate <= 25) return 'text-amber-400';
  return 'text-red-400';
}

const VERIFY_URLS: Record<string, (cert: string) => string> = {
  PSA: c => `https://www.psacard.com/cert/${c}`,
  CGC: c => `https://www.cgccards.com/certlookup/${c}`,
  BGS: c => `https://www.beckett.com/grading/lookup?certNumber=${c}`,
  ACE: c => `https://www.acegradings.com/verify?cert=${c}`,
  SGC: c => `https://www.gosgc.com/cert/${c}`,
  TAG: c => `https://www.taggrading.com/verify/${c}`,
};

const POP_URLS: Record<string, string> = {
  PSA: 'https://www.psacard.com/pop',
  CGC: 'https://www.cgccards.com/population',
  BGS: 'https://www.beckett.com/grading/population',
};

function PopSection({ pop, company }: { pop: GradingPopulation; company: string }) {
  const gemColor = gemRateColor(pop.gem_rate_pct);
  return (
    <div className="bg-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-white">{company} population report</h4>
        {POP_URLS[company] && (
          <a href={POP_URLS[company]} target="_blank" rel="noreferrer"
            className="text-xs text-brand">↗ View full pop</a>
        )}
      </div>
      <div className="space-y-1.5 text-xs">
        {pop.pop_10 != null && (
          <div className="flex justify-between">
            <span className="text-gray-400">{company} 10</span>
            <span className="text-white font-medium">{pop.pop_10.toLocaleString()} copies
              {pop.gem_rate_pct != null && (
                <span className={`ml-2 ${gemColor}`}>Gem rate: {pop.gem_rate_pct.toFixed(1)}%</span>
              )}
            </span>
          </div>
        )}
        {pop.pop_9 != null && (
          <div className="flex justify-between">
            <span className="text-gray-400">{company} 9</span>
            <span className="text-white font-medium">{pop.pop_9.toLocaleString()} copies</span>
          </div>
        )}
        {pop.pop_8 != null && (
          <div className="flex justify-between">
            <span className="text-gray-400">{company} 8</span>
            <span className="text-white font-medium">{pop.pop_8.toLocaleString()} copies</span>
          </div>
        )}
        {pop.pop_7 != null && (
          <div className="flex justify-between">
            <span className="text-gray-400">{company} 7</span>
            <span className="text-white font-medium">{pop.pop_7.toLocaleString()} copies</span>
          </div>
        )}
        {pop.pop_below_7 != null && (
          <div className="flex justify-between">
            <span className="text-gray-400">Below 7</span>
            <span className="text-white font-medium">{pop.pop_below_7.toLocaleString()} copies</span>
          </div>
        )}
        {pop.total_graded != null && (
          <div className="flex justify-between pt-1 border-t border-gray-700">
            <span className="text-gray-400">Total graded</span>
            <span className="text-white font-semibold">{pop.total_graded.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  entry: UserCard;
  onClose: () => void;
  onUpdated: (entry: UserCard) => void;
}

export function SlabDetailSheet({ entry, onClose, onUpdated }: Props) {
  const { card } = entry;
  const [prices, setPrices] = useState<CardGradedPrices | null>(null);
  const [includeInTrades, setIncludeInTrades] = useState(entry.include_in_trades);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<CardGradedPrices>(`/cards/${card.id}/graded-prices`).then(setPrices).catch(() => {});
  }, [card.id]);

  const verifyUrl = entry.cert_number && entry.grading_company
    ? VERIFY_URLS[entry.grading_company]?.(entry.cert_number)
    : null;

  async function toggleTrades() {
    const next = !includeInTrades;
    setSaving(true);
    try {
      const updated = await apiPatch<UserCard>(`/binder/${entry.id}`, { include_in_trades: next });
      setIncludeInTrades(next);
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  }

  const formatUsd = (cents: number | null) =>
    cents != null ? `$${(cents / 100).toFixed(0)}` : '—';

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="w-full bg-gray-900 rounded-t-3xl max-h-[92vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-700 rounded-full" />
        </div>

        <div className="p-5 space-y-5">
          {/* Card header */}
          <div className="flex gap-4">
            {(entry.slab_image_url || card.image_url) && (
              <img
                src={entry.slab_image_url || cardImageUrl(card.image_url)}
                alt={card.name}
                className="w-24 h-32 object-cover rounded-xl flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white">{card.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <GamePill game={card.game} />
                <span className="text-xs text-gray-400">{card.external_id}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{card.set_name}</p>
              {entry.finish && entry.finish !== 'standard' && (
                <p className="text-xs text-purple-300 mt-0.5">{entry.finish}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                {entry.grading_company && entry.grade && (
                  <GradeBadge company={entry.grading_company} grade={entry.grade} size="md" />
                )}
              </div>
              {entry.cert_number && (
                <p className="text-xs text-gray-400 mt-1.5">Cert #{entry.cert_number}</p>
              )}
              {entry.graded_at && (
                <p className="text-xs text-gray-500 mt-0.5">
                  Graded {new Date(entry.graded_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </p>
              )}
              {verifyUrl && (
                <a
                  href={verifyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-2 text-xs text-brand underline"
                >
                  ↗ Verify on {entry.grading_company} website
                </a>
              )}
            </div>
          </div>

          {/* Graded eBay prices */}
          {prices && (prices.psa || prices.cgc || prices.bgs) && (
            <div className="bg-gray-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white">Graded eBay sales</h4>
                {prices.updated_at && (
                  <span className="text-xs text-gray-500">
                    Updated {Math.round((Date.now() - new Date(prices.updated_at).getTime()) / 3600000)}h ago
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {prices.psa && (
                  <>
                    {prices.psa.grade_10.median_usd != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <GradeBadge company="PSA" grade="10" />
                        </span>
                        <span>
                          <span className="text-white font-semibold">${prices.psa.grade_10.median_usd.toFixed(0)} median</span>
                          {prices.psa.grade_10.sample_count && (
                            <span className="text-gray-500 ml-1">({prices.psa.grade_10.sample_count} sales)</span>
                          )}
                        </span>
                      </div>
                    )}
                    {prices.psa.grade_9.median_usd != null && (
                      <div className="flex items-center justify-between text-xs">
                        <GradeBadge company="PSA" grade="9" />
                        <span>
                          <span className="text-white font-semibold">${prices.psa.grade_9.median_usd.toFixed(0)} median</span>
                          {prices.psa.grade_9.sample_count && (
                            <span className="text-gray-500 ml-1">({prices.psa.grade_9.sample_count} sales)</span>
                          )}
                        </span>
                      </div>
                    )}
                    {prices.psa.grade_8.median_usd != null && (
                      <div className="flex items-center justify-between text-xs">
                        <GradeBadge company="PSA" grade="8" />
                        <span className="text-white font-semibold">${prices.psa.grade_8.median_usd.toFixed(0)} median</span>
                      </div>
                    )}
                  </>
                )}
                {prices.cgc?.grade_10.median_usd != null && (
                  <div className="flex items-center justify-between text-xs">
                    <GradeBadge company="CGC" grade="10" />
                    <span>
                      <span className="text-white font-semibold">${prices.cgc.grade_10.median_usd.toFixed(0)} median</span>
                      {prices.cgc.grade_10.sample_count && (
                        <span className="text-gray-500 ml-1">({prices.cgc.grade_10.sample_count} sales)</span>
                      )}
                    </span>
                  </div>
                )}
                {prices.bgs?.grade_10.median_usd != null && (
                  <div className="flex items-center justify-between text-xs">
                    <GradeBadge company="BGS" grade="10" />
                    <span className="text-white font-semibold">${prices.bgs.grade_10.median_usd.toFixed(0)} median</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Population data */}
          {prices?.population && (
            <>
              {prices.population.psa && <PopSection pop={prices.population.psa} company="PSA" />}
              {prices.population.cgc && <PopSection pop={prices.population.cgc} company="CGC" />}
              {prices.population.bgs && <PopSection pop={prices.population.bgs} company="BGS" />}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={toggleTrades}
              disabled={saving}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                includeInTrades
                  ? 'bg-green-800/40 border border-green-600/40 text-green-300'
                  : 'bg-gray-800 border border-gray-700 text-gray-400'
              }`}
            >
              {includeInTrades ? '✓ In trades' : 'Include in trades'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
