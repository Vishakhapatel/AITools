// ─────────────────────────────────────────────────────────────
// SIPscore — client controller. Wires the 3-step form, validates
// input, renders the affordability + trade-off result, the growth
// chart and the live sliders. No named funds, no advice.
// ─────────────────────────────────────────────────────────────
import { computePlan, fundCategories, simulateFV, inflate, corpusSeries } from '../lib/sipmath.js';
import { AFFILIATE, AFFILIATE_READY } from '../consts';

const $ = (id) => document.getElementById(id);

// ── number formatting (Indian grouping) ──
const fmt = (n) => {
  const abs = Math.abs(Math.round(n));
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return sign + '₹' + (abs / 1e7).toFixed(2) + ' Cr';
  if (abs >= 1e5) return sign + '₹' + (abs / 1e5).toFixed(2) + ' L';
  return sign + '₹' + abs.toLocaleString('en-IN');
};
function groupIndian(digits) {
  digits = digits.replace(/^0+(?=\d)/, '');
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return rest + ',' + last3;
}
const parseMoney = (id) => {
  const raw = ($(id)?.value || '').replace(/[^\d]/g, '');
  return raw === '' ? NaN : parseInt(raw, 10);
};
const numField = (id, fallback) => {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? v : fallback;
};

// ── state ──
let currentStep = 1;
let plan = null;
let ctx = null;

// ── stepper ──
function showStep(n) {
  $('view' + currentStep).classList.remove('active');
  $('sc' + currentStep).classList.remove('active');
  if (n > currentStep) $('sc' + currentStep).classList.add('done');
  currentStep = n;
  $('view' + n).classList.add('active');
  $('sc' + n).classList.add('active');
  $('tool').scrollIntoView({ behavior: 'smooth' });
}

// ── validation ──
function setError(id, msg) {
  const box = $('err-' + id);
  const group = $(id)?.closest('.form-group');
  if (box) box.textContent = msg || '';
  if (group) group.classList.toggle('error', !!msg);
  return !msg;
}
function validateStep(step) {
  let ok = true;
  if (step === 1) {
    const income = parseMoney('income');
    const expenses = parseMoney('expenses');
    ok = setError('income', !Number.isFinite(income) || income <= 0 ? 'Enter your monthly take-home.' : '') && ok;
    ok = setError('expenses', !Number.isFinite(expenses) ? 'Enter your monthly expenses.' : '') && ok;
    // capacity is optional and never blocks — the engine caps it at surplus,
    // and the surplus banner already shows what we'll actually invest.
    setError('capacity', '');
  }
  if (step === 2) {
    const target = parseMoney('target');
    const years = numField('years', NaN);
    ok = setError('target', !Number.isFinite(target) || target <= 0 ? 'Enter your goal amount.' : '') && ok;
    ok = setError('years', !Number.isFinite(years) || years < 1 || years > 40 ? 'Enter a horizon between 1 and 40 years.' : '') && ok;
  }
  return ok;
}

// ── live surplus banner (step 1) ──
function updateSurplus() {
  const income = parseMoney('income');
  const expenses = parseMoney('expenses');
  const capacity = parseMoney('capacity');
  const el = $('surplusBanner');
  if (!Number.isFinite(income) || !Number.isFinite(expenses)) { el.className = 'surplus-banner'; el.innerHTML = ''; return; }
  const surplus = income - expenses;
  if (surplus <= 0) {
    el.className = 'surplus-banner warn';
    el.innerHTML = `Your expenses currently use up all your income — there's no surplus to invest yet.`;
    return;
  }
  const invest = Number.isFinite(capacity) && capacity > 0 ? Math.min(capacity, surplus) : Math.round(0.7 * surplus);
  const how = Number.isFinite(capacity) && capacity > 0 ? 'you told us you can invest' : "we'll earmark 70% of it";
  el.className = 'surplus-banner ok';
  el.innerHTML = `Monthly surplus: <strong>${fmt(surplus)}</strong> · ${how} <strong>${fmt(invest)}/mo</strong>`;
}

// ── chip selection ──
function selectChip(el) {
  const group = el.dataset.group;
  document.querySelectorAll(`.chip[data-group="${group}"]`).forEach((c) => c.classList.remove('active'));
  el.classList.add('active');
}
const chipValue = (group) => document.querySelector(`.chip[data-group="${group}"].active`)?.dataset.value;

