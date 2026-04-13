#!/usr/bin/env node
/**
 * run-price-scenarios.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs all 10 AI price suggestion test scenarios against a running backend.
 * Logs in automatically, then calls POST /api/ai/price-suggestion for each.
 *
 * Usage:
 *   node run-price-scenarios.mjs
 *   node run-price-scenarios.mjs --base http://localhost:3000/api --email user1@example.com --pass password123
 *
 * Output: formatted table + raw JSON file (scenario-results.json)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { writeFileSync } from 'fs';

// ── Config (override via CLI args) ────────────────────────────────────────────
const args  = process.argv.slice(2);
const get   = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i+1] : def; };

const BASE  = get('--base',  'http://localhost:3000/api');
const EMAIL = get('--email', 'user1@example.com');
const PASS  = get('--pass',  'password123');
const OUT   = get('--out',   'scenario-results.json');

// ── 10 Scenarios ──────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 'S1',
    name: 'Kelibia villa near sea — peak',
    body: {
      city: 'Kelibia', category: 'accommodation', unit: 'per_night',
      lat: 36.8497, lng: 11.1047, radiusKm: 20,
      propertyType: 'villa', distanceToSeaKm: 0.2,
      capacity: 8, season: 'peak',
    },
    expect: 'highest — villa × beachfront × peak',
  },
  {
    id: 'S2',
    name: 'Kelibia house far sea — off-peak',
    body: {
      city: 'Kelibia', category: 'accommodation', unit: 'per_night',
      lat: 36.8301, lng: 11.0801, radiusKm: 20,
      propertyType: 'house', distanceToSeaKm: 6.0,
      capacity: 4, season: 'off_peak',
    },
    expect: '≥40% lower than S1',
  },
  {
    id: 'S3',
    name: 'Kelibia apartment near sea — small (capacity 2)',
    body: {
      city: 'Kelibia', category: 'accommodation', unit: 'per_night',
      lat: 36.8490, lng: 11.1050, radiusKm: 20,
      propertyType: 'apartment', distanceToSeaKm: 0.3,
      capacity: 2, season: 'peak',
    },
    expect: 'lower than S1 (smaller capacity, apt type)',
  },
  {
    id: 'S4',
    name: 'Kelibia villa near sea — large (capacity 12)',
    body: {
      city: 'Kelibia', category: 'accommodation', unit: 'per_night',
      lat: 36.8495, lng: 11.1045, radiusKm: 20,
      propertyType: 'villa', distanceToSeaKm: 0.25,
      capacity: 12, season: 'peak',
    },
    expect: '≥ S1 (larger capacity)',
  },
  {
    id: 'S5',
    name: 'Tunis apartment — no sea',
    body: {
      city: 'Tunis', category: 'accommodation', unit: 'per_night',
      lat: 36.8065, lng: 10.1815, radiusKm: 15,
      propertyType: 'apartment', capacity: 4,
    },
    expect: 'city comps differ from Kelibia, no sea multiplier',
  },
  {
    id: 'S6',
    name: 'Tunis sports facility — per-slot',
    body: {
      city: 'Tunis', category: 'sports_facility', unit: 'per_session',
      lat: 36.8190, lng: 10.1658, radiusKm: 15,
      capacity: 22,
    },
    expect: '20–80 TND, no accom multipliers',
  },
  {
    id: 'S7',
    name: 'Kelibia tennis court — per-hour',
    body: {
      city: 'Kelibia', category: 'sports_facility', unit: 'per_hour',
      lat: 36.8497, lng: 11.1047, radiusKm: 20,
      capacity: 4,
    },
    expect: '15–55 TND, wider range (fewer comps)',
  },
  {
    id: 'S8',
    name: 'Tunis car rental — per-day',
    body: {
      city: 'Tunis', category: 'vehicle', unit: 'per_day',
      lat: 36.8190, lng: 10.1660, radiusKm: 20,
      capacity: 5,
    },
    expect: '80–400 TND, hard cap 1000',
  },
  {
    id: 'S9',
    name: 'Sfax tools — per-day (national fallback)',
    body: {
      city: 'Sfax', category: 'tool', unit: 'per_day',
      lat: 34.7400, lng: 10.7600, radiusKm: 25,
    },
    expect: '20–150 TND, low/medium confidence',
  },
  {
    id: 'S10',
    name: 'Unknown city — cold-start fallback',
    body: {
      city: 'BirMcherga', category: 'accommodation', unit: 'per_night',
    },
    expect: 'confidence=low, compsUsed=0, baseline price',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function post(url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json?.data ?? json; // unwrap TransformInterceptor envelope if present
}

function fmt(n) {
  return n == null ? '—' : Number(n).toFixed(1);
}

function pad(str, len) {
  return String(str ?? '—').padEnd(len).slice(0, len);
}

function hr(len = 110) { return '─'.repeat(len); }

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // 1. Login
  process.stdout.write(`Logging in as ${EMAIL}... `);
  let token;
  try {
    const login = await post(`${BASE}/auth/login`, { email: EMAIL, password: PASS });
    token = login?.accessToken ?? login?.token ?? login?.access_token;
    if (!token) throw new Error('No token in response: ' + JSON.stringify(login));
    console.log('✓');
  } catch (err) {
    console.error('✗ Login failed:', err.message);
    process.exit(1);
  }

  // 2. Run scenarios
  console.log(`\nRunning ${SCENARIOS.length} scenarios against ${BASE}\n`);
  const results = [];

  for (const s of SCENARIOS) {
    process.stdout.write(`  ${s.id} ${s.name.slice(0,50).padEnd(50)} ... `);
    const row = { id: s.id, name: s.name, expect: s.expect };
    try {
      const r = await post(`${BASE}/ai/price-suggestion`, s.body, token);
      row.recommended   = r.recommended;
      row.rangeMin      = r.range?.min;
      row.rangeMax      = r.range?.max;
      row.confidence    = r.confidence;
      row.compsUsed     = r.compsUsed;
      row.unit          = r.unit;
      row.explanation   = r.explanation;
      row.logId         = r.logId;
      row.error         = null;
      console.log(`${fmt(r.recommended)} TND  [${r.confidence}]  comps=${r.compsUsed}`);
    } catch (err) {
      row.error = err.message;
      console.log(`ERROR: ${err.message}`);
    }
    results.push(row);
  }

  // 3. Print results table
  console.log('\n' + hr());
  console.log(
    pad('ID',  4) + ' ' +
    pad('Scenario', 42) + ' ' +
    pad('Rec (TND)', 10) + ' ' +
    pad('Min', 7) + ' ' +
    pad('Max', 7) + ' ' +
    pad('Conf', 8) + ' ' +
    pad('Comps', 6) + ' ' +
    'Notes / Expected',
  );
  console.log(hr());

  for (const r of results) {
    if (r.error) {
      console.log(
        pad(r.id, 4) + ' ' +
        pad(r.name, 42) + ' ' +
        pad('ERROR', 10) + ' ' + r.error,
      );
    } else {
      console.log(
        pad(r.id,           4)  + ' ' +
        pad(r.name,         42) + ' ' +
        pad(fmt(r.recommended), 10) + ' ' +
        pad(fmt(r.rangeMin), 7) + ' ' +
        pad(fmt(r.rangeMax), 7) + ' ' +
        pad(r.confidence,   8)  + ' ' +
        pad(r.compsUsed,    6)  + ' ' +
        r.expect,
      );
    }
  }
  console.log(hr());

  // 4. Markdown copy-paste table
  console.log('\n### Copy-paste table (Markdown)\n');
  console.log('| ID | Scenario | Recommended | Range | Confidence | Comps | Notes |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const rec   = r.error ? 'ERROR' : `${fmt(r.recommended)} TND`;
    const range = r.error ? '—' : `${fmt(r.rangeMin)}–${fmt(r.rangeMax)}`;
    console.log(
      `| ${r.id} | ${r.name} | ${rec} | ${range} | ${r.confidence ?? '—'} | ${r.compsUsed ?? '—'} | ${r.expect} |`
    );
  }

  // 5. Write JSON
  writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\nFull JSON written to: ${OUT}`);
})();
