// The token radar's model, version radar-2: one snapshot of the protocol universe in, one ranked
// board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds the
// pre-token protocols below the watchlist floor that could actually be launches: it leaves out the
// bridges, liquid-staking and restaking products, the versioned pools and the exchange-named ones,
// because those are not protocols waiting on a token of their own. A protocol is pre-token when its
// index entry records no token (no market cap, no CoinGecko id, no symbol); the snapshot's
// live-token protocols are kept apart in a Live view and shown at the market's own values, never
// mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, and the multiple is calibrated from
// the snapshot itself, not asserted:
//
//   size multiple  the live-token protocols are bucketed by TVL (<$100M, $100M-$1B, $1B-$10B,
//                  >$10B) and each bucket's median market-cap/TVL is taken. In this snapshot the
//                  medians fall hard with size (about 0.25, 0.08, 0.03, 0.01), so a protocol's
//                  multiple is interpolated in log-log space between the two nearest bucket
//                  centres (the buckets' median TVLs), and clamped to the end buckets outside
//                  the range. A small protocol earns a far higher multiple than a giant one.
//   base           = tvl_usd x size multiple
//   growth         = clamp(change_7d, -40, 60) per cent
//   growthMult     = 1 + 0.5 x growth / 100
//   maturity       = 0.7 + 0.3 x min(age_days, 1095) / 1095   (age unknown: 365 days)
//   breakout       = 1.15 when the protocol is under a year old and growing over 5% in a week,
//                  else 1.0: a young protocol that is already growing is the breakout shape
//   implied        = max(1, round(base x growthMult x maturity x breakout))
//
// No protocol name is ever special-cased: the same function scores every row, and the calibration
// buckets are recomputed from the snapshot on every run.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breakout_age_days: number;
  breakout_growth_pct: number;
  breakout_multiplier: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -40,
  growth_cap: 60,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breakout_age_days: 365,
  breakout_growth_pct: 5,
  breakout_multiplier: 1.15,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One TVL bucket of the live set: its centre and its calibrated multiple. */
export interface CalibrationBucket {
  tvl_lo: number;
  tvl_hi: number | null;
  centre_tvl: number;
  multiple: number;
  count: number;
}

/** The calibration the model derived from the snapshot's live-token protocols. */
export interface Calibration {
  buckets: CalibrationBucket[];
  overall_median_multiple: number;
  live_count: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    size_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breakout_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  size_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breakout_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The categories the watchlist rule treats as a wrapped, staked or bridged product, not a launch. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A whole word in a name that marks a wrapped or staked product. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** A name that begins with an exchange's name. */
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and not a bridge, a liquid-staking or
 * restaking product, a versioned pool, a wrapped or staked product, or an exchange's own product.
 * This mirrors the watchlist's own rule as far as the snapshot's ten fields allow (the snapshot
 * carries no parent-protocol field, so a wrapped product the rule would catch by parent is caught
 * here by category and name instead).
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !WRAPPED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_START.test(p.name)
  );
}

/** The TVL bucket edges of the calibration, in dollars. */
const BUCKET_EDGES = [0, 100_000_000, 1_000_000_000, 10_000_000_000];

/**
 * The size-decay calibration, derived from the snapshot's live-token protocols: each TVL bucket's
 * median market-cap/TVL, centred on the bucket's median TVL. Exchanges and versioned pools are
 * left out of the calibration, as they are left out of the board.
 */
export function calibrate(snapshot: Snapshot): Calibration {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0 && p.category !== 'CEX' && !VERSIONED.test(p.name),
  );
  const overall = live.length > 0 ? median(live.map((p) => p.mcap_usd! / p.tvl_usd)) : 0.25;
  const buckets: CalibrationBucket[] = [];
  for (let i = 0; i < BUCKET_EDGES.length; i++) {
    const lo = BUCKET_EDGES[i]!;
    const hi = i + 1 < BUCKET_EDGES.length ? BUCKET_EDGES[i + 1]! : null;
    const inBucket = live.filter((p) => p.tvl_usd >= lo && (hi === null || p.tvl_usd < hi));
    if (inBucket.length === 0) continue;
    buckets.push({
      tvl_lo: lo,
      tvl_hi: hi,
      centre_tvl: median(inBucket.map((p) => p.tvl_usd)),
      multiple: median(inBucket.map((p) => p.mcap_usd! / p.tvl_usd)),
      count: inBucket.length,
    });
  }
  return { buckets, overall_median_multiple: overall, live_count: live.length };
}

/**
 * A protocol's size multiple: log-log interpolation between the two nearest calibration bucket
 * centres, clamped to the end buckets outside the range. When the calibration has fewer than two
 * buckets, the overall median multiple stands in.
 */