// ── read all inputs ──
function readInputs() {
  const capacity = parseMoney('capacity');
  // Expected return is optional: blank → assume one from the risk profile (engine default).
  const rr = parseFloat($('expreturn').value);
  return {
    income: parseMoney('income') || 0,
    expenses: parseMoney('expenses') || 0,
    existing: parseMoney('lumpsum') || 0,
    capacity: Number.isFinite(capacity) ? capacity : null,
    stability: $('stability').value,
    taxRegime: $('tax').value,
    goalType: $('goal').value,
    goalToday: parseMoney('target') || 0,
    years: Math.max(1, Math.round(numField('years', 20))),
    inflation: numField('inflation', 6) / 100,
    stepUp: Math.max(0, numField('stepup', 0)) / 100, // user-controlled; 0 = flat SIP
    returnRate: Number.isFinite(rr) ? rr / 100 : null, // null → derive from profile
    riskBehavior: chipValue('rc'),
    experience: chipValue('ec'),
  };
}

// ── main ──
function calculate(rOverride = null) {
  if (!validateStep(1)) { showStep(1); return; }
  if (!validateStep(2)) { showStep(2); return; }
  const input = readInputs();
  // Precedence: an explicit recalc arg (the 8% short-horizon reset) > the user's typed return > profile-derived.
  const effReturn = rOverride != null ? rOverride : input.returnRate;
  plan = computePlan({ ...input, rOverride: effReturn });
  ctx = { existing: input.existing, inflation: input.inflation, rm: plan.rm, taxRegime: input.taxRegime, userReturn: input.returnRate != null };
  renderHeadline();
  renderNumbers();
  renderChart();
  renderGauge();
  renderTradeoff();
  renderCategories();
  renderAffiliate();
  renderAssumptions();
  showStep(4);
}

// 1 ── headline
function renderHeadline() {
  const el = $('headlineVerdict');
  el.className = 'headline-verdict ' + plan.band;
  const p = plan;
  let h = '', sub = '';
  switch (p.band) {
    case 'noSurplus':
      h = 'Right now, your expenses use up all your income.';
      sub = "The first goal isn't picking a SIP — it's freeing up some monthly surplus to invest. Come back once there's a gap between what you earn and what you spend.";
      break;
    case 'alreadyThere':
      h = "You're already on track — your existing investments alone should reach this goal.";
      sub = 'You may not need a new SIP at all. A small maintenance SIP would simply add a cushion on top.';
      break;
    case 'comfortable':
      h = `You can reach this comfortably: about ${fmt(p.requiredSIP)}/month gets you there, with room to spare.`;
      sub = `That sits within the ${fmt(p.comfortSurplus)}/month you can comfortably invest, leaving a buffer for other goals.`;
      break;
    case 'tight':
      h = `Doable, but it needs a bit more than you'd comfortably invest — here's the honest picture.`;
      sub = `This needs ${fmt(p.requiredSIP)}/month versus the ${fmt(p.comfortSurplus)} you can comfortably invest — within your ${fmt(p.surplus)} total surplus if you stretch, but tight. The levers below show gentler paths.`;
      break;
    case 'notAffordable':
      h = `This goal isn't affordable yet — you're short by about ${fmt(p.affordGap)}/month.`;
      sub = `It needs ${fmt(p.requiredSIP)}/month, but you can invest ${fmt(p.comfortSurplus)}. That's normal for a big goal — the levers below show how to close the gap.`;
      break;
  }
  el.innerHTML = `<h2>${h}</h2><p class="hv-sub">${sub}</p>`;
}

// 2 ── numbers block
const metric = (label, value, sub, color = '') =>
  `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value"${color ? ` style="color:${color}"` : ''}>${value}</div><div class="metric-sub">${sub}</div></div>`;
const metricHero = (label, value, sub) =>
  `<div class="metric hero"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;
const metricTip = (label, value, sub, tip) =>
  `<div class="metric"><div class="metric-label">${label}<span class="tooltip" data-tip="${tip.replace(/"/g, '&quot;')}">?</span></div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div></div>`;

