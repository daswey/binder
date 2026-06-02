import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiPost } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useNavigation } from '@react-navigation/native';

interface MatchedCard {
  card_id: string; name: string; image_url?: string;
  market_price_eur?: number; quantity: number;
  condition?: string; language?: string; finish?: string;
}

interface TradeMatch {
  id: string; match_type: 'perfect' | 'partial' | 'value_gap';
  user_a_id: string; user_b_id: string;
  user_a_gets: MatchedCard[]; user_b_gets: MatchedCard[];
  distance_km: number; value_gap_eur: number;
  other_user: { id: string; username: string; is_pro: boolean; reputation_score?: number; trade_count?: number };
}

const MATCH_COLORS = {
  perfect: '#4ade80', partial: '#a78bfa', value_gap: '#fbbf24',
};
const MATCH_LABELS = { perfect: 'Perfect ✓', partial: 'Partial', value_gap: 'Value Gap' };
const RADIUS_OPTIONS = [5, 10, 25, 50];

export function MatchesScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [radiusKm, setRadiusKm] = useState(25);
  const [selected, setSelected] = useState<TradeMatch | null>(null);

  const fetchMatches = useCallback(async (radius = radiusKm) => {
    setLoading(true);
    try {
      const data = await apiFetch<TradeMatch[]>(`/matches?radius_km=${radius}`);
      setMatches(data);
    } finally { setLoading(false); }
  }, [radiusKm]);

  useEffect(() => { fetchMatches(radiusKm); }, [radiusKm]);

  async function openConv(match: TradeMatch) {
    try {
      const conv = await apiPost<{ id: string }>('/conversations', { trade_match_id: match.id });
      navigation.navigate('Messages', { screen: 'Chat', params: { id: conv.id } });
      setSelected(null);
    } catch (err: any) {
      if (err.status === 409) {
        const convs = await apiFetch<any[]>('/conversations');
        const existing = convs.find((c: any) => c.trade_match_id === match.id);
        if (existing) {
          navigation.navigate('Messages', { screen: 'Chat', params: { id: existing.id } });
          setSelected(null);
        }
      }
    }
  }

  const myId = user?.id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Matches</Text>
        <Text style={styles.subtitle}>{matches.length} matches within {radiusKm} km</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
            {RADIUS_OPTIONS.map(r => (
              <TouchableOpacity key={r} onPress={() => setRadiusKm(r)} style={[styles.pill, radiusKm === r && styles.pillActive]}>
                <Text style={[styles.pillText, radiusKm === r && styles.pillTextActive]}>{r} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={matches}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => {
            const isA = item.user_a_id === myId;
            const myCards = isA ? item.user_a_gets : item.user_b_gets;
            const theirCards = isA ? item.user_b_gets : item.user_a_gets;
            return (
              <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.other_user.username[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.username}>{item.other_user.username}</Text>
                    <Text style={styles.distance}>{item.distance_km.toFixed(1)} km away</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: MATCH_COLORS[item.match_type] + '20', borderColor: MATCH_COLORS[item.match_type] + '50' }]}>
                    <Text style={[styles.badgeText, { color: MATCH_COLORS[item.match_type] }]}>{MATCH_LABELS[item.match_type]}</Text>
                  </View>
                </View>
                {myCards.length > 0 && (
                  <Text style={styles.cardLine} numberOfLines={1}>
                    You get: {myCards.map(c => c.name).join(', ')}
                  </Text>
                )}
                {theirCards.length > 0 && (
                  <Text style={styles.cardLine} numberOfLines={1}>
                    They get: {theirCards.map(c => c.name).join(', ')}
                  </Text>
                )}
                <TouchableOpacity style={styles.msgBtn} onPress={() => openConv(item)}>
                  <Text style={styles.msgBtnText}>Message {item.other_user.username}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>🔍</Text>
              <Text style={styles.emptyText}>No matches found. Try expanding your radius or adding more cards.</Text>
            </View>
          }
        />
      )}

      {/* Match Detail Modal */}
      {selected && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setSelected(null)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelected(null)}>
            <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
              <ScrollView>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <View>
                    <Text style={styles.modalTitle}>{selected.other_user.username}</Text>
                    <Text style={{ color: '#9ca3af', fontSize: 12 }}>{selected.distance_km.toFixed(1)} km away</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: MATCH_COLORS[selected.match_type] + '20', borderColor: MATCH_COLORS[selected.match_type] + '50' }]}>
                    <Text style={[styles.badgeText, { color: MATCH_COLORS[selected.match_type] }]}>{MATCH_LABELS[selected.match_type]}</Text>
                  </View>
                </View>

                {(() => {
                  const isA = selected.user_a_id === myId;
                  const myCards = isA ? selected.user_a_gets : selected.user_b_gets;
                  const theirCards = isA ? selected.user_b_gets : selected.user_a_gets;
                  return (
                    <>
                      {myCards.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={styles.sectionLabel}>You get</Text>
                          {myCards.map((c, i) => (
                            <View key={i} style={styles.matchCard}>
                              {c.image_url && <Image source={{ uri: c.image_url }} style={styles.matchImg} />}
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
                                {c.condition && <Text style={{ color: '#9ca3af', fontSize: 11 }}>{c.condition}{c.language ? ` · ${c.language}` : ''}</Text>}
                              </View>
                              {c.market_price_eur != null && (
                                <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>€{(c.market_price_eur / 100).toFixed(2)}</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                      {theirCards.length > 0 && (
                        <View style={{ marginBottom: 16 }}>
                          <Text style={styles.sectionLabel}>They get</Text>
                          {theirCards.map((c, i) => (
                            <View key={i} style={styles.matchCard}>
                              {c.image_url && <Image source={{ uri: c.image_url }} style={styles.matchImg} />}
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
                                {c.condition && <Text style={{ color: '#9ca3af', fontSize: 11 }}>{c.condition}{c.language ? ` · ${c.language}` : ''}</Text>}
                              </View>
                              {c.market_price_eur != null && (
                                <Text style={{ color: '#6366f1', fontSize: 12, fontWeight: '700' }}>€{(c.market_price_eur / 100).toFixed(2)}</Text>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  );
                })()}

                <TouchableOpacity style={styles.btn} onPress={() => openConv(selected)}>
                  <Text style={styles.btnText}>Message {selected.other_user.username}</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#374151' },
  pillActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  pillText: { color: '#9ca3af', fontSize: 12, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  card: { backgroundColor: '#1f2937', borderRadius: 16, padding: 14, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  username: { color: '#fff', fontWeight: '600', fontSize: 14 },
  distance: { color: '#9ca3af', fontSize: 11 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardLine: { color: '#9ca3af', fontSize: 12 },
  msgBtn: { backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 12, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  msgBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 240 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sectionLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  matchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 12, padding: 10, gap: 10, marginBottom: 6 },
  matchImg: { width: 32, height: 44, borderRadius: 4 },
  btn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
