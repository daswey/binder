import React, { useEffect } from 'react';
import { ActivityIndicator, View, StatusBar, Text } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAuthStore } from './src/store/auth';
import { AuthScreen } from './src/screens/AuthScreen';
import { BinderScreen } from './src/screens/BinderScreen';
import { MatchesScreen } from './src/screens/MatchesScreen';
import { ConversationsScreen, ChatScreen } from './src/screens/MessagesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const DARK_THEME = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#030712',
    card: '#111827',
    text: '#ffffff',
    border: '#1f2937',
    primary: '#6366f1',
  },
};

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === '#6366f1' ? 1 : 0.5 }}>{emoji}</Text>;
}

function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#111827' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: '' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#111827', borderTopColor: '#1f2937', paddingBottom: 4 },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Binder" component={BinderScreen} options={{ tabBarIcon: ({ color }) => <TabIcon emoji="📦" color={color} /> }} />
      <Tab.Screen name="Matches" component={MatchesScreen} options={{ tabBarIcon: ({ color }) => <TabIcon emoji="🔄" color={color} /> }} />
      <Tab.Screen name="Messages" component={MessagesStack} options={{ tabBarIcon: ({ color }) => <TabIcon emoji="💬" color={color} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth" component={AuthScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { user, loading, fetchMe } = useAuthStore();

  useEffect(() => { fetchMe(); }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#030712', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#030712" />
        <NavigationContainer theme={DARK_THEME}>
          {user ? <MainTabs /> : <AuthStack />}
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
