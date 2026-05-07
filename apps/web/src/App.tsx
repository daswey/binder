import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { BottomNav } from './components/BottomNav';
import { AuthPage } from './pages/Auth';
import { FeedPage } from './pages/Feed';
import { BinderPage } from './pages/Binder';
import { MatchesPage } from './pages/Matches';
import { EventsPage } from './pages/Events';
import { ProfilePage } from './pages/Profile';
import { ConversationsPage, ChatPage } from './pages/Messages';
import { OnboardingPage } from './pages/Onboarding';
import { PrivacyPage } from './pages/Privacy';
import { TermsPage } from './pages/Terms';
import { CookieBanner } from './components/CookieBanner';
import { getSocket } from './hooks/useSocket';

function ProtectedLayout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [feedCount, setFeedCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const refreshUnreadMessages = useCallback(async () => {
    // Computed from conversation list on load
  }, []);

  useEffect(() => {
    if (!user) { navigate('/auth', { replace: true }); return; }
    if (!user.onboarding_completed) { navigate('/onboarding', { replace: true }); return; }

    const token = localStorage.getItem('access_token');
    if (!token) return;
    const socket = getSocket(token);
    socket.on('activity_event', () => setFeedCount(n => n + 1));
    socket.on('message', () => setUnreadMessages(n => n + 1));
    return () => {
      socket.off('activity_event');
      socket.off('message');
    };
  }, [user, navigate, refreshUnreadMessages]);

  if (!user) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/binder" element={<BinderPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/messages" element={<ConversationsPage onRead={() => setUnreadMessages(0)} />} />
          <Route path="/messages/:id" element={<ChatPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </div>
      <BottomNav feedCount={feedCount} unreadMessages={unreadMessages} />
    </div>
  );
}

export default function App() {
  const { fetchMe, loading } = useAuthStore();

  useEffect(() => { fetchMe(); }, [fetchMe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-950">
        <div className="text-center">
          <div className="text-5xl mb-4">📒</div>
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
      <CookieBanner />
    </>
  );
}