export function sizeMultiple(tvl: number, calibration: Calibration): number {
  const b = calibration.buckets;
  if (b.length === 0) return calibration.overall_median_multiple;
  if (b.length === 1) return b[0]!.multiple;
  if (tvl <= b[0]!.centre_tvl) return b[0]!.multiple;
  const last = b[b.length - 1]!;
  if (tvl >= last.centre_tvl) return last.multiple;
  for (let i = 0; i + 1 < b.length; i++) {
    const a = b[i]!;
    const c = b[i + 1]!;
    if (tvl >= a.centre_tvl && tvl <= c.centre_tvl) {
      const t = (Math.log(tvl) - Math.log(a.centre_tvl)) / (Math.log(c.centre_tvl) - Math.log(a.centre_tvl));
      return Math.exp(Math.log(a.multiple) + t * (Math.log(c.multiple) - Math.log(a.multiple)));
    }
  }
  return last.multiple;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): { implied: number; sizeMult: number; growthPct: number; growthMult: number; maturityMult: number; breakoutMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breakoutMult = age !== null && age < model.breakout_age_days && growthPct > model.breakout_growth_pct ? model.breakout_multiplier : 1;
  const sizeMult = sizeMultiple(protocol.tvl_usd, calibration);
  const base = protocol.tvl_usd * sizeMult;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breakoutMult));
  return { implied, sizeMult, growthPct, growthMult, maturityMult, breakoutMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; calibration: Calibration } {
  const calibration = calibrate(snapshot);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist floor, every one of them.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      size_multiple: round4(s.v.sizeMult),
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breakout_multiplier: s.v.breakoutMult,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
  return { board, calibration };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral, then borrow about $${Math.round(capital * 0.2)} against it and keep both legs open.`;
  if (c.includes('dex')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in the narrowest range you are comfortable managing, and keep the position open.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('basis')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares for the whole farming window.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset ${name} offers on ${chain} and hold it in your farming wallet.`;
  if (c.includes('cedefi')) return `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain} and leave it earning for the whole window.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, sized so a single move cannot liquidate it.`;
  if (c.includes('prediction')) return `Fund your ${name} account with $${capital} and place one small position in a market that settles after at least a week.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in your farming wallet.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy for its full term.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset ${name} issues on ${chain} and hold it in your farming wallet.`;
  if (c.includes('governance')) return `Lock $${capital} of the governance asset in ${name} on ${chain} and vote on the next live proposal.`;
  if (c.includes('payment')) return `Route a real $${capital} payment through ${name} on ${chain} and keep the receipt in your farming wallet.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${name}'s chain and use it in one native app on that chain, keeping the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and use its main feature once, keeping the position open.`;
}

/** A second, different action on the same protocol, so the wallet reads as a real user, not a bot. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Repay part of the borrow and top up the collateral once, so the wallet shows two-way activity on ${name}.`;
  if (c.includes('dex')) return `Swap $${Math.round(capital * 0.25)} through ${name} on ${chain} once a week, in a pair the pool actually trades.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield') || c.includes('basis') || c.includes('cedefi')) return `Add a second, smaller deposit of $${Math.round(capital * 0.25)} to the same ${name} vault a week later, rather than everything at once.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge and open a fresh one half the size, so the account shows repeated trading rather than a single open position.`;
  if (c.includes('prediction')) return `Place a second small position in a different ${name} market, so the account is not a single bet.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim any staking rewards ${name} shows and restake them, instead of letting them sit unclaimed.`;
  if (c.includes('governance')) return `Vote on a second proposal in ${name} and post one short comment in its forum, from the same wallet.`;
  if (c.includes('rwa') || c.includes('stable') || c.includes('insurance')) return `Use the ${name} position a second time: top it up by $${Math.round(capital * 0.25)} and leave the new funds in place.`;
  return `Use ${name} a second way: run one more transaction on ${chain} that the protocol itself offers, such as a swap, a vote or a claim.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and write its seed phrase on paper and store it offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Bridge $${capital} of USDC to ${chain} from the chain you already hold funds on, using a bridge you have used before.`,
      cost: `about $2 to $8 of bridge and gas fees on $${capital}`,
      time: '20 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about $2 of gas, plus the $${Math.round(capital * 0.25)} in the second action`,
      time: '10 minutes',
    },
    {
      text: `Repeat one qualifying action each week, such as a deposit, a swap, a vote or a claim, and never let the wallet sit idle for a full month.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and do not withdraw everything at once.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you claim anything, open the protocol's own points or rewards page from a link it publishes itself, and never pay a fee to claim.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, farm plan included. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    size_multiple: row.model.size_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breakout_multiplier: row.model.breakout_multiplier,
    watchlist: onWatchlist,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, calibration } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const watchSet = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchSet.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