function renderNumbers() {
  const p = plan;
  const wrap = $('numbersBlock');
  if (p.band === 'noSurplus') {
    const inp = readInputs();
    wrap.innerHTML = `<div class="numbers-grid">
      ${metric('Monthly income', fmt(inp.income), 'take-home')}
      ${metric('Monthly expenses', fmt(inp.expenses), 'everything you spend')}
      ${metric('Surplus', fmt(p.surplus), 'nothing to invest yet', 'var(--danger)')}
    </div>`;
    return;
  }
  const sipCell = p.requiredSIP === 0
    ? metricHero('Required SIP', '₹0', 'existing investments cover it')
    : metricHero('Required SIP', fmt(p.requiredSIP) + '<span class="per">/mo</span>', `to reach the goal in ${p.years} years`);
  const returnTip = ctx.userReturn
    ? `You set the expected return to ${(p.r * 100).toFixed(0)}% a year — your own assumption, shown for illustration only. Real returns vary and are never guaranteed. (Your ${p.profile.toLowerCase()} profile still guides the fund categories below.)`
    : `We assume ${(p.r * 100).toFixed(0)}% a year for a ${p.profile.toLowerCase()} profile${p.overridden ? ' (recalculated at a conservative rate)' : ''}. It's an assumption for illustration — real returns vary and are never guaranteed.`;
  const returnSub = ctx.userReturn ? 'your input' : p.profile.toLowerCase() + ' profile';

  wrap.innerHTML = `
    <div class="numbers-grid">
      <div class="big">${sipCell}</div>
      ${metric('You can invest', fmt(p.comfortSurplus) + '/mo', p.capacityProvided ? 'the amount you entered' : '70% of your surplus')}
      ${p.affordGap > 0
        ? metric('The monthly gap', fmt(p.affordGap) + '/mo', 'beyond what you can invest', 'var(--warning)')
        : metric('Buffer left', fmt(Math.max(0, p.comfortSurplus - p.requiredSIP)) + '/mo', 'of what you can invest', 'var(--success)')}
      ${metricTip('Real target', fmt(p.goalFuture), `${fmt(p.goalToday)} today, +inflation`, `Your ${fmt(p.goalToday)} in today's money, grown at ${(p.inflation * 100).toFixed(1)}% inflation over ${p.years} years.`)}
      ${metric('You would invest', fmt(p.totalInvested), 'total, over the years')}
      ${metric('Growth on top', fmt(p.wealthGained), 'from compounding', 'var(--success)')}
      ${metricTip('Return assumption', (p.r * 100).toFixed(0) + '%', returnSub, returnTip)}
    </div>
    ${p.costOfDelay && p.costOfDelay.extra > 0
      ? `<div class="delay-note">⏳ <strong>Cost of waiting:</strong> start ${p.costOfDelay.delay} year${p.costOfDelay.delay > 1 ? 's' : ''} later and this rises to <strong>${fmt(p.costOfDelay.requiredLater)}/mo</strong> — about ${fmt(p.costOfDelay.extra)}/mo more, for the same goal by the same date.</div>`
      : ''}`;
}

// 3 ── growth chart (SVG)
function renderChart() {
  const p = plan;
  const wrap = $('chartWrap');
  if (p.band === 'noSurplus') { wrap.innerHTML = ''; return; }
  const series = corpusSeries({ startSIP: p.requiredSIP, stepUp: p.stepUp, rm: p.rm, years: p.years, lumpsum: ctx.existing });
  const W = 640, H = 300, padL = 58, padR = 20, padT = 20, padB = 34;
  const maxY = Math.max(p.goalFuture, series[series.length - 1].corpus) * 1.08;
  const x = (yr) => padL + (yr / p.years) * (W - padL - padR);
  const y = (v) => H - padB - (v / maxY) * (H - padT - padB);

  const corpusPts = series.map((s) => `${x(s.year).toFixed(1)},${y(s.corpus).toFixed(1)}`).join(' ');
  const investPts = series.map((s) => `${x(s.year).toFixed(1)},${y(s.invested).toFixed(1)}`).join(' ');
  const area = `${padL},${(H - padB).toFixed(1)} ${corpusPts} ${x(p.years).toFixed(1)},${(H - padB).toFixed(1)}`;

  // gridlines / y labels
  const ticks = 4;
  let grid = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (maxY / ticks) * i;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--border)" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${(+yy + 4).toFixed(1)}" text-anchor="end" class="cx-axis">${fmt(v)}</text>`;
  }
  // x labels
  const xlabels = [0, Math.round(p.years / 2), p.years]
    .map((yr) => `<text x="${x(yr).toFixed(1)}" y="${H - padB + 20}" text-anchor="middle" class="cx-axis">${yr}y</text>`).join('');
  const targetY = y(p.goalFuture).toFixed(1);

  wrap.innerHTML = `
    <div class="card chart-card">
      <h2 class="card-title">Projected growth${p.requiredSIP > 0 ? ` of a ${fmt(p.requiredSIP)}/mo SIP` : ''}</h2>
      <svg viewBox="0 0 ${W} ${H}" class="growth-chart" role="img" aria-label="Projected corpus growth vs amount invested">
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        ${grid}
        <polygon points="${area}" fill="url(#cg)"/>
        <polyline points="${investPts}" fill="none" stroke="var(--text-tertiary)" stroke-width="2" stroke-dasharray="5 4"/>
        <polyline points="${corpusPts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
        <line x1="${padL}" y1="${targetY}" x2="${W - padR}" y2="${targetY}" stroke="var(--success)" stroke-width="1.5" stroke-dasharray="2 3"/>
        <text x="${W - padR}" y="${(+targetY - 6).toFixed(1)}" text-anchor="end" class="cx-target">Target ${fmt(p.goalFuture)}</text>
        ${xlabels}
      </svg>
      <div class="chart-legend">
        <span><i class="sw sw-corpus"></i> Projected value</span>
        <span><i class="sw sw-invest"></i> Amount invested</span>
        <span><i class="sw sw-target"></i> Inflation-adjusted target</span>
      </div>
    </div>`;
}

