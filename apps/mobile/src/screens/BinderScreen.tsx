import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, Image, Modal, ScrollView, Alert,
} from 'react-native';
import { apiFetch, apiPost, apiDelete, apiPatch } from '../api/client';
import { SafeAreaView } from 'react-native-safe-area-context';

const SEARCH_LIMIT = 20;
const API_IMG = (url?: string | null) => url ?? undefined;

const CONDITION_COLORS: Record<string, string> = {
  NM: '#4ade80', LP: '#2dd4bf', MP: '#fbbf24', HP: '#fb923c', Damaged: '#ef4444',
};

interface Card {
  id: string; name: string; external_id: string; game: string;
  set_name: string; image_url?: string; market_price_eur?: number;
  available_finishes?: { finish_id: string; label: string }[];
  local_id?: string; set_card_count?: number;
}

interface UserCard {
  id: string; card_id: string; status: 'want' | 'have';
  quantity: number; condition?: string; language?: string;
  finish?: string; notes?: string; is_graded?: boolean;
  card: Card;
}

export function BinderScreen() {
  const [tab, setTab] = useState<'want' | 'have'>('want');
  const [entries, setEntries] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState<Card | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const fetchBinder = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<UserCard[]>('/binder');
      setEntries(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBinder(); }, [fetchBinder]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await apiFetch<{ data: Card[] }>(`/cards/search?q=${encodeURIComponent(searchQuery)}&limit=${SEARCH_LIMIT}`);
        setSearchResults(data.data);
      } finally { setSearching(false); }
    }, 300);
  }, [searchQuery]);

  const displayed = entries.filter(e => !e.is_graded && e.status === tab);
  const wantCount = entries.filter(e => !e.is_graded && e.status === 'want').length;
  const haveCount = entries.filter(e => !e.is_graded && e.status === 'have').length;

  async function removeEntry(id: string) {
    await apiDelete(`/binder/${id}`);
    setEntries(e => e.filter(x => x.id !== id));
  }

  const formatNumber = (card: Card) => {
    if (card.game === 'one_piece') return card.set_card_count ? `${card.external_id}/${card.set_card_count}` : card.external_id;
    const raw = card.local_id ?? card.external_id.split('-').pop() ?? card.external_id;
    if (card.set_card_count) {
      const digits = String(card.set_card_count).length;
      return `${raw.padStart(digits, '0')}/${card.set_card_count}`;
    }
    return raw;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Search */}
      <View style={styles.header}>
        <Text style={styles.title}>My Binder</Text>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search cards…"
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searching && <ActivityIndicator color="#6366f1" style={{ marginRight: 10 }} />}
        </View>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <View style={styles.dropdown}>
            <FlatList
              data={searchResults}
              keyExtractor={c => c.id}
              style={{ maxHeight: 240 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => { setShowAddSheet(item); setSearchQuery(''); setSearchResults([]); }}
                >
                  {item.image_url && (
                    <Image source={{ uri: item.image_url }} style={styles.dropdownImg} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.dropdownSub}>{formatNumber(item)} · {item.set_name}</Text>
                  </View>
                  {item.market_price_eur != null && (
                    <Text style={styles.price}>€{(item.market_price_eur / 100).toFixed(2)}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'want' && styles.tabActive]}
            onPress={() => setTab('want')}
          >
            <Text style={[styles.tabText, tab === 'want' && styles.tabTextActive]}>Want ({wantCount})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'have' && styles.tabActive]}
            onPress={() => setTab('have')}
          >
            <Text style={[styles.tabText, tab === 'have' && styles.tabTextActive]}>Have ({haveCount})</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.card.image_url ? (
                <Image source={{ uri: API_IMG(item.card.image_url) }} style={styles.cardImg} />
              ) : (
                <View style={[styles.cardImg, { backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#6b7280' }}>?</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName} numberOfLines={1}>{item.card.name}</Text>
                <Text style={styles.cardSub}>{formatNumber(item.card)} · {item.card.set_name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  {item.condition && (
                    <Text style={[styles.badge, { color: CONDITION_COLORS[item.condition] ?? '#9ca3af' }]}>{item.condition}</Text>
                  )}
                  {item.language && <Text style={[styles.badge, { color: '#93c5fd' }]}>{item.language}</Text>}
                  {item.quantity > 1 && <Text style={[styles.badge, { color: '#a5b4fc' }]}>×{item.quantity}</Text>}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {item.card.market_price_eur != null && (
                  <Text style={styles.price}>€{(item.card.market_price_eur / 100).toFixed(2)}</Text>
                )}
                <TouchableOpacity onPress={() => {
                  Alert.alert('Remove', 'Remove this card?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeEntry(item.id) },
                  ]);
                }}>
                  <Text style={{ color: '#ef4444', fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>{tab === 'want' ? '🎯' : '💎'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'want' ? 'Search cards above to add to your want list' : 'Add cards you have to spare'}
              </Text>
            </View>
          }
        />
      )}

      {/* Add Card Modal */}
      {showAddSheet && (
        <AddCardModal
          card={showAddSheet}
          defaultStatus={tab}
          onDone={(entry) => { setEntries(prev => [entry, ...prev]); setShowAddSheet(null); }}
          onClose={() => setShowAddSheet(null)}
        />
      )}
    </SafeAreaView>
  );
}

function AddCardModal({ card, defaultStatus, onDone, onClose }: {
  card: Card; defaultStatus: 'want' | 'have';
  onDone: (e: UserCard) => void; onClose: () => void;
}) {
  const [status, setStatus] = useState<'want' | 'have'>(defaultStatus);
  const [condition, setCondition] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('EN');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'Damaged'];
  const LANGUAGES = ['EN', 'JP', 'DE', 'FR', 'ES'];

  async function submit() {
    setSubmitting(true);
    try {
      const entry = await apiPost<UserCard>('/binder', {
        card_id: card.id, status, quantity,
        condition: status === 'have' ? (condition ?? 'NM') : undefined,
        language,
      });
      onDone(entry);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSubmitting(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
          <ScrollView>
            {/* Card header */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              {card.image_url && <Image source={{ uri: card.image_url }} style={{ width: 56, height: 80, borderRadius: 8 }} />}
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{card.name}</Text>
                <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{card.set_name} · {card.external_id}</Text>
                {card.market_price_eur != null && (
                  <Text style={{ color: '#6366f1', fontSize: 13, marginTop: 4 }}>
                    €{(card.market_price_eur / 100).toFixed(2)}
                  </Text>
                )}
              </View>
            </View>

            {/* Status */}
            <Text style={styles.label}>Add to</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {(['want', 'have'] as const).map(s => (
                <TouchableOpacity
                  key={s} onPress={() => setStatus(s)}
                  style={[styles.chip, status === s && styles.chipActive]}
                >
                  <Text style={[styles.chipText, status === s && styles.chipTextActive]}>
                    {s === 'want' ? '🎯 Want' : '💎 Have'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Quantity */}
            <Text style={styles.label}>Quantity</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                <Text style={{ color: '#fff', fontSize: 20 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', width: 30, textAlign: 'center' }}>{quantity}</Text>
              <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity(Math.min(10, quantity + 1))}>
                <Text style={{ color: '#fff', fontSize: 20 }}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Condition */}
            {status === 'have' && (
              <>
                <Text style={styles.label}>Condition</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {CONDITIONS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setCondition(c)} style={[styles.chip, condition === c && styles.chipActive]}>
                      <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Language */}
            <Text style={styles.label}>Language</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {LANGUAGES.map(l => (
                <TouchableOpacity key={l} onPress={() => setLanguage(l)} style={[styles.chip, language === l && styles.chipActive]}>
                  <Text style={[styles.chipText, language === l && styles.chipTextActive]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.btn} onPress={submit} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Add to Binder</Text>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 16, borderWidth: 1, borderColor: '#374151', marginBottom: 8 },
  searchInput: { flex: 1, color: '#fff', paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  dropdown: { position: 'absolute', top: 100, left: 16, right: 16, backgroundColor: '#1f2937', borderRadius: 16, borderWidth: 1, borderColor: '#374151', zIndex: 100, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 10 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#374151', gap: 10 },
  dropdownImg: { width: 32, height: 44, borderRadius: 4 },
  dropdownName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dropdownSub: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  tabs: { flexDirection: 'row', backgroundColor: '#1f2937', borderRadius: 12, padding: 4, gap: 4, marginTop: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  card: { flexDirection: 'row', backgroundColor: '#1f2937', borderRadius: 14, padding: 12, gap: 12, alignItems: 'center' },
  cardImg: { width: 40, height: 56, borderRadius: 6 },
  cardName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cardSub: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  badge: { fontSize: 11, fontWeight: '600' },
  price: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 240 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  label: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#374151' },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  qtyBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  btn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
