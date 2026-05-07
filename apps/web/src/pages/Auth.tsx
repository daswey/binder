import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        if (!agreedToTerms) { setError('You must agree to the Terms of Service'); setLoading(false); return; }
        await register({ username: form.username, email: form.email, password: form.password, agreed_to_terms: true });
      }
      navigate('/binder');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12 bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📒</div>
          <h1 className="text-3xl font-bold text-white">Binder</h1>
          <p className="text-gray-400 mt-1 text-sm">Find TCG trades near you</p>
        </div>

        <div className="flex bg-gray-800 rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-brand text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={set('username')}
                required
                minLength={3}
                placeholder="e.g. ash_ketchum"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              placeholder="you@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand"
            />
          </div>

          {mode === 'register' && (
            <div className="flex items-start gap-3">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand flex-shrink-0"
              />
              <label htmlFor="terms" className="text-xs text-gray-400 leading-relaxed">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand underline">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand underline">Privacy Policy</a>
              </label>
            </div>
          )}

          {error && <p className="text-red-400 text-sm bg-red-900/20 rounded-lg px-3 py-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Loading…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
