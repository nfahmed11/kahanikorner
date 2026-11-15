/** Kahani Korner — Weekly Growth Tracker (Apps Script, bound or standalone).
 * Script Properties (Project Settings > Script properties):
 *   GA4_PROPERTY_ID  numeric GA4 property id (Admin > Property details)
 *   GSC_SITE         sc-domain:kahanikorner.com   (or https://kahanikorner.com/)
 *   RECIPIENT        email for reports
 *   SHEET_ID         1nniv8xeCXfhQplePvgyUYbySXd0pKaP3eIXf3WV-4qk
 *   PURCHASE_TRACKING  "on" only after verified GA4 purchase events are live
 *   PAUSED           "true" to pause all emails/rows
 * Run setup() once, then testWeekly(). */
const P = PropertiesService.getScriptProperties();
const cfg = k => P.getProperty(k);
const NA = 'Not configured', UN = 'Unavailable';
const SITE = 'https://kahanikorner.com';
const KEY_PAGES = ['/', '/products', '/subscribe', '/resources/resources'];

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyJob').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone('America/Chicago').create();
  ScriptApp.newTrigger('monthlyJob').timeBased().onMonthDay(5).atHour(9).inTimezone('America/Chicago').create();
  ScriptApp.newTrigger('alertJob').timeBased().everyHours(6).create();
  Logger.log('Triggers installed: ' + ScriptApp.getProjectTriggers().length);
}
function pause()  { P.setProperty('PAUSED', 'true'); }
function resume() { P.setProperty('PAUSED', 'false'); }
const paused = () => cfg('PAUSED') === 'true';

// ---------- helpers ----------
const fmt = d => Utilities.formatDate(d, 'America/Chicago', 'yyyy-MM-dd');
function lastFullWeek(offsetWeeks) {           // Mon..Sun, ending last Sunday
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const end = new Date(t); end.setDate(t.getDate() - ((t.getDay() + 7) % 7 || 7) - 7 * (offsetWeeks || 0));
  const start = new Date(end); start.setDate(end.getDate() - 6);
  return { start: fmt(start), end: fmt(end) };
}
function retry(fn, tries) {
  for (let i = 0; i < (tries || 3); i++) {
    try { return fn(); } catch (e) { if (i === (tries || 3) - 1) throw e; Utilities.sleep(2000 * Math.pow(2, i)); }
  }
}
function ga(start, end, dims, mets, filter, limit) {
  const id = cfg('GA4_PROPERTY_ID'); if (!id) return null;
  const req = { dateRanges: [{ startDate: start, endDate: end }], dimensions: dims.map(n => ({ name: n })),
    metrics: mets.map(n => ({ name: n })), limit: limit || 100 };
  if (filter) req.dimensionFilter = filter;
  return retry(() => AnalyticsData.Properties.runReport(req, 'properties/' + id));
}
function gaTotal(start, end, metric) {
  const r = ga(start, end, [], [metric]); if (!r) return NA;
  return r.rows && r.rows.length ? Number(r.rows[0].metricValues[0].value) : 0;
}
// sessions/purchases/revenue by source (sessionSource contains match)
function gaBySource(start, end) {
  const r = ga(start, end, ['sessionSource', 'sessionMedium'], ['sessions', 'ecommercePurchases', 'purchaseRevenue'], null, 500);
  if (!r) return null;
  const out = { instagram: [0,0,0], tiktok: [0,0,0], facebook: [0,0,0], google: [0,0,0] };
  (r.rows || []).forEach(row => {
    const src = row.dimensionValues[0].value.toLowerCase(), med = row.dimensionValues[1].value.toLowerCase();
    const v = row.metricValues.map(m => Number(m.value));
    let k = null;
    if (/instagram|^ig$|l\.instagram/.test(src)) k = 'instagram';
    else if (/tiktok/.test(src)) k = 'tiktok';
    else if (/facebook|^fb$|m\.facebook|l\.facebook/.test(src)) k = 'facebook';
    else if (src === 'google' && med === 'organic') k = 'google';
    if (k) for (let i = 0; i < 3; i++) out[k][i] += v[i];
  });
  return out;
}
function gaTopPage(start, end) {
  const r = ga(start, end, ['pagePath'], ['screenPageViews'], null, 1);
  if (!r) return NA; return r.rows && r.rows.length ? r.rows[0].dimensionValues[0].value : UN;
}
function gscQuery(start, end, dims, rowLimit) {
  const site = cfg('GSC_SITE'); if (!site) return null;
  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(site) + '/searchAnalytics/query';
  return retry(() => {
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ startDate: start, endDate: end, dimensions: dims, rowLimit: rowLimit || 1 }) });
    if (res.getResponseCode() >= 300) throw new Error('GSC ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    return JSON.parse(res.getContentText());
  });
}
function gscTotals(start, end) {
  const r = gscQuery(start, end, [], 1); if (!r) return null;
  const row = (r.rows || [])[0] || { clicks: 0, impressions: 0 };
  return { clicks: row.clicks, impressions: row.impressions };
}
function gscTopQuery(start, end) {
  const r = gscQuery(start, end, ['query'], 1); if (!r) return NA;
  return r.rows && r.rows.length ? r.rows[0].keys[0] : UN;
}
function checkPages() {
  const bad = [];
  KEY_PAGES.concat(['/sitemap.xml']).forEach(p => {
    try { const c = UrlFetchApp.fetch(SITE + p, { muteHttpExceptions: true, followRedirects: true }).getResponseCode();
      if (c >= 400) bad.push(p + ' (' + c + ')'); } catch (e) { bad.push(p + ' (unreachable)'); }
  });
  return bad;
}
const pct = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0) ? (a - b) / b : UN;