// 4 ── gauge
function renderGauge() {
  const p = plan;
  const R = 60, C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, p.sipScore)) / 100;
  const color = p.sipScore >= 80 ? 'var(--success)' : p.sipScore >= 60 ? 'var(--accent)' : p.sipScore >= 40 ? 'var(--warning)' : 'var(--danger)';
  const blurb = {
    'On track': 'Your fundamentals line up — affordability, timeline and discipline all work in your favour.',
    'Close': 'Nearly there. Small tweaks — a little more time or surplus — lock this in.',
    'A stretch': 'There are real gaps. The goal is steep relative to what you can set aside today.',
    'Needs a rethink': 'The plan needs reshaping — the levers below are the place to start.',
  }[p.scoreBand];
  $('gaugeWrap').innerHTML = `
    <div class="card">
      <div class="gauge-wrap">
        <div class="gauge">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--border)" stroke-width="10"/>
            <circle cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}"/>
          </svg>
          <div class="gauge-num"><strong style="color:${color}">${p.sipScore}</strong><span>SIPscore</span></div>
        </div>
        <div class="gauge-text">
          <div class="band">${p.scoreBand}</div>
          <p>${blurb}</p>
          <p class="fine">A readiness heuristic, not a guarantee — it blends affordability, head start, timeline and income stability.</p>
        </div>
      </div>
    </div>`;
}

// 5 ── trade-off engine
const lever = (tag, title, body, flag = false) =>
  `<div class="lever ${flag ? 'flag' : ''}"><div class="lever-tag">${tag}</div><div class="lever-title">${title}</div><div class="lever-body">${body}</div></div>`;

