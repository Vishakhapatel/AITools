// ─────────────────────────────────────────────────────────────
// SIPscore — affordability + trade-off engine (pure functions)
//
// All returns/step-ups are ASSUMPTIONS, not promises. Every number
// this file produces is illustrative. Nothing here names a fund or
// gives buy/sell advice — see the legal constraints in the brief.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_STEP_UP = 0.10; // 10% annual SIP step-up
export const DEFAULT_INFLATION = 0.06; // 6% India avg
export const COMFORT_RATIO = 0.70; // default share of surplus we'd earmark

// Expected annual return keyed to risk behaviour + experience.
// Labelled as an assumption everywhere it surfaces in the UI.
export function expectedReturn(riskBehavior, experience) {
  if (riskBehavior === 'buyDip' && experience === 'over2') {
    return { r: 0.12, profile: 'Aggressive' };
  }
  if (riskBehavior === 'panicSell' || experience === 'none') {
    return { r: 0.09, profile: 'Conservative' };
  }
  return { r: 0.11, profile: 'Moderate' };
}

export function monthlyRate(r) {
  return Math.pow(1 + r, 1 / 12) - 1;
}

export function inflate(todayValue, inflation, years) {
  return todayValue * Math.pow(1 + inflation, years);
}

// Month-by-month forward-value simulator. Handles step-up SIP +
// starting lumpsum cleanly without fragile closed-form formulas.
export function simulateFV(startSIP, stepUp, rm, N, lumpsum) {
  let balance = lumpsum;
  for (let t = 1; t <= N; t++) {
    const yearIndex = Math.floor((t - 1) / 12);
    const monthlySIP = startSIP * Math.pow(1 + stepUp, yearIndex);
    balance = balance * (1 + rm) + monthlySIP;
  }
  return balance;
}

// Total rupees actually put in (contributions + starting lumpsum), no growth.
export function investedTotal(startSIP, stepUp, N, lumpsum) {
  let invested = lumpsum;
  for (let t = 1; t <= N; t++) {
    invested += startSIP * Math.pow(1 + stepUp, Math.floor((t - 1) / 12));
  }
  return invested;
}

// Required starting SIP for a given horizon (FV is linear in the SIP).
export function requiredSIPFor({ goalFuture, stepUp, rm, years, existing }) {
  const fvLumpsumOnly = simulateFV(0, stepUp, rm, years * 12, existing);
  const fvPerUnitSIP = simulateFV(1, stepUp, rm, years * 12, 0);
  const needed = goalFuture - fvLumpsumOnly;
  return needed <= 0 ? 0 : needed / fvPerUnitSIP;
}

// Yearly trajectory for the growth chart: invested vs projected value.
export function corpusSeries({ startSIP, stepUp, rm, years, lumpsum }) {
  const points = [];
  for (let y = 0; y <= years; y++) {
    points.push({
      year: y,
      corpus: simulateFV(startSIP, stepUp, rm, y * 12, lumpsum),
      invested: investedTotal(startSIP, stepUp, y * 12, lumpsum),
    });
  }
  return points;
}

// ── Trade-off levers ────────────────────────────────────────────
export function leverExtendTimeline({ comfortSurplus, stepUp, rm, existing, goalToday, inflation, startYears }) {
  const MAX_YEARS = 60;
  for (let y = startYears; y <= MAX_YEARS; y++) {
    const goalFuture = inflate(goalToday, inflation, y);
    if (simulateFV(comfortSurplus, stepUp, rm, y * 12, existing) >= goalFuture) {
      return { years: y, added: y - startYears };
    }
  }
  return null;
}

export function leverLowerGoal({ comfortSurplus, stepUp, rm, N, existing, inflation, years }) {
  const maxFuture = simulateFV(comfortSurplus, stepUp, rm, N, existing);
  const maxGoalToday = maxFuture / Math.pow(1 + inflation, years);
  return { maxGoalToday, maxFuture };
}

export function leverSteeperStepUp({ comfortSurplus, rm, N, existing, goalFuture, startStepUp = 0 }) {
  const MAX_STEP_UP = 0.40;
  // Always propose something faster than the user's current step-up.
  const from = Math.round((Math.max(0, startStepUp) + 0.01) * 100) / 100;
  for (let s = from; s <= MAX_STEP_UP + 1e-9; s += 0.01) {
    if (simulateFV(comfortSurplus, s, rm, N, existing) >= goalFuture) {
      return { stepUp: Math.round(s * 100) / 100, aggressive: s > 0.15 };
    }
  }
  return null;
}