// ---------- weekly ----------
function buildWeek(w) {
  const prev = (() => { const s = new Date(w.start + 'T12:00:00'); s.setDate(s.getDate() - 7);
    const e = new Date(s); e.setDate(s.getDate() + 6); return { start: fmt(s), end: fmt(e) }; })();
  const visitors = gaTotal(w.start, w.end, 'activeUsers');
  const prevVisitors = gaTotal(prev.start, prev.end, 'activeUsers');
  const src = gaBySource(w.start, w.end);
  const sc = gscTotals(w.start, w.end);
  const topPage = gaTopPage(w.start, w.end);
  const buy = cfg('PURCHASE_TRACKING') === 'on' && src;
  const purchases = buy ? gaTotal(w.start, w.end, 'ecommercePurchases') : NA;
  const revenue = buy ? gaTotal(w.start, w.end, 'purchaseRevenue') : NA;
  let best = NA;
  if (buy) { const ranked = Object.keys(src).sort((a, b) => src[b][2] - src[a][2]);
    best = src[ranked[0]][2] > 0 ? ranked[0] : 'No attributed sales'; }
  const bad = checkPages();
  const problem = bad.length ? 'Page check failed: ' + bad.join(', ') : 'None found in checks.';
  const s = k => src ? src[k][0] : NA, p = k => buy ? src[k][1] : NA;
  const nextStep = bad.length ? 'Check the failing page(s) listed in Problems to Fix.'
    : (src && src.instagram[0] + src.tiktok[0] + src.facebook[0] === 0
       ? 'Put your tracking links in your Instagram, TikTok and Facebook bios.'
       : 'Share one free resource on social with a link to /subscribe.');
  const link = topPage && topPage.charAt(0) === '/' ? '=HYPERLINK("' + SITE + topPage + '","' + topPage + '")' : topPage;
  return [w.start + ' to ' + w.end, visitors, pct(visitors, prevVisitors), s('instagram'), s('tiktok'), s('facebook'), s('google'),
    sc ? sc.clicks : NA, sc ? sc.impressions : NA, link, gscTopQuery(w.start, w.end),
    purchases, revenue, p('instagram'), p('tiktok'), p('google'), p('facebook'), best, NA /* subs: needs Stripe source */,
    problem, nextStep, '=HYPERLINK("https://analytics.google.com","Open Google Analytics")'];
}
function writeRow(row) {
  const sh = SpreadsheetApp.openById(cfg('SHEET_ID')).getSheetByName('Weekly Tracker');
  const weeks = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(r => r[0]);
  const i = weeks.indexOf(row[0]);
  const r = i >= 0 ? i + 2 : sh.getLastRow() + 1;   // update existing week, never duplicate
  sh.getRange(r, 1, 1, row.length).setValues([row]);
  sh.getRange(2, 1, sh.getLastRow() - 1, row.length).sort(1);
}
function weeklyJob() {
  if (paused()) return;
  try {
    // GSC data lags ~2-3 days; Monday run reports the week ending yesterday but GSC numbers may be partial,
    // so we also re-write the prior week (finalized) each run.
    writeRow(buildWeek(lastFullWeek(1)));
    const row = buildWeek(lastFullWeek(0)); writeRow(row);
    sendWeeklyEmail(row); P.setProperty('LAST_OK', new Date().toISOString()); P.deleteProperty('FAILS');
  } catch (e) { fail('weekly', e); }
}
function testWeekly() { const row = buildWeek(lastFullWeek(0)); Logger.log(JSON.stringify(row)); return row; }
function backfill() { for (let i = 11; i >= 0; i--) writeRow(buildWeek(lastFullWeek(i))); }

