import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Event } from '@binder/shared';
import { apiFetch, apiPost, apiDelete } from '../api/client';
import { GamePill } from '../components/GamePill';

const DATE_FILTERS = [
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
  { label: 'All', days: 0 },
] as const;

const GAME_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'one_piece', label: 'One Piece' },
] as const;

const EVENT_TYPE_LABELS: Record<string, string> = {
  tournament: '🏆 Tournament',
  locals: '🎮 Locals',
  trade_table: '🔄 Trade Table',
  casual: '😊 Casual',
};

export function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFiler, setDateFilter] = useState<number>(7);
  const [game, setGame] = useState('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [selected, setSelected] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ game, radius_km: '50' });
      if (dateFiler > 0) {
        params.set('from', new Date().toISOString());
        params.set('to', new Date(Date.now() + dateFiler * 864e5).toISOString());
      }
      if (freeOnly) params.set('free_only', 'true');
      const data = await apiFetch<{ data: Event[] }>(`/events?${params}`);
      setEvents(data.data);
    } finally {
      setLoading(false);
    }
  }, [dateFiler, game, freeOnly]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  async function toggleRsvp(event: Event) {
    if (event.is_attending) {
      await apiDelete(`/events/${event.id}/rsvp`);
    } else {
      await apiPost(`/events/${event.id}/rsvp`, {});
    }
    fetchEvents();
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 pt-6 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Events</h1>
          <button
            onClick={() => setCreating(true)}
            className="w-10 h-10 bg-brand rounded-full flex items-center justify-center text-white text-xl shadow-lg"
            aria-label="Create event"
          >
            +
          </button>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-none pb-1">
          {DATE_FILTERS.map(f => (
            <button
              key={f.days}
              onClick={() => setDateFilter(f.days)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${dateFiler === f.days ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 items-center">
          {GAME_FILTERS.map(g => (
            <button
              key={g.value}
              onClick={() => setGame(g.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${game === g.value ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400'}`}
            >
              {g.label}
            </button>
          ))}
          <button
            onClick={() => setFreeOnly(v => !v)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${freeOnly ? 'bg-green-700 border-green-700 text-white' : 'border-gray-700 text-gray-400'}`}
          >
            Free only
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-gray-400 text-sm max-w-xs">No events found nearby. Create one for your local community!</p>
          </div>
        ) : events.map(event => (
          <button
            key={event.id}
            onClick={() => setSelected(event)}
            className="w-full bg-gray-800 rounded-2xl p-4 text-left hover:bg-gray-750 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-white truncate">{event.title}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <GamePill game={event.game} />
                  <span className="text-xs text-gray-400">{EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}</span>
                  {event.entry_fee_eur === 0 ? (
                    <span className="text-xs text-green-400">Free</span>
                  ) : (
                    <span className="text-xs text-gray-400">€{(event.entry_fee_eur / 100).toFixed(2)}</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{new Date(event.starts_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{event.address}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>👥 {event.attendee_count} attending</span>
                  {event.distance_km != null && <span>📍 {event.distance_km.toFixed(1)} km</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <EventDetailSheet
          event={selected}
          onClose={() => setSelected(null)}
          onRsvp={() => { toggleRsvp(selected); setSelected(null); }}
        />
      )}
      {creating && <CreateEventSheet onClose={() => setCreating(false)} onCreated={() => { setCreating(false); fetchEvents(); }} />}
    </div>
  );
}

function EventDetailSheet({ event, onClose, onRsvp }: { event: Event; onClose: () => void; onRsvp: () => void }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-gray-900 rounded-t-3xl max-h-[80vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div>
            <h3 className="text-xl font-bold text-white">{event.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <GamePill game={event.game} />
              <span className="text-sm text-gray-400">{EVENT_TYPE_LABELS[event.event_type]}</span>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-300">
            <p>📅 {new Date(event.starts_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <p>📍 {event.address}</p>
            <p>👥 {event.attendee_count} attending{event.max_attendees ? ` / ${event.max_attendees} max` : ''}</p>
            <p>{event.entry_fee_eur === 0 ? '✅ Free entry' : `🎫 €${(event.entry_fee_eur / 100).toFixed(2)} entry`}</p>
          </div>

          {event.description && <p className="text-gray-400 text-sm">{event.description}</p>}

          <button
            onClick={onRsvp}
            className={`w-full font-semibold py-3 rounded-xl transition-colors ${event.is_attending ? 'bg-gray-700 text-gray-300' : 'bg-brand hover:bg-brand-dark text-white'}`}
          >
            {event.is_attending ? 'Cancel RSVP' : 'RSVP'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEventSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: '', description: '', game: 'all' as 'pokemon' | 'one_piece' | 'all',
    event_type: 'locals' as 'tournament' | 'locals' | 'trade_table' | 'casual',
    address: '', latitude: 0, longitude: 0,
    starts_at: '', entry_fee_eur: 0,
  });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost('/events', form);
      onCreated();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-gray-900 rounded-t-3xl max-h-[90vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <form onSubmit={submit} className="p-6 space-y-4">
          <h3 className="text-xl font-bold text-white">Create Event</h3>

          {[
            { label: 'Title', key: 'title', type: 'text', required: true },
            { label: 'Address', key: 'address', type: 'text', required: true },
            { label: 'Date & Time', key: 'starts_at', type: 'datetime-local', required: true },
            { label: 'Latitude', key: 'latitude', type: 'number', required: true },
            { label: 'Longitude', key: 'longitude', type: 'number', required: true },
            { label: 'Entry Fee (cents)', key: 'entry_fee_eur', type: 'number', required: false },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm text-gray-400 mb-1">{f.label}</label>
              <input
                type={f.type}
                value={(form as any)[f.key]}
                onChange={e => setForm(v => ({ ...v, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                required={f.required}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Game</label>
            <select
              value={form.game}
              onChange={e => setForm(v => ({ ...v, game: e.target.value as any }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
            >
              <option value="all">All games</option>
              <option value="pokemon">Pokémon</option>
              <option value="one_piece">One Piece</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Type</label>
            <select
              value={form.event_type}
              onChange={e => setForm(v => ({ ...v, event_type: e.target.value as any }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
            >
              <option value="locals">Locals</option>
              <option value="tournament">Tournament</option>
              <option value="trade_table">Trade Table</option>
              <option value="casual">Casual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(v => ({ ...v, description: e.target.value }))}
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand resize-none"
            />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
            {loading ? 'Creating…' : 'Create Event'}
          </button>
        </form>
      </div>
    </div>
  );
}
