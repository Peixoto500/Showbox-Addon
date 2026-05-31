const express = require('express');
const cors = require('cors');
const { getShowboxStreams } = require('./showbox');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7860;

const FEBBOX_UI_COOKIE = process.env.FEBBOX_UI_COOKIE || '';
const TMDB_API_KEY     = process.env.TMDB_API_KEY     || '';

const manifest = {
  id: 'community.showbox-febbox-streams',
  version: '4.0.0',
  name: 'ShowBox Streams',
  description: 'Direct HTTP streams via ShowBox + FebBox.',
  logo: 'https://www.febbox.com/favicon.ico',
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt'],
  catalogs: [],
  behaviorHints: { adult: false, p2p: false },
};

app.get('/', (req, res) => {
  const hasCookie = !!FEBBOX_UI_COOKIE;
  const hasKey    = !!TMDB_API_KEY;
  const host = req.headers.host ? `https://${req.headers.host}` : `http://localhost:${PORT}`;

  res.send(`<!DOCTYPE html><html>
<head><title>ShowBox Streams</title>
<style>
  *{box-sizing:border-box}body{font-family:-apple-system,sans-serif;max-width:640px;
  margin:60px auto;color:#e0e0e0;background:#0f0f0f;padding:24px}h1{color:#fff}
  .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:12px;margin:2px}
  .ok{background:#1e4d1e}.no{background:#4d1e1e}
  .btn{display:inline-block;padding:12px 26px;background:#7b5ea7;color:#fff;
  text-decoration:none;border-radius:8px;font-size:15px;margin-top:8px}
  code{background:#1e1e1e;padding:2px 7px;border-radius:4px;font-size:13px}
</style></head>
<body>
<h1>🎬 ShowBox Streams</h1>
<span class="badge ${hasCookie?'ok':'no'}">${hasCookie?'✅ FebBox cookie set':'⚠️ No FebBox cookie'}</span>
<span class="badge ${hasKey?'ok':'no'}">${hasKey?'✅ TMDB key set':'⚠️ No TMDB key'}</span>
<p>Stremio addon for direct HTTP streams via ShowBox + FebBox.</p>
<a class="btn" href="stremio://${host.replace(/^https?:\/\//,'')}/manifest.json">➕ Install in Stremio</a>
<p style="font-size:13px;color:#666;margin-top:8px">Or add manually:<br>
<code>${host}/manifest.json</code></p>
</body></html>`);
});

app.get('/manifest.json', (_req, res) => res.json(manifest));

app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  let imdbId, season, episode;

  if (type === 'series') {
    const p = id.split(':');
    imdbId = p[0]; season = +p[1]; episode = +p[2];
  } else {
    imdbId = id;
  }

  console.log(`[req] ${type} ${imdbId}${season != null ? ` S${season}E${episode}` : ''}`);

  if (!TMDB_API_KEY) {
    console.error('[err] TMDB_API_KEY not set');
    return res.json({ streams: [] });
  }

  try {
    const streams = await getShowboxStreams({
      imdbId,
      type,
      season: season ?? null,
      episode: episode ?? null,
      uiCookie: FEBBOX_UI_COOKIE || null,
      tmdbApiKey: TMDB_API_KEY,
    });
    console.log(`[res] ${streams.length} stream(s)`);
    res.json({ streams });
  } catch (err) {
    console.error('[err]', err.message);
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => {
  console.log(`🎬 ShowBox Addon — port ${PORT}`);
  console.log(TMDB_API_KEY && FEBBOX_UI_COOKIE ? '✅ All secrets loaded' : '⚠️  Missing secrets');
});
