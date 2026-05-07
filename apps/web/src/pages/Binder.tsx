import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserCard, Card, CardVariantSummary, Condition, Language, Edition, GradingCompany,
  CONDITION_LABELS, CONDITION_COLORS, FINISH_LABELS, LANGUAGE_LABELS, EDITION_LABELS } from '@binder/shared';
import { apiFetch, apiPost, apiDelete, apiPatch } from '../api/client';
import { cardImageUrl } from '../api/imageUrl';
import { GamePill } from '../components/GamePill';
import { CardPriceSheet } from '../components/CardPriceSheet';
import { ProSheet } from '../components/ProSheet';
import { SlabDetailSheet } from '../components/SlabDetailSheet';
import { GradeBadge } from '../components/shared/GradeBadge';
import { useAuthStore } from '../store/auth';

type Tab = 'want' | 'have' | 'slabs';
type SearchLang = 'EN' | 'DE' | 'JP';

const SEARCH_LANGS: { lang: SearchLang; flag: string }[] = [
  { lang: 'EN', flag: '🇬🇧' },
  { lang: 'DE', flag: '🇩🇪' },
  { lang: 'JP', flag: '🇯🇵' },
];

const CONDITIONS: Condition[] = ['NM', 'LP', 'MP', 'HP', 'Damaged'];
const LANGUAGES: Language[] = ['EN', 'JP', 'DE', 'FR', 'ES', 'IT', 'PT', 'KO', 'ZH'];
const EDITIONS: Edition[] = ['1st_ed', 'unlimited', 'alt_art', 'promo', 'reprint'];
const GRADING_COMPANIES: GradingCompany[] = ['PSA', 'CGC', 'BGS', 'ACE', 'SGC', 'TAG'];

const PSA_GRADES = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '10 GEM'];
const CGC_GRADES = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '10 PRISTINE'];
const BGS_GRADES = ['10', '9.5', '9', '8.5', '8', '7', '6', '5', '4', '3', '2', '1', '10 BLACK LABEL'];

const POKEMON_FINISHES: { finish_id: string; label: string }[] = [
  { finish_id: 'standard', label: 'Standard' },
  { finish_id: 'holo', label: 'Holo' },
  { finish_id: 'reverse_holo', label: 'Reverse Holo' },
  { finish_id: 'full_art', label: 'Full Art' },
  { finish_id: 'secret_rare', label: 'Secret Rare' },
  { finish_id: 'alt_art_holo', label: 'Alt Art Holo' },
];

const CONDITION_DOT: Record<Condition, string> = {
  NM: 'bg-green-400', LP: 'bg-teal-400', MP: 'bg-amber-400', HP: 'bg-orange-400', Damaged: 'bg-red-500',
};

const VERIFY_URLS: Record<string, (cert: string) => string> = {
  PSA: c => `https://www.psacard.com/cert/${c}`,
  CGC: c => `https://www.cgccards.com/certlookup/${c}`,
  BGS: c => `https://www.beckett.com/grading/lookup?certNumber=${c}`,
  ACE: c => `https://www.acegradings.com/verify?cert=${c}`,
  SGC: c => `https://www.gosgc.com/cert/${c}`,
  TAG: c => `https://www.taggrading.com/verify/${c}`,
};

