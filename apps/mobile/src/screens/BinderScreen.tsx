import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, Image, Modal, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiPost, apiDelete } from '../api/client';

interface Card {
  id: string; name: string; external_id: string; game: string;
  set_name: string; image_url?: string; market_price_eur?: number;
  local_id?: string; set_card_count?: number;
  available_finishes?: { finish_id: string; label: string }[];
}

interface UserCard {
  id: string; status: 'want' | 'have'; quantity: number;
  condition?: string; language?: string; finish?: string;
  is_graded?: boolean; card: Card;
}

const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'Damaged'];
const LANGUAGES = ['EN', 'JP', 'DE', 'FR', 'ES'];
const COND_COLOR: Record<string, string> = {
  NM: '#4ade80', LP: '#2dd4bf', MP: '#fbbf24', HP: '#fb923c', Damaged: '#ef4444',
};

function cardNum(card: Card): string {
  if (card.game === 'one_piece') {
    return card.set_card_count ? `${card.external_id}/${card.set_card_count}` : card.external_id;
  }
  const raw = card.local_id ?? card.external_id.split('-').pop() ?? card.external_id;
  if (card.set_card_count) {
    return `${raw.padStart(String(card.set_card_count).length, '0')}/${card.set_card_count}`;
  }
  return raw;
}

type SearchLang = 'EN' | 'DE' | 'JP';
type SearchGame = '' | 'pokemon' | 'one_piece';

const SEARCH_LANGS: { lang: SearchLang; flag: string }[] = [
  { lang: 'EN', flag: '🇬🇧' },
  { lang: 'DE', flag: '🇩🇪' },
  { lang: 'JP', flag: '🇯🇵' },
];

const SEARCH_GAMES: { game: SearchGame; label: string }[] = [
  { game: '', label: 'All' },
  { game: 'pokemon', label: '⚡ Pokémon' },
  { game: 'one_piece', label: '☠️ One Piece' },
];