function renderTradeoff() {
  const p = plan;
  const wrap = $('tradeoff');
  let warnHtml = '';
  if (p.shortHorizonAggressive && !p.overridden) {
    warnHtml = `<div class="verdict warning">Over just ${p.years} years, equity returns swing a lot — a ${(p.r * 100).toFixed(0)}% assumption can be optimistic for such a short horizon.
      <button class="btn btn-secondary recalc-btn" id="recalc8">Recompute at a conservative 8%</button></div>`;
  }
  const attachRecalc = () => { if (p.shortHorizonAggressive) $('recalc8')?.addEventListener('click', () => calculate(0.08)); };

  if (p.band === 'noSurplus') {
    wrap.innerHTML = warnHtml + `<div class="verdict danger">There's no monthly surplus to model trade-offs on yet. Once your income exceeds your expenses, come back and this section will show exactly what's reachable.</div>`;
    attachRecalc();
    return;
  }
  if (p.band === 'alreadyThere' || p.band === 'comfortable') {
    wrap.innerHTML = warnHtml + sandboxHtml();
    wireSliders();
    attachRecalc();
    return;
  }

  const L = p.levers || {};
  const cards = [];
  cards.push(L.extend
    ? lever('Lever A', 'Give it more time', L.extend.added === 0
        ? 'Your current timeline already works at the affordable amount.'
        : `Stretch the horizon to <strong>${L.extend.years} years</strong> (${L.extend.added} more) and ${fmt(p.comfortSurplus)}/month gets you there.`)
    : lever('Lever A', 'Give it more time', `Even over a very long horizon, ${fmt(p.comfortSurplus)}/month doesn't reach this target — time alone won't close it.`));
  if (L.lower) cards.push(lever('Lever B', 'Aim a little lower', `With ${fmt(p.comfortSurplus)}/month you'd comfortably reach <strong>${fmt(L.lower.maxGoalToday)}</strong> (in today's money) instead of ${fmt(p.goalToday)}.`));
  cards.push(L.steeper
    ? lever('Lever C', 'Step up faster', `Increasing your SIP <strong>${Math.round(L.steeper.stepUp * 100)}% a year</strong> (instead of ${Math.round(p.stepUp * 100)}%) reaches it at ${fmt(p.comfortSurplus)}/month.${L.steeper.aggressive ? ' That assumes fast salary growth — treat it as a stretch.' : ''}`, L.steeper.aggressive)
    : lever('Lever C', 'Step up faster', `Even a steep annual step-up doesn't bridge the gap at ${fmt(p.comfortSurplus)}/month alone.`));
  if (L.incomeGap) cards.push(lever('Lever D', 'Close the income gap', `You'd need about <strong>${fmt(L.incomeGap.comfortGap)}/month</strong> more to invest — from a raise, side income, or trimming expenses — to fund this comfortably.`));

  wrap.innerHTML = `
    <div class="card">
      <h2 class="card-title">Your trade-off levers</h2>
      ${warnHtml}
      <p class="lead">A big goal is normal. Each lever is a real, honest way to close the gap — pull one, or mix them.</p>
      <div class="levers-grid">${cards.join('')}</div>
    </div>
    ${sandboxHtml()}`;
  wireSliders();
  attachRecalc();
}

// Pick the single most sensible lever to close the gap, plus the slider target that applies it.
// Priority favours the least-painful realistic moves: a little more time, then a modest step-up,
// then more time, then a steeper step-up, then investing more, and only lastly trimming the goal.
function suggestLever(p) {
  const L = p.levers;
  if (!L) return null; // goal already affordable at what they can invest — nothing to suggest
  const s = (n) => (n > 1 ? 's' : '');
  const baseStep = Math.round(p.stepUp * 100);

  const extend = (L.extend && L.extend.added > 0 && L.extend.years <= 40)
    ? { set: { years: L.extend.years }, added: L.extend.added,
        desc: `Simplest fix: give it ${L.extend.added} more year${s(L.extend.added)} — finish in ${L.extend.years} instead of ${p.years}.` }
    : null;
  const steeper = L.steeper
    ? { set: { step: Math.round(L.steeper.stepUp * 100) }, aggressive: L.steeper.aggressive,
        desc: baseStep === 0
          ? `Simplest fix: add a ${Math.round(L.steeper.stepUp * 100)}% annual step-up — raise your SIP that much each year as your salary grows.`
          : `Simplest fix: raise your annual step-up to ${Math.round(L.steeper.stepUp * 100)}% as your salary grows.` }
    : null;
  const invest = p.requiredSIP <= p.surplus
    ? { set: { sip: Math.ceil(p.requiredSIP / 500) * 500 },
        desc: `Simplest fix: invest ${fmt(p.requiredSIP)}/mo — above the ${fmt(p.comfortSurplus)} you called comfortable, but still within your surplus.` }
    : null;
  const lower = L.lower
    ? { set: { goal: Math.floor(L.lower.maxGoalToday / 1000) * 1000 },
        desc: `Realistically, at what you can comfortably invest this goal fits better around ${fmt(L.lower.maxGoalToday)} — or combine the levers above.` }
    : null;

  if (extend && extend.added <= 5) return extend;
  if (steeper && !steeper.aggressive) return steeper;
  if (extend) return extend;
  if (invest) return invest;
  // Nothing gentle works — trimming the goal (or combining levers) is the honest call.
  // An aggressive step-up is left to the Lever cards above, not headlined as a "simple fix".
  return lower;
}

