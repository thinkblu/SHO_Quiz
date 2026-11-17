/**
 * Kuiz SHO – penerima markah dan kemajuan untuk Google Sheet "Markah Kuiz SHO". Versi 3 (e-mel; kemajuan turut membawa markah semua bab).
 *
 * Cara pasang / kemas kini:
 * 1. Buka Google Sheet "Markah Kuiz SHO" → Extensions → Apps Script.
 * 2. Padam kod sedia ada, tampal SEMUA kod dalam fail ini, tekan Save.
 * 3. Kali pertama: Deploy → New deployment → "Web app", Execute as: Me, Who has access: Anyone.
 *    Kemas kini: Deploy → Manage deployments → ikon pensel → Version: New version → Deploy
 *    (URL web app kekal sama).
 *
 * Tab yang digunakan:
 *   Modul 1–4 : Nama Peserta | E-mel | Tarikh Daftar | kod bab ... | Jumlah | Peratus
 *   Kemajuan  : E-mel | Nama Peserta | Kemajuan (JSON aplikasi) | Kemas kini
 *
 * GET  ?action=lookup&email=...            → {found, name, progress}
 * POST {action:"register", email, name}
 * POST {action:"score", email, name, module, chapter, score}   (markah tertinggi disimpan)
 * POST {action:"progress", email, name, progress, scores}       (kemajuan terkini peserta; scores = {bab: {m, s}})
 */

const VERSION = 3;
const TABS = { 1: 'Modul 1', 2: 'Modul 2', 3: 'Modul 3', 4: 'Modul 4' };
const PROGRESS_TAB = 'Kemajuan';
const FIRST_ROW = 3;        // modul: baris 1 = kod bab, baris 2 = tajuk bab, data bermula baris 3
const MAX_PER_CHAPTER = 20; // 20 soalan, 1 markah setiap jawapan betul

