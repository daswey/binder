import React, { useState, useEffect, useCallback } from 'react';
import { TradeMatch, MatchedCard, FINISH_LABELS, CONDITION_COLORS, EDITION_LABELS } from '@binder/shared';
import { GradeBadge } from '../components/shared/GradeBadge';
import { apiFetch, apiPost } from '../api/client';
import { useAuthStore } from '../store/auth';
import { GamePill } from '../components/GamePill';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../hooks/useSocket';

type GameFilter = 'all' | 'pokemon' | 'one_piece';

const MATCH_TYPE_COLORS = {
  perfect: 'bg-green-900/60 text-green-300 border-green-700/40',
  partial: 'bg-purple-900/60 text-purple-300 border-purple-700/40',
  value_gap: 'bg-amber-900/60 text-amber-300 border-amber-700/40',
};
const MATCH_TYPE_LABELS = { perfect: 'Perfect ✓', partial: 'Partial', value_gap: 'Value Gap' };

const RADIUS_OPTIONS = [5, 10, 25, 50];

export function MatchesPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<TradeMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [radiusKm, setRadiusKm] = useState(25);
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [selectedMatch, setSelectedMatch] = useState<TradeMatch | null>(null);

  const fetchMatches = useCallback(async (radius = radiusKm, game = gameFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ radius_km: String(radius), game });
      const data = await apiFetch<TradeMatch[]>(`/matches?${params}`);
      setMatches(data);
    } finally {
      setLoading(false);
    }
  }, [radiusKm, gameFilter]);

  useEffect(() => { fetchMatches(radiusKm, gameFilter); }, [radiusKm, gameFilter]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token || !user) return;
    const socket = getSocket(token);
    socket.on('match_update', () => fetchMatches());
    return () => { socket.off('match_update'); };
  }, [user, fetchMatches]);

  const myId = user?.id;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="px-4 pt-6 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-white">Matches</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          {matches.length} mutual {matches.length === 1 ? 'match' : 'matches'} within {radiusKm} km
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {RADIUS_OPTIONS.map(r => (
            <button key={r} onClick={() => setRadiusKm(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${radiusKm === r ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}>
              {r} km
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          {(['all', 'pokemon', 'one_piece'] as GameFilter[]).map(g => (
            <button key={g} onClick={() => setGameFilter(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${gameFilter === g ? 'bg-brand border-brand text-white' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}>
              {g === 'all' ? 'All' : g === 'pokemon' ? 'Pokémon' : 'One Piece'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none px-4 pb-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-400 text-sm max-w-xs">No matches found. Try expanding your radius or adding more cards.</p>
          </div>
        ) : matches.map(match => {
          const isA = match.user_a_id === myId;
          return (
            <MatchCard key={match.id} match={match}
              myCards={isA ? match.user_a_gets : match.user_b_gets}
              theirCards={isA ? match.user_b_gets : match.user_a_gets}
              onOpen={() => setSelectedMatch(match)}
              navigate={navigate} />
          );
        })}
      </div>

      {selectedMatch && (
        <MatchDetail match={selectedMatch} myId={myId ?? ''} onClose={() => setSelectedMatch(null)} navigate={navigate} />
      )}
    </div>
  );
}

function MatchCard({ match, myCards, theirCards, onOpen, navigate }: {
  match: TradeMatch; myCards: MatchedCard[]; theirCards: MatchedCard[];
  onOpen: () => void; navigate: ReturnType<typeof useNavigate>;
}) {
  const { other_user } = match;
  async function openConversation(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const conv = await apiPost<{ id: string }>('/conversations', { trade_match_id: match.id });
      navigate(`/messages/${conv.id}`);
    } catch (err: any) {
      if (err.status === 409) {
        const convs = await apiFetch<any[]>('/conversations');
        const existing = convs.find((c: any) => c.trade_match_id === match.id);
        if (existing) navigate(`/messages/${existing.id}`);
      }
    }
  }
  return (
    <div className="bg-gray-800 rounded-2xl overflow-hidden">
      <button onClick={onOpen} className="w-full p-4 text-left">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand/30 flex items-center justify-center text-sm font-bold text-brand">
              {other_user.username[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-semibold text-white">{other_user.username}</span>
            {other_user.is_pro && <span className="text-amber-400 text-xs font-bold">◆</span>}
            {other_user.is_lgs && <span className="text-xs text-yellow-400">🏪</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{match.distance_km.toFixed(1)} km</span>
            {other_user.reputation_score != null && <span className="text-yellow-400">★ {other_user.reputation_score.toFixed(1)}</span>}
            <span>· {other_user.trade_count} trades</span>
          </div>
        </div>
        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border mb-2 ${MATCH_TYPE_COLORS[match.match_type]}`}>
          {MATCH_TYPE_LABELS[match.match_type]}
        </span>
        {myCards.length > 0 && (
          <div className="mb-1.5">
            <p className="text-xs text-gray-500 mb-1">You get:</p>
            {myCards.slice(0, 2).map((c, i) => <CardLine key={i} card={c} />)}
            {myCards.length > 2 && <p className="text-xs text-gray-500">+{myCards.length - 2} more</p>}
          </div>
        )}
        {theirCards.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-1">They get:</p>
            {theirCards.slice(0, 2).map((c, i) => <CardLine key={i} card={c} />)}
            {theirCards.length > 2 && <p className="text-xs text-gray-500">+{theirCards.length - 2} more</p>}
          </div>
        )}
        {match.match_type === 'value_gap' && (
          <p className="text-xs text-amber-400 mt-1.5">Gap: €{Math.abs(match.value_gap_eur / 100).toFixed(2)}</p>
        )}
      </button>
      <div className="px-4 pb-4">
        <button onClick={openConversation}
          className="w-full bg-brand/20 border border-brand/40 text-brand text-sm font-semibold py-2.5 rounded-xl hover:bg-brand/30 transition-colors">
          Message {other_user.username}
        </button>
      </div>
    </div>
  );
}

function CardLine({ card }: { card: MatchedCard }) {
  const attrs: string[] = [];
  if (card.finish && card.finish !== 'standard') attrs.push(FINISH_LABELS[card.finish]);
  if (card.language) attrs.push(card.language);
  if (card.condition) attrs.push(card.condition);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-white truncate flex-1">{card.name}</span>
      {card.is_graded && card.grading_company && card.grade && (
        <GradeBadge company={card.grading_company} grade={card.grade} />
      )}
      <span className="text-xs text-gray-400 flex-shrink-0">{attrs.join(' · ')}</span>
      {card.market_price_eur != null && (
        <span className="text-xs text-gray-500 flex-shrink-0">~€{(card.market_price_eur / 100).toFixed(0)}</span>
      )}
    </div>
  );
}

function MatchDetail({ match, myId, onClose, navigate }: {
  match: TradeMatch; myId: string; onClose: () => void; navigate: ReturnType<typeof useNavigate>;
}) {
  const isA = match.user_a_id === myId;
  const myCards = isA ? match.user_a_gets : match.user_b_gets;
  const theirCards = isA ? match.user_b_gets : match.user_a_gets;
  const { other_user } = match;
  const myValue = myCards.reduce((s, c) => s + (c.market_price_eur ?? 0) * c.quantity, 0);
  const theirValue = theirCards.reduce((s, c) => s + (c.market_price_eur ?? 0) * c.quantity, 0);

  async function openConversation() {
    try {
      const conv = await apiPost<{ id: string }>('/conversations', { trade_match_id: match.id });
      navigate(`/messages/${conv.id}`); onClose();
    } catch (err: any) {
      if (err.status === 409) {
        const convs = await apiFetch<any[]>('/conversations');
        const existing = convs.find((c: any) => c.trade_match_id === match.id);
        if (existing) { navigate(`/messages/${existing.id}`); onClose(); }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end bg-black/60" onClick={onClose}>
      <div className="w-full bg-gray-900 rounded-t-3xl max-h-[90vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">{other_user.username}</h3>
              <p className="text-xs text-gray-400">{match.distance_km.toFixed(1)} km · {other_user.location_label}</p>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${MATCH_TYPE_COLORS[match.match_type]}`}>
              {MATCH_TYPE_LABELS[match.match_type]}
            </span>
          </div>
          {myCards.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                You get · ~€{(myValue / 100).toFixed(2)}
              </h4>
              <div className="space-y-2">{myCards.map((c, i) => <DetailCard key={i} card={c} />)}</div>
            </div>
          )}
          {theirCards.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                They get · ~€{(theirValue / 100).toFixed(2)}
              </h4>
              <div className="space-y-2">{theirCards.map((c, i) => <DetailCard key={i} card={c} />)}</div>
            </div>
          )}
          {match.match_type === 'value_gap' && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
              <p className="text-sm text-amber-300 font-medium">
                Gap: €{Math.abs(match.value_gap_eur / 100).toFixed(2)} {match.value_gap_eur > 0 ? 'in your favour' : 'in their favour'}
              </p>
            </div>
          )}
          <button onClick={openConversation}
            className="w-full bg-brand text-white font-semibold py-3.5 rounded-xl text-base">
            Message {other_user.username}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailCard({ card }: { card: MatchedCard }) {
  const attrs: string[] = [];
  if (card.finish && card.finish !== 'standard') attrs.push(FINISH_LABELS[card.finish]);
  if (card.language) attrs.push(card.language);
  if (card.condition) attrs.push(card.condition);
  if (card.edition) attrs.push(EDITION_LABELS[card.edition]);
  return (
    <div className="flex items-center gap-3 bg-gray-800 rounded-xl p-3">
      {card.image_url && <img src={card.image_url} alt={card.name} className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{card.name}</p>
        <div className="flex items-center gap-2 mt-0.5"><GamePill game={card.game} /><span className="text-xs text-gray-400">{card.external_id}</span></div>
        <p className="text-xs text-gray-400 mt-0.5">{attrs.join(' · ')}</p>
      </div>
      <div className="text-right flex-shrink-0">
        {card.market_price_eur != null && <p className="text-xs text-gray-400">~€{(card.market_price_eur / 100).toFixed(2)}</p>}
        {card.quantity > 1 && <p className="text-xs text-indigo-300">×{card.quantity}</p>}
      </div>
    </div>
  );
}