// live-slider sandbox
function sandboxHtml() {
  const p = plan;
  // Start the SIP slider at the amount the user can actually invest, so it opens
  // on "here's what your affordable SIP achieves" — they adjust up/down from there.
  const sipStart = Math.round(p.comfortSurplus > 0 ? p.comfortSurplus : (p.requiredSIP > 0 ? p.requiredSIP : 5000));
  const sipMax = Math.max(5000, Math.ceil(Math.max(p.requiredSIP, p.surplus, p.comfortSurplus) * 1.8 / 500) * 500);
  const goalMax = Math.max(p.goalToday * 2, 500000);
  return `
    <div class="sandbox">
      <h3>Play with it</h3>
      <p class="hint">Drag any slider and watch the projected corpus and verdict update instantly. The return assumption stays at ${(p.r * 100).toFixed(0)}% (${p.profile.toLowerCase()}).</p>
      ${sliderRow('slSip', 'Monthly SIP', 0, sipMax, 500, sipStart, 'money')}
      ${sliderRow('slYears', 'Years', 1, 40, 1, p.years, 'int', 'yrs')}
      ${sliderRow('slGoal', "Goal (today's ₹)", 100000, goalMax, 100000, p.goalToday, 'money')}
      ${sliderRow('slStep', 'Annual step-up', 0, 25, 1, Math.round(p.stepUp * 100), 'int', '%')}
      <p class="sandbox-tip">Drag the slider for a quick sweep, or tap the number to type an exact figure.</p>
      <div class="sandbox-verdict" id="sandboxVerdict"></div>
      <p class="sandbox-outcome" id="sandboxOutcome"></p>
      ${suggestBlock(p)}
    </div>`;
}
// Recommended-lever call to action. Data attributes carry the slider target(s) to apply.
function suggestBlock(p) {
  const sug = suggestLever(p);
  if (!sug) return '';
  const dataAttrs = Object.entries(sug.set).map(([k, v]) => `data-${k}="${v}"`).join(' ');
  return `
    <div class="sandbox-suggest" id="sandboxSuggest">
      <span class="suggest-text">💡 ${sug.desc}</span>
      <button type="button" class="btn-suggest" id="applySuggest" ${dataAttrs}>Apply this →</button>
    </div>`;
}
// The value beside each slider is an editable field — slider for quick
// sweeps, typed box for a precise figure. Kept in two-way sync in wireSliders.
const sliderRow = (id, label, min, max, step, val, kind, suffix = '') =>
  `<div class="slider-row">
    <div class="slabel">
      <span>${label}</span>
      <span class="sval">${kind === 'money' ? '<span class="sval-pre">₹</span>' : ''}<input type="text" inputmode="numeric" class="sval-edit" id="${id}Val" aria-label="${label} — type an exact value"/>${suffix ? `<span class="sval-suf">${suffix}</span>` : ''}</span>
    </div>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" aria-label="${label}"/>
  </div>`;