// ── The full plan ───────────────────────────────────────────────
export function computePlan(input) {
  const {
    income, expenses, existing = 0,
    goalToday, years, inflation = DEFAULT_INFLATION,
    riskBehavior, experience, stability = 'moderate',
    stepUp = DEFAULT_STEP_UP,
    capacity = null, // user-stated monthly amount they can invest (overrides the 70% default)
    rOverride = null,
  } = input;

  const base = expectedReturn(riskBehavior, experience);
  const r = rOverride ?? base.r;
  const profile = base.profile;
  const rm = monthlyRate(r);
  const N = years * 12;

  const goalFuture = inflate(goalToday, inflation, years);
  const fvLumpsumOnly = simulateFV(0, stepUp, rm, N, existing);
  const fvPerUnitSIP = simulateFV(1, stepUp, rm, N, 0);

  const neededFromSIP = goalFuture - fvLumpsumOnly;
  const requiredSIP = neededFromSIP <= 0 ? 0 : neededFromSIP / fvPerUnitSIP;

  const surplus = income - expenses;

  // The amount we treat as "comfortably investable": the user's stated
  // capacity if they gave one, otherwise 70% of surplus. Never above surplus.
  const capacityProvided = capacity != null && capacity > 0;
  let comfortSurplus;
  if (surplus <= 0) comfortSurplus = COMFORT_RATIO * surplus; // negative; band handles it
  else if (capacityProvided) comfortSurplus = Math.min(capacity, surplus);
  else comfortSurplus = COMFORT_RATIO * surplus;
  const capacityExceedsSurplus = capacityProvided && capacity > surplus;

  const gap = requiredSIP - surplus; // short even if you invested your ENTIRE surplus
  // The gap that actually matters to the user: required minus what they can invest
  // (their stated capacity, or 70% of surplus). This is what the UI shows.
  const affordGap = requiredSIP > 0 ? Math.max(0, requiredSIP - comfortSurplus) : 0;

  let band;
  if (surplus <= 0) band = 'noSurplus';
  else if (requiredSIP === 0) band = 'alreadyThere';
  else if (requiredSIP <= comfortSurplus) band = 'comfortable';
  else if (requiredSIP <= surplus) band = 'tight';
  else band = 'notAffordable';

  // What the recommended (required) SIP actually costs and grows to.
  const projectedCorpus = simulateFV(requiredSIP, stepUp, rm, N, existing);
  const totalInvested = investedTotal(requiredSIP, stepUp, N, existing);
  const wealthGained = projectedCorpus - totalInvested;

  // SIPscore — an honest, tunable readiness heuristic (not science).
  const affordability = requiredSIP === 0 ? 1 : Math.min(1, comfortSurplus / requiredSIP);
  const headStart = goalFuture > 0 ? Math.min(1, fvLumpsumOnly / goalFuture) : 1;
  const timeFactor = Math.min(1, years / 15);
  const disciplineFactor = stability === 'stable' ? 1 : stability === 'moderate' ? 0.7 : 0.4;
  const sipScore = Math.round(
    100 * (0.5 * affordability + 0.2 * headStart + 0.15 * timeFactor + 0.15 * disciplineFactor)
  );

  let scoreBand;
  if (sipScore >= 80) scoreBand = 'On track';
  else if (sipScore >= 60) scoreBand = 'Close';
  else if (sipScore >= 40) scoreBand = 'A stretch';
  else scoreBand = 'Needs a rethink';

  // Trade-off levers — only when the goal isn't already comfortable.
  let levers = null;
  if (surplus > 0 && requiredSIP > comfortSurplus) {
    levers = {
      extend: leverExtendTimeline({ comfortSurplus, stepUp, rm, existing, goalToday, inflation, startYears: years }),
      lower: leverLowerGoal({ comfortSurplus, stepUp, rm, N, existing, inflation, years }),
      steeper: leverSteeperStepUp({ comfortSurplus, rm, N, existing, goalFuture, startStepUp: stepUp }),
      incomeGap: { requiredSIP, gap: Math.max(0, gap), comfortGap: Math.max(0, requiredSIP - comfortSurplus) },
    };
  }

  // Cost of delay — same goal, same deadline, started a few years later.
  let costOfDelay = null;
  if (requiredSIP > 0 && years >= 5) {
    const delay = Math.min(3, years - 1);
    const later = requiredSIPFor({ goalFuture, stepUp, rm, years: years - delay, existing });
    costOfDelay = { delay, requiredLater: later, extra: Math.max(0, later - requiredSIP) };
  }

  const shortHorizonAggressive = years < 5 && profile === 'Aggressive';

  return {
    r, profile, rm, stepUp, inflation, years, N, overridden: rOverride != null,
    goalToday, goalFuture, fvLumpsumOnly, fvPerUnitSIP,
    requiredSIP, surplus, comfortSurplus, capacityProvided, capacityExceedsSurplus, gap, affordGap,
    projectedCorpus, totalInvested, wealthGained,
    band, sipScore, scoreBand, levers, costOfDelay, shortHorizonAggressive,
  };
}

// Fund CATEGORIES only — never named funds. Educational strings.
export function fundCategories(profile) {
  if (profile === 'Conservative') {
    return [
      ['Large-cap index funds', 'Track the top listed companies — lower volatility, low cost.'],
      ['Balanced advantage / hybrid', 'Automatically shift between equity and debt as markets move.'],
      ['Short-duration debt', 'For any portion of the goal that is under ~5 years away.'],
    ];
  }
  if (profile === 'Moderate') {
    return [
      ['Flexi-cap funds', 'Diversified across large, mid and small companies in one fund.'],
      ['Large-cap index funds', 'A low-cost core that anchors the portfolio.'],
      ['ELSS (only if old tax regime)', 'Equity funds with an 80C tax deduction and a 3-year lock-in.'],
    ];
  }
  return [
    ['Flexi-cap funds', 'A diversified equity core across market caps.'],
    ['Mid-cap funds', 'Higher growth potential over 10+ years, with bigger swings.'],
    ['Small-cap funds', 'Highest growth potential — needs patience and a long horizon.'],
  ];
}
