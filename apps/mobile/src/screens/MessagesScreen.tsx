import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  Alert, Modal, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiPost, apiPatch } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useNavigation, useRoute } from '@react-navigation/native';

// ── Types ─────────────────────────────────────────────────────────────────────

type ConvStatus = 'active' | 'proposal_sent' | 'proposal_accepted' | 'meetup_set' | 'completed';

interface Conversation {
  id: string; status: ConvStatus; trade_match_id?: string;
  other_participant?: { id: string; username: string };
  last_message?: { body: string; created_at: string };
  unread_count: number;
  trade_proposal?: TradeProposal;
  completed_by_a?: boolean; completed_by_b?: boolean;
  participant_ids?: string[];
}

interface Message {
  id: string; sender_id: string; body: string;
  type: 'text' | 'system' | 'trade_proposal' | 'meetup_proposal';
  payload?: any; created_at: string;
}

interface ProposalItem {
  card_id: string; name: string; quantity: number; finish?: string;
}

interface TradeProposal {
  status: 'pending' | 'accepted' | 'rejected';
  items_i_give: ProposalItem[];
  items_you_give: ProposalItem[];
}

interface SearchCard { id: string; name: string; external_id: string; image_url?: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const STATUS_STEPS: ConvStatus[] = ['active', 'proposal_sent', 'proposal_accepted', 'meetup_set', 'completed'];
const STATUS_LABELS: Record<ConvStatus, string> = {
  active: 'Chatting', proposal_sent: 'Proposal sent',
  proposal_accepted: 'Terms agreed', meetup_set: 'Meetup set', completed: 'Completed ✓',
};

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar({ status }: { status: ConvStatus }) {
  const idx = STATUS_STEPS.indexOf(status);
  return (
    <View style={sb.container}>
      <View style={sb.track}>
        {STATUS_STEPS.map((_, i) => (
          <View
            key={i}
            style={[sb.segment, i <= idx ? (status === 'completed' ? sb.segDone : sb.segActive) : sb.segInactive]}
          />
        ))}
      </View>
      <Text style={sb.label}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(15,23,42,0.95)', borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  track: { flexDirection: 'row', gap: 3, marginBottom: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  segActive: { backgroundColor: '#6366f1' },
  segDone: { backgroundColor: '#4ade80' },
  segInactive: { backgroundColor: '#1f2937' },
  label: { color: '#9ca3af', fontSize: 11, textAlign: 'center' },
});

// ── Trade proposal card ───────────────────────────────────────────────────────

function ProposalCard({ payload, mine, convId, convStatus, onUpdate }: {
  payload: TradeProposal; mine: boolean; convId: string;
  convStatus: ConvStatus; onUpdate: () => void;
}) {
  const [acting, setActing] = useState(false);
  const isPending = payload.status === 'pending' && convStatus === 'proposal_sent';
  const statusColors: Record<string, string> = {
    pending: '#fbbf24', accepted: '#4ade80', rejected: '#ef4444',
  };

  async function act(action: 'accept' | 'reject') {
    setActing(true);
    try { await apiPatch(`/conversations/${convId}/proposal`, { action }); onUpdate(); }
    finally { setActing(false); }
  }

  return (
    <View style={pc.card}>
      <View style={pc.header}>
        <Text style={pc.headerTxt}>Trade Proposal</Text>
        <View style={[pc.badge, { backgroundColor: (statusColors[payload.status] ?? '#9ca3af') + '20' }]}>
          <Text style={[pc.badgeTxt, { color: statusColors[payload.status] ?? '#9ca3af' }]}>
            {payload.status.charAt(0).toUpperCase() + payload.status.slice(1)}
          </Text>
        </View>
      </View>
      <View style={pc.body}>
        <ProposalSide label={mine ? 'You give' : 'They offer'} items={mine ? payload.items_i_give : payload.items_you_give} />
        <View style={pc.divider} />
        <ProposalSide label={mine ? 'They give' : 'You give'} items={mine ? payload.items_you_give : payload.items_i_give} />
      </View>
      {!mine && isPending && (
        <View style={pc.actions}>
          <TouchableOpacity style={pc.rejectBtn} onPress={() => act('reject')} disabled={acting}>
            <Text style={pc.rejectTxt}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={pc.acceptBtn} onPress={() => act('accept')} disabled={acting}>
            {acting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={pc.acceptTxt}>Accept</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function ProposalSide({ label, items }: { label: string; items: ProposalItem[] }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={pc.sideLabel}>{label}</Text>
      {items.length === 0
        ? <Text style={pc.nothing}>Nothing</Text>
        : items.map((item, i) => (
            <View key={i} style={pc.itemRow}>
              <View style={pc.qty}><Text style={pc.qtyTxt}>{item.quantity}</Text></View>
              <Text style={pc.itemName} numberOfLines={1}>{item.name}</Text>
            </View>
          ))
      }
    </View>
  );
}

const pc = StyleSheet.create({
  card: { backgroundColor: '#1f2937', borderRadius: 16, borderWidth: 1, borderColor: '#374151', maxWidth: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#374151' },
  headerTxt: { color: '#d1d5db', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  body: { padding: 12, gap: 10 },
  divider: { height: 1, backgroundColor: '#374151' },
  sideLabel: { color: '#6b7280', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  nothing: { color: '#6b7280', fontSize: 12, fontStyle: 'italic' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qty: { width: 20, height: 20, borderRadius: 4, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  qtyTxt: { color: '#9ca3af', fontSize: 10, fontWeight: '700' },
  itemName: { color: '#e5e7eb', fontSize: 12, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 0 },
  rejectBtn: { flex: 1, backgroundColor: '#374151', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectTxt: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  acceptBtn: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  acceptTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ── Meetup card ───────────────────────────────────────────────────────────────

function MeetupCard({ payload }: { payload: { location: string; time: string } }) {
  const date = new Date(payload.time).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <View style={mc.card}>
      <Text style={mc.label}>Meetup Proposal</Text>
      <Text style={mc.loc}>📍 {payload.location}</Text>
      <Text style={mc.time}>🕐 {date}</Text>
    </View>
  );
}

const mc = StyleSheet.create({
  card: { backgroundColor: '#1f2937', borderRadius: 16, borderWidth: 1, borderColor: '#374151', padding: 14, maxWidth: '85%', gap: 6 },
  label: { color: '#6b7280', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  loc: { color: '#e5e7eb', fontSize: 13 },
  time: { color: '#9ca3af', fontSize: 12 },
});

// ── Propose Trade Modal ───────────────────────────────────────────────────────

function ProposeTradeModal({ convId, onDone, onClose }: {
  convId: string; onDone: () => void; onClose: () => void;
}) {
  const [iGive, setIGive] = useState<ProposalItem[]>([]);
  const [youGive, setYouGive] = useState<ProposalItem[]>([]);
  const [activeList, setActiveList] = useState<'i' | 'you'>('i');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchCard[]>([]);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function onSearch(v: string) {
    setSearch(v);
    clearTimeout(timer.current);
    if (v.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await apiFetch<{ data: SearchCard[] }>(`/cards/search?q=${encodeURIComponent(v)}&limit=6`);
        setResults(d.data ?? []);
      } catch {}
    }, 300);
  }

  function addCard(card: SearchCard, to: 'i' | 'you') {
    const item: ProposalItem = { card_id: card.id, name: card.name, quantity: 1 };
    if (to === 'i') setIGive(p => [...p.filter(x => x.card_id !== card.id), item]);
    else setYouGive(p => [...p.filter(x => x.card_id !== card.id), item]);
    setSearch(''); setResults([]);
  }

  async function send() {
    setSending(true);
    try {
      await apiPost(`/conversations/${convId}/proposal`, { items_i_give: iGive, items_you_give: youGive });
      onDone();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSending(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={pm.sheet}>
          <View style={pm.topRow}>
            <Text style={pm.title}>Propose Trade</Text>
            <TouchableOpacity onPress={onClose}><Text style={pm.close}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* List selector */}
            <View style={pm.tabs}>
              {(['i', 'you'] as const).map(t => (
                <TouchableOpacity key={t} style={[pm.tab, activeList === t && pm.tabOn]} onPress={() => setActiveList(t)}>
                  <Text style={[pm.tabTxt, activeList === t && pm.tabTxtOn]}>
                    {t === 'i' ? `I give (${iGive.length})` : `They give (${youGive.length})`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Search */}
            <TextInput
              style={pm.input}
              placeholder={`Search card to add to "${activeList === 'i' ? 'I give' : 'They give'}"…`}
              placeholderTextColor="#6b7280"
              value={search}
              onChangeText={onSearch}
            />

            {results.length > 0 && (
              <View style={pm.dropdown}>
                {results.map(card => (
                  <TouchableOpacity key={card.id} style={pm.dropItem} onPress={() => addCard(card, activeList)}>
                    <Text style={pm.dropName} numberOfLines={1}>{card.name}</Text>
                    <Text style={pm.dropSub}>{card.external_id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* I give list */}
            {iGive.length > 0 && (
              <View style={pm.section}>
                <Text style={pm.sectionLabel}>I give</Text>
                {iGive.map(item => (
                  <View key={item.card_id} style={pm.itemRow}>
                    <Text style={pm.itemName} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity onPress={() => setIGive(p => p.filter(x => x.card_id !== item.card_id))}>
                      <Text style={{ color: '#ef4444' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* They give list */}
            {youGive.length > 0 && (
              <View style={pm.section}>
                <Text style={pm.sectionLabel}>They give</Text>
                {youGive.map(item => (
                  <View key={item.card_id} style={pm.itemRow}>
                    <Text style={pm.itemName} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity onPress={() => setYouGive(p => p.filter(x => x.card_id !== item.card_id))}>
                      <Text style={{ color: '#ef4444' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[pm.btn, (iGive.length === 0 && youGive.length === 0) && { opacity: 0.4 }]}
              onPress={send}
              disabled={sending || (iGive.length === 0 && youGive.length === 0)}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={pm.btnTxt}>Send Proposal</Text>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, maxHeight: '90%' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  close: { color: '#6b7280', fontSize: 20 },
  tabs: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 4, gap: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabOn: { backgroundColor: '#6366f1' },
  tabTxt: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  tabTxtOn: { color: '#fff' },
  input: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937', paddingHorizontal: 14, paddingVertical: 11, color: '#fff', fontSize: 14, marginBottom: 8 },
  dropdown: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937', marginBottom: 8, overflow: 'hidden' },
  dropItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1f2937' },
  dropName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dropSub: { color: '#9ca3af', fontSize: 11 },
  section: { marginBottom: 12 },
  sectionLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, padding: 10, marginBottom: 4 },
  itemName: { flex: 1, color: '#e5e7eb', fontSize: 13 },
  btn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ── Meetup Modal ──────────────────────────────────────────────────────────────

function MeetupModal({ convId, onDone, onClose }: {
  convId: string; onDone: () => void; onClose: () => void;
}) {
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!location.trim() || !date || !time) return Alert.alert('Error', 'Fill in all fields');
    setSending(true);
    try {
      await apiPost(`/conversations/${convId}/meetup`, {
        location: location.trim(),
        time: new Date(`${date}T${time}`).toISOString(),
      });
      onDone();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally { setSending(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={pm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={pm.sheet}>
          <View style={pm.topRow}>
            <Text style={pm.title}>Propose Meetup</Text>
            <TouchableOpacity onPress={onClose}><Text style={pm.close}>✕</Text></TouchableOpacity>
          </View>
          <Text style={mm.label}>Location</Text>
          <TextInput
            style={pm.input}
            placeholder="e.g. Coffee shop on Main Street…"
            placeholderTextColor="#6b7280"
            value={location}
            onChangeText={setLocation}
          />
          <Text style={mm.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            style={pm.input}
            placeholder="2025-12-31"
            placeholderTextColor="#6b7280"
            value={date}
            onChangeText={setDate}
          />
          <Text style={mm.label}>Time (HH:MM)</Text>
          <TextInput
            style={pm.input}
            placeholder="15:00"
            placeholderTextColor="#6b7280"
            value={time}
            onChangeText={setTime}
          />
          <TouchableOpacity style={pm.btn} onPress={send} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={pm.btnTxt}>Propose Meetup</Text>}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const mm = StyleSheet.create({
  label: { color: '#6b7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
});

// ── Rating Modal ──────────────────────────────────────────────────────────────

function RatingModal({ convId, tradeMatchId, otherUsername, onClose }: {
  convId: string; tradeMatchId?: string; otherUsername: string; onClose: () => void;
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!tradeMatchId) { onClose(); return; }
    setSending(true);
    try {
      await apiPost('/ratings', { trade_match_id: tradeMatchId, score, comment: comment.trim() || null });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally { setSending(false); }
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={rm.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={rm.sheet}>
          {done ? (
            <View style={{ alignItems: 'center', padding: 24 }}>
              <Text style={{ fontSize: 48 }}>⭐</Text>
              <Text style={rm.title}>Thanks for the rating!</Text>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 48, textAlign: 'center' }}>🎉</Text>
              <Text style={rm.title}>Trade Complete!</Text>
              <Text style={rm.sub}>How was your trade with {otherUsername}?</Text>
              <View style={rm.stars}>
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity key={n} onPress={() => setScore(n)}>
                    <Text style={[rm.star, n > score && rm.starInactive]}>⭐</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={rm.input}
                placeholder="Leave a comment (optional)…"
                placeholderTextColor="#6b7280"
                value={comment}
                onChangeText={setComment}
                multiline
                numberOfLines={2}
              />
              <View style={rm.actions}>
                <TouchableOpacity style={rm.skipBtn} onPress={onClose}>
                  <Text style={rm.skipTxt}>Later</Text>
                </TouchableOpacity>
                <TouchableOpacity style={rm.submitBtn} onPress={submit} disabled={sending}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={rm.submitTxt}>Submit</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0f172a', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  star: { fontSize: 36 },
  starInactive: { opacity: 0.3 },
  input: { backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#1f2937', padding: 12, color: '#fff', fontSize: 14, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  skipBtn: { backgroundColor: '#111827', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  skipTxt: { color: '#9ca3af', fontSize: 14, fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

// ── Conversations List ────────────────────────────────────────────────────────

export function MessagesListScreen() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<any>();

  useEffect(() => {
    apiFetch<Conversation[]>('/conversations')
      .then(setConvs)
      .finally(() => setLoading(false));
  }, []);

  const STATUS_COLOR: Record<ConvStatus, string> = {
    active: 'transparent', proposal_sent: '#6366f1',
    proposal_accepted: '#4ade80', meetup_set: '#fbbf24', completed: '#4ade80',
  };

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.title}>Messages</Text>
      {loading
        ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
        : <FlatList
            data={convs}
            keyExtractor={c => c.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.convRow}
                onPress={() => navigation.navigate('Chat', {
                  id: item.id,
                  title: item.other_participant?.username ?? 'Chat',
                })}
              >
                <View style={s.avatar}>
                  <Text style={s.avatarTxt}>{item.other_participant?.username?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.convName}>{item.other_participant?.username ?? 'Unknown'}</Text>
                    {item.status !== 'active' && (
                      <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[item.status] }]} />
                    )}
                  </View>
                  {item.last_message && (
                    <Text style={s.lastMsg} numberOfLines={1}>{item.last_message.body}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {item.last_message && (
                    <Text style={s.time}>{timeAgo(item.last_message.created_at)}</Text>
                  )}
                  {item.unread_count > 0 && (
                    <View style={s.unread}>
                      <Text style={s.unreadTxt}>{item.unread_count}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ fontSize: 44 }}>💬</Text>
                <Text style={s.emptyTxt}>No conversations yet. Find a match and start trading!</Text>
              </View>
            }
          />
      }
    </SafeAreaView>
  );
}

// ── Chat Screen ───────────────────────────────────────────────────────────────

export function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { id } = route.params;

  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<'trade' | 'meetup' | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const listRef = useRef<FlatList>(null);
  const myId = user?.id;

  const loadData = useCallback(async () => {
    try {
      const [convData, msgData] = await Promise.all([
        apiFetch<Conversation>(`/conversations/${id}`),
        apiFetch<Message[]>(`/conversations/${id}/messages`),
      ]);
      setConv(convData);
      setMessages(msgData);
      apiPost(`/conversations/${id}/read`, {}).catch(() => {});
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    navigation.setOptions({ title: route.params?.title ?? 'Chat' });
  }, []);

  async function send() {
    const body = input.trim();
    if (!body) return;
    setInput('');
    try {
      const msg = await apiPost<Message>(`/conversations/${id}/messages`, { body });
      setMessages(p => p.some(m => m.id === msg.id) ? p : [...p, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  async function markComplete() {
    setCompleting(true);
    try {
      const result = await apiPost<{ status: string }>(`/conversations/${id}/complete`, {});
      await loadData();
      if (result.status === 'completed') setShowRating(true);
    } finally { setCompleting(false); }
  }

  const status: ConvStatus = conv?.status ?? 'active';
  const participants = conv?.participant_ids ?? [];
  const isParticipantA = participants.sort()[0] === myId;
  const iHaveCompleted = isParticipantA ? conv?.completed_by_a : conv?.completed_by_b;

  function renderMessage({ item }: { item: Message }) {
    const mine = item.sender_id === myId;

    if (item.type === 'system') {
      return (
        <View style={{ alignItems: 'center', marginVertical: 6 }}>
          <Text style={cs.sys}>{item.body}</Text>
        </View>
      );
    }

    if (item.type === 'trade_proposal' && item.payload) {
      return (
        <View style={[cs.row, mine ? cs.rowMine : cs.rowThem]}>
          <ProposalCard
            payload={item.payload}
            mine={mine}
            convId={id}
            convStatus={status}
            onUpdate={loadData}
          />
        </View>
      );
    }

    if (item.type === 'meetup_proposal' && item.payload) {
      return (
        <View style={[cs.row, mine ? cs.rowMine : cs.rowThem]}>
          <MeetupCard payload={item.payload} />
        </View>
      );
    }

    return (
      <View style={[cs.row, mine ? cs.rowMine : cs.rowThem]}>
        <View style={[cs.bubble, mine ? cs.bubbleMine : cs.bubbleThem]}>
          <Text style={cs.bubbleTxt}>{item.body}</Text>
          <Text style={cs.bubbleTime}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={cs.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Status bar */}
      <StatusBar status={status} />

      {/* Messages */}
      {loading
        ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
        : <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={renderMessage}
          />
      }

      {/* Action buttons */}
      {status !== 'completed' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={cs.actions}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <TouchableOpacity style={cs.actionBtn} onPress={() => setSheet('trade')}>
            <Text style={cs.actionTxt}>🔄 Propose Trade</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.actionBtn} onPress={() => setSheet('meetup')}>
            <Text style={cs.actionTxt}>📍 Meetup</Text>
          </TouchableOpacity>
          {(status === 'proposal_accepted' || status === 'meetup_set') && !iHaveCompleted && (
            <TouchableOpacity
              style={[cs.actionBtn, { backgroundColor: 'rgba(74,222,128,0.15)', borderColor: 'rgba(74,222,128,0.4)' }]}
              onPress={markComplete}
              disabled={completing}
            >
              <Text style={[cs.actionTxt, { color: '#4ade80' }]}>
                {completing ? '…' : '✓ Mark Complete'}
              </Text>
            </TouchableOpacity>
          )}
          {iHaveCompleted && (
            <Text style={cs.waitTxt}>Waiting for other side…</Text>
          )}
        </ScrollView>
      )}

      {/* Input */}
      <View style={cs.bar}>
        <TextInput
          style={cs.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          placeholderTextColor="#6b7280"
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[cs.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={send}
          disabled={!input.trim()}
        >
          <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      {sheet === 'trade' && (
        <ProposeTradeModal
          convId={id}
          onDone={() => { setSheet(null); loadData(); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'meetup' && (
        <MeetupModal
          convId={id}
          onDone={() => { setSheet(null); loadData(); }}
          onClose={() => setSheet(null)}
        />
      )}
      {showRating && (
        <RatingModal
          convId={id}
          tradeMatchId={conv?.trade_match_id}
          otherUsername={conv?.other_participant?.username ?? 'trader'}
          onClose={() => setShowRating(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  list: { padding: 16, gap: 8 },
  convRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, padding: 14, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  convName: { color: '#fff', fontWeight: '700', fontSize: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  lastMsg: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  time: { color: '#6b7280', fontSize: 11 },
  unread: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  unreadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 64, gap: 12 },
  emptyTxt: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
});

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowThem: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '76%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMine: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#111827', borderBottomLeftRadius: 4 },
  bubbleTxt: { color: '#fff', fontSize: 15, lineHeight: 21 },
  bubbleTime: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 3 },
  sys: { backgroundColor: '#111827', color: '#9ca3af', fontSize: 12, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  actions: { borderTopWidth: 1, borderTopColor: '#111827', maxHeight: 56 },
  actionBtn: { backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  actionTxt: { color: '#818cf8', fontSize: 13, fontWeight: '600' },
  waitTxt: { color: '#6b7280', fontSize: 12, alignSelf: 'center' },
  bar: { flexDirection: 'row', padding: 12, paddingBottom: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#111827' },
  input: { flex: 1, backgroundColor: '#111827', borderRadius: 26, paddingHorizontal: 18, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
});