function wireSliders() {
  const cfg = { slSip: { money: true }, slYears: { money: false }, slGoal: { money: true }, slStep: { money: false } };
  const ids = Object.keys(cfg);
  // Exact values the engine computes on — the typed box can hold a precise
  // figure the stepped slider can't land on, so we read from here, not the range.
  const vals = {};
  ids.forEach((id) => { vals[id] = +$(id).value; });
  // Snapshot the opening values (affordable SIP, original years/goal/step-up) so the
  // outcome line can describe what the user changed to make the goal work.
  const base = { ...vals };
  // Grow the field to fit its content so long figures (₹1,50,000+) never clip.
  const sizeBox = (id) => { const b = $(id + 'Val'); b.style.width = Math.max(4, b.value.length + 1) + 'ch'; };
  const showBox = (id) => { $(id + 'Val').value = cfg[id].money ? groupIndian(String(vals[id])) : String(vals[id]); sizeBox(id); };

  // Plain-English list of the levers the user has moved away from the starting point.
  const joinNat = (a) => (a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  const describeChanges = () => {
    const parts = [];
    if (vals.slSip !== base.slSip) parts.push(`${vals.slSip > base.slSip ? 'stretching' : 'easing'} your SIP to ${fmt(vals.slSip)}/mo`);
    const dy = vals.slYears - base.slYears;
    if (dy > 0) parts.push(`giving it ${dy} more year${dy > 1 ? 's' : ''}`);
    else if (dy < 0) parts.push(`cutting ${-dy} year${-dy > 1 ? 's' : ''}`);
    if (vals.slStep !== base.slStep) {
      if (base.slStep === 0) parts.push(`adding a ${vals.slStep}% annual step-up`);
      else parts.push(`${vals.slStep > base.slStep ? 'raising' : 'lowering'} your step-up to ${vals.slStep}% a year`);
    }
    if (vals.slGoal !== base.slGoal) parts.push(`${vals.slGoal < base.slGoal ? 'trimming' : 'raising'} the goal to ${fmt(vals.slGoal)}`);
    return parts;
  };

  const recompute = () => {
    const goalFuture = inflate(vals.slGoal, ctx.inflation, vals.slYears);
    const corpus = simulateFV(vals.slSip, vals.slStep / 100, ctx.rm, vals.slYears * 12, ctx.existing);
    const v = $('sandboxVerdict');
    if (corpus >= goalFuture) {
      const over = corpus - goalFuture;
      v.className = 'sandbox-verdict ok';
      v.innerHTML = `On track — projected ${fmt(corpus)} vs ${fmt(goalFuture)} target<small>${over > 0 ? fmt(over) + ' to spare' : 'right on target'}</small>`;
    } else {
      v.className = 'sandbox-verdict short';
      v.innerHTML = `Short by ${fmt(goalFuture - corpus)} — projected ${fmt(corpus)} vs ${fmt(goalFuture)} target<small>nudge the SIP up, add years, or lower the goal to close it</small>`;
    }
    // Outcome line — articulate what the user's dragging achieves.
    const met = corpus >= goalFuture;
    const o = $('sandboxOutcome');
    const changes = describeChanges();
    if (met) {
      o.className = 'sandbox-outcome ok';
      o.innerHTML = changes.length
        ? `✓ You reach this goal by ${joinNat(changes)}.`
        : `✓ At ${fmt(base.slSip)}/mo — the amount you can invest — this goal is already on track. Drag a lever to explore what-ifs.`;
    } else {
      o.className = 'sandbox-outcome short';
      o.innerHTML = changes.length
        ? `Not quite — still ${fmt(goalFuture - corpus)} short after ${joinNat(changes)}. Push one lever a little further to close it.`
        : `At ${fmt(base.slSip)}/mo — the amount you can invest — you're ${fmt(goalFuture - corpus)} short. Drag a lever to see what closes the gap.`;
    }
    // The recommended-lever action is only useful while there's still a gap.
    const sug = $('sandboxSuggest');
    if (sug) sug.style.display = met ? 'none' : '';
  };

  // Slider drag → exact state + typed box follows.
  ids.forEach((id) => {
    $(id).addEventListener('input', () => { vals[id] = +$(id).value; showBox(id); recompute(); });
  });

  // Typed box → exact state + slider position (clamped to the slider's range).
  ids.forEach((id) => {
    const box = $(id + 'Val');
    const range = $(id);
    const money = cfg[id].money;
    const apply = (forceMin) => {
      const digits = box.value.replace(/[^\d]/g, '');
      if (digits === '' && !forceMin) return; // let them clear mid-edit; tidy on blur
      let num = digits === '' ? +range.min : parseInt(digits, 10);
      if (num > +range.max) num = +range.max; // guard runaway typos
      if (forceMin && num < +range.min) num = +range.min;
      vals[id] = num;
      range.value = num; // range snaps to its step for the thumb position only
      box.value = money ? groupIndian(String(num)) : String(num);
      sizeBox(id);
      recompute();
    };
    box.addEventListener('input', () => apply(false));
    box.addEventListener('blur', () => apply(true));
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') box.blur(); });
  });

  // Recommended-lever action: reset to the affordable baseline, then apply the one suggested lever.
  const applyBtn = $('applySuggest');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      Object.assign(vals, base);
      const d = applyBtn.dataset;
      if (d.years) vals.slYears = +d.years;
      if (d.step != null) vals.slStep = +d.step;
      if (d.sip) vals.slSip = +d.sip;
      if (d.goal) vals.slGoal = +d.goal;
      ids.forEach((id) => { const r = $(id); r.value = Math.min(Math.max(vals[id], +r.min), +r.max); showBox(id); });
      recompute();
    });
  }

  ids.forEach(showBox);
  recompute();
}

