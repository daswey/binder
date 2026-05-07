import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { apiPatch, apiFetch } from '../api/client';
import { User } from '@binder/shared';

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2;

const GAMES = [
  { id: 'one_piece', label: 'One Piece', emoji: '🏴‍☠️' },
  { id: 'pokemon', label: 'Pokémon', emoji: '⚡' },
];

// ── Location search via Nominatim ─────────────────────────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

async function searchNominatim(q: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  return res.json();
}

async function reverseNominatim(lat: number, lon: number): Promise<NominatimResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  return res.json();
}

function formatLabel(r: NominatimResult) {
  const parts = r.display_name.split(',').slice(0, 3);
  return parts.join(',').trim();
}

// ── Step 0: Location ──────────────────────────────────────────────────────────

function LocationStep({ onNext }: { onNext: () => void }) {
  const { user } = useAuthStore();
  const [query, setQuery] = useState(user?.location_label ?? '');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [selected, setSelected] = useState<{ label: string; lat: number; lon: number } | null>(
    user?.location_label ? { label: user.location_label, lat: 0, lon: 0 } : null
  );
  const [geoLoading, setGeoLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const onQueryChange = (v: string) => {
    setQuery(v);
    setSelected(null);
    clearTimeout(debounce.current);
    if (v.length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchNominatim(v);
      setResults(r);
      setSearching(false);
    }, 350);
  };

  const detectLocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const r = await reverseNominatim(coords.latitude, coords.longitude);
        if (r) {
          const label = formatLabel(r);
          setQuery(label);
          setSelected({ label, lat: coords.latitude, lon: coords.longitude });
          setResults([]);
        }
        setGeoLoading(false);
      },
      () => setGeoLoading(false)
    );
  };

  const pick = (r: NominatimResult) => {
    const label = formatLabel(r);
    setQuery(label);
    setSelected({ label, lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
    setResults([]);
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPatch('/auth/me/onboarding', {
        step: 1,
        location_label: selected.label,
        latitude: selected.lat || undefined,
        longitude: selected.lon || undefined,
      });
      useAuthStore.getState().fetchMe();
      onNext();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Where are you based?</h2>
        <p className="text-gray-400 text-sm">We use your location to find nearby traders and events.</p>
      </div>

      <button
        type="button"
        onClick={detectLocation}
        disabled={geoLoading}
        className="flex items-center gap-3 px-4 py-3 bg-gray-800 border border-gray-700 rounded-2xl text-sm text-gray-300 hover:border-brand transition-colors"
      >
        {geoLoading ? (
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        )}
        Use my current location
      </button>

      <div className="relative">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            placeholder="Search city or area…"
            className="w-full bg-gray-800 border border-gray-700 rounded-2xl pl-9 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand text-sm"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {results.length > 0 && (
          <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
            {results.map(r => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="w-full text-left px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-0"
                >
                  {formatLabel(r)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {selected.label}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!selected || saving}
        className="w-full py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}

// ── Step 1: Games ─────────────────────────────────────────────────────────────

function GamesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { user } = useAuthStore();
  const [selected, setSelected] = useState<string[]>(user?.games ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const save = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await apiPatch('/auth/me/onboarding', { step: 2, games: selected });
      useAuthStore.getState().fetchMe();
      onNext();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Which games do you play?</h2>
        <p className="text-gray-400 text-sm">Select all that apply. You can change this later in your profile.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {GAMES.map(g => {
          const active = selected.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className={`flex flex-col items-center gap-2 py-6 rounded-2xl border-2 transition-all ${
                active ? 'border-brand bg-brand/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              <span className="text-4xl">{g.emoji}</span>
              <span className="text-sm font-semibold">{g.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3.5 bg-gray-800 rounded-2xl text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={save}
          disabled={selected.length === 0 || saving}
          className="flex-1 py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

// ── Step 2: First cards ───────────────────────────────────────────────────────

interface SearchCard { id: string; name: string; external_id: string; image_url: string; game: string; set_code: string; }

function FirstCardsStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchCard[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const search = (v: string) => {
    setQ(v);
    clearTimeout(debounce.current);
    if (v.length < 2) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ data: SearchCard[] }>(`/cards/search?q=${encodeURIComponent(v)}&limit=8`);
        setResults(data.data ?? []);
      } catch {}
    }, 350);
  };

  const addCard = async (card: SearchCard) => {
    try {
      await apiFetch('/binder', {
        method: 'POST',
        body: JSON.stringify({ card_id: card.id, status: 'have', quantity: 1, condition: 'NM' }),
        headers: { 'Content-Type': 'application/json' },
      });
      setAddedCount(n => n + 1);
      setResults(prev => prev.filter(c => c.id !== card.id));
    } catch {}
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await apiPatch('/auth/me/onboarding', { step: 3, completed: true });
      useAuthStore.getState().fetchMe();
      onFinish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-1">Add your first cards</h2>
        <p className="text-gray-400 text-sm">Search and add cards you own to your binder. You can always add more later.</p>
      </div>

      {addedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-4 py-2.5 rounded-xl">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {addedCount} card{addedCount !== 1 ? 's' : ''} added to your binder
        </div>
      )}

      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          type="text"
          value={q}
          onChange={e => search(e.target.value)}
          placeholder="Search cards to add…"
          className="w-full bg-gray-800 border border-gray-700 rounded-2xl pl-9 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand text-sm"
        />
      </div>

      {results.length > 0 && (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {results.map(card => (
            <li key={card.id}>
              <button
                type="button"
                onClick={() => addCard(card)}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800 rounded-xl hover:bg-gray-700 transition-colors text-left"
              >
                {card.image_url ? (
                  <img src={card.image_url} alt="" className="w-8 h-11 object-contain rounded" />
                ) : (
                  <div className="w-8 h-11 bg-gray-700 rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{card.name}</p>
                  <p className="text-xs text-gray-500">{card.external_id}</p>
                </div>
                <div className="w-7 h-7 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand"><path d="M12 5v14M5 12h14"/></svg>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3 mt-auto">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3.5 bg-gray-800 rounded-2xl text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={finishing}
          className="flex-1 py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
        >
          {finishing ? 'Finishing…' : addedCount > 0 ? 'Finish setup' : 'Skip for now'}
        </button>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`rounded-full transition-all ${
            i === step ? 'w-6 h-2 bg-brand' : i < step ? 'w-2 h-2 bg-brand/60' : 'w-2 h-2 bg-gray-700'
          }`}
        />
      ))}
    </div>
  );
}

// ── Main Onboarding page ──────────────────────────────────────────────────────

export function OnboardingPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>((user?.onboarding_step ?? 0) as Step);

  useEffect(() => {
    if (user?.onboarding_completed) {
      navigate('/feed', { replace: true });
    }
  }, [user?.onboarding_completed, navigate]);

  const STEP_LABELS = ['Location', 'Games', 'Cards'];

  return (
    <div className="min-h-full bg-gray-950 flex flex-col">
      <div className="px-6 pt-12 pb-6 flex-shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">📒</span>
          <span className="text-lg font-bold text-white">Binder</span>
        </div>

        <p className="text-xs font-medium text-gray-500 uppercase tracking-widest mb-1">
          Step {step + 1} of 3 — {STEP_LABELS[step]}
        </p>
        <ProgressDots step={step} />
      </div>

      <div className="flex-1 px-6 pb-safe overflow-y-auto">
        {step === 0 && (
          <LocationStep onNext={() => setStep(1)} />
        )}
        {step === 1 && (
          <GamesStep onNext={() => setStep(2)} onBack={() => setStep(0)} />
        )}
        {step === 2 && (
          <FirstCardsStep
            onFinish={() => navigate('/feed', { replace: true })}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </div>
  );
}