export default function BinderScreen() {
  const [tab, setTab] = useState<'want' | 'have'>('want');
  const [entries, setEntries] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchLang, setSearchLang] = useState<SearchLang>('EN');
  const [searchGame, setSearchGame] = useState<SearchGame>('');
  const [results, setResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [addCard, setAddCard] = useState<Card | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await apiFetch<UserCard[]>('/binder')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!query.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const gameParam = searchGame ? `&game=${searchGame}` : '';
        const d = await apiFetch<{ data: Card[] }>(
          `/cards/search?q=${encodeURIComponent(query)}&lang=${searchLang}${gameParam}&limit=20`
        );
        setResults(d.data);
      } finally { setSearching(false); }
    }, 300);
  }, [query, searchLang, searchGame]);

  const shown = entries.filter(e => !e.is_graded && e.status === tab);
  const wantN = entries.filter(e => !e.is_graded && e.status === 'want').length;
  const haveN = entries.filter(e => !e.is_graded && e.status === 'have').length;

  async function remove(id: string) {
    await apiDelete(`/binder/${id}`);
    setEntries(p => p.filter(x => x.id !== id));
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>My Binder</Text>

        {/* Search input */}
        <View style={s.searchRow}>
          <TextInput
            style={s.searchInput}
            placeholder="Search cards by name or code…"
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
          />
          {searching && <ActivityIndicator color="#6366f1" style={s.spinner} />}
        </View>

        {/* Language filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6, paddingRight: 4 }}>
            {SEARCH_LANGS.map(({ lang, flag }) => (
              <TouchableOpacity
                key={lang}
                style={[s.filterPill, searchLang === lang && s.filterPillOn]}
                onPress={() => setSearchLang(lang)}
              >
                <Text style={[s.filterPillTxt, searchLang === lang && s.filterPillTxtOn]}>{flag} {lang}</Text>
              </TouchableOpacity>
            ))}
            <View style={s.filterDivider} />
            {SEARCH_GAMES.map(({ game, label }) => (
              <TouchableOpacity
                key={game}
                style={[s.filterPill, searchGame === game && s.filterPillOn]}
                onPress={() => setSearchGame(game)}
              >
                <Text style={[s.filterPillTxt, searchGame === game && s.filterPillTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Search dropdown */}
        {results.length > 0 && (
          <View style={s.dropdown}>
            <FlatList
              data={results}
              keyExtractor={c => c.id}
              style={{ maxHeight: 260 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.dropRow}
                  onPress={() => { setAddCard(item); setQuery(''); setResults([]); }}
                >
                  {item.image_url
                    ? <Image source={{ uri: item.image_url }} style={s.dropImg} />
                    : <View style={[s.dropImg, { backgroundColor: '#374151' }]} />
                  }
                  <View style={{ flex: 1 }}>
                    <Text style={s.dropName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.dropSub}>{cardNum(item)} · {item.set_name}</Text>
                  </View>
                  {item.market_price_eur != null && (
                    <Text style={s.price}>€{(item.market_price_eur / 100).toFixed(2)}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Tabs */}
        <View style={s.tabs}>
          {(['want', 'have'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabOn]}
              onPress={() => setTab(t)}
            >
              <Text style={[s.tabTxt, tab === t && s.tabTxtOn]}>
                {t === 'want' ? `🎯 Want (${wantN})` : `💎 Have (${haveN})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading
        ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
        : <FlatList
            data={shown}
            keyExtractor={e => e.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <View style={s.card}>
                {item.card.image_url
                  ? <Image source={{ uri: item.card.image_url }} style={s.cardImg} />
                  : <View style={[s.cardImg, { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#6b7280', fontSize: 10 }}>?</Text>
                    </View>
                }
                <View style={{ flex: 1 }}>
                  <Text style={s.cardName} numberOfLines={1}>{item.card.name}</Text>
                  <Text style={s.cardSub}>{cardNum(item.card)} · {item.card.set_name}</Text>
                  <View style={s.badges}>
                    {item.condition && (
                      <Text style={[s.badge, { color: COND_COLOR[item.condition] ?? '#9ca3af' }]}>
                        {item.condition}
                      </Text>
                    )}
                    {item.language && <Text style={[s.badge, { color: '#93c5fd' }]}>{item.language}</Text>}
                    {item.quantity > 1 && <Text style={[s.badge, { color: '#a5b4fc' }]}>×{item.quantity}</Text>}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {item.card.market_price_eur != null && (
                    <Text style={s.price}>€{(item.card.market_price_eur / 100).toFixed(2)}</Text>
                  )}
                  <TouchableOpacity onPress={() =>
                    Alert.alert('Remove', 'Remove this card?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => remove(item.id) },
                    ])
                  }>
                    <Text style={{ color: '#ef4444', fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ fontSize: 44 }}>{tab === 'want' ? '🎯' : '💎'}</Text>
                <Text style={s.emptyTxt}>
                  {tab === 'want'
                    ? 'Search for cards above and add them to your want list'
                    : 'Add cards you have spare to find trade matches'}
                </Text>
              </View>
            }
          />
      }

      {addCard && (
        <AddModal
          card={addCard}
          defaultStatus={tab}
          onDone={entry => { setEntries(p => [entry, ...p]); setAddCard(null); }}
          onClose={() => setAddCard(null)}
        />
      )}
    </SafeAreaView>
  );
}

function AddModal({ card, defaultStatus, onDone, onClose }: {
  card: Card; defaultStatus: 'want' | 'have';
  onDone: (e: UserCard) => void; onClose: () => void;
}) {
  const [status, setStatus] = useState<'want' | 'have'>(defaultStatus);
  const [condition, setCondition] = useState('NM');
  const [language, setLanguage] = useState('EN');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const entry = await apiPost<UserCard>('/binder', {
        card_id: card.id, status, quantity,
        condition: status === 'have' ? condition : undefined,
        language,
      });
      onDone(entry);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={ms.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Card header */}
            <View style={ms.cardRow}>
              {card.image_url && (
                <Image source={{ uri: card.image_url }} style={ms.cardThumb} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={ms.cardName}>{card.name}</Text>
                <Text style={ms.cardSub}>{card.set_name}</Text>
                <Text style={ms.cardSub}>{cardNum(card)}</Text>
                {card.market_price_eur != null && (
                  <Text style={ms.cardPrice}>
                    Market: €{(card.market_price_eur / 100).toFixed(2)}
                  </Text>
                )}
              </View>
            </View>

            {/* Status */}
            <Text style={ms.label}>Add to</Text>
            <View style={ms.row}>
              {(['want', 'have'] as const).map(v => (
                <TouchableOpacity
                  key={v} style={[ms.chip, status === v && ms.chipOn]}
                  onPress={() => setStatus(v)}
                >
                  <Text style={[ms.chipTxt, status === v && ms.chipTxtOn]}>
                    {v === 'want' ? '🎯 Want' : '💎 Have'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantity */}
            <Text style={ms.label}>Quantity</Text>
            <View style={[ms.row, { alignItems: 'center' }]}>
              <TouchableOpacity style={ms.qBtn} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                <Text style={ms.qBtnTxt}>−</Text>
              </TouchableOpacity>
              <Text style={ms.qNum}>{quantity}</Text>
              <TouchableOpacity style={ms.qBtn} onPress={() => setQuantity(Math.min(10, quantity + 1))}>
                <Text style={ms.qBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Condition (have only) */}
            {status === 'have' && <>
              <Text style={ms.label}>Condition</Text>
              <View style={ms.wrap}>
                {CONDITIONS.map(c => (
                  <TouchableOpacity key={c} style={[ms.chip, condition === c && ms.chipOn]} onPress={() => setCondition(c)}>
                    <Text style={[ms.chipTxt, condition === c && ms.chipTxtOn]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>}

            {/* Language */}
            <Text style={ms.label}>Language</Text>
            <View style={ms.wrap}>
              {LANGUAGES.map(l => (
                <TouchableOpacity key={l} style={[ms.chip, language === l && ms.chipOn]} onPress={() => setLanguage(l)}>
                  <Text style={[ms.chipTxt, language === l && ms.chipTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={ms.btn} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={ms.btnTxt}>Add to Binder</Text>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', marginBottom: 8 },
  searchInput: { flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 13, fontSize: 15 },
  spinner: { marginRight: 12 },
  dropdown: { position: 'absolute', top: 105, left: 16, right: 16, zIndex: 99, backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: '#1f2937', elevation: 10, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8 },
  dropRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937', gap: 10 },
  dropImg: { width: 34, height: 47, borderRadius: 4 },
  dropName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dropSub: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1f2937' },
  filterPillOn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  filterPillTxt: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  filterPillTxtOn: { color: '#fff' },
  filterDivider: { width: 1, backgroundColor: '#1f2937', marginHorizontal: 4 },
  tabs: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 4, gap: 4, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#6366f1' },
  tabTxt: { color: '#6b7280', fontSize: 13, fontWeight: '700' },
  tabTxtOn: { color: '#fff' },
  list: { padding: 16, gap: 8 },
  card: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 14, padding: 12, gap: 12, alignItems: 'center' },
  cardImg: { width: 40, height: 56, borderRadius: 6 },
  cardName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardSub: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  badge: { fontSize: 11, fontWeight: '600' },
  price: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 64, gap: 12 },
  emptyTxt: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '92%' },
  cardRow: { flexDirection: 'row', gap: 14, marginBottom: 22 },
  cardThumb: { width: 60, height: 84, borderRadius: 8 },
  cardName: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  cardSub: { color: '#9ca3af', fontSize: 12 },
  cardPrice: { color: '#6366f1', fontSize: 13, marginTop: 4 },
  label: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24, borderWidth: 1, borderColor: '#1f2937' },
  chipOn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipTxt: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: '#fff' },
  qBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' },
  qBtnTxt: { color: '#fff', fontSize: 22, lineHeight: 26 },
  qNum: { color: '#fff', fontSize: 24, fontWeight: '800', width: 44, textAlign: 'center' },
  btn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
