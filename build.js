/**
 * build.js — Pre-renders reports into index.html for SEO
 * 
 * Outputs to public/ which Vercel serves by default.
 * Reads reports.json, bakes the latest report into index.html
 * so Google sees real content instead of "Loading report..."
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

// ── Render today's report as static HTML ─────────────────
function renderToday(r) {
  const folder = r.folder || r.date;
  const n = r.photos || 1;
  let thumbs = '';
  for (let i = 1; i <= n; i++)
    thumbs += `<img src="photos/${folder}/${i}.jpg" alt="Cocoa Beach surf photo ${i} — ${esc(r.headline)}" ${i===1?'class="active"':''}>`;

  return `<div class="report-card">
        <img src="photos/${folder}/1.jpg" alt="Cocoa Beach surf conditions at Picnic Tables — ${r.date}" class="report-photo-main" id="main-photo">
        <div class="report-thumbnails">${thumbs}</div>
        <div class="report-body">
          <div class="report-meta">${esc(r.day)}, ${fmtDate(r.date)} &middot; ${esc(r.time)}</div>
          <h2 class="report-headline">${esc(r.headline)}</h2>
          <p class="report-text">${esc(r.text)}</p>
        </div>
      </div>`;
}

// ── Render archive list as static HTML ───────────────────
function renderArchive(reports) {
  if (reports.length <= 1)
    return '<div class="report-card" style="padding:24px;text-align:center;color:var(--text-light)">More reports coming soon.</div>';
  let html = '';
  for (let i = 1; i < reports.length; i++) {
    const r = reports[i];
    const folder = r.folder || r.date;
    html += `<div class="archive-item">
          <img src="photos/${folder}/1.jpg" alt="${esc(r.day)} ${r.date}" class="archive-thumb">
          <div><div class="archive-date">${esc(r.day)}, ${fmtDate(r.date)} &middot; ${esc(r.time)}</div>
          <div class="archive-headline">${esc(r.headline)}</div></div>
        </div>`;
  }
  return html;
}

// ── Build JSON-LD for reports ────────────────────────────
function buildJsonLd(reports) {
  const posts = reports.map(r => {
    const folder = r.folder || r.date;
    const imgs = [];
    for (let i = 1; i <= (r.photos||1); i++)
      imgs.push({"@type":"ImageObject","url":`${SITE}/photos/${folder}/${i}.jpg`,"contentLocation":"Picnic Tables, 31st Street, South Cocoa Beach, FL"});
    const iso = `${r.date}T${to24h(r.time)}:00-04:00`;
    return {
      "@type": "BlogPosting",
      "@id": `${SITE}/#report-${folder}`,
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
      "mainEntityOfPage": {"@type":"WebPage","@id":SITE},
      "locationCreated": {"@type":"Place","name":"Picnic Tables — 31st Street, South Cocoa Beach","address":{"@type":"PostalAddress","streetAddress":"31st Street","addressLocality":"Cocoa Beach","addressRegion":"FL","postalCode":"32931","addressCountry":"US"},"geo":{"@type":"GeoCoordinates","latitude":28.3200,"longitude":-80.6076}}
    };
  });
  return JSON.stringify({"@context":"https://schema.org","@graph":posts});
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

    // 2. Replace "Loading archive..." with static archive
    html = html.replace(
      '<div id="archive-list"><div class="report-card" style="padding:24px;text-align:center;color:var(--text-light)">Loading archive...</div></div>',
      `<div id="archive-list">${renderArchive(recent)}</div>`
    );

    // 3. Update <title>
    const dateStr = fmtDate(latest.date);
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
  }

  // ── Write to public/ ──
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'index.html'), html);

  // Copy everything else to public/
  const skip = new Set(['node_modules', OUT, '.git', '.gitignore', 'build.js', 'package.json', 'package-lock.json', 'vercel.json', '.vercel','index.html','api']);
  copyDir('.', OUT, skip);

  console.log(`🏄 Build complete → ${OUT}/`);
}

build();