function doGet(e) {
  const p = (e && e.parameter) || {};
  let res;
  try {
    res = p.action === 'lookup' ? lookup(p.email) : { ok: true, service: 'Kuiz SHO', version: VERSION };
  } catch (err) {
    res = { ok: false, error: String(err), version: VERSION };
  }
  if (p.callback && /^[A-Za-z_$][\w$.]*$/.test(p.callback)) {
    return ContentService.createTextOutput(p.callback + '(' + JSON.stringify(res) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return reply(res);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    const email = cleanEmail(d.email);
    const name = cleanName(d.name);
    if (!email) return reply({ ok: false, error: 'e-mel tidak sah' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (d.action === 'register') {
      registerAll(ss, email, name);
      return reply({ ok: true });
    }

    if (d.action === 'score') {
      registerAll(ss, email, name);
      const ok = writeScore(ss, d.module, d.chapter, d.score, email, name);
      return reply(ok ? { ok: true } : { ok: false, error: 'bab tidak sah' });
    }

    if (d.action === 'progress') {
      const sh = progressSheet(ss);
      let row = findRow(sh, 1, email, 2);
      if (!row) row = Math.max(sh.getLastRow() + 1, 2);
      const json = JSON.stringify(d.progress || {});
      if (json.length > 49000) return reply({ ok: false, error: 'data terlalu besar' });
      const current = row <= sh.getLastRow() ? sh.getRange(row, 2).getValue() : '';
      sh.getRange(row, 1, 1, 4).setValues([[email, current || name, json, new Date()]]);
      if (d.scores && typeof d.scores === 'object') {
        registerAll(ss, email, name);
        Object.keys(d.scores).forEach(ch => writeScore(ss, d.scores[ch].m, ch, d.scores[ch].s, email, name));
      }
      return reply({ ok: true });
    }

    return reply({ ok: false, error: 'tindakan tidak sah' });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Tulis markah bab; markah tertinggi disimpan. */
function writeScore(ss, module, chapter, value, email, name) {
  const sh = ss.getSheetByName(TABS[module]);
  if (!sh) return false;
  const col = headers(sh).indexOf(String(chapter)) + 1;
  if (col < 1 || col <= colIndex(sh, 'Tarikh Daftar')) return false;
  const row = rowFor(sh, email, name);
  const score = Math.max(0, Math.min(MAX_PER_CHAPTER, Math.round(Number(value) || 0)));
  const cell = sh.getRange(row, col);
  const current = cell.getValue();
  if (current === '' || score > Number(current)) cell.setValue(score);
  return true;
}

/** Cari peserta mengikut e-mel: nama dan kemajuan tersimpan. */
function lookup(rawEmail) {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: 'e-mel tidak sah', version: VERSION };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ps = progressSheet(ss);
  const pr = findRow(ps, 1, email, 2);
  if (pr) {
    const v = ps.getRange(pr, 1, 1, 3).getValues()[0];
    let progress = {};
    try { progress = JSON.parse(v[2] || '{}'); } catch (err) { progress = {}; }
    return { ok: true, version: VERSION, found: true, name: String(v[1]), progress: progress };
  }
  for (const t of Object.values(TABS)) {
    const sh = ss.getSheetByName(t);
    const r = findRow(sh, colIndex(sh, 'E-mel'), email, FIRST_ROW);
    if (r) return { ok: true, version: VERSION, found: true, name: String(sh.getRange(r, 1).getValue()), progress: {} };
  }
  return { ok: true, version: VERSION, found: false };
}

function registerAll(ss, email, name) {
  Object.values(TABS).forEach(t => rowFor(ss.getSheetByName(t), email, name));
}

/** Baris peserta dalam tab modul: cari ikut e-mel, kemudian ikut nama tanpa e-mel (pendaftaran lama), atau tambah baris baharu. */
function rowFor(sh, email, name) {
  const emailCol = colIndex(sh, 'E-mel');
  let row = findRow(sh, emailCol, email, FIRST_ROW);
  if (row) return row;
  if (name) {
    const last = sh.getLastRow();
    if (last >= FIRST_ROW) {
      const vals = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, emailCol).getValues();
      const i = vals.findIndex(r => String(r[0]).trim().toUpperCase() === name.toUpperCase() && String(r[emailCol - 1]).trim() === '');
      if (i >= 0) {
        sh.getRange(FIRST_ROW + i, emailCol).setValue(email);
        return FIRST_ROW + i;
      }
    }
  }
  row = Math.max(sh.getLastRow() + 1, FIRST_ROW);
  const h = headers(sh);
  const dateCol = h.indexOf('Tarikh Daftar') + 1;
  const total = h.indexOf('Jumlah') + 1;
  sh.getRange(row, 1).setValue(name || email);
  sh.getRange(row, emailCol).setValue(email);
  sh.getRange(row, dateCol).setValue(new Date());
  sh.getRange(row, total).setFormulaR1C1('=SUM(RC' + (dateCol + 1) + ':RC' + (total - 1) + ')');
  sh.getRange(row, total + 1).setFormulaR1C1('=IF(R2C' + total + '=0,0,RC' + total + '/R2C' + total + ')');
  return row;
}

function findRow(sh, col, value, firstRow) {
  const last = sh.getLastRow();
  if (!col || last < firstRow) return 0;
  const vals = sh.getRange(firstRow, col, last - firstRow + 1, 1).getValues();
  const want = String(value).trim().toLowerCase();
  const i = vals.findIndex(r => String(r[0]).trim().toLowerCase() === want);
  return i >= 0 ? firstRow + i : 0;
}

function headers(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
}

function colIndex(sh, label) {
  return headers(sh).indexOf(label) + 1;
}

function progressSheet(ss) {
  let sh = ss.getSheetByName(PROGRESS_TAB);
  if (!sh) {
    sh = ss.insertSheet(PROGRESS_TAB);
    sh.getRange(1, 1, 1, 4).setValues([['E-mel', 'Nama Peserta', 'Kemajuan (data aplikasi, jangan diubah)', 'Kemas kini']]);
  }
  return sh;
}

function cleanEmail(s) {
  const e = String(s || '').trim().toLowerCase();
  return /^[^\s@=+]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120 ? e : '';
}

/** Kemaskan nama dan elakkan teks yang boleh dibaca sebagai formula. */
function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@']+/, '').slice(0, 80);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
