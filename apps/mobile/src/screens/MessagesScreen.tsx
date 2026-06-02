import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiFetch, apiPost } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useNavigation, useRoute } from '@react-navigation/native';

interface Conversation {
  id: string; status: string; trade_match_id?: string;
  other_participant?: { id: string; username: string };
  last_message?: { body: string; created_at: string };
  unread_count: number;
}

interface Message {
  id: string; sender_id: string; body: string; type: string; created_at: string;
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function MessagesListScreen() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<any>();

  useEffect(() => {
    apiFetch<Conversation[]>('/conversations')
      .then(setConvs)
      .finally(() => setLoading(false));
  }, []);

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
                  <Text style={s.convName}>{item.other_participant?.username ?? 'Unknown'}</Text>
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

export function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { id } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({ title: route.params?.title ?? 'Chat' });
    apiFetch<Message[]>(`/conversations/${id}/messages`)
      .then(msgs => { setMessages(msgs); setLoading(false); })
      .catch(() => setLoading(false));
    apiPost(`/conversations/${id}/read`, {}).catch(() => {});
  }, [id]);

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

  const myId = user?.id;

  return (
    <KeyboardAvoidingView
      style={cs.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading
        ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
        : <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 16, gap: 6 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => {
              const mine = item.sender_id === myId;
              if (item.type === 'system') {
                return (
                  <View style={{ alignItems: 'center', marginVertical: 4 }}>
                    <Text style={cs.sys}>{item.body}</Text>
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
            }}
          />
      }
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
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  list: { padding: 16, gap: 8 },
  convRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 16, padding: 14, gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 18 },
  convName: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  bar: { flexDirection: 'row', padding: 12, paddingBottom: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#111827' },
  input: { flex: 1, backgroundColor: '#111827', borderRadius: 26, paddingHorizontal: 18, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#1f2937' },
  sendBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
});
