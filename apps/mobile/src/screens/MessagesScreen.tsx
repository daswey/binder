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
  id: string; sender_id: string; body: string; type: string;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function ConversationsScreen() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation<any>();

  useEffect(() => {
    apiFetch<Conversation[]>('/conversations')
      .then(data => setConvs(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Messages</Text>
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={convs}
          keyExtractor={c => c.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.convItem} onPress={() => navigation.navigate('Chat', { id: item.id })}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.other_participant?.username?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.convName}>{item.other_participant?.username ?? 'Unknown'}</Text>
                {item.last_message && (
                  <Text style={styles.lastMsg} numberOfLines={1}>{item.last_message.body}</Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {item.last_message && <Text style={styles.time}>{timeAgo(item.last_message.created_at)}</Text>}
                {item.unread_count > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={styles.emptyText}>No conversations yet. Find a match and start trading!</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

export function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { id } = route.params;
  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  const loadData = useCallback(async () => {
    try {
      const [convData, msgData] = await Promise.all([
        apiFetch<any>(`/conversations/${id}`),
        apiFetch<Message[]>(`/conversations/${id}/messages`),
      ]);
      setConv(convData);
      setMessages(msgData);
      await apiPost(`/conversations/${id}/read`, {});
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => {
    loadData();
    navigation.setOptions({ title: '' });
  }, [loadData]);

  useEffect(() => {
    if (conv?.other_participant?.username) {
      navigation.setOptions({ title: conv.other_participant.username });
    }
  }, [conv]);

  async function send() {
    if (!input.trim()) return;
    const body = input.trim();
    setInput('');
    try {
      const msg = await apiPost<Message>(`/conversations/${id}/messages`, { body });
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }

  const myId = user?.id;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {loading ? <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} /> : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender_id === myId;
            if (item.type === 'system') {
              return (
                <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={styles.systemMsg}>{item.body}</Text>
                </View>
              );
            }
            return (
              <View style={[styles.msgRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleThem]}>
                  <Text style={styles.bubbleText}>{item.body}</Text>
                  <Text style={styles.bubbleTime}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.msgInput}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message…"
          placeholderTextColor="#6b7280"
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={!input.trim()}>
          <Text style={{ color: '#fff', fontSize: 16 }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  convItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 16, padding: 14, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  convName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  lastMsg: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  time: { color: '#6b7280', fontSize: 11 },
  unreadBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#6b7280', fontSize: 13, textAlign: 'center', maxWidth: 240 },
  msgRow: { flexDirection: 'row' },
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: '#6366f1', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#1f2937', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#fff', fontSize: 14 },
  bubbleTime: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 4 },
  systemMsg: { backgroundColor: '#1f2937', color: '#9ca3af', fontSize: 12, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#1f2937', backgroundColor: '#030712' },
  msgInput: { flex: 1, backgroundColor: '#1f2937', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#374151' },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
});
