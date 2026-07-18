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

// ── Author identity (§5 — a named byline is an SEO ranking signal) ──
// TODO: replace with your real name, one-line bio and a photo at
// public/author.jpg. Finance content ranks far worse when anonymous.
export const AUTHOR = {
  name: 'Vishakha Patel',
  // Pick your favourite from the options Claude suggested (or send your own).
  bio: 'breaks down money for salaried folks who were never taught this stuff, minus the jargon and the fund tips.',
  photo: '/author.jpg', // optional — add this file to /public to show a headshot
};

// Primary navigation.
export const NAV = [
  { label: 'Calculator', href: '/#tool' },
  { label: 'Blog', href: '/blog' },
  { label: 'About', href: '/about' },
];
