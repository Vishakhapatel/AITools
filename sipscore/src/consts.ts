// ─────────────────────────────────────────────────────────────
// KitnaSIP — site-wide configuration. Swap the placeholders below
// (affiliate link, author identity, domain) when you have them.
// The 0–100 readiness gauge is still called the "SIPscore" (a feature).
// ─────────────────────────────────────────────────────────────

export const SITE = {
  name: 'KitnaSIP',
  // Live domain. Used for canonical URLs, sitemap.xml and robots.txt.
  // Apex (no www); keep the https and no trailing slash.
  url: 'https://kitnasip.in',
  title: 'KitnaSIP — how much SIP do you need, and can you afford it?',
  description:
    'A free SIP calculator for Indian salaried investors. It works out the monthly SIP your goal needs, checks it against what you can actually afford, and shows the trade-offs to close the gap. Inflation-adjusted, honest, no signup.',
  locale: 'en_IN',
};

// Google Analytics (carried over from the existing site).
export const GA_ID = 'G-91M1WCZ96S';

// ── Affiliate (flat per-account CPA only — never share-of-brokerage) ──
// Single constant so the real link drops in here later. Until it's a real
// URL, the CTA renders in a disabled "coming soon" state.
export const AFFILIATE = {
  url: '#', // TODO: paste your flat-CPA broker affiliate link here.
  broker: 'a partner broker', // e.g. 'Angel One' once you pick one.
  cta: 'Open a demat account to start investing',
  // Honest sub-line, no fake urgency.
  note: 'We may earn a fixed referral fee if you open an account — it never changes what you pay or what you see here.',
};
export const AFFILIATE_READY = AFFILIATE.url !== '#';

// ── Display ads (Google AdSense) ──
export const ADSENSE = { client: 'ca-pub-8031434253913892' };
// The AdSense script goes in <head> as soon as a real publisher id is set — this is
// what lets Google verify and review the site, and (with Auto ads on in the dashboard)
// serve ads after approval.
export const ADSENSE_ENABLED = /^ca-pub-\d+$/.test(ADSENSE.client);
// Separately gates the manual in-article ad units. Keep false until approved so there
// are no blank "Advertisement" boxes during the review.
export const ADSENSE_READY = false;

// ── Author identity (a byline is a small SEO/trust signal) ──
// Anonymous brand byline + an illustrated brand avatar (public/author.svg).
export const AUTHOR = {
  name: 'KitnaSIP Team',
  bio: 'breaks down money for salaried folks who were never taught this stuff, minus the jargon and the fund tips.',
  photo: '/author.svg',
};

// ── Email capture (MailerLite) ──
// Account script goes in <head> site-wide (like GA). The embedded form itself
// (EMAIL_FORM_ID below) renders inside the result page — set once you've built
// the form in MailerLite and copied its data-form id from the embed snippet.
export const MAILERLITE_ACCOUNT_ID = '2531194';
export const EMAIL_FORM_ID = ''; // TODO: paste the embedded form's data-form id
export const EMAIL_READY = EMAIL_FORM_ID !== '';

// Primary navigation.
export const NAV = [
  { label: 'Calculator', href: '/#tool' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];
