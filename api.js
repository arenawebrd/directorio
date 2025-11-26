// loadData() fetches the published CSV and parses it into objects
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSIEOUVLIXPvHK6BoHxM8c55p6M3zf8g1p7Lhj2DD1ukJIHIuWFf6Vo7HlH7OR_dOLU5fkZLA5T-j2h/pub?gid=1509118300&single=true&output=csv";

function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i+1];
    if (ch === '"' ) {
      if (inQuotes && next === '"') {
        cur += '"'; i++; // escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // handle CRLF
      if (ch === '\r' && next === '\n') continue;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += ch;
  }
  // push last
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

async function loadData() {
  // simple sessionStorage cache to avoid refetching CSV during the same session
  const cacheKey = 'csv_cache_' + btoa(CSV_URL);
  let text = null;
  try{
    const cached = sessionStorage.getItem(cacheKey);
    if(cached){ const parsed = JSON.parse(cached); if(parsed && parsed.ts && (Date.now() - parsed.ts) < 1000*60*60*6){ text = parsed.text; } }
  }catch(e){ /* ignore cache errors */ }
  if(!text){ const res = await fetch(CSV_URL); text = await res.text(); try{ sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), text })); }catch(e){} }
  const rows = parseCSV(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const raw = rows.slice(1).filter(r => r.some(cell => cell && cell.trim() !== '')).map((row, idx) => {
    const obj = {};
    headers.forEach((h,i) => {
      obj[h] = row[i] ? row[i].trim() : '';
    });
    return obj;
  });

  // generate a URL-friendly slug for each business if not present
  function slugify(s){
    if(!s) return '';
    // normalize accents, remove diacritics
    let out = s.toString().trim().toLowerCase();
    out = out.normalize && out.normalize('NFD').replace(/\p{Diacritic}/gu, '') || out.replace(/[\u0300-\u036f]/g,'');
    out = out.replace(/[^a-z0-9]+/g,'-');
    out = out.replace(/^-+|-+$/g,'');
    out = out.replace(/-{2,}/g,'-');
    return out || '';
  }

  const seen = Object.create(null);
  const data = raw.map((obj, i) => {
    // possible slug fields from CSV
    const slugCandidates = [
      obj.slug, obj.header_slug, obj['header-slug'], obj['header slug'], obj.url_slug, obj['url-slug']
    ].filter(Boolean);
    let base = slugCandidates.length ? slugCandidates[0] : (obj.name || obj.title || '');
    let s = slugify(base || 'item');
    // ensure unique
    if(!s) s = 'item';
    if(seen[s]){
      let n = ++seen[s];
      // try with suffix until unique
      while(seen[s + '-' + n]) n++;
      s = s + '-' + n;
      seen[s] = 1;
    } else {
      seen[s] = 1;
    }
    return Object.assign({}, obj, { _src_index: i, slug: s });
  });

  return data;
}
