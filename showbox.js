// showbox.js — ShowBox/FebBox streams via febapi.nuvioapp.space
// Clean REST API — no encryption needed!
const axios = require('axios');

const FEBAPI    = 'https://febapi.nuvioapp.space/api/media';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// ─── TMDB: IMDB → TMDB ID ────────────────────────────────────────────────────
async function getTmdbInfo(imdbId, tmdbApiKey) {
  const res = await axios.get(`${TMDB_BASE}/find/${imdbId}`, {
    params: { external_source: 'imdb_id', api_key: tmdbApiKey },
    timeout: 10000,
    headers: { 'User-Agent': UA },
  });
  const d = res.data;
  if (d.movie_results?.length) {
    const m = d.movie_results[0];
    return { tmdbId: m.id, type: 'movie', title: m.title };
  }
  if (d.tv_results?.length) {
    const t = d.tv_results[0];
    return { tmdbId: t.id, type: 'tv', title: t.name };
  }
  return null;
}

// ─── FebAPI: get streams ──────────────────────────────────────────────────────
async function fetchFromFebApi(tmdbId, type, season, episode, uiCookie, region = 'USA7', proxy = null) {
  let url;
  if (type === 'tv') {
    url = `${FEBAPI}/tv/${tmdbId}/oss=${region}/${season}/${episode}`;
  } else {
    url = `${FEBAPI}/movie/${tmdbId}/oss=${region}`;
  }

  if (uiCookie) {
    url += `?cookie=${encodeURIComponent(uiCookie)}`;
  }

  const finalUrl = proxy ? `${proxy}${encodeURIComponent(url)}` : url;
  console.log(`[FebAPI] GET ${url.replace(uiCookie || 'x', '***')}`);

  const res = await axios.get(finalUrl, {
    timeout: 20000,
    headers: { 'User-Agent': UA },
  });

  console.log(`[FebAPI] status=${res.status} data=${JSON.stringify(res.data).slice(0, 300)}`);
  return res.data;
}

// ─── Quality parser ───────────────────────────────────────────────────────────
function parseQuality(label = '') {
  const l = label.toUpperCase();
  if (l.includes('2160') || l.includes('4K') || l.includes('UHD')) return '4K';
  if (l.includes('1080')) return '1080p';
  if (l.includes('720'))  return '720p';
  if (l.includes('480'))  return '480p';
  if (l.includes('360'))  return '360p';
  return label || 'HD';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function getShowboxStreams({ imdbId, type, season, episode, uiCookie, tmdbApiKey, sbProxy }) {
  const log = msg => console.log(`[ShowBox] ${msg}`);

  // Step 1: IMDB → TMDB
  log(`Resolving TMDB ID for ${imdbId}...`);
  const info = await getTmdbInfo(imdbId, tmdbApiKey);
  if (!info) { log('Not found on TMDB'); return []; }
  log(`TMDB: ${info.title} (id=${info.tmdbId}, type=${info.type})`);

  // Step 2: Fetch from FebAPI
  log(`Fetching streams from FebAPI...`);
  const data = await fetchFromFebApi(
    info.tmdbId,
    info.type,
    season,
    episode,
    uiCookie,
    undefined,
    sbProxy,
  );

  // Step 3: Parse response
  // Response shape: { versions: [{ name, size, links: [{ name, url, quality, size }] }] }
  const versions = data?.versions || data?.data?.versions || [];
  if (!versions.length) {
    log('No versions in FebAPI response');
    return [];
  }

  const streams = [];
  for (const version of versions) {
    const links = version.links || [];
    for (const link of links) {
      const url = link.url || link.file;
      if (!url) continue;

      const quality = parseQuality(link.quality || link.name || version.name);
      const size = link.size || version.size || '';

      streams.push({
        url,
        name: `ShowBox\n${quality}`,
        description: [version.name, size].filter(Boolean).join(' · '),
        quality,
        behaviorHints: {
          notWebReady: false,
          filename: version.name || `${imdbId}.mkv`,
        },
      });
    }
  }

  log(`Found ${streams.length} stream(s)`);
  return streams;
}

module.exports = { getShowboxStreams };