// 6 ── fund categories (educational only)
function renderCategories() {
  const p = plan;
  if (p.band === 'noSurplus') { $('catCard').innerHTML = ''; return; }
  let cats = fundCategories(p.profile);
  if (ctx.taxRegime !== 'old') cats = cats.filter(([name]) => !name.startsWith('ELSS'));
  $('catCard').innerHTML = `
    <div class="card">
      <h2 class="card-title">Fund categories that fit your profile</h2>
      <p class="lead">Categories only — KitnaSIP never names specific funds to buy. Use these to guide your research, or ask a SEBI-registered adviser.</p>
      <div class="category-list">
        ${cats.map(([name, why]) => `<div class="category-item"><div class="category-dot"></div><div class="category-text"><strong>${name}</strong>${why}</div></div>`).join('')}
      </div>
    </div>`;
}

// 7 ── affiliate CTA
function renderAffiliate() {
  const p = plan;
  const wrap = $('affiliateWrap');
  if (!['comfortable', 'tight', 'alreadyThere'].includes(p.band)) { wrap.innerHTML = ''; return; }
  const btn = AFFILIATE_READY
    ? `<a class="btn btn-primary" href="${AFFILIATE.url}" target="_blank" rel="sponsored noopener">${AFFILIATE.cta} →</a>`
    : `<button class="btn btn-primary" aria-disabled="true" disabled>${AFFILIATE.cta} (link coming soon)</button>`;
  wrap.innerHTML = `
    <div class="affiliate">
      <h3>Ready to start?</h3>
      <p>You'll need a demat account to run a SIP. ${AFFILIATE_READY ? '' : "We're finalising our broker partner — this button goes live soon."}</p>
      ${btn}
      <p class="disclosure">${AFFILIATE.note}</p>
    </div>`;
}

// 8 ── assumptions footer
function renderAssumptions() {
  const p = plan;
  $('assumptions').innerHTML = `
    <strong>The assumptions behind this:</strong> returns are illustrative, not guarantees — we used
    ${(p.r * 100).toFixed(0)}% a year (${p.profile.toLowerCase()} profile) and ${(p.inflation * 100).toFixed(1)}% inflation,
    with a ${Math.round(p.stepUp * 100)}% annual SIP step-up. Markets don't move in straight lines and real
    returns will differ. The SIPscore is an educational readiness heuristic, not investment advice. KitnaSIP
    never recommends specific funds — for a personal plan, please consult a SEBI-registered investment adviser.`;
}

// ── init ──
function init() {
  // money inputs → live Indian-format grouping
  document.querySelectorAll('input[data-money]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const digits = inp.value.replace(/[^\d]/g, '');
      inp.value = groupIndian(digits);
      if (['income', 'expenses', 'capacity'].includes(inp.id)) updateSurplus();
    });
  });
  updateSurplus();

  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => showStep(+b.dataset.goto)));
  document.querySelectorAll('[data-next]').forEach((b) =>
    b.addEventListener('click', () => { const s = +b.dataset.next; if (validateStep(s)) showStep(s + 1); }));
  $('calcBtn')?.addEventListener('click', () => calculate());
  $('resetBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.step-circle').forEach((c) => c.classList.remove('done', 'active'));
    $('sc1').classList.add('active');
    showStep(1);
  });

  document.querySelectorAll('.chip[data-group]').forEach((chip) => {
    chip.addEventListener('click', () => selectChip(chip));
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectChip(chip); } });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
