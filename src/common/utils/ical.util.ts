/**
 * Minimal iCalendar (RFC 5545) helpers for availability sync.
 *
 * We only deal with all-day VEVENTs (DATE values) — the shape every booking
 * platform (Airbnb, Booking.com, Vrbo) uses to export blocked dates. DTEND is
 * EXCLUSIVE in iCal, which matches our own booking/block convention exactly.
 *
 * Hand-rolled (no dependency) because the surface we need is tiny and the
 * project pins old peer deps that make adding packages painful.
 */

export interface IcalEvent {
  uid: string;
  start: Date;
  end: Date;
  summary?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** YYYYMMDD for an all-day DATE value (UTC). */
function toIcalDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** YYYYMMDDTHHMMSSZ for DTSTAMP. */
function toIcalStamp(d: Date): string {
  return `${toIcalDate(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildIcal(opts: {
  calName: string;
  events: Array<{ uid: string; start: Date; end: Date; summary: string }>;
}): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RentEverything//Availability//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opts.calName)}`,
  ];
  const stamp = toIcalStamp(new Date());
  for (const ev of opts.events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${toIcalDate(ev.start)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcalDate(ev.end)}`); // exclusive end
    lines.push(`SUMMARY:${escapeText(ev.summary)}`);
    lines.push('TRANSP:OPAQUE');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n'; // CRLF per RFC 5545
}

function parseIcalDate(v: string): Date | undefined {
  // 20260701  |  20260701T120000Z  |  20260701T120000
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/.exec(v.trim());
  if (!m) return undefined;
  const [, y, mo, d, hh, mm, ss] = m;
  return new Date(
    Date.UTC(+y, +mo - 1, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0),
  );
}

export function parseIcal(text: string): IcalEvent[] {
  // Unfold continuation lines (RFC 5545 §3.1 — folded lines start with WS).
  const unfolded = text
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r\n|\n|\r/);

  const events: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur?.start && cur?.end) {
        events.push({
          uid: cur.uid || `${cur.start.getTime()}-${cur.end.getTime()}`,
          start: cur.start,
          end: cur.end,
          summary: cur.summary,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).split(';')[0].toUpperCase();
    const value = line.slice(idx + 1);

    if (key === 'UID') cur.uid = value.trim();
    else if (key === 'SUMMARY') cur.summary = value.trim();
    else if (key === 'DTSTART') cur.start = parseIcalDate(value);
    else if (key === 'DTEND') cur.end = parseIcalDate(value);
  }

  return events.filter((e) => e.start && e.end && e.end > e.start);
}
