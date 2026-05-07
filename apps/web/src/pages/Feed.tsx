import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActivityEvent, TradeCompletedPayload, NewMemberPayload, EventCreatedPayload, NewMatchAreaPayload, FINISH_LABELS, CONDITION_LABELS } from '@binder/shared';
import { apiFetch } from '../api/client';
import { useAuthStore } from '../store/auth';
import { GamePill } from '../components/GamePill';
import { getSocket } from '../hooks/useSocket';

export function FeedPage() {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [radiusKm, setRadiusKm] = useState(25);
  const navigate = useNavigate();

  const fetchFeed = useCallback(async (cursor?: string, prepend = false, radius = radiusKm) => {
    const params = new URLSearchParams({ radius_km: String(radius), limit: '20' });
    if (cursor) params.set('cursor', cursor);
    const res = await apiFetch<{ data: ActivityEvent[]; next_cursor: string | null }>(`/feed?${params}`);
    if (prepend) {
      setEvents(prev => [...res.data, ...prev]);
      setNewCount(0);
    } else {
      setEvents(prev => cursor ? [...prev, ...res.data] : res.data);
      setNextCursor(res.next_cursor);
    }
    setLoading(false);
  }, [radiusKm]);

  useEffect(() => {
    setLoading(true);
    fetchFeed(undefined, false, radiusKm);
  }, [radiusKm]);

  // Real-time: join geohash room and listen for activity events
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token || !user) return;
    const socket = getSocket(token);
    socket.on('activity_event', () => setNewCount(n => n + 1));
    return () => { socket.off('activity_event'); };
  }, [user]);

  function loadNew() {
    fetchFeed(undefined, false, radiusKm);
    setNewCount(0);
    window.scrollTo(0, 0);
  }

  const RADIUS_OPTIONS = [10, 25, 50, 100];

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 pt-6 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white">Feed</h1>
        <p className="text-gray-500 text-xs mt-0.5">What's happening near you</p>

        {/* Radius filter */}
        <div className="flex gap-2 mt-3">
          {RADIUS_OPTIONS.map(r => (
            <button
              key={r}
              onClick={() => setRadiusKm(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                radiusKm === r ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {newCount > 0 && (
        <div className="px-4 mb-2 flex-shrink-0">
          <button
            onClick={loadNew}
            className="w-full bg-brand/20 border border-brand/40 rounded-2xl py-2.5 text-brand text-sm font-semibold text-center"
          >
            ↑ {newCount} new {newCount === 1 ? 'item' : 'items'}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <EmptyFeed />
        ) : (
          <>
            {events.map(event => (
              <FeedCard key={event.id} event={event} navigate={navigate} />
            ))}
            {nextCursor && (
              <button
                onClick={() => fetchFeed(nextCursor)}
                className="w-full py-3 text-gray-400 text-sm hover:text-white transition-colors"
              >
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FeedCard({ event, navigate }: { event: ActivityEvent; navigate: ReturnType<typeof useNavigate> }) {
  const ago = timeAgo(event.created_at);

  if (event.type === 'trade_completed') {
    const p = event.payload as TradeCompletedPayload;
    return (
      <div className="bg-gray-800 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="flex -space-x-2 flex-shrink-0">
            <Avatar url={p.avatar_a} username={p.username_a} size="sm" />
            <Avatar url={p.avatar_b} username={p.username_b} size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">
              <span className="font-semibold">{p.username_a}</span>
              {' and '}
              <span className="font-semibold">{p.username_b}</span>
              {' completed a trade'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {p.card_name}
              {' · '}
              <span className="text-purple-300">{FINISH_LABELS[p.finish]}</span>
              {' · '}
              <span className="text-gray-300">{p.condition}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <GamePill game={p.game} />
              <span className="text-xs text-gray-500">{ago}</span>
            </div>
          </div>
          <div className="text-2xl flex-shrink-0">✅</div>
        </div>
      </div>
    );
  }

  if (event.type === 'new_member') {
    const p = event.payload as NewMemberPayload;
    return (
      <button
        onClick={() => navigate('/profile')}
        className="w-full bg-gray-800 rounded-2xl p-4 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Avatar url={p.avatar_url} username={p.username} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">
              <span className="font-semibold">{p.username}</span> just joined Binder
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{p.location_label}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {p.games.map(g => <GamePill key={g} game={g} />)}
              <span className="text-xs text-gray-500">{ago}</span>
            </div>
          </div>
          <span className="text-xs text-brand flex-shrink-0">View →</span>
        </div>
      </button>
    );
  }

  if (event.type === 'event_created') {
    const p = event.payload as EventCreatedPayload;
    return (
      <button
        onClick={() => navigate('/events')}
        className="w-full bg-gray-800 rounded-2xl p-4 text-left hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-900 flex items-center justify-center text-xl flex-shrink-0">📅</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white truncate">{p.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {p.organizer} · {formatDate(p.starts_at)}
              {p.distance_km > 0 && ` · ${p.distance_km.toFixed(1)} km`}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <GamePill game={p.game} />
              <span className="text-xs text-green-400">{p.entry_fee_eur === 0 ? 'Free' : `€${(p.entry_fee_eur / 100).toFixed(2)}`}</span>
              <span className="text-xs text-brand">RSVP →</span>
              <span className="text-xs text-gray-500">{ago}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  if (event.type === 'new_match_area') {
    const p = event.payload as NewMatchAreaPayload;
    const topFinish = Object.entries(p.finish_breakdown ?? {})
      .sort(([, a], [, b]) => (b as number) - (a as number))[0];

    return (
      <button
        onClick={() => navigate('/binder')}
        className="w-full bg-gradient-to-br from-amber-950/60 to-gray-800 border border-amber-700/30 rounded-2xl p-4 text-left hover:border-amber-600/50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-14 rounded-lg bg-amber-900/40 flex-shrink-0 flex items-center justify-center text-xl">📈</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wide mb-0.5">Trending nearby</p>
            <p className="text-sm font-bold text-white truncate">{p.card_name}</p>
            <p className="text-xs text-gray-300 mt-0.5">{p.want_count} players want this near you</p>
            {topFinish && (
              <p className="text-xs text-amber-300 mt-0.5">
                Most wanted: {FINISH_LABELS[topFinish[0] as keyof typeof FINISH_LABELS] ?? topFinish[0]} ({topFinish[1]}×)
              </p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <GamePill game={p.game} />
              <span className="text-xs text-brand">Add to binder →</span>
              <span className="text-xs text-gray-500">{ago}</span>
            </div>
          </div>
        </div>
      </button>
    );
  }

  return null;
}

function Avatar({ url, username, size = 'md' }: { url: string | null; username: string; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  if (url) return <img src={url} alt={username} className={`${sz} rounded-full object-cover border-2 border-gray-800 flex-shrink-0`} />;
  return (
    <div className={`${sz} rounded-full bg-brand/30 flex items-center justify-center font-bold text-brand border-2 border-gray-800 flex-shrink-0`}>
      {username[0]?.toUpperCase()}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center px-6">
      <div className="text-5xl mb-4">🌱</div>
      <h3 className="text-white font-bold text-lg mb-2">Your feed is quiet</h3>
      <p className="text-gray-400 text-sm">
        Add cards to your binder to start finding local trades. Completed trades, new members, events, and trending cards near you will appear here.
      </p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
