/**
 * Kuiz SHO – penerima markah untuk Google Sheet "Markah Kuiz SHO".
 *
 * Cara pasang (sekali sahaja):
 * 1. Buka Google Sheet "Markah Kuiz SHO" → Extensions → Apps Script.
 * 2. Padam kod sedia ada, tampal SEMUA kod dalam fail ini, tekan Save.
 * 3. Deploy → New deployment → jenis "Web app".
 *    Execute as: Me   ·   Who has access: Anyone
 * 4. Tekan Deploy, benarkan akses (Authorize), salin "Web app URL".
 *
 * Aplikasi kuiz menghantar dua jenis permintaan:
 *   {action:"register", name}                      → nama ditambah ke semua tab Modul 1–4
 *   {action:"score", name, module, chapter, score} → markah bab ditulis (markah tertinggi disimpan)
 */

const TABS = { 1: 'Modul 1', 2: 'Modul 2', 3: 'Modul 3', 4: 'Modul 4' };
const FIRST_ROW = 3;        // baris 1 = kod bab, baris 2 = tajuk bab, data bermula baris 3
const MAX_PER_CHAPTER = 20; // 20 soalan, 1 markah setiap jawapan betul

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    const name = cleanName(d.name);
    if (!name) return reply({ ok: false, error: 'nama kosong' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (d.action === 'register') {
      Object.values(TABS).forEach(t => rowFor(ss.getSheetByName(t), name));
      return reply({ ok: true });
    }

    if (d.action === 'score') {
      const sh = ss.getSheetByName(TABS[d.module]);
      if (!sh) return reply({ ok: false, error: 'modul tidak sah' });
      Object.values(TABS).forEach(t => rowFor(ss.getSheetByName(t), name)); // pastikan nama ada di semua tab
      const row = rowFor(sh, name);
      const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      const col = header.indexOf(String(d.chapter)) + 1;
      if (col < 3) return reply({ ok: false, error: 'bab tidak sah' });
      const score = Math.max(0, Math.min(MAX_PER_CHAPTER, Math.round(Number(d.score) || 0)));
      const cell = sh.getRange(row, col);
      const current = cell.getValue();
      if (current === '' || score > Number(current)) cell.setValue(score);
      return reply({ ok: true });
    }

    return reply({ ok: false, error: 'tindakan tidak sah' });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return reply({ ok: true, service: 'Kuiz SHO' });
}

/** Cari baris peserta (tidak sensitif huruf besar/kecil); tambah baris baharu jika belum ada. */
function rowFor(sh, name) {
  const last = sh.getLastRow();
  if (last >= FIRST_ROW) {
    const names = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 1).getValues()
      .map(r => String(r[0]).trim().toUpperCase());
    const i = names.indexOf(name.toUpperCase());
    if (i >= 0) return FIRST_ROW + i;
  }
  const row = Math.max(last + 1, FIRST_ROW);
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const total = header.indexOf('Jumlah') + 1;
  sh.getRange(row, 1, 1, 2).setValues([[name, new Date()]]);
  sh.getRange(row, total).setFormulaR1C1('=SUM(RC3:RC' + (total - 1) + ')');
  sh.getRange(row, total + 1).setFormulaR1C1('=IF(R2C' + total + '=0,0,RC' + total + '/R2C' + total + ')');
  return row;
}

/** Kemaskan nama dan elakkan teks yang boleh dibaca sebagai formula. */
function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().replace(/^[=+\-@']+/, '').slice(0, 80);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
