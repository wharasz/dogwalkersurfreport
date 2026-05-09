/**
 * build.js — Pre-renders reports into index.html for SEO
 *            + generates individual report pages at /reports/{folder}/
 * 
 * Outputs to public/ which Vercel serves by default.
 * Reads reports.json, bakes the latest report into index.html,
 * and generates a standalone page per report for shareable URLs,
 * clickable archive, and per-page SEO indexing.
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://www.dogwalkersurfreport.com';
const MAX_DAYS = 7;
const OUT = 'public';

// ── Helpers ──────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  const m = ['January','February','March','April','May','June',
             'July','August','September','October','November','December'];
  const [y, mo, dy] = d.split('-').map(Number);
  return `${m[mo-1]} ${dy}, ${y}`;
}
function fmtDateShort(d) {
  const m = ['January','February','March','April','May','June',
             'July','August','September','October','November','December'];
  const [y, mo, dy] = d.split('-').map(Number);
  return `${m[mo-1]} ${dy}`;
}
function to24h(t) {
  if (!t) return '08:00';
  const [time, period] = t.split(' ');
  let [h, m] = time.split(':').map(Number);
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
function withinDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - n);
  cutoff.setHours(0,0,0,0);
  return d >= cutoff;
}
function reportUrl(r) {
  return `/reports/${r.folder || r.date}/`;
}

// ── Render today's report as static HTML ─────────────────
function renderToday(r) {
  const folder = r.folder || r.date;
  const n = r.photos || 1;
  let thumbs = '';
  for (let i = 1; i <= n; i++){
    const alt = (r.photoAlts && r.photoAlts[i-1]) ? r.photoAlts[i-1] : `Cocoa Beach surf photo ${i} — ${r.headline}`;
    thumbs += `<img src="/photos/${folder}/${i}.jpg" alt="${esc(alt)}" ${i===1?'class="active"':''}>`}

  const mainAlt = (r.photoAlts && r.photoAlts[0]) ? r.photoAlts[0] : `Cocoa Beach surf conditions at Picnic Tables — ${r.date}`;
  return `<div class="report-card">
        <img src="/photos/${folder}/1.jpg" alt="${esc(mainAlt)}" class="report-photo-main" id="main-photo">
        <div class="report-thumbnails">${thumbs}</div>
        <div class="report-body">
          <div class="report-meta">${esc(r.day)}, ${fmtDateShort(r.date)} &middot; ${esc(r.time)}</div>
          <h2 class="report-headline">${esc(r.headline)}</h2>
          <p class="report-text">${esc(r.text)}</p>
        </div>
      </div>`;
}

// ── Render archive list with links ───────────────────────
function renderArchive(reports) {
  if (reports.length <= 1)
    return '<div class="report-card" style="padding:24px;text-align:center;color:var(--text-light)">More reports coming soon.</div>';
  let html = '';
  for (let i = 1; i < reports.length; i++) {
    const r = reports[i];
    const folder = r.folder || r.date;
    const url = reportUrl(r);
    html += `<a href="${url}" class="archive-item" style="text-decoration:none;color:inherit;">
          <img src="/photos/${folder}/1.jpg" alt="${esc(r.day)} ${r.date}" class="archive-thumb">
          <div><div class="archive-date">${esc(r.day)}, ${fmtDateShort(r.date)} &middot; ${esc(r.time)}</div>
          <div class="archive-headline">${esc(r.headline)}</div></div>
        </a>`;
  }
  return html;
}

// ── Build JSON-LD for a single report ────────────────────
function buildSingleJsonLd(r) {
  const folder = r.folder || r.date;
  const imgs = [];
  for (let i = 1; i <= (r.photos||1); i++)
    imgs.push({"@type":"ImageObject","url":`${SITE}/photos/${folder}/${i}.jpg`,"contentLocation":"Picnic Tables, 31st Street, South Cocoa Beach, FL"});
  const iso = `${r.date}T${to24h(r.time)}:00-04:00`;
  const post = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${SITE}/reports/${folder}/`,
    "headline": r.seoTitle || r.headline,
    "name": r.seoTitle || r.headline,
    "description": r.seoDescription || r.text,
    "articleBody": r.text,
    "datePublished": iso,
    "dateModified": iso,
    "keywords": r.keywords ? r.keywords.join(', ') : 'Cocoa Beach surf report, Picnic Tables surf, South Cocoa Beach conditions',
    "inLanguage": "en-US",
    "isAccessibleForFree": true,
    "image": imgs,
    "author": {"@type":"Person","name":"Dog Walker — Picnic Tables, South Cocoa Beach","url":SITE},
    "publisher": {"@type":"Organization","@id":`${SITE}/#organization`,"name":"Dog Walker Surf Report","logo":{"@type":"ImageObject","url":`${SITE}/logo.png`}},
    "mainEntityOfPage": {"@type":"WebPage","@id":`${SITE}/reports/${folder}/`},
    "locationCreated": {"@type":"Place","name":"Picnic Tables — 31st Street, South Cocoa Beach","address":{"@type":"PostalAddress","streetAddress":"31st Street","addressLocality":"Cocoa Beach","addressRegion":"FL","postalCode":"32931","addressCountry":"US"},"geo":{"@type":"GeoCoordinates","latitude":28.3200,"longitude":-80.6076}}
  };
  return JSON.stringify(post);
}

// ── Build JSON-LD graph for homepage ─────────────────────
function buildJsonLd(reports) {
  const posts = reports.map(r => {
    const folder = r.folder || r.date;
    const imgs = [];
    for (let i = 1; i <= (r.photos||1); i++)
      imgs.push({"@type":"ImageObject","url":`${SITE}/photos/${folder}/${i}.jpg`,"contentLocation":"Picnic Tables, 31st Street, South Cocoa Beach, FL"});
    const iso = `${r.date}T${to24h(r.time)}:00-04:00`;
    return {
      "@type": "BlogPosting",
      "@id": `${SITE}/reports/${folder}/`,
      "headline": r.seoTitle || r.headline,
      "name": r.seoTitle || r.headline,
      "description": r.seoDescription || r.text,
      "articleBody": r.text,
      "datePublished": iso,
      "dateModified": iso,
      "keywords": r.keywords ? r.keywords.join(', ') : 'Cocoa Beach surf report, Picnic Tables surf, South Cocoa Beach conditions',
      "inLanguage": "en-US",
      "isAccessibleForFree": true,
      "image": imgs,
      "author": {"@type":"Person","name":"Dog Walker — Picnic Tables, South Cocoa Beach","url":SITE},
      "publisher": {"@type":"Organization","@id":`${SITE}/#organization`,"name":"Dog Walker Surf Report","logo":{"@type":"ImageObject","url":`${SITE}/logo.png`}},
      "mainEntityOfPage": {"@type":"WebPage","@id":`${SITE}/reports/${folder}/`},
      "locationCreated": {"@type":"Place","name":"Picnic Tables — 31st Street, South Cocoa Beach","address":{"@type":"PostalAddress","streetAddress":"31st Street","addressLocality":"Cocoa Beach","addressRegion":"FL","postalCode":"32931","addressCountry":"US"},"geo":{"@type":"GeoCoordinates","latitude":28.3200,"longitude":-80.6076}}
    };
  });
  return JSON.stringify({"@context":"https://schema.org","@graph":posts});
}

// ── Extract <style> blocks from index.html ───────────────
function extractStyles(html) {
  const styles = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) styles.push(m[0]);
  return styles.join('\n');
}

// ── Extract Google Fonts / external CSS links ────────────
function extractFontLinks(html) {
  const links = [];
  const re = /<link[^>]+href="[^"]*fonts[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) links.push(m[0]);
  // Also grab preconnect links
  const re2 = /<link[^>]+preconnect[^>]*>/gi;
  while ((m = re2.exec(html)) !== null) {
    if (!links.includes(m[0])) links.push(m[0]);
  }
  return links.join('\n');
}

// ── Generate individual report page HTML ─────────────────
function buildReportPage(r, idx, allReports, styles, fontLinks) {
  const folder = r.folder || r.date;
  const n = r.photos || 1;
  const pageTitle = r.seoTitle || `Cocoa Beach Surf Report — ${r.day} ${fmtDate(r.date)} | Dog Walker Surf Report`;
  const pageDesc = (r.seoDescription || r.text).substring(0, 155);
  const ogImg = `${SITE}/photos/${folder}/1.jpg`;
  const canonical = `${SITE}/reports/${folder}/`;

  // Prev / Next (chronological: prev = older = idx+1, next = newer = idx-1)
  const prevReport = idx < allReports.length - 1 ? allReports[idx + 1] : null;
  const nextReport = idx > 0 ? allReports[idx - 1] : null;

  // Photo gallery
  let thumbs = '';
  for (let i = 1; i <= n; i++) {
    const alt = (r.photoAlts && r.photoAlts[i-1]) ? r.photoAlts[i-1] : `Cocoa Beach surf photo ${i} — ${r.headline}`;
    thumbs += `<img src="/photos/${folder}/${i}.jpg" alt="${esc(alt)}" ${i===1?'class="active"':''} onclick="document.getElementById('rp-main').src=this.src;document.getElementById('rp-main').alt=this.alt;document.querySelectorAll('.rp-thumbs img').forEach(t=>t.classList.remove('active'));this.classList.add('active');">`;
  }

  const mainAlt = (r.photoAlts && r.photoAlts[0]) ? r.photoAlts[0] : `Cocoa Beach surf conditions at Picnic Tables — ${r.date}`;

  // Prev/Next nav HTML
  let navHtml = '<div class="rp-nav">';
  if (prevReport) {
    navHtml += `<a href="${reportUrl(prevReport)}" class="rp-nav-link rp-nav-prev">
      <span class="rp-nav-arrow">&larr;</span>
      <span class="rp-nav-label">Previous Report</span>
      <span class="rp-nav-date">${esc(prevReport.day)}, ${fmtDateShort(prevReport.date)}</span>
    </a>`;
  } else {
    navHtml += '<span></span>';
  }
  if (nextReport) {
    navHtml += `<a href="${reportUrl(nextReport)}" class="rp-nav-link rp-nav-next">
      <span class="rp-nav-arrow">&rarr;</span>
      <span class="rp-nav-label">Next Report</span>
      <span class="rp-nav-date">${esc(nextReport.day)}, ${fmtDateShort(nextReport.date)}</span>
    </a>`;
  } else {
    navHtml += '<span></span>';
  }
  navHtml += '</div>';

  const jsonLd = buildSingleJsonLd(r);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(pageDesc)}">
<meta name="keywords" content="${r.keywords ? esc(r.keywords.join(', ')) : 'Cocoa Beach surf report, Picnic Tables surf, South Cocoa Beach conditions'}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(pageTitle)}">
<meta property="og:description" content="${esc(pageDesc)}">
<meta property="og:image" content="${ogImg}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Dog Walker Surf Report">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(pageTitle)}">
<meta name="twitter:description" content="${esc(pageDesc)}">
<meta name="twitter:image" content="${ogImg}">
${fontLinks}
${styles}
<style>
/* ── Report page overrides ─────────────────────────────── */
.rp-header {
  background: var(--bg-dark, #0a1628);
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
}
.rp-header a { text-decoration: none; }
.rp-logo {
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: 22px;
  color: var(--accent, #4ecdc4);
  letter-spacing: 1px;
}
.rp-back {
  font-size: 13px;
  color: var(--text-light, #8899aa);
  transition: color .2s;
}
.rp-back:hover { color: var(--accent, #4ecdc4); }
.rp-wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}
.rp-main-photo {
  width: 100%;
  border-radius: 12px;
  max-height: 520px;
  object-fit: contain;
  display: block;
  margin-bottom: 12px;
  background: rgba(0,0,0,0.2);
}
.rp-thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 20px;
  -webkit-overflow-scrolling: touch;
}
.rp-thumbs img {
  width: 80px;
  height: 56px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity .2s, outline .2s;
  flex-shrink: 0;
}
.rp-thumbs img.active,
.rp-thumbs img:hover { opacity: 1; outline: 2px solid var(--accent, #4ecdc4); outline-offset: 2px; }
.rp-meta {
  font-size: 13px;
  color: var(--text-light, #8899aa);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}
.rp-headline {
  font-family: var(--font-display, 'Bebas Neue', sans-serif);
  font-size: clamp(24px, 5vw, 34px);
  color: var(--text, #e8f0fe);
  line-height: 1.15;
  margin: 0 0 14px;
}
.rp-text {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-secondary, #b0bec5);
  margin: 0 0 32px;
}
.rp-nav {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
}
.rp-nav-link {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  padding: 12px 16px;
  border-radius: 10px;
  background: var(--bg-card, rgba(255,255,255,0.03));
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  transition: border-color .2s, background .2s;
  min-width: 0;
}
.rp-nav-link:hover {
  border-color: var(--accent, #4ecdc4);
  background: rgba(78,205,196,0.05);
}
.rp-nav-prev { align-items: flex-start; }
.rp-nav-next { align-items: flex-end; margin-left: auto; }
.rp-nav-arrow { font-size: 18px; color: var(--accent, #4ecdc4); }
.rp-nav-label { font-size: 11px; color: var(--text-light, #8899aa); text-transform: uppercase; letter-spacing: 1px; margin: 2px 0; }
.rp-nav-date { font-size: 13px; color: var(--text, #e8f0fe); white-space: nowrap; }
.rp-home-link {
  display: block;
  text-align: center;
  margin-top: 24px;
  padding: 14px;
  background: var(--accent, #4ecdc4);
  color: var(--bg-dark, #0a1628);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.5px;
  border-radius: 8px;
  text-decoration: none;
  transition: opacity .2s;
}
.rp-home-link:hover { opacity: 0.85; }
.rp-footer {
  text-align: center;
  padding: 24px 16px;
  font-size: 12px;
  color: var(--text-light, #8899aa);
  border-top: 1px solid var(--border, rgba(255,255,255,0.08));
}
.rp-footer a { color: var(--accent, #4ecdc4); text-decoration: none; }
</style>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<header class="rp-header">
  <a href="/" class="rp-logo">Dog Walker Surf Report</a>
  <a href="/" class="rp-back">&larr; Today's Report</a>
</header>

<main class="rp-wrap">
  <img src="/photos/${folder}/1.jpg" alt="${esc(mainAlt)}" class="rp-main-photo" id="rp-main">
  <div class="rp-thumbs">${thumbs}</div>
  <div class="rp-meta">${esc(r.day)}, ${fmtDate(r.date)} &middot; ${esc(r.time)}</div>
  <h1 class="rp-headline">${esc(r.headline)}</h1>
  <p class="rp-text">${esc(r.text)}</p>
  ${navHtml}
  <a href="/" class="rp-home-link">🏄 Back to Today's Report & Live Conditions</a>
</main>

<footer class="rp-footer">
  &copy; 2026 Dog Walker Surf Report &middot; Cocoa Beach Surf Report from 31st St, South Cocoa Beach, FL<br>
  <a href="/">Home</a> &middot; <a href="/archives.html">Archives</a> &middot; <a href="/advertise.html">Advertise</a> &middot; <a href="mailto:dogwalkersurfreport@gmail.com">dogwalkersurfreport@gmail.com</a>
</footer>
</body>
</html>`;
}

// ── Copy directory recursively ───────────────────────────
function copyDir(src, dest, skipSet) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipSet.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d, skipSet);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ── Main build ───────────────────────────────────────────
function build() {
  console.log('🏄 Building Dog Walker Surf Report...');

  const reports = JSON.parse(fs.readFileSync('reports.json', 'utf8'));
  let html = fs.readFileSync('index.html', 'utf8');

  // Extract styles & fonts for report pages
  const styles = extractStyles(html);
  const fontLinks = extractFontLinks(html);

  if (!reports.length) {
    console.log('⚠️  No reports — copying as-is');
  } else {
    let recent = reports.filter(r => withinDays(r.date, MAX_DAYS));
    if (!recent.length) recent = reports.slice(0, 5);

    const latest = recent[0];
    console.log(`📋 ${reports.length} total, ${recent.length} recent — latest: ${latest.date} ${latest.time}`);

    // 1. Replace "Loading report..." with static report
    html = html.replace(
      '<div id="today-report"><div class="report-card" style="padding:24px;text-align:center;color:var(--text-light)">Loading report...</div></div>',
      `<div id="today-report">${renderToday(latest)}</div>`
    );

    // 2. Replace "Loading archive..." with static archive (now with links!)
    html = html.replace(
      '<div id="archive-list"><div class="report-card" style="padding:24px;text-align:center;color:var(--text-light)">Loading archive...</div></div>',
      `<div id="archive-list">${renderArchive(recent)}</div>`
    );

    // 3. Update <title>
    const dateStr = fmtDateShort(latest.date);
    const newTitle = `Cocoa Beach Surf Report — ${latest.day} ${dateStr} | Dog Walker Surf Report`;
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(newTitle)}</title>`);

    // 4. Update meta description
    const desc = (latest.seoDescription || latest.text).substring(0, 155);
    html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);

    // 5. Update OG tags
    html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(newTitle)}">`);
    html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);

    // 6. Add og:image
    const ogImg = `${SITE}/photos/${latest.folder || latest.date}/1.jpg`;
    if (html.includes('og:image')) {
      html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${ogImg}">`);
    } else {
      html = html.replace('<meta property="og:type" content="website">', `<meta property="og:type" content="website">\n<meta property="og:image" content="${ogImg}">`);
    }

    // 7. Inject JSON-LD for reports
    const jsonLd = buildJsonLd(recent.slice(0, 10));
    html = html.replace('</head>', `<script type="application/ld+json" id="dwsr-report-schema">${jsonLd}</script>\n</head>`);

    console.log('✅ Injected report, archive, meta tags, og:image, JSON-LD');

    // ── 8. Generate individual report pages ──────────────
    let pageCount = 0;
    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      const folder = r.folder || r.date;
      const dir = path.join(OUT, 'reports', folder);
      fs.mkdirSync(dir, { recursive: true });
      const pageHtml = buildReportPage(r, i, reports, styles, fontLinks);
      fs.writeFileSync(path.join(dir, 'index.html'), pageHtml);
      pageCount++;
    }
    console.log(`📄 Generated ${pageCount} individual report pages → ${OUT}/reports/`);
  }

  // ── Write index.html to public/ ──
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  // Copy everything else to public/
  const skip = new Set(['node_modules', OUT, '.git', '.gitignore', 'build.js', 'package.json', 'package-lock.json', 'vercel.json', '.vercel','index.html','api']);
  copyDir('.', OUT, skip);

  console.log(`🏄 Build complete → ${OUT}/`);
}

build();
