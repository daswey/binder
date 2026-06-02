import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Message, Conversation, ConversationStatus, TradeProposal, ProposalItem } from '@binder/shared';
import { apiFetch, apiPost, apiPatch } from '../api/client';
import { useAuthStore } from '../store/auth';
import { getSocket } from '../hooks/useSocket';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const STATUS_STEPS: ConversationStatus[] = ['active', 'proposal_sent', 'proposal_accepted', 'meetup_set', 'completed'];
const STATUS_LABELS: Record<ConversationStatus, string> = {
  active: 'Chatting',
  proposal_sent: 'Proposal sent',
  proposal_accepted: 'Terms agreed',
  meetup_set: 'Meetup set',
  completed: 'Completed',
};

// ── ConversationsPage ─────────────────────────────────────────────────────────

export function ConversationsPage({ onRead }: { onRead?: () => void }) {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch<Conversation[]>('/conversations')
      .then(data => { setConvs(data); onRead?.(); })
      .finally(() => setLoading(false));
  }, []);

  const totalUnread = convs.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 pt-6 pb-3 flex-shrink-0 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        {totalUnread > 0 && (
          <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold">
            {totalUnread} unread
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : convs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-gray-400 text-sm max-w-xs">No conversations yet. Find a match and start trading!</p>
          </div>
        ) : convs.map(conv => (
          <button
            key={conv.id}
            onClick={() => navigate(`/messages/${conv.id}`)}
            className="w-full bg-gray-800 rounded-2xl p-4 text-left hover:bg-gray-750 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand flex items-center justify-center text-white font-bold flex-shrink-0">
                {conv.other_participant?.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{conv.other_participant?.username ?? 'Unknown'}</span>
                  <div className="flex items-center gap-2">
                    {conv.status !== 'active' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        conv.status === 'completed' ? 'bg-green-900/60 text-green-400' : 'bg-indigo-900/60 text-indigo-300'
                      }`}>
                        {STATUS_LABELS[conv.status]}
                      </span>
                    )}
                    {conv.last_message && <span className="text-xs text-gray-500">{timeAgo(conv.last_message.created_at)}</span>}
                  </div>
                </div>
                {conv.last_message && (
                  <p className="text-sm text-gray-400 truncate">{conv.last_message.body}</p>
                )}
              </div>
              {conv.unread_count > 0 && (
                <span className="w-5 h-5 rounded-full bg-brand text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">
                  {conv.unread_count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────

function StatusBar({ status }: { status: ConversationStatus }) {
  const stepIdx = STATUS_STEPS.indexOf(status);
  return (
    <div className="px-4 py-2 bg-gray-900/80 border-b border-gray-800">
      <div className="flex items-center gap-1 mb-1">
        {STATUS_STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className={`h-1.5 flex-1 rounded-full transition-all ${
              i <= stepIdx ? (s === 'completed' ? 'bg-green-400' : 'bg-brand') : 'bg-gray-700'
            }`} />
            {i < STATUS_STEPS.length - 1 && <div className="w-0.5" />}
          </React.Fragment>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center">{STATUS_LABELS[status]}</p>
    </div>
  );
}

// ── Trade Proposal Message ────────────────────────────────────────────────────

function ProposalCard({
  payload, mine, convId, convStatus, onUpdate,
}: {
  payload: TradeProposal;
  mine: boolean;
  convId: string;
  convStatus: ConversationStatus;
  onUpdate: () => void;
}) {
  const [acting, setAct] = useState(false);
  const isPending = payload.status === 'pending' && convStatus === 'proposal_sent';

  const act = async (action: 'accept' | 'reject') => {
    setAct(true);
    try {
      await apiPatch(`/conversations/${convId}/proposal`, { action });
      onUpdate();
    } finally { setAct(false); }
  };

  const statusColors: Record<string, string> = {
    pending: 'text-amber-400 bg-amber-400/10',
    accepted: 'text-green-400 bg-green-400/10',
    rejected: 'text-red-400 bg-red-400/10',
    countered: 'text-indigo-400 bg-indigo-400/10',
  };

  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden border border-gray-700 max-w-[85%] text-left">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Trade Proposal</span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[payload.status] ?? ''}`}>
          {payload.status}
        </span>
      </div>
      <div className="p-3 space-y-3">
        <ProposalSide label="They offer" items={mine ? payload.items_you_give : payload.items_i_give} />
        <ProposalSide label="You give" items={mine ? payload.items_i_give : payload.items_you_give} />
      </div>
      {!mine && isPending && (
        <div className="px-3 pb-3 flex gap-2">
          <button
            disabled={acting}
            onClick={() => act('reject')}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 transition-colors"
          >
            Decline
          </button>
          <button
            disabled={acting}
            onClick={() => act('accept')}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors"
          >
            Accept
          </button>
        </div>
      )}
    </div>
  );
}

function ProposalSide({ label, items }: { label: string; items: ProposalItem[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500 italic">Nothing</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
              <span className="w-4 h-4 rounded bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-400 flex-shrink-0">
                {item.quantity}
              </span>
              <span className="truncate">{item.name}</span>
              {item.finish && item.finish !== 'standard' && (
                <span className="text-[10px] text-gray-500 flex-shrink-0">{item.finish}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Meetup Proposal Message ───────────────────────────────────────────────────

function MeetupCard({ payload }: { payload: { location: string; time: string } }) {
  const date = new Date(payload.time).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 max-w-[85%]">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Meetup Proposal</p>
      <div className="flex items-start gap-2 text-sm text-gray-200 mb-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0 text-brand"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>{payload.location}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>{date}</span>
      </div>
    </div>
  );
}

// ── System Message ────────────────────────────────────────────────────────────

function SystemMessage({ body, payload }: { body: string; payload: any }) {
  const isCompleted = payload?.text === 'trade_completed';
  return (
    <div className="flex justify-center py-1">
      <span className={`text-xs px-3 py-1 rounded-full ${
        isCompleted ? 'bg-green-900/60 text-green-300' : 'bg-gray-800 text-gray-500'
      }`}>
        {isCompleted ? '🎉 ' : ''}{body}
      </span>
    </div>
  );
}

// ── Propose Trade Sheet ───────────────────────────────────────────────────────

function ProposeTradeSheet({
  convId, onDone, onClose,
}: { convId: string; onDone: () => void; onClose: () => void }) {
  const [iGive, setIGive] = useState<ProposalItem[]>([]);
  const [youGive, setYouGive] = useState<ProposalItem[]>([]);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeList, setActiveList] = useState<'i' | 'you'>('i');
  const [sending, setSending] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  const searchCards = (q: string) => {
    setSearch(q);
    clearTimeout(debounce.current);
    if (q.length < 2) { setSearchResults([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const data = await apiFetch<{ data: any[] }>(`/cards/search?q=${encodeURIComponent(q)}&limit=6`);
        setSearchResults(data.data ?? []);
      } catch {}
    }, 300);
  };

  const addCard = (card: any, to: 'i' | 'you') => {
    const item: ProposalItem = {
      card_id: card.id, external_id: card.external_id, name: card.name,
      image_url: card.image_url, quantity: 1,
    };
    if (to === 'i') setIGive(prev => [...prev.filter(x => x.card_id !== card.id), item]);
    else setYouGive(prev => [...prev.filter(x => x.card_id !== card.id), item]);
    setSearch('');
    setSearchResults([]);
  };

  const removeItem = (cardId: string, from: 'i' | 'you') => {
    if (from === 'i') setIGive(prev => prev.filter(x => x.card_id !== cardId));
    else setYouGive(prev => prev.filter(x => x.card_id !== cardId));
  };

  const send = async () => {
    setSending(true);
    try {
      await apiPost(`/conversations/${convId}/proposal`, {
        items_i_give: iGive, items_you_give: youGive, message: message.trim() || undefined,
      });
      onDone();
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Propose Trade</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Search + list selector */}
          <div className="flex gap-2 mb-1">
            <button
              type="button"
              onClick={() => setActiveList('i')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${activeList === 'i' ? 'bg-brand text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              I give ({iGive.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveList('you')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${activeList === 'you' ? 'bg-brand text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              They give ({youGive.length})
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => searchCards(e.target.value)}
              placeholder={`Search card to add to "${activeList === 'i' ? 'I give' : 'They give'}"…`}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand"
            />
            {searchResults.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                {searchResults.map(card => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => addCard(card, activeList)}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 border-b border-gray-700 last:border-0 truncate"
                    >
                      <span className="font-medium">{card.name}</span>
                      <span className="text-gray-500 ml-2 text-xs">{card.external_id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* I give list */}
          <ItemList label="I give" items={iGive} onRemove={id => removeItem(id, 'i')} />
          <ItemList label="They give" items={youGive} onRemove={id => removeItem(id, 'you')} />

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Add a message (optional)…"
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand resize-none"
          />
        </div>

        <div className="px-5 pb-safe pt-3 border-t border-gray-800">
          <button
            disabled={sending || (iGive.length === 0 && youGive.length === 0)}
            onClick={send}
            className="w-full py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
          >
            {sending ? 'Sending…' : 'Send Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemList({ label, items, onRemove }: { label: string; items: ProposalItem[]; onRemove: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <ul className="space-y-1.5">
        {items.map(item => (
          <li key={item.card_id} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800 rounded-xl px-3 py-2">
            <span className="flex-1 truncate">{item.name}</span>
            <button onClick={() => onRemove(item.card_id)} className="text-gray-600 hover:text-red-400 transition-colors ml-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Propose Meetup Sheet ──────────────────────────────────────────────────────

function ProposeMeetupSheet({
  convId, onDone, onClose,
}: { convId: string; onDone: () => void; onClose: () => void }) {
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!location.trim() || !date || !time) return;
    setSending(true);
    try {
      await apiPost(`/conversations/${convId}/meetup`, {
        location: location.trim(),
        time: new Date(`${date}T${time}`).toISOString(),
      });
      onDone();
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-t-3xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Propose Meetup</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Cardsphere Hamburg, coffee shop on main street…"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-brand"
              />
            </div>
          </div>
        </div>

        <div className="px-5 pb-safe pt-1 border-t border-gray-800">
          <button
            disabled={sending || !location.trim() || !date || !time}
            onClick={send}
            className="w-full py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
          >
            {sending ? 'Sending…' : 'Propose Meetup'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Rating Modal ──────────────────────────────────────────────────────────────

function RatingModal({ convId, tradeMatchId, otherUsername, onClose }: {
  convId: string;
  tradeMatchId: string | null;
  otherUsername: string;
  onClose: () => void;
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!tradeMatchId) { onClose(); return; }
    setSending(true);
    try {
      await apiPost('/ratings', { trade_match_id: tradeMatchId, score, comment: comment.trim() || null });
      setDone(true);
      setTimeout(onClose, 1500);
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 rounded-t-3xl w-full p-6 pb-safe space-y-5">
        {done ? (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">⭐</div>
            <p className="text-white font-bold text-xl">Thanks for the rating!</p>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-xl font-bold text-white">Trade Complete!</h3>
              <p className="text-gray-400 text-sm mt-1">How was your trade with {otherUsername}?</p>
            </div>

            <div className="flex justify-center gap-3">
              {[1, 2, 3, 4, 5].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScore(s)}
                  className={`text-3xl transition-transform ${s <= score ? 'scale-110' : 'grayscale opacity-40'}`}
                >
                  ⭐
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Leave a comment (optional)…"
              rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-brand resize-none"
            />

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3.5 bg-gray-800 rounded-2xl text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
              >
                Later
              </button>
              <button
                onClick={submit}
                disabled={sending}
                className="flex-1 py-3.5 bg-brand rounded-2xl text-white font-semibold disabled:opacity-40 hover:bg-indigo-500 transition-colors"
              >
                {sending ? 'Submitting…' : 'Submit Rating'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ChatPage ──────────────────────────────────────────────────────────────────

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<'propose_trade' | 'meetup' | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadConv = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<any>(`/conversations/${id}`);
      setConv(data);
    } catch {}
  }, [id]);

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    const data = await apiFetch<Message[]>(`/conversations/${id}/messages`);
    setMessages(data);
    setLoading(false);
    await apiPost(`/conversations/${id}/read`, {});
  }, [id]);

  useEffect(() => {
    loadConv();
    fetchMessages();
    const token = localStorage.getItem('access_token');
    if (!token || !id) return;
    const socket = getSocket(token);
    socket.emit('join_conversation', id);
    socket.on('message', (msg: Message) => setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
    socket.on('conversation_updated', (update: any) => {
      setConv((prev: any) => prev ? { ...prev, ...update } : prev);
    });
    return () => {
      socket.off('message');
      socket.off('conversation_updated');
      socket.emit('leave_conversation', id);
    };
  }, [id, fetchMessages, loadConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !id) return;
    const body = input.trim();
    setInput('');
    try {
      const msg = await apiPost<Message>(`/conversations/${id}/messages`, { body });
      setMessages(prev => [...prev, msg]);
    } catch {}
  }

  const handleComplete = async () => {
    if (!id) return;
    setCompleting(true);
    try {
      const result = await apiPost<{ status: string }>(`/conversations/${id}/complete`, {});
      await loadConv();
      if (result.status === 'completed') {
        setShowRating(true);
      }
    } finally { setCompleting(false); }
  };

  const otherUser = conv?.other_participant;
  const status: ConversationStatus = conv?.status ?? 'active';
  const proposal: TradeProposal | null = conv?.trade_proposal ?? null;
  const myId = user?.id;

  // Determine my role in completion
  const participants: string[] = conv?.participant_ids ?? [];
  const isParticipantA = participants.length >= 2 && participants.sort()[0] === myId;
  const iHaveCompleted = isParticipantA ? conv?.completed_by_a : conv?.completed_by_b;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 flex-shrink-0 border-b border-gray-800 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white p-1" aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {otherUser?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{otherUser?.username ?? 'Chat'}</p>
          {otherUser?.location_label && (
            <p className="text-xs text-gray-500 truncate">{otherUser.location_label}</p>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar status={status} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.map(msg => {
          const mine = msg.sender_id === myId;

          if (msg.type === 'system') {
            return <SystemMessage key={msg.id} body={msg.body} payload={msg.payload} />;
          }

          if (msg.type === 'trade_proposal') {
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <ProposalCard
                  payload={msg.payload as TradeProposal}
                  mine={mine}
                  convId={id!}
                  convStatus={status}
                  onUpdate={() => { loadConv(); fetchMessages(); }}
                />
              </div>
            );
          }

          if (msg.type === 'meetup_proposal') {
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <MeetupCard payload={msg.payload} />
              </div>
            );
          }

          return (
            <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${mine ? 'bg-brand text-white rounded-br-md' : 'bg-gray-800 text-gray-100 rounded-bl-md'}`}>
                <p>{msg.body}</p>
                <p className={`text-xs mt-1 ${mine ? 'text-indigo-200' : 'text-gray-500'}`}>{timeAgo(msg.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Action bar */}
      {status !== 'completed' && (
        <div className="flex-shrink-0 px-4 pt-2 border-t border-gray-800 flex gap-2">
          <button
            type="button"
            onClick={() => setSheet('propose_trade')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 text-xs text-gray-300 font-medium hover:bg-gray-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4"/></svg>
            Propose Trade
          </button>
          <button
            type="button"
            onClick={() => setSheet('meetup')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800 text-xs text-gray-300 font-medium hover:bg-gray-700 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Meetup
          </button>
          {(status === 'proposal_accepted' || status === 'meetup_set') && !iHaveCompleted && (
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-800/60 text-xs text-green-300 font-medium hover:bg-green-700/60 disabled:opacity-40 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              {completing ? '…' : 'Mark Complete'}
            </button>
          )}
          {iHaveCompleted && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500">
              Waiting for other side…
            </span>
          )}
        </div>
      )}

      {/* Input */}
      <form onSubmit={send} className="flex-shrink-0 px-4 pb-4 pt-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand text-sm"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="w-12 h-12 bg-brand rounded-full flex items-center justify-center text-white disabled:opacity-40 hover:bg-indigo-500 transition-colors flex-shrink-0"
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
        </button>
      </form>

      {/* Sheets */}
      {sheet === 'propose_trade' && (
        <ProposeTradeSheet
          convId={id!}
          onDone={() => { setSheet(null); loadConv(); fetchMessages(); }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'meetup' && (
        <ProposeMeetupSheet
          convId={id!}
          onDone={() => { setSheet(null); loadConv(); }}
          onClose={() => setSheet(null)}
        />
      )}
      {showRating && (
        <RatingModal
          convId={id!}
          tradeMatchId={conv?.trade_match_id ?? null}
          otherUsername={otherUser?.username ?? 'trader'}
          onClose={() => setShowRating(false)}
        />
      )}
    </div>
  );
}
