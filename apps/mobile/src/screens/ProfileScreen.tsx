import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/auth';

export function ProfileScreen() {
  const { user, logout } = useAuthStore();

  function confirmLogout() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={styles.title}>Profile</Text>

        {/* User card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.username?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.username}>{user?.username}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
          {user?.is_pro && (
            <View style={styles.proBadge}>
              <Text style={styles.proText}>◆ Pro</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{user?.trade_count ?? 0}</Text>
            <Text style={styles.statLabel}>Trades</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{user?.reputation_score?.toFixed(1) ?? '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>

        {/* Location */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Location</Text>
          <Text style={styles.infoValue}>{user?.location_label ?? 'Not set'}</Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030712' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 4 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f2937', borderRadius: 16, padding: 16, gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 22 },
  username: { color: '#fff', fontSize: 18, fontWeight: '700' },
  email: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  proBadge: { backgroundColor: '#fbbf24', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  proText: { color: '#000', fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, backgroundColor: '#1f2937', borderRadius: 16, padding: 16, alignItems: 'center' },
  statNum: { color: '#fff', fontSize: 28, fontWeight: '700' },
  statLabel: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  infoCard: { backgroundColor: '#1f2937', borderRadius: 16, padding: 16, gap: 4 },
  infoLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { color: '#fff', fontSize: 15 },
  logoutBtn: { backgroundColor: '#7f1d1d', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { color: '#fca5a5', fontSize: 16, fontWeight: '700' },
});
