import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TradeRating } from '@binder/shared';
import { apiFetch, apiPatch, apiDelete } from '../api/client';
import { useAuthStore } from '../store/auth';
import { StarRating } from '../components/StarRating';
import { ProSheet } from '../components/ProSheet';

export function ProfilePage() {
  const { user, logout, fetchMe } = useAuthStore();
  const [ratings, setRatings] = useState<TradeRating[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ bio: '', location_label: '' });
  const [showPro, setShowPro] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      setForm({ bio: user.bio ?? '', location_label: user.location_label });
      apiFetch<TradeRating[]>(`/users/${user.id}/ratings`).then(setRatings).catch(() => {});
    }
  }, [user]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiPatch('/auth/me', form);
      await fetchMe();
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/auth');
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-y-auto scrollbar-none">
      <div className="px-4 pt-6 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-gray-700">
            Sign out
          </button>
        </div>

        {/* Avatar + name */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-brand flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {user.username[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-white">{user.username}</p>
              {user.is_pro && <span className="text-amber-400 text-sm font-bold">◆</span>}
            </div>
            {user.location_label && <p className="text-sm text-gray-400 mt-0.5">📍 {user.location_label}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Trades', value: user.trade_count },
            { label: 'Rating', value: user.trade_count > 0 ? `★ ${(user.reputation_score ?? 0).toFixed(1)}` : '—' },
            { label: 'Since', value: new Date(user.created_at).getFullYear() },
          ].map(stat => (
            <div key={stat.label} className="bg-gray-800 rounded-2xl p-3 text-center">
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Bio */}
        {user.bio && !editing && (
          <p className="text-gray-300 text-sm mb-4 bg-gray-800 rounded-2xl p-4">{user.bio}</p>
        )}

        {/* Edit profile form */}
        {editing ? (
          <form onSubmit={saveProfile} className="space-y-3 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bio</label>
              <textarea
                value={form.bio}
                onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                rows={3}
                maxLength={500}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">City</label>
              <input
                type="text"
                value={form.location_label}
                onChange={e => setForm(f => ({ ...f, location_label: e.target.value }))}
                placeholder="e.g. Duisburg, DE"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-brand text-white font-semibold py-2.5 rounded-xl">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="flex-1 bg-gray-700 text-gray-300 font-semibold py-2.5 rounded-xl">Cancel</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="w-full bg-gray-800 border border-gray-700 text-gray-300 font-medium py-2.5 rounded-xl mb-6 hover:bg-gray-700 transition-colors">
            Edit Profile
          </button>
        )}

        {/* Pro upgrade banner (free users only) */}
        {!user.is_pro && (
          <button
            onClick={() => setShowPro(true)}
            className="w-full mb-6 bg-amber-900/30 border border-amber-600/40 rounded-2xl p-4 text-left hover:bg-amber-900/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">◆</span>
              <div>
                <p className="text-sm font-bold text-amber-400">Upgrade to Binder Pro</p>
                <p className="text-xs text-amber-600/80 mt-0.5">Unlimited cards · 100 km radius · Price alerts</p>
              </div>
              <span className="ml-auto text-amber-500 text-sm">€3.49/mo →</span>
            </div>
          </button>
        )}

        {/* Pro status (Pro users) */}
        {user.is_pro && (
          <div className="w-full mb-6 bg-amber-900/20 border border-amber-600/30 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">◆</span>
              <div>
                <p className="text-sm font-bold text-amber-400">Binder Pro active</p>
                {user.pro_expires_at && (
                  <p className="text-xs text-amber-600/70 mt-0.5">
                    Renews {new Date(user.pro_expires_at).toLocaleDateString('en-GB')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Trade ratings */}
        {ratings.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-bold text-white mb-3">Trade Ratings</h2>
            <div className="space-y-3">
              {ratings.map(r => (
                <div key={r.id} className="bg-gray-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{(r.rater as any)?.username ?? 'Anonymous'}</span>
                    <StarRating score={r.score} count={1} />
                  </div>
                  {r.comment && <p className="text-sm text-gray-400">{r.comment}</p>}
                  <p className="text-xs text-gray-500 mt-1">{new Date(r.created_at).toLocaleDateString('en-GB')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Push Notifications */}
        <PushNotificationToggle />

        {/* My Data */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white mb-3">My data</h2>
          <div className="bg-gray-800 rounded-2xl overflow-hidden">
            {/* Download */}
            <div className="px-4 py-4 border-b border-gray-700/50">
              <div className="flex items-start gap-3 mb-3">
                <span className="text-xl mt-0.5">⬇</span>
                <div>
                  <p className="text-sm font-semibold text-white">Download my data</p>
                  <p className="text-xs text-gray-400 mt-0.5">ZIP with 4 CSV files: profile, binder, trade history, and ratings. Opens in Excel, Google Sheets, or Numbers.</p>
                </div>
              </div>
              <DownloadDataButton />
            </div>

            {/* Delete account */}
            <DeleteAccountSection />
          </div>
        </div>

        {/* Footer links */}
        <div className="text-center space-y-1 mt-2">
          <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
            <button onClick={() => navigate('/privacy')} className="hover:text-gray-400 transition-colors">Privacy Policy</button>
            <span>·</span>
            <button onClick={() => navigate('/terms')} className="hover:text-gray-400 transition-colors">Terms of Service</button>
            <span>·</span>
            <button
              onClick={() => { localStorage.removeItem('binder_cookie_consent'); window.location.reload(); }}
              className="hover:text-gray-400 transition-colors"
            >
              Cookie Settings
            </button>
          </div>
          <p className="text-xs text-gray-700">v1.0.0</p>
        </div>
      </div>

      {showPro && <ProSheet onClose={() => setShowPro(false)} trigger="general" />}
    </div>
  );
}

function DeleteAccountSection() {
  const [confirm, setConfirm] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  async function doDelete() {
    if (input !== 'DELETE') return;
    setLoading(true);
    try {
      await apiDelete('/auth/me', { confirm: 'DELETE' });
      await logout();
      navigate('/auth');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xl mt-0.5">🗑</span>
        <div>
          <p className="text-sm font-semibold text-white">Delete account</p>
          <p className="text-xs text-gray-400 mt-0.5">Permanently deletes your account and all data. This cannot be undone.</p>
        </div>
      </div>

      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-700 text-red-400 hover:bg-red-900/30 transition-colors"
        >
          Delete my account
        </button>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="w-full bg-gray-700 border border-red-600/40 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={doDelete}
              disabled={input !== 'DELETE' || loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-40 hover:bg-red-500 transition-colors"
            >
              {loading ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button
              onClick={() => { setConfirm(false); setInput(''); }}
              className="flex-1 py-2.5 rounded-xl text-sm bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PushNotificationToggle() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
      setStatus('granted');
      navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
        setSubscribed(!!sub);
      }).catch(() => {});
    } else if (perm === 'denied') {
      setStatus('denied');
    }
  }, []);

  async function subscribe() {
    setStatus('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch('/api/push/vapid-public-key');
      const { key } = await keyRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const token = localStorage.getItem('access_token');
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: (sub.toJSON().keys as any).p256dh, auth: (sub.toJSON().keys as any).auth } }),
      });
      setSubscribed(true);
      setStatus('granted');
    } catch {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'idle');
    }
  }

  async function unsubscribe() {
    setStatus('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = localStorage.getItem('access_token');
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setStatus('granted');
    } catch {
      setStatus('granted');
    }
  }

  if (status === 'unsupported') return null;

  return (
    <div className="mb-6 bg-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔔</span>
          <div>
            <p className="text-sm font-semibold text-white">Push notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {status === 'denied' ? 'Blocked in browser settings' : subscribed ? 'On — matches, messages & trades' : 'Off'}
            </p>
          </div>
        </div>
        {status === 'denied' ? (
          <span className="text-xs text-gray-500">Blocked</span>
        ) : (
          <button
            onClick={subscribed ? unsubscribe : subscribe}
            disabled={status === 'loading'}
            className={`relative w-12 h-6 rounded-full transition-colors ${subscribed ? 'bg-brand' : 'bg-gray-600'} disabled:opacity-50`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${subscribed ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        )}
      </div>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function DownloadDataButton() {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/auth/me/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] ?? 'binder-export.zip';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-700 text-white hover:bg-gray-600 transition-colors disabled:opacity-60"
    >
      {downloading ? 'Preparing download…' : '⬇ Download CSV export'}
    </button>
  );
}
