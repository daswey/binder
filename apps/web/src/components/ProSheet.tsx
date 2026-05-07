import React from 'react';

interface Props {
  onClose: () => void;
  trigger?: 'binder_limit' | 'radius' | 'alerts' | 'general';
}

const PRO_FEATURES = [
  { icon: '💎', label: 'Unlimited binder cards', free: '30 cards', pro: 'Unlimited' },
  { icon: '📍', label: 'Extended trade radius', free: 'Up to 50 km', pro: 'Up to 100 km' },
  { icon: '🔔', label: 'Price drop alerts', free: '3 alerts', pro: '50 alerts' },
  { icon: '◆', label: 'Pro badge on your profile', free: '—', pro: '✓' },
  { icon: '⚡', label: 'Priority in match feed', free: '—', pro: '✓' },
];

const TRIGGER_MESSAGES: Record<string, { title: string; body: string }> = {
  binder_limit: {
    title: 'Binder full',
    body: 'You\'ve reached the 30-card limit on the free plan. Upgrade to add unlimited cards.',
  },
  radius: {
    title: 'Expand your radius',
    body: 'Free users are limited to 50 km. Go Pro to find traders up to 100 km away.',
  },
  alerts: {
    title: 'Alert limit reached',
    body: 'Free plan allows 3 price alerts. Upgrade to monitor up to 50 cards.',
  },
  general: {
    title: 'Upgrade to Binder Pro',
    body: 'Unlock the full trading experience with a Pro subscription.',
  },
};

export function ProSheet({ onClose, trigger = 'general' }: Props) {
  const msg = TRIGGER_MESSAGES[trigger] ?? TRIGGER_MESSAGES.general;

  function openSubscribe() {
    window.open('https://binder.app/subscribe', '_blank', 'noopener,noreferrer');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="w-full bg-gray-900 rounded-t-3xl max-h-[92vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        <div className="px-5 pb-10 space-y-6">
          {/* Header */}
          <div className="text-center pt-2">
            <div className="text-4xl mb-2">◆</div>
            <h2 className="text-2xl font-bold text-amber-400">{msg.title}</h2>
            <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">{msg.body}</p>
          </div>

          {/* Feature comparison */}
          <div className="bg-gray-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 px-4 py-2 border-b border-gray-700">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Feature</span>
              <span className="text-xs text-gray-400 text-center uppercase tracking-wide">Free</span>
              <span className="text-xs text-amber-400 text-center uppercase tracking-wide font-semibold">Pro ◆</span>
            </div>
            {PRO_FEATURES.map((f, i) => (
              <div key={i} className="grid grid-cols-3 items-center px-4 py-3 border-b border-gray-700/50 last:border-0">
                <span className="text-sm text-gray-200 flex items-center gap-2">
                  <span>{f.icon}</span>
                  <span className="text-xs text-gray-300 leading-tight">{f.label}</span>
                </span>
                <span className="text-xs text-gray-500 text-center">{f.free}</span>
                <span className="text-xs text-amber-400 text-center font-semibold">{f.pro}</span>
              </div>
            ))}
          </div>

          {/* Price + CTA */}
          <div className="text-center">
            <div className="text-3xl font-bold text-white mb-1">€3.49<span className="text-base font-normal text-gray-400"> / month</span></div>
            <p className="text-xs text-gray-500 mb-4">Cancel anytime</p>
            <button
              onClick={openSubscribe}
              className="w-full py-4 rounded-2xl font-bold text-base bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors"
            >
              Upgrade to Pro ◆
            </button>
            <button
              onClick={onClose}
              className="w-full mt-3 py-3 rounded-2xl text-sm text-gray-400 hover:text-gray-200 transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
