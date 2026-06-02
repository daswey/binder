import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, FlatList, Image, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiPost, apiPatch } from '../api/client';
import { useAuthStore } from '../store/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface SearchCard {
  id: string; name: string; external_id: string;
  image_url?: string; game: string;
}

const GAMES = [
  { id: 'pokemon', label: 'Pokémon', emoji: '⚡' },
  { id: 'one_piece', label: 'One Piece', emoji: '🏴‍☠️' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function searchNominatim(q: string): Promise<NominatimResult[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

async function reverseNominatim(lat: number, lon: number): Promise<NominatimResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function formatLabel(r: NominatimResult) {
  return r.display_name.split(',').slice(0, 3).join(',').trim();
}

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  return (
    <View style={s.dots}>
      {([0, 1, 2] as Step[]).map(i => (
        <View
          key={i}
          style={[
            s.dot,
            i === step ? s.dotActive : i < step ? s.dotDone : s.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

// ── Step 0: Location ──────────────────────────────────────────────────────────

function LocationStep({ onNext }: { onNext: () => void }) {
  const { fetchMe } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [selected, setSelected] = useState<{ label: string; lat: number; lon: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function onQueryChange(v: string) {
    setQuery(v);
    setSelected(null);
    clearTimeout(timer.current);
    if (v.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchNominatim(v);
      setResults(r);
      setSearching(false);
    }, 350);
  }

  function detectLocation() {
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
      () => {
        setGeoLoading(false);
        Alert.alert('Location', 'Could not detect location. Please search manually.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function pick(r: NominatimResult) {
    const label = formatLabel(r);
    setQuery(label);
    setSelected({ label, lat: parseFloat(r.lat), lon: parseFloat(r.lon) });
    setResults([]);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPatch('/auth/me/onboarding', {
        step: 1,
        location_label: selected.label,
        latitude: selected.lat || undefined,
        longitude: selected.lon || undefined,
      });
      await fetchMe();
      onNext();
    } finally { setSaving(false); }
  }

  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>Where are you based?</Text>
      <Text style={s.stepSub}>We use your location to find nearby traders and events.</Text>

      {/* GPS button */}
      <TouchableOpacity style={s.gpsBtn} onPress={detectLocation} disabled={geoLoading}>
        {geoLoading
          ? <ActivityIndicator color="#6366f1" />
          : <Text style={s.gpsBtnTxt}>📍  Use my current location</Text>
        }
      </TouchableOpacity>

      {/* Search */}
      <View style={s.searchBox}>
        <TextInput
          style={s.searchInput}
          placeholder="Search city or area…"
          placeholderTextColor="#6b7280"
          value={query}
          onChangeText={onQueryChange}
        />
        {searching && <ActivityIndicator color="#6366f1" style={{ marginRight: 12 }} />}
      </View>

      {/* Results */}
      {results.length > 0 && (
        <View style={s.dropdown}>
          {results.map(r => (
            <TouchableOpacity key={r.place_id} style={s.dropItem} onPress={() => pick(r)}>
              <Text style={s.dropTxt} numberOfLines={1}>{formatLabel(r)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Selected */}
      {selected && (
        <View style={s.selectedRow}>
          <Text style={s.selectedTxt}>✓  {selected.label}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.btn, !selected && s.btnDisabled]}
        onPress={save}
        disabled={!selected || saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnTxt}>Continue</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ── Step 1: Games ─────────────────────────────────────────────────────────────

function GamesStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { fetchMe } = useAuthStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected(p => p.includes(id) ? p.filter(g => g !== id) : [...p, id]);
  }

  async function save() {
    if (selected.length === 0) return;
    setSaving(true);
    try {
      await apiPatch('/auth/me/onboarding', { step: 2, games: selected });
      await fetchMe();
      onNext();
    } finally { setSaving(false); }
  }

  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>Which games do you play?</Text>
      <Text style={s.stepSub}>Select all that apply. You can change this later.</Text>

      <View style={s.gamesGrid}>
        {GAMES.map(g => {
          const on = selected.includes(g.id);
          return (
            <TouchableOpacity
              key={g.id}
              style={[s.gameCard, on && s.gameCardOn]}
              onPress={() => toggle(g.id)}
              activeOpacity={0.8}
            >
              <Text style={s.gameEmoji}>{g.emoji}</Text>
              <Text style={[s.gameLabel, on && s.gameLabelOn]}>{g.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.row}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backBtnTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, s.flex1, selected.length === 0 && s.btnDisabled]}
          onPress={save}
          disabled={selected.length === 0 || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Step 2: First cards ───────────────────────────────────────────────────────

function FirstCardsStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  const { fetchMe } = useAuthStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchCard[]>([]);
  const [addedCount, setAddedCount] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function onSearch(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    if (v.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await apiFetch<{ data: SearchCard[] }>(`/cards/search?q=${encodeURIComponent(v)}&limit=8`);
        setResults(d.data ?? []);
      } catch {}
    }, 350);
  }

  async function addCard(card: SearchCard) {
    try {
      await apiPost('/binder', { card_id: card.id, status: 'have', quantity: 1, condition: 'NM' });
      setAddedCount(n => n + 1);
      setResults(p => p.filter(c => c.id !== card.id));
    } catch {}
  }

  async function finish() {
    setFinishing(true);
    try {
      await apiPatch('/auth/me/onboarding', { step: 3, completed: true });
      await fetchMe();
      onFinish();
    } finally { setFinishing(false); }
  }

  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>Add your first cards</Text>
      <Text style={s.stepSub}>Search and add cards you own. You can add more later.</Text>

      {addedCount > 0 && (
        <View style={s.addedBanner}>
          <Text style={s.addedTxt}>✓  {addedCount} card{addedCount !== 1 ? 's' : ''} added to your binder</Text>
        </View>
      )}

      <TextInput
        style={s.searchInput}
        placeholder="Search cards to add…"
        placeholderTextColor="#6b7280"
        value={q}
        onChangeText={onSearch}
      />

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={c => c.id}
          style={{ maxHeight: 280, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity style={s.cardRow} onPress={() => addCard(item)}>
              {item.image_url
                ? <Image source={{ uri: item.image_url }} style={s.cardImg} />
                : <View style={[s.cardImg, { backgroundColor: '#1f2937' }]} />
              }
              <View style={{ flex: 1 }}>
                <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardSub}>{item.external_id}</Text>
              </View>
              <View style={s.addCircle}>
                <Text style={{ color: '#6366f1', fontSize: 20, lineHeight: 22 }}>+</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={[s.row, { marginTop: 'auto' as any }]}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backBtnTxt}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.flex1]} onPress={finish} disabled={finishing}>
          {finishing
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnTxt}>{addedCount > 0 ? 'Finish setup' : 'Skip for now'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>((user?.onboarding_step ?? 0) as Step);
  const LABELS = ['Location', 'Games', 'Cards'];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.logo}>📒 Binder</Text>
        <Text style={s.stepLabel}>Step {step + 1} of 3 — {LABELS[step]}</Text>
        <ProgressDots step={step} />
      </View>

      {/* Steps */}
      {step === 0 && <LocationStep onNext={() => setStep(1)} />}
      {step === 1 && <GamesStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <FirstCardsStep onFinish={onDone} onBack={() => setStep(1)} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  logo: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 16 },
  stepLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 24, backgroundColor: '#6366f1' },
  dotDone: { width: 8, backgroundColor: '#6366f1', opacity: 0.5 },
  dotInactive: { width: 8, backgroundColor: '#1f2937' },

  step: { flex: 1, paddingHorizontal: 24, paddingBottom: 32, gap: 16 },
  stepTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  stepSub: { color: '#9ca3af', fontSize: 14, lineHeight: 20, marginTop: -8 },

  gpsBtn: { backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  gpsBtnTxt: { color: '#d1d5db', fontSize: 14, fontWeight: '600' },

  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937' },
  searchInput: { flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937' },

  dropdown: { backgroundColor: '#111827', borderRadius: 14, borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden' },
  dropItem: { paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  dropTxt: { color: '#e5e7eb', fontSize: 14 },

  selectedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  selectedTxt: { color: '#4ade80', fontSize: 14, fontWeight: '600' },

  btn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  flex1: { flex: 1 },

  row: { flexDirection: 'row', gap: 12 },
  backBtn: { backgroundColor: '#111827', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 24, alignItems: 'center' },
  backBtnTxt: { color: '#9ca3af', fontSize: 16, fontWeight: '600' },

  gamesGrid: { flexDirection: 'row', gap: 12 },
  gameCard: { flex: 1, backgroundColor: '#111827', borderRadius: 20, borderWidth: 2, borderColor: '#1f2937', paddingVertical: 32, alignItems: 'center', gap: 10 },
  gameCardOn: { borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)' },
  gameEmoji: { fontSize: 40 },
  gameLabel: { color: '#9ca3af', fontSize: 14, fontWeight: '700' },
  gameLabelOn: { color: '#fff' },

  addedBanner: { backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  addedTxt: { color: '#4ade80', fontSize: 13, fontWeight: '600' },

  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 12, padding: 10, gap: 10, marginBottom: 6 },
  cardImg: { width: 34, height: 47, borderRadius: 5 },
  cardName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cardSub: { color: '#9ca3af', fontSize: 11 },
  addCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)', alignItems: 'center', justifyContent: 'center' },
});
