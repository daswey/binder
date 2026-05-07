import React, { useState, useEffect } from 'react';

const CONSENT_KEY = 'binder_cookie_consent';

type ConsentState = 'all' | 'essential' | null;

export function useCookieConsent() {
  const [consent, setConsent] = useState<ConsentState>(() => {
    return (localStorage.getItem(CONSENT_KEY) as ConsentState) ?? null;
  });

  function accept(type: 'all' | 'essential') {
    localStorage.setItem(CONSENT_KEY, type);
    setConsent(type);
  }

  return { consent, accept };
}

export function CookieBanner() {
  const { consent, accept } = useCookieConsent();
  const [showManage, setShowManage] = useState(false);

  if (consent !== null) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 shadow-2xl max-w-md mx-auto">
        {!showManage ? (
          <>
            <p className="text-sm text-gray-200 mb-1 font-semibold">We use cookies</p>
            <p className="text-xs text-gray-400 mb-3">
              Essential cookies keep the app working. Optional cookies help us improve Binder.{' '}
              <a href="/privacy" className="text-brand underline">Privacy policy</a>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => accept('all')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors"
              >
                Accept all
              </button>
              <button
                onClick={() => setShowManage(true)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Manage
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-200 mb-3 font-semibold">Cookie preferences</p>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between bg-gray-700 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm text-white">Essential</p>
                  <p className="text-xs text-gray-400">Authentication, session, security</p>
                </div>
                <span className="text-xs text-gray-500 bg-gray-600 px-2 py-1 rounded-full">Required</span>
              </div>
              <div className="flex items-center justify-between bg-gray-700 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm text-white">Analytics</p>
                  <p className="text-xs text-gray-400">Anonymous usage data to improve the app</p>
                </div>
                <span className="text-xs text-gray-500 bg-gray-600 px-2 py-1 rounded-full">Optional</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => accept('essential')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Essential only
              </button>
              <button
                onClick={() => accept('all')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-dark transition-colors"
              >
                Accept all
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
