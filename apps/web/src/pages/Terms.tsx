import React from 'react';
import { useNavigate } from 'react-router-dom';

export function TermsPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-y-auto scrollbar-none">
      <div className="px-5 pt-6 pb-12 max-w-2xl mx-auto w-full">
        <button onClick={() => navigate(-1)} className="text-brand text-sm mb-4">← Back</button>
        <h1 className="text-2xl font-bold text-white mb-1">Terms of Service</h1>
        <p className="text-xs text-gray-500 mb-6">Last updated: 4 May 2026</p>

        {[
          {
            title: '1. Acceptance',
            body: 'By creating an account you agree to these Terms. If you are under 16, you need parental consent.',
          },
          {
            title: '2. What Binder is',
            body: 'Binder is a platform for peer-to-peer trading card game (TCG) collectors to find and arrange local card trades. Binder facilitates introductions; the actual trade happens between users in person. Binder is not a party to any trade.',
          },
          {
            title: '3. Accounts',
            body: `• You must be 16 or older.
• One account per person.
• You are responsible for keeping your credentials secure.
• We may suspend accounts that violate these Terms.`,
          },
          {
            title: '4. Acceptable use',
            body: `You agree not to:
• List counterfeit, stolen, or proxied cards
• Use the platform for commercial bulk selling without disclosure
• Harass, spam, or threaten other users
• Attempt to circumvent rate limits or access controls
• Scrape or bulk-download card data for commercial use`,
          },
          {
            title: '5. Card listings',
            body: 'You represent that you own (or have the right to trade) any card you list as "have". Binder reserves the right to remove listings that appear fraudulent.',
          },
          {
            title: '6. Binder Pro',
            body: `Binder Pro is a monthly subscription at €3.49/month (prices may change with 30 days notice).
• Payment is processed by Stripe. We do not store card details.
• Subscriptions auto-renew unless cancelled at least 24 hours before renewal.
• Refunds are at our discretion; contact support@binder.app within 14 days of charge.`,
          },
          {
            title: '7. Content',
            body: 'You retain ownership of content you post. You grant Binder a non-exclusive licence to display it to facilitate trades. We may remove content that violates these Terms.',
          },
          {
            title: '8. Ratings & reputation',
            body: 'Trade ratings must be honest and based on actual trade experience. False or retaliatory ratings may be removed.',
          },
          {
            title: '9. Limitation of liability',
            body: 'Binder is provided "as is". We are not liable for the outcome of trades between users, including items not received or disputes. Our total liability is limited to the subscription fees paid in the prior 3 months.',
          },
          {
            title: '10. Governing law',
            body: 'These Terms are governed by German law. The place of jurisdiction is Germany, to the extent permitted by law.',
          },
          {
            title: '11. Changes',
            body: 'We may update these Terms. We will notify you in-app 30 days before material changes take effect.',
          },
          {
            title: '12. Contact',
            body: 'Questions? Email legal@binder.app.',
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