function Chip({ active, onClick, children, className = '' }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex-shrink-0 ${
        active ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'
      } ${className}`}
    >
      {children}
    </button>
  );
}

// Grading fields sub-form used in both Add and Edit sheets
function GradingFields({
  company, setCompany,
  grade, setGrade,
  certNumber, setCertNumber,
  gradedAt, setGradedAt,
  includeInTrades, setIncludeInTrades,
}: {
  company: GradingCompany | null; setCompany: (v: GradingCompany | null) => void;
  grade: string; setGrade: (v: string) => void;
  certNumber: string; setCertNumber: (v: string) => void;
  gradedAt: string; setGradedAt: (v: string) => void;
  includeInTrades: boolean; setIncludeInTrades: (v: boolean) => void;
}) {
  const grades = company === 'CGC' ? CGC_GRADES : company === 'BGS' ? BGS_GRADES : PSA_GRADES;
  const verifyUrl = certNumber.length >= 6 && company ? VERIFY_URLS[company]?.(certNumber) : null;

  return (
    <div className="space-y-4">
      {/* Company */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Grading company</label>
        <div className="flex gap-2 flex-wrap">
          {GRADING_COMPANIES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { setCompany(c); setGrade(''); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                company === c ? 'border-brand text-white' : 'border-gray-700 text-gray-400'
              }`}
              style={company === c ? { background: c === 'PSA' ? '#E8131A' : c === 'CGC' ? '#F5A623' : c === 'BGS' ? '#1A56DB' : c === 'ACE' ? '#0F6E56' : c === 'SGC' ? '#444441' : '#534AB7', borderColor: 'transparent', color: c === 'CGC' ? '#3d1800' : '#fff' } : {}}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Grade */}
      {company && (
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Grade</label>
          {['ACE', 'SGC', 'TAG'].includes(company) ? (
            <input
              type="text"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              placeholder="e.g. MINT 9, GEM MINT 10"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
            />
          ) : (
            <div className="flex gap-2 flex-wrap">
              {grades.map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    grade === g ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cert number */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Certificate number <span className="normal-case font-normal text-gray-500">(optional)</span>
        </label>
        <input
          type="text"
          value={certNumber}
          onChange={e => setCertNumber(e.target.value.slice(0, 32))}
          placeholder="e.g. 12345678"
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
        />
        {verifyUrl && (
          <a href={verifyUrl} target="_blank" rel="noreferrer" className="inline-block mt-1.5 text-xs text-brand underline">
            ↗ Verify this cert
          </a>
        )}
      </div>

      {/* Date graded */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Date graded <span className="normal-case font-normal text-gray-500">(optional)</span>
        </label>
        <input
          type="month"
          value={gradedAt ? gradedAt.slice(0, 7) : ''}
          onChange={e => setGradedAt(e.target.value ? e.target.value + '-01' : '')}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
        />
      </div>

      {/* Include in trades */}
      <div className="flex items-start gap-3 bg-gray-800 rounded-xl p-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Include in trade matching</p>
          <p className="text-xs text-gray-400 mt-0.5">Graded cards are excluded from matches by default. Turn on if you're open to trading this slab.</p>
        </div>
        <button
          type="button"
          onClick={() => setIncludeInTrades(!includeInTrades)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 mt-0.5 ${includeInTrades ? 'bg-green-500' : 'bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${includeInTrades ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

export function BinderPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('want');
  const [entries, setEntries] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLang, setSearchLang] = useState<SearchLang>('EN');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [showSheet, setShowSheet] = useState<Card | null>(null);
  const [priceCard, setPriceCard] = useState<Card | null>(null);
  const [showProSheet, setShowProSheet] = useState(false);
  const [editEntry, setEditEntry] = useState<UserCard | null>(null);
  const [slabEntry, setSlabEntry] = useState<UserCard | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>();
  const [searchFocused, setSearchFocused] = useState(false);
  const SEARCH_LIMIT = 20;

  const fetchBinder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<UserCard[]>('/binder');
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBinder(); }, [fetchBinder]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchFocused && !searchQuery.trim()) {
      setSearchResults([]); setSearchTotal(0); setSearchPage(1); return;
    }
    const delay = searchQuery.trim() ? 300 : 0;
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      setSearchPage(1);
      try {
        const q = searchQuery.trim();
        const url = q
          ? `/cards/search?q=${encodeURIComponent(q)}&lang=${searchLang}&limit=${SEARCH_LIMIT}&page=1`
          : `/cards/search?lang=${searchLang}&limit=${SEARCH_LIMIT}&page=1`;
        const data = await apiFetch<{ data: Card[]; total: number }>(url);
        setSearchResults(data.data);
        setSearchTotal(data.total);
      } finally {
        setSearching(false);
      }
    }, delay);
  }, [searchQuery, searchLang, searchFocused]);

  const loadMoreResults = useCallback(async () => {
    if (loadingMore || searchResults.length >= searchTotal) return;
    const nextPage = searchPage + 1;
    setLoadingMore(true);
    try {
      const q = searchQuery.trim();
      const url = q
        ? `/cards/search?q=${encodeURIComponent(q)}&lang=${searchLang}&limit=${SEARCH_LIMIT}&page=${nextPage}`
        : `/cards/search?lang=${searchLang}&limit=${SEARCH_LIMIT}&page=${nextPage}`;
      const data = await apiFetch<{ data: Card[]; total: number }>(url);
      setSearchResults(prev => [...prev, ...data.data]);
      setSearchPage(nextPage);
      setSearchTotal(data.total);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, searchResults.length, searchTotal, searchPage, searchQuery, searchLang]);

  const handleDropdownScroll = useCallback(() => {
    const el = dropdownRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) loadMoreResults();
  }, [loadMoreResults]);

  async function removeEntry(id: string) {
    await apiDelete(`/binder/${id}`);
    setEntries(e => e.filter(x => x.id !== id));
  }

  const slabs = entries.filter(e => e.is_graded);
  const rawEntries = entries.filter(e => !e.is_graded);
  const displayed = tab === 'slabs' ? slabs : rawEntries.filter(e => e.status === tab);
  const wantCount = rawEntries.filter(e => e.status === 'want').length;
  const haveCount = rawEntries.filter(e => e.status === 'have').length;
  const slabCount = slabs.length;

  // Auto-switch away from slabs tab if all slabs removed
  useEffect(() => {
    if (tab === 'slabs' && slabCount === 0) setTab('want');
  }, [slabCount, tab]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 pt-6 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white mb-4">My Binder</h1>

        <div className="relative mb-2">
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              clearTimeout(blurTimer.current);
              blurTimer.current = setTimeout(() => setSearchFocused(false), 150);
            }}
            placeholder="Search cards by name or code…"
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        </div>
        <div className="flex gap-2 mb-4">
          {SEARCH_LANGS.map(({ lang, flag }) => (
            <button
              key={lang}
              type="button"
              onClick={() => setSearchLang(lang)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                searchLang === lang ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {flag} {lang}
            </button>
          ))}
        </div>

        {(searchFocused || searchResults.length > 0 || searching) && (
          <div
            ref={dropdownRef}
            onScroll={handleDropdownScroll}
            className="absolute left-0 right-0 mx-4 z-10 bg-gray-800 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto scrollbar-none"
          >
            {searching && <div className="text-center py-3 text-gray-400 text-sm">Searching…</div>}
            {searchResults.map(card => (
              <button
                key={card.id}
                onClick={() => { setShowSheet(card); setSearchQuery(''); setSearchResults([]); setSearchTotal(0); setSearchFocused(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left border-b border-gray-700/50 last:border-0"
              >
                {card.image_url && <img src={cardImageUrl(card.image_url)} alt={card.name} className="w-8 h-11 object-cover rounded flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">{card.name}</p>
                    {card.variant_count != null && card.variant_count > 0 && (
                      <span className="flex-shrink-0 text-xs bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 rounded-full">+{card.variant_count}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <GamePill game={card.game} />
                    <span className="text-xs text-gray-400">{card.external_id}</span>
                    <span className="text-xs text-gray-500">{card.set_name}</span>
                  </div>
                </div>
                {card.market_price_eur != null && (
                  <span className="text-xs text-gray-400 flex-shrink-0">€{(card.market_price_eur / 100).toFixed(2)}</span>
                )}
              </button>
            ))}
            {loadingMore && <div className="text-center py-3 text-gray-500 text-xs">Loading more…</div>}
            {!loadingMore && searchResults.length > 0 && searchResults.length < searchTotal && (
              <div className="text-center py-2 text-gray-600 text-xs">{searchResults.length} of {searchTotal} — scroll for more</div>
            )}
          </div>
        )}

        {/* Tab strip */}
        <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
          {slabCount > 0 && (
            <button
              onClick={() => setTab('slabs')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === 'slabs' ? 'bg-amber-500 text-white' : 'text-gray-400'}`}
            >
              Slabs ({slabCount})
            </button>
          )}
          <button
            onClick={() => setTab('want')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'want' ? 'bg-brand text-white' : 'text-gray-400'}`}
          >
            I Want ({wantCount})
          </button>
          <button
            onClick={() => setTab('have')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'have' ? 'bg-brand text-white' : 'text-gray-400'}`}
          >
            I Have ({haveCount})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'slabs' ? (
          <>
            {/* Slabs value summary */}
            <SlabValueCard slabs={slabs} />
            {slabs.map(entry => (
              <SlabRow
                key={entry.id}
                entry={entry}
                onTap={() => setSlabEntry(entry)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">{tab === 'want' ? '🎯' : '💎'}</div>
            <p className="text-gray-400 text-sm max-w-xs">
              {tab === 'want'
                ? 'Search for cards above and add them to your want list to start finding trade matches.'
                : 'Add cards you have spare to attract trade offers from nearby players.'}
            </p>
          </div>
        ) : displayed.map(entry => (
          <CardRow
            key={entry.id}
            entry={entry}
            onRemove={() => removeEntry(entry.id)}
            onEdit={() => setEditEntry(entry)}
            onPrice={() => setPriceCard(entry.card)}
          />
        ))}
      </div>

      {showSheet && (
        <AddCardSheet
          card={showSheet}
          defaultStatus={tab === 'slabs' ? 'have' : tab}
          searchLang={searchLang}
          onDone={(entry) => { setEntries(prev => [entry, ...prev]); setShowSheet(null); }}
          onClose={() => setShowSheet(null)}
          onLimitReached={() => { setShowSheet(null); setShowProSheet(true); }}
        />
      )}

      {editEntry && (
        <EditCardSheet
          entry={editEntry}
          onDone={(updated) => {
            setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
            setEditEntry(null);
          }}
          onClose={() => setEditEntry(null)}
        />
      )}

      {priceCard && (
        <CardPriceSheet
          card={priceCard}
          onClose={() => setPriceCard(null)}
          isPro={user?.is_pro ?? false}
        />
      )}

      {slabEntry && (
        <SlabDetailSheet
          entry={slabEntry}
          onClose={() => setSlabEntry(null)}
          onUpdated={(updated) => {
            setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
            setSlabEntry(updated);
          }}
        />
      )}

      {showProSheet && <ProSheet onClose={() => setShowProSheet(false)} trigger="binder_limit" />}
    </div>
  );
}

// ── Slab value summary ──────────────────────────────────────────────────────

function SlabValueCard({ slabs }: { slabs: UserCard[] }) {
  const [summary, setSummary] = useState<{ total_value_usd: number; total_value_eur: number } | null>(null);

  useEffect(() => {
    apiFetch<any>('/binder/slabs').then(d => setSummary(d)).catch(() => {});
  }, [slabs.length]);

  const companyCounts: Record<string, number> = {};
  for (const s of slabs) {
    if (s.grading_company) companyCounts[s.grading_company] = (companyCounts[s.grading_company] ?? 0) + 1;
  }
  const companyLine = Object.entries(companyCounts).map(([c, n]) => `${c} ×${n}`).join('  ·  ');

  const highest = slabs.reduce<UserCard | null>((best, s) => {
    if (!s.graded_prices) return best;
    const company = (s.grading_company ?? '').toLowerCase();
    const gradeNum = (s.grade ?? '').replace(/\s+.*/,'');
    const price = s.graded_prices?.[`${company}_${gradeNum}_median`];
    if (!price) return best;
    if (!best) return s;
    const bestCompany = (best.grading_company ?? '').toLowerCase();
    const bestGradeNum = (best.grade ?? '').replace(/\s+.*/,'');
    const bestPrice = best.graded_prices?.[`${bestCompany}_${bestGradeNum}_median`];
    return (price > (bestPrice ?? 0)) ? s : best;
  }, null);

  return (
    <div className="bg-gray-800 rounded-2xl p-4 mb-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Your slabs</p>
      <p className="text-sm text-gray-300">{slabs.length} graded {slabs.length === 1 ? 'card' : 'cards'}</p>
      {summary && (
        <p className="text-lg font-bold text-white mt-1">
          ${summary.total_value_usd.toFixed(0)}
          <span className="text-sm font-normal text-gray-400 ml-2">(~€{summary.total_value_eur.toFixed(0)})</span>
        </p>
      )}
      {highest && (
        <p className="text-xs text-gray-400 mt-1">
          Highest: {highest.card.name}
          {highest.grading_company && highest.grade && ` ${highest.grading_company} ${highest.grade}`}
        </p>
      )}
      {companyLine && <p className="text-xs text-gray-500 mt-0.5">{companyLine}</p>}
    </div>
  );
}

// ── Slab row ────────────────────────────────────────────────────────────────

function SlabRow({ entry, onTap, onRemove }: { entry: UserCard; onTap: () => void; onRemove: () => void }) {
  const { card } = entry;
  const verifyUrl = entry.cert_number && entry.grading_company
    ? VERIFY_URLS[entry.grading_company]?.(entry.cert_number)
    : null;

  const attrs: string[] = [];
  if (entry.finish && entry.finish !== 'standard') attrs.push(FINISH_LABELS[entry.finish] ?? entry.finish);
  if (entry.language) attrs.push(entry.language);
  if (entry.edition && entry.edition !== 'unlimited') attrs.push(EDITION_LABELS[entry.edition]);

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden group">
      <button onClick={onTap} className="w-full flex items-center gap-3 px-3 py-3 text-left">
        <img
          src={cardImageUrl(card.image_url)}
          alt={card.name}
          className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-white truncate">{card.name}</span>
            {entry.grading_company && entry.grade && (
              <GradeBadge company={entry.grading_company} grade={entry.grade} />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <GamePill game={card.game} />
            <span className="text-xs text-gray-400">{card.external_id}</span>
          </div>
          {attrs.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{attrs.join(' · ')}</p>
          )}
          {entry.cert_number && (
            <p className="text-xs text-gray-500 mt-0.5">
              Cert #{entry.cert_number}
              {entry.graded_at && (
                <span className="ml-2">
                  · {new Date(entry.graded_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
          {verifyUrl && (
            <a
              href={verifyUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-brand"
            >
              ↗ Verify
            </a>
          )}
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1"
          >
            ✕
          </button>
        </div>
      </button>
    </div>
  );
}

// ── Raw card row ────────────────────────────────────────────────────────────

function CardRow({ entry, onRemove, onEdit, onPrice }: { entry: UserCard; onRemove: () => void; onEdit: () => void; onPrice: () => void }) {
  const { card } = entry;
  const cond = entry.condition;
  const finish = entry.finish;
  const lang = entry.language;

  const attrs: string[] = [];
  if (finish && finish !== 'standard') attrs.push(FINISH_LABELS[finish] ?? finish);
  if (lang) attrs.push(lang);
  if (cond) attrs.push(cond);

  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl px-3 py-3 group">
      {card.image_url ? (
        <img src={cardImageUrl(card.image_url)} alt={card.name} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" loading="lazy" />
      ) : (
        <div className="w-10 h-14 rounded-lg bg-gray-700 flex-shrink-0 flex items-center justify-center text-gray-500 text-xs">?</div>
      )}
      <div className="flex-1 min-w-0" onClick={onEdit}>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-white truncate">{card.name}</span>
          {entry.quantity > 1 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-bold bg-indigo-900/60 text-indigo-300">×{entry.quantity}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <GamePill game={card.game} />
          <span className="text-xs text-gray-400">{card.external_id}</span>
        </div>
        {attrs.length > 0 && (
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {cond && (
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[cond]}`} aria-hidden="true" />
                <span className={`text-xs font-medium ${CONDITION_COLORS[cond]}`}>{cond}</span>
              </span>
            )}
            {finish && finish !== 'standard' && <span className="text-xs text-purple-300">{FINISH_LABELS[finish] ?? finish}</span>}
            {lang && <span className="text-xs text-blue-300">{lang}</span>}
            {entry.edition && entry.edition !== 'unlimited' && <span className="text-xs text-gray-500">{EDITION_LABELS[entry.edition]}</span>}
          </div>
        )}
        {entry.notes && <p className="text-xs text-gray-500 mt-0.5 italic truncate">{entry.notes}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
        {card.market_price_eur != null && (
          <button
            onClick={onPrice}
            className="text-xs font-semibold text-brand bg-brand/10 px-2 py-0.5 rounded-full hover:bg-brand/20 transition-colors"
          >
            €{(card.market_price_eur / 100).toFixed(2)}
          </button>
        )}
        <button
          onClick={onRemove}
          aria-label="Remove card"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Add card sheet ──────────────────────────────────────────────────────────

interface AddCardSheetProps {
  card: Card;
  defaultStatus: 'want' | 'have';
  searchLang: SearchLang;
  onDone: (entry: UserCard) => void;
  onClose: () => void;
  onLimitReached?: () => void;
}

function AddCardSheet({ card, defaultStatus, searchLang, onDone, onClose, onLimitReached }: AddCardSheetProps) {
  const { user } = useAuthStore();
  const [status, setStatus] = useState<'want' | 'have'>(defaultStatus);
  const [isGraded, setIsGraded] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  // grading fields
  const [gradingCompany, setGradingCompany] = useState<GradingCompany | null>(null);
  const [grade, setGrade] = useState('');
  const [certNumber, setCertNumber] = useState('');
  const [gradedAt, setGradedAt] = useState('');
  const [includeInTrades, setIncludeInTrades] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPrices, setShowPrices] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(card.id);

  useEffect(() => {
    if (status === 'have') {
      if (!condition) setCondition('NM');
      setLanguage(searchLang as Language);
      if (!edition) setEdition(searchLang === 'JP' ? '1st_ed' : 'unlimited');
      if (!finish) setFinish(card.available_finishes?.[0]?.finish_id ?? 'standard');
    } else {
      setLanguage(searchLang as Language);
      setCondition(null);
      setEdition(null);
      setFinish(null);
      setIsGraded(false);
    }
  }, [status]);

  const availableFinishes: { finish_id: string; label: string }[] = card.available_finishes?.length
    ? card.available_finishes
    : POKEMON_FINISHES;

  const variantOptions: Array<{ id: string; image_url: string; label: string; finish_id: string }> =
    card.variants && card.variants.length > 0
      ? [
          { id: card.id, image_url: cardImageUrl(card.image_url) ?? '', label: 'Standard', finish_id: 'standard' },
          ...card.variants.map((v: CardVariantSummary) => {
            const matchedFinish = card.available_finishes?.find(f => f.finish_id === v.parallel_id);
            return { id: v.id, image_url: cardImageUrl(v.image_url) ?? '', label: matchedFinish?.label ?? v.parallel_id, finish_id: v.parallel_id };
          }),
        ]
      : [];

  function selectVariant(opt: typeof variantOptions[0]) {
    setSelectedVariantId(opt.id);
    setFinish(opt.finish_id);
  }

  async function submit() {
    if (isGraded && (!gradingCompany || !grade)) {
      setError('Please select a grading company and grade.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const cardId = variantOptions.length > 0 ? selectedVariantId : card.id;
      const body: Record<string, any> = {
        card_id: cardId,
        status,
        quantity,
        language: language ?? undefined,
        edition: edition ?? undefined,
        finish: finish ?? undefined,
        notes: notes || undefined,
        is_graded: isGraded,
      };
      if (!isGraded) {
        body.condition = condition ?? undefined;
      } else {
        body.grading_company = gradingCompany;
        body.grade = grade;
        body.cert_number = certNumber || undefined;
        body.graded_at = gradedAt || undefined;
        body.include_in_trades = includeInTrades;
      }
      const entry = await apiPost<UserCard>('/binder', body);
      onDone(entry);
    } catch (err: any) {
      if (err?.data?.code === 'binder_limit_reached' && onLimitReached) {
        onLimitReached();
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const displayImage = variantOptions.length > 0
    ? (variantOptions.find(v => v.id === selectedVariantId)?.image_url ?? cardImageUrl(card.image_url))
    : cardImageUrl(card.image_url);

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-gray-900 rounded-t-3xl max-h-[92vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          {/* Card header */}
          <div className="flex items-center gap-3">
            {displayImage && <img src={displayImage} alt={card.name} className="w-14 h-20 object-cover rounded-xl flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white">{card.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <GamePill game={card.game} />
                <span className="text-xs text-gray-400">{card.set_name}</span>
                <span className="text-xs text-gray-500">{card.external_id}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {card.market_price_eur != null && (
                  <p className="text-xs text-gray-400">Market: €{(card.market_price_eur / 100).toFixed(2)}</p>
                )}
                <button type="button" onClick={() => setShowPrices(true)} className="text-xs text-brand underline">
                  See prices ↗
                </button>
              </div>
            </div>
          </div>

          {showPrices && (
            <CardPriceSheet card={card} onClose={() => setShowPrices(false)} isPro={user?.is_pro ?? false} />
          )}

          {variantOptions.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Select Variant <span className="normal-case font-normal text-gray-500">({variantOptions.length} available)</span>
              </label>
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
                {variantOptions.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => selectVariant(opt)}
                    className={`flex-shrink-0 flex flex-col items-center gap-1 rounded-xl p-1 border-2 transition-colors ${selectedVariantId === opt.id ? 'border-brand' : 'border-transparent hover:border-gray-600'}`}
                  >
                    <img src={opt.image_url} alt={opt.label} className="w-14 h-20 object-cover rounded-lg" />
                    <span className="text-xs text-gray-400 max-w-[60px] text-center truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Add to</label>
            <div className="flex gap-2">
              {(['want', 'have'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${status === s ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400'}`}
                >
                  {s === 'want' ? '🎯 Want' : '💎 Have'}
                </button>
              ))}
            </div>
          </div>

          {/* Graded toggle — only for "have" */}
          {status === 'have' && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Card type</label>
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setIsGraded(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!isGraded ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
                >
                  Raw card
                </button>
                <button
                  type="button"
                  onClick={() => setIsGraded(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${isGraded ? 'bg-amber-500 text-white' : 'text-gray-400'}`}
                >
                  Graded slab
                </button>
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quantity</label>
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-full bg-gray-700 text-white text-xl flex items-center justify-center">−</button>
              <span className="text-xl font-bold text-white w-6 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(10, quantity + 1))} className="w-10 h-10 rounded-full bg-gray-700 text-white text-xl flex items-center justify-center">+</button>
            </div>
          </div>

          {/* Grading fields or raw card attributes */}
          {isGraded ? (
            <GradingFields
              company={gradingCompany} setCompany={setGradingCompany}
              grade={grade} setGrade={setGrade}
              certNumber={certNumber} setCertNumber={setCertNumber}
              gradedAt={gradedAt} setGradedAt={setGradedAt}
              includeInTrades={includeInTrades} setIncludeInTrades={setIncludeInTrades}
            />
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Condition</label>
                <div className="flex gap-2 flex-wrap">
                  {status === 'want' && <Chip active={condition === null} onClick={() => setCondition(null)}>Any</Chip>}
                  {CONDITIONS.map(c => (
                    <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[c]}`} aria-hidden="true" />
                        {c}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Finish / Variant</label>
                <div className="flex gap-2 flex-wrap">
                  {status === 'want' && <Chip active={finish === null} onClick={() => setFinish(null)}>Any</Chip>}
                  {availableFinishes.map(f => (
                    <Chip key={f.finish_id} active={finish === f.finish_id} onClick={() => setFinish(f.finish_id)}>{f.label}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Language — always shown */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Language</label>
            <div className="flex gap-2 flex-wrap">
              {status === 'want' && !isGraded && <Chip active={language === null} onClick={() => setLanguage(null)}>Any</Chip>}
              {LANGUAGES.map(l => <Chip key={l} active={language === l} onClick={() => setLanguage(l)}>{l}</Chip>)}
            </div>
          </div>

          {/* Edition — always shown */}
          {!isGraded && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Edition</label>
              <div className="flex gap-2 flex-wrap">
                {status === 'want' && <Chip active={edition === null} onClick={() => setEdition(null)}>Any</Chip>}
                {EDITIONS.map(e => (
                  <Chip key={e} active={edition === e} onClick={() => setEdition(e)}>{EDITION_LABELS[e]}</Chip>
                ))}
              </div>
            </div>
          )}

          {!isGraded && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 120))}
                placeholder="e.g. minor edge wear…"
                maxLength={120}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
              <p className="text-xs text-gray-600 mt-1 text-right">{notes.length}/120</p>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3.5 rounded-xl transition-colors text-base disabled:opacity-60"
          >
            {submitting ? 'Adding…' : 'Add to Binder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit card sheet ─────────────────────────────────────────────────────────

function EditCardSheet({ entry, onDone, onClose }: { entry: UserCard; onDone: (u: UserCard) => void; onClose: () => void }) {
  const [quantity, setQuantity] = useState(entry.quantity);
  const [condition, setCondition] = useState<Condition | null>(entry.condition);
  const [language, setLanguage] = useState<Language | null>(entry.language);
  const [edition, setEdition] = useState<Edition | null>(entry.edition);
  const [finish, setFinish] = useState<string | null>(entry.finish);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [isGraded, setIsGraded] = useState(entry.is_graded ?? false);
  const [gradingCompany, setGradingCompany] = useState<GradingCompany | null>(entry.grading_company ?? null);
  const [grade, setGrade] = useState(entry.grade ?? '');
  const [certNumber, setCertNumber] = useState(entry.cert_number ?? '');
  const [gradedAt, setGradedAt] = useState(entry.graded_at ?? '');
  const [includeInTrades, setIncludeInTrades] = useState(entry.include_in_trades ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isWant = entry.status === 'want';
  const availableFinishes: { finish_id: string; label: string }[] = entry.card.available_finishes?.length
    ? entry.card.available_finishes
    : POKEMON_FINISHES;

  async function submit() {
    if (isGraded && (!gradingCompany || !grade)) {
      setError('Please select a grading company and grade.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body: Record<string, any> = {
        quantity,
        language,
        edition,
        finish,
        notes: notes || null,
        is_graded: isGraded,
      };
      if (!isGraded) {
        body.condition = condition;
        body.grading_company = null;
        body.grade = null;
        body.cert_number = null;
        body.graded_at = null;
      } else {
        body.grading_company = gradingCompany;
        body.grade = grade;
        body.cert_number = certNumber || null;
        body.graded_at = gradedAt || null;
        body.include_in_trades = includeInTrades;
      }
      const updated = await apiPatch<UserCard>(`/binder/${entry.id}`, body);
      onDone(updated);
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-gray-900 rounded-t-3xl max-h-[92vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            {entry.card.image_url && <img src={cardImageUrl(entry.card.image_url)} alt={entry.card.name} className="w-14 h-20 object-cover rounded-xl flex-shrink-0" />}
            <div>
              <h3 className="text-lg font-bold text-white">{entry.card.name}</h3>
              <p className="text-xs text-gray-400 mt-1">{entry.status === 'want' ? '🎯 Want' : '💎 Have'}</p>
            </div>
          </div>

          {/* Graded toggle — only for "have" */}
          {!isWant && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Card type</label>
              <div className="flex bg-gray-800 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setIsGraded(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!isGraded ? 'bg-gray-600 text-white' : 'text-gray-400'}`}
                >
                  Raw card
                </button>
                <button
                  type="button"
                  onClick={() => setIsGraded(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${isGraded ? 'bg-amber-500 text-white' : 'text-gray-400'}`}
                >
                  Graded slab
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quantity</label>
            <div className="flex items-center gap-5">
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-full bg-gray-700 text-white text-xl flex items-center justify-center">−</button>
              <span className="text-xl font-bold text-white w-6 text-center">{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(10, quantity + 1))} className="w-10 h-10 rounded-full bg-gray-700 text-white text-xl flex items-center justify-center">+</button>
            </div>
          </div>

          {isGraded ? (
            <GradingFields
              company={gradingCompany} setCompany={setGradingCompany}
              grade={grade} setGrade={setGrade}
              certNumber={certNumber} setCertNumber={setCertNumber}
              gradedAt={gradedAt} setGradedAt={setGradedAt}
              includeInTrades={includeInTrades} setIncludeInTrades={setIncludeInTrades}
            />
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Condition</label>
                <div className="flex gap-2 flex-wrap">
                  {isWant && <Chip active={condition === null} onClick={() => setCondition(null)}>Any</Chip>}
                  {CONDITIONS.map(c => (
                    <Chip key={c} active={condition === c} onClick={() => setCondition(c)}>
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${CONDITION_DOT[c]}`} />
                        {c}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Finish / Variant</label>
                <div className="flex gap-2 flex-wrap">
                  {isWant && <Chip active={finish === null} onClick={() => setFinish(null)}>Any</Chip>}
                  {availableFinishes.map(f => (
                    <Chip key={f.finish_id} active={finish === f.finish_id} onClick={() => setFinish(f.finish_id)}>{f.label}</Chip>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Language</label>
            <div className="flex gap-2 flex-wrap">
              {isWant && <Chip active={language === null} onClick={() => setLanguage(null)}>Any</Chip>}
              {LANGUAGES.map(l => <Chip key={l} active={language === l} onClick={() => setLanguage(l)}>{l}</Chip>)}
            </div>
          </div>

          {!isGraded && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Edition</label>
              <div className="flex gap-2 flex-wrap">
                {isWant && <Chip active={edition === null} onClick={() => setEdition(null)}>Any</Chip>}
                {EDITIONS.map(e => <Chip key={e} active={edition === e} onClick={() => setEdition(e)}>{EDITION_LABELS[e]}</Chip>)}
              </div>
            </div>
          )}

          {!isGraded && (
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value.slice(0, 120))}
                maxLength={120}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full bg-brand text-white font-semibold py-3.5 rounded-xl transition-colors text-base disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
