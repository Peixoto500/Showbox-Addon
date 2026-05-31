const express = require('express');
const cors = require('cors');
const { getShowboxStreams } = require('./showbox');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 7860;

const FEBBOX_UI_COOKIE = process.env.FEBBOX_UI_COOKIE || '';
const SHOWBOX_PROXY    = process.env.SHOWBOX_PROXY_URL   || null;
const FEBBOX_PROXY     = process.env.FEBBOX_PROXY_URL    || null;
const TMDB_API_KEY     = process.env.TMDB_API_KEY     || '';

const manifest = {
  id: 'community.showbox-febbox-streams',
  version: '3.0.0',
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
  const host = process.env.SPACE_HOST
    ? `https://${process.env.SPACE_HOST}`
    : `http://localhost:${PORT}`;

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
  .box{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px;margin:18px 0}
  .box h3{margin-top:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px}
  ol{margin:0;padding-left:18px;line-height:2;font-size:14px}a{color:#9b79d4}
</style></head>
<body>
<h1>🎬 ShowBox Streams</h1>
<span class="badge ${hasCookie?'ok':'no'}">${hasCookie?'✅ FebBox cookie set':'⚠️ No FebBox cookie'}</span>
<span class="badge ${hasKey?'ok':'no'}">${hasKey?'✅ TMDB key set':'⚠️ No TMDB key'}</span>

<p>Stremio addon for direct HTTP streams via ShowBox + FebBox.</p>
<a class="btn" href="stremio://${host.replace(/^https?:\/\//,'')}/manifest.json">➕ Install in Stremio</a>
<p style="font-size:13px;color:#666;margin-top:8px">Or add manually:<br>
<code>${host}/manifest.json</code></p>

<div class="box">
  <h3>Required: FebBox ui cookie</h3>
  <ol>
    <li>Go to <a href="https://www.febbox.com" target="_blank">febbox.com</a> → log in with Google</li>
    <li>Press F12 → Application → Cookies → <code>febbox.com</code></li>
    <li>Copy the value of the <strong>ui</strong> cookie</li>
    <li>Add as secret <code>FEBBOX_UI_COOKIE</code> in HuggingFace Space settings</li>
  </ol>
</div>

<div class="box">
  <h3>Required: TMDB API key</h3>
  <ol>
    <li>Go to <a href="https://www.themoviedb.org/signup" target="_blank">themoviedb.org</a> → sign up free</li>
    <li>Go to Settings → API → Request a v3 API Key (takes ~1 min)</li>
    <li>Add as secret <code>TMDB_API_KEY</code> in HuggingFace Space settings</li>
  </ol>
</div>
</body></html>`);
});

app.get('/manifest.json', (_req, res) => res.json(manifest));

app.get('/deploy', (_req, res) => res.sendFile(__dirname + '/deploy.html'));

// Proxy the Cloudflare Worker deploy API call (avoids browser CORS)
app.post('/deploy-worker', express.json(), async (req, res) => {
  const { accountId, apiToken } = req.body;
  if (!accountId || !apiToken) return res.json({ success: false, error: 'Missing fields' });

  const workerCode = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    const destination = url.searchParams.get("destination");
    if (!destination) return new Response("Missing destination", { status: 400 });
    const res = await fetch(decodeURIComponent(destination), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};`;

  try {
    const axios = require('axios');
    const FormData = require('form-data');
    const form = new FormData();
    form.append('metadata', Buffer.from(JSON.stringify({
      main_module: 'worker.js',
      compatibility_date: '2024-01-01',
    })), { filename: 'metadata', contentType: 'application/json' });
    form.append('worker.js', Buffer.from(workerCode), { filename: 'worker.js', contentType: 'application/javascript+module' });

    const cfRes = await axios.put(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/showbox-proxy`,
      form,
      { headers: { Authorization: `Bearer ${apiToken}`, ...form.getHeaders() } }
    );

    if (!cfRes.data.success) return res.json({ success: false, error: cfRes.data.errors?.[0]?.message });

    // Get subdomain
    const subRes = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { headers: { Authorization: `Bearer ${apiToken}` } }
    );
    const subdomain = subRes.data.result?.subdomain || 'YOUR_SUBDOMAIN';
    const proxyUrl = `https://showbox-proxy.${subdomain}.workers.dev`;
    res.json({ success: true, proxyUrl });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.errors?.[0]?.message || err.message });
  }
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const { type, id } = req.params;
  let imdbId, season, episode;

  if (type === 'series') {
    const p = id.split(':');
    imdbId = p[0]; season = +p[1]; episode = +p[2];
  } else {
    imdbId = id;
  }

  console.log(`\n[req] ${type} ${imdbId}${season != null ? ` S${season}E${episode}` : ''}`);

  if (!TMDB_API_KEY) {
    console.error('[err] TMDB_API_KEY not set!');
    return res.json({ streams: [] });
  }
  if (!FEBBOX_UI_COOKIE) {
    console.warn('[warn] FEBBOX_UI_COOKIE not set — streams may fail');
  }

  try {
    const streams = await getShowboxStreams({
      imdbId,
      type,
      season: season ?? null,
      episode: episode ?? null,
      uiCookie: FEBBOX_UI_COOKIE,
      tmdbApiKey: TMDB_API_KEY,
      sbProxy: SHOWBOX_PROXY,
      fbProxy: FEBBOX_PROXY,
    });
    res.json({ streams });
  } catch (err) {
    console.error('[err]', err.message);
    res.json({ streams: [] });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 ShowBox Stremio Addon — port ${PORT}`);
  if (!TMDB_API_KEY)     console.log('⚠  TMDB_API_KEY not set — addon will not work');
  if (!FEBBOX_UI_COOKIE) console.log('⚠  FEBBOX_UI_COOKIE not set — streams may fail');
  if (TMDB_API_KEY && FEBBOX_UI_COOKIE) console.log('✅ All secrets loaded');
});