const v = x => (typeof x === 'number') ? x.toLocaleString() : x;
function sendWeeklyEmail(r) {
  const to = cfg('RECIPIENT'); if (!to) return;
  const sheet = 'https://docs.google.com/spreadsheets/d/' + cfg('SHEET_ID');
  const body = [
    'Week: ' + r[0], '', 'HOW YOUR WEBSITE DID',
    'Visitors: ' + v(r[1]) + (typeof r[2] === 'number' ? ' (' + (r[2] >= 0 ? '+' : '') + Math.round(r[2] * 100) + '% vs last week)' : ''),
    'Google Search clicks: ' + v(r[7]), 'Instagram visits: ' + v(r[3]), 'TikTok visits: ' + v(r[4]),
    'Facebook visits: ' + v(r[5]), 'Google organic visits: ' + v(r[6]), '',
    'SALES', 'Total purchases: ' + v(r[11]), 'Revenue: ' + (typeof r[12] === 'number' ? '$' + r[12].toFixed(2) : r[12]),
    'New Kahani Times subscriptions: ' + v(r[18]), 'Best sales source: ' + r[17], '',
    'WHAT WORKED', 'Top page: ' + String(r[9]).replace(/^=HYPERLINK\("([^"]+)".*$/, '$1') + ' | Top Google search: ' + r[10], '',
    'WHAT NEEDS ATTENTION', r[19], '', 'YOUR ONE TASK THIS WEEK', r[20], '',
    'LINKS', 'Sheet: ' + sheet, 'Analytics: https://analytics.google.com', 'Search Console: https://search.google.com/search-console', 'Site: ' + SITE
  ].join('\n');
  MailApp.sendEmail(to, 'Kahani Korner — Your Weekly Growth Report', body);
}

// ---------- monthly ----------
function monthRange(back) {
  const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - back, 1); const e = new Date(n.getFullYear(), n.getMonth() - back + 1, 0);
  return { start: fmt(s), end: fmt(e), label: Utilities.formatDate(s, 'America/Chicago', 'MMMM yyyy') };
}
function monthlyJob() {
  if (paused()) return;
  try {
    const m = monthRange(1), pm = monthRange(2);
    const vis = gaTotal(m.start, m.end, 'activeUsers'), pvis = gaTotal(pm.start, pm.end, 'activeUsers');
    const src = gaBySource(m.start, m.end), sc = gscTotals(m.start, m.end);
    const pages = ga(m.start, m.end, ['pagePath'], ['screenPageViews'], null, 5);
    const qs = gscQuery(m.start, m.end, ['query'], 5);
    const buy = cfg('PURCHASE_TRACKING') === 'on';
    const g = pct(vis, pvis);
    const lines = ['MONTHLY REPORT — ' + m.label, '',
      'Visitors: ' + v(vis) + (typeof g === 'number' ? ' (' + Math.round(g * 100) + '% vs ' + pm.label + ')' : ''),
      'Google Search: ' + (sc ? v(sc.clicks) + ' clicks, ' + v(sc.impressions) + ' times shown' : NA),
      src ? 'Visits — Instagram ' + src.instagram[0] + ', TikTok ' + src.tiktok[0] + ', Facebook ' + src.facebook[0] + ', Google ' + src.google[0] : 'Traffic sources: ' + NA,
      'Purchases & revenue: ' + (buy ? v(gaTotal(m.start, m.end, 'ecommercePurchases')) + ' / $' + Number(gaTotal(m.start, m.end, 'purchaseRevenue')).toFixed(2) : NA),
      'New Kahani Times subscriptions: ' + NA, '',
      'Most popular pages: ' + (pages && pages.rows ? pages.rows.map(r => r.dimensionValues[0].value).join(', ') : UN),
      'Top Google searches: ' + (qs && qs.rows ? qs.rows.map(r => r.keys[0]).join(', ') : UN),
      'Problems: ' + (checkPages().join(', ') || 'None found in checks.'), '',
      'TOP 3 ACTIONS', '1. Keep tracking links in every social bio.', '2. Add a clear "Join The Kahani Times" link on your most popular free resource page.',
      '3. Post your top-searched topic as a short video and link to it.', '',
      'Sheet: https://docs.google.com/spreadsheets/d/' + cfg('SHEET_ID')];
    if (cfg('RECIPIENT')) MailApp.sendEmail(cfg('RECIPIENT'), 'Kahani Korner — Monthly Website Growth Report', lines.join('\n'));
  } catch (e) { fail('monthly', e); }
}

// ---------- alerts (only confirmed, de-duplicated) ----------
function alertJob() {
  if (paused()) return;
  let bad = checkPages();
  if (bad.length) { Utilities.sleep(60000); bad = checkPages(); }      // confirm
  const key = bad.join('|'), last = cfg('LAST_ALERT') || '';
  if (bad.length && key !== last && cfg('RECIPIENT'))
    MailApp.sendEmail(cfg('RECIPIENT'), 'Kahani Korner — Website problem found', 'These pages failed twice in a row:\n' + bad.join('\n'));
  P.setProperty('LAST_ALERT', key);
}
function fail(job, e) {
  console.error(job, e);
  const n = Number(cfg('FAILS') || 0) + 1; P.setProperty('FAILS', String(n));
  if (n >= 2 && cfg('RECIPIENT')) MailApp.sendEmail(cfg('RECIPIENT'), 'Kahani Korner — report failed', job + ' failed ' + n + ' times: ' + e.message);
}
