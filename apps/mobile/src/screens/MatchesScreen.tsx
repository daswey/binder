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
  name: string; image_url?: string; market_price_eur?: number;
  quantity: number; condition?: string; language?: string;
}

interface TradeMatch {
  id: string; match_type: 'perfect' | 'partial' | 'value_gap';
  user_a_id: string; user_b_id: string;
  user_a_gets: MatchedCard[]; user_b_gets: MatchedCard[];
  distance_km: number; value_gap_eur: number;
  other_user: { id: string; username: string; is_pro: boolean; reputation_score?: number; trade_count?: number };
}

const MATCH_COLOR = { perfect: '#4ade80', partial: '#a78bfa', value_gap: '#fbbf24' };
const MATCH_LABEL = { perfect: 'Perfect ✓', partial: 'Partial', value_gap: 'Value Gap' };
const RADII = [5, 10, 25, 50];

export default function MatchesScreen() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(25);
  const [detail, setDetail] = useState<TradeMatch | null>(null);

  const load = useCallback(async (r: number) => {
    setLoading(true);
    try { setMatches(await apiFetch<TradeMatch[]>(`/matches?radius_km=${r}`)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(radius); }, [radius]);

  async function openChat(match: TradeMatch) {
    try {
      const conv = await apiPost<{ id: string }>('/conversations', { trade_match_id: match.id });
      setDetail(null);
      navigation.navigate('Chat', { id: conv.id, title: match.other_user.username });
    } catch (err: any) {
      if (err.status === 409) {
        const convs = await apiFetch<any[]>('/conversations');
        const ex = convs.find((c: any) => c.trade_match_id === match.id);
        if (ex) {
          setDetail(null);
          navigation.navigate('Chat', { id: ex.id, title: match.other_user.username });
        }
      }
    }
  }

  const myId = user?.id;

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Matches</Text>
        <Text style={s.sub}>{matches.length} matches within {radius} km</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
            {RADII.map(r => (
              <TouchableOpacity key={r} style={[s.pill, radius === r && s.pillOn]} onPress={() => setRadius(r)}>
                <Text style={[s.pillTxt, radius === r && s.pillTxtOn]}>{r} km</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading
        ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
        : <FlatList
            data={matches}
            keyExtractor={m => m.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => {
              const isA = item.user_a_id === myId;
              const myCards = isA ? item.user_a_gets : item.user_b_gets;
              const theirCards = isA ? item.user_b_gets : item.user_a_gets;
              const col = MATCH_COLOR[item.match_type];
              return (
                <TouchableOpacity style={s.card} onPress={() => setDetail(item)} activeOpacity={0.85}>
                  <View style={s.cardTop}>
                    <View style={s.avatar}>
                      <Text style={s.avatarTxt}>{item.other_user.username[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.username}>{item.other_user.username}</Text>
                      <Text style={s.dist}>{item.distance_km.toFixed(1)} km away</Text>
                    </View>
                    <View style={[s.badge, { backgroundColor: col + '20', borderColor: col + '60' }]}>
                      <Text style={[s.badgeTxt, { color: col }]}>{MATCH_LABEL[item.match_type]}</Text>
                    </View>
                  </View>
                  {myCards.length > 0 && (
                    <Text style={s.cardLine} numberOfLines={1}>
                      You get: {myCards.map(c => c.name).join(', ')}
                    </Text>
                  )}
                  {theirCards.length > 0 && (
                    <Text style={s.cardLine} numberOfLines={1}>
                      They get: {theirCards.map(c => c.name).join(', ')}
                    </Text>
                  )}
                  <TouchableOpacity style={s.msgBtn} onPress={() => openChat(item)}>
                    <Text style={s.msgBtnTxt}>💬 Message {item.other_user.username}</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ fontSize: 44 }}>🔍</Text>
                <Text style={s.emptyTxt}>No matches yet. Add more cards or expand your radius.</Text>
              </View>
            }
          />
      }

      {detail && (
        <Modal visible animationType="slide" transparent onRequestClose={() => setDetail(null)}>
          <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={() => setDetail(null)}>
            <TouchableOpacity activeOpacity={1} style={ms.sheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={ms.topRow}>
                  <View>
                    <Text style={ms.name}>{detail.other_user.username}</Text>
                    <Text style={ms.dist}>{detail.distance_km.toFixed(1)} km away</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: MATCH_COLOR[detail.match_type] + '20', borderColor: MATCH_COLOR[detail.match_type] + '60' }]}>
                    <Text style={[s.badgeTxt, { color: MATCH_COLOR[detail.match_type] }]}>{MATCH_LABEL[detail.match_type]}</Text>
                  </View>
                </View>

                {(() => {
                  const isA = detail.user_a_id === myId;
                  const myCards = isA ? detail.user_a_gets : detail.user_b_gets;
                  const theirCards = isA ? detail.user_b_gets : detail.user_a_gets;
                  return (
                    <>
                      {myCards.length > 0 && (
                        <>
                          <Text style={ms.sectionLabel}>You get</Text>
                          {myCards.map((c, i) => <CardRow key={i} card={c} />)}
                        </>
                      )}
                      {theirCards.length > 0 && (
                        <>
                          <Text style={ms.sectionLabel}>They get</Text>
                          {theirCards.map((c, i) => <CardRow key={i} card={c} />)}
                        </>
                      )}
                    </>
                  );
                })()}

                {detail.match_type === 'value_gap' && (
                  <View style={ms.gapBox}>
                    <Text style={ms.gapTxt}>
                      Value gap: €{Math.abs(detail.value_gap_eur / 100).toFixed(2)}
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={ms.btn} onPress={() => openChat(detail)}>
                  <Text style={ms.btnTxt}>Message {detail.other_user.username}</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function CardRow({ card }: { card: MatchedCard }) {
  return (
    <View style={ms.cardRow}>
      {card.image_url
        ? <Image source={{ uri: card.image_url }} style={ms.img} />
        : <View style={[ms.img, { backgroundColor: '#1f2937' }]} />
      }
      <View style={{ flex: 1 }}>
        <Text style={ms.cardName} numberOfLines={1}>{card.name}</Text>
        {(card.condition || card.language) && (
          <Text style={ms.cardAttr}>{[card.condition, card.language].filter(Boolean).join(' · ')}</Text>
        )}
      </View>
      {card.market_price_eur != null && (
        <Text style={ms.cardPrice}>€{(card.market_price_eur / 100).toFixed(2)}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  sub: { color: '#6b7280', fontSize: 13, marginTop: 2 },
  pill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 24, borderWidth: 1, borderColor: '#1f2937' },
  pillOn: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  pillTxt: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  pillTxtOn: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#111827', borderRadius: 18, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  username: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dist: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  cardLine: { color: '#9ca3af', fontSize: 12 },
  msgBtn: { backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 4 },
  msgBtnTxt: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTxt: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '90%' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  name: { color: '#fff', fontSize: 20, fontWeight: '800' },
  dist: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  sectionLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 12, padding: 10, gap: 10, marginBottom: 6 },
  img: { width: 34, height: 47, borderRadius: 5 },
  cardName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cardAttr: { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  cardPrice: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  gapBox: { backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 12, padding: 12, marginTop: 12 },
  gapTxt: { color: '#fbbf24', fontSize: 13, fontWeight: '600' },
  btn: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
