import React from 'react';
import { useNavigate } from 'react-router-dom';

export function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-y-auto scrollbar-none">
      <div className="px-5 pt-6 pb-12 max-w-2xl mx-auto w-full">
        <button onClick={() => navigate(-1)} className="text-brand text-sm mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-500 mb-6">Last updated: 4 May 2026</p>

        {[
          {
            title: '1. Who we are',
            body: 'Binder is a peer-to-peer trading card game marketplace operated by Binder UG (haftungsbeschränkt), Germany. Contact: privacy@binder.app',
          },
          {
            title: '2. What data we collect',
            body: `We collect the following personal data when you register:
• Email address and username (required)
• Optional: city / location label and approximate GPS coordinates (used for local trade matching)
• Binder contents: cards you want and have (visible to other users for matching)
• Messages sent via the in-app chat
• Trade history and ratings
• Device information: browser/OS type, IP address (security logs only)`,
          },
          {
            title: '3. Legal basis (GDPR Art. 6)',
            body: `• Contract performance (Art. 6(1)(b)): processing your binder, matches, and messages.
• Legitimate interests (Art. 6(1)(f)): security logging, fraud prevention.
• Consent (Art. 6(1)(a)): optional analytics cookies, which you can withdraw at any time.`,
          },
          {
            title: '4. How we use your data',
            body: `• Show your binder to nearby traders for matching purposes
• Send in-app notifications about trade offers
• Calculate reputation scores from trade ratings
• Detect and prevent fraud or abuse
We do not sell your data to third parties.`,
          },
          {
            title: '5. Data sharing',
            body: `• PostgreSQL database hosted on Supabase (EU region)
• Email delivery via Postmark (GDPR DPA in place)
• Stripe for subscription billing (no card data stored by us)
• eBay.de sold comps fetched on-demand via Apify — only card name and external ID are sent, no personal data.`,
          },
          {
            title: '6. Data retention',
            body: 'Active accounts: data retained while your account is active. On account deletion: PII (email, username, bio, location) is anonymised immediately. Messages and trade history are retained for 12 months in anonymised form for dispute resolution, then hard-deleted.',
          },
          {
            title: '7. Your rights (GDPR)',
            body: `You have the right to:
• Access: request a full export of your data (Profile → My Data → Download)
• Rectification: edit your profile at any time
• Erasure: delete your account (Profile → My Data → Delete Account)
• Portability: download your data as JSON
• Restriction & objection: email privacy@binder.app
• Withdraw consent: manage cookies in Profile → My Data → Cookie Settings
• Lodge a complaint with your national supervisory authority (e.g. BfDI for Germany)`,
          },
          {
            title: '8. Cookies',
            body: 'We use one essential cookie (authentication JWT stored in localStorage) and optional anonymous analytics. You can manage this in the cookie banner or under Profile → My Data.',
          },
          {
            title: '9. Changes',
            body: 'We will notify you of material changes via an in-app notification. Continued use after 30 days constitutes acceptance.',
          },
          {
            title: '10. Contact',
            body: 'Data protection officer: privacy@binder.app. Postal: Binder UG, c/o Data Protection, Germany.',
          },
        ].map(({ title, body }) => (
          <div key={title} className="mb-6">
            <h2 className="text-base font-semibold text-white mb-2">{title}</h2>
            <p className="text-sm text-gray-400 whitespace-pre-line leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
