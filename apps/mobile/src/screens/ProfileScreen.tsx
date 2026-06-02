import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/auth';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  function confirmLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Profile</Text>

        {/* Avatar + name */}
        <View style={s.hero}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <Text style={s.username}>{user?.username}</Text>
          <Text style={s.email}>{user?.email}</Text>
          {user?.is_pro && (
            <View style={s.proBadge}>
              <Text style={s.proTxt}>◆ Binder Pro</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{user?.trade_count ?? 0}</Text>
            <Text style={s.statLbl}>Trades</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>
              {user?.reputation_score != null ? user.reputation_score.toFixed(1) : '—'}
            </Text>
            <Text style={s.statLbl}>Rating ⭐</Text>
          </View>
        </View>

        {/* Info rows */}
        {user?.location_label && (
          <View style={s.infoRow}>
            <Text style={s.infoLbl}>📍 Location</Text>
            <Text style={s.infoVal}>{user.location_label}</Text>
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
          <Text style={s.logoutTxt}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#fff' },
  hero: { backgroundColor: '#111827', borderRadius: 20, padding: 24, alignItems: 'center', gap: 6 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarTxt: { color: '#fff', fontSize: 28, fontWeight: '800' },
  username: { color: '#fff', fontSize: 22, fontWeight: '800' },
  email: { color: '#9ca3af', fontSize: 14 },
  proBadge: { backgroundColor: '#fbbf24', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 5, marginTop: 4 },
  proTxt: { color: '#000', fontSize: 13, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, backgroundColor: '#111827', borderRadius: 16, padding: 18, alignItems: 'center', gap: 4 },
  statNum: { color: '#fff', fontSize: 30, fontWeight: '800' },
  statLbl: { color: '#9ca3af', fontSize: 13 },
  infoRow: { backgroundColor: '#111827', borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLbl: { color: '#9ca3af', fontSize: 14 },
  infoVal: { color: '#fff', fontSize: 14, fontWeight: '600' },
  logoutBtn: { backgroundColor: '#1c0606', borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutTxt: { color: '#fca5a5', fontSize: 16, fontWeight: '700' },
});
