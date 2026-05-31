const axios = require('axios');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const FEBAPI_BASE_URL = 'https://febapi.nuvioapp.space/api/media';

const parseQualityFromLabel = (label) => {
    if (!label) return "ORG";
    const l = String(label).toLowerCase();
    if (l.includes('2160') || l.includes('4k') || l.includes('uhd')) return "2160p";
    if (l.includes('1080')) return "1080p";
    if (l.includes('720') || l.includes('hd')) return "720p";
    if (l.includes('480') || l.includes('sd')) return "480p";
    if (l.includes('360')) return "360p";
    return "ORG";
};

const extractCodecDetails = (text) => {
    if (!text) return [];
    const details = new Set();
    const t = text.toLowerCase();
    if (t.includes('dolby vision') || t.includes('dovi')) details.add('DV');
    if (t.includes('hdr10+')) details.add('HDR10+');
    else if (t.includes('hdr')) details.add('HDR');
    if (t.includes('av1')) details.add('AV1');
    else if (t.includes('h265') || t.includes('x265') || t.includes('hevc')) details.add('H.265');
    else if (t.includes('h264') || t.includes('x264') || t.includes('avc')) details.add('H.264');
    if (t.includes('atmos')) details.add('Atmos');
    if (t.includes('truehd')) details.add('TrueHD');
    if (t.includes('dts-hd ma')) details.add('DTS-HD MA');
    else if (t.includes('dts-hd')) details.add('DTS-HD');
    else if (t.includes('dts')) details.add('DTS');
    if (t.includes('eac3') || t.includes('dd+')) details.add('EAC3');
    else if (t.includes('ac3')) details.add('AC3');
    if (t.includes('aac')) details.add('AAC');
    return Array.from(details);
};

const convertImdbToTmdb = async (imdbId, expectedType = null) => {
    try {
        const res = await axios.get(`${TMDB_BASE_URL}/find/${imdbId}`, {
            params: { api_key: TMDB_API_KEY, external_source: 'imdb_id' },
            timeout: 10000
        });
        const d = res.data;
        if (expectedType === 'tv' || expectedType === 'series') {
            if (d.tv_results?.length) return { tmdbId: String(d.tv_results[0].id), tmdbType: 'tv', title: d.tv_results[0].name };
            if (d.movie_results?.length) return { tmdbId: String(d.movie_results[0].id), tmdbType: 'movie', title: d.movie_results[0].title };
        } else {
            if (d.movie_results?.length) return { tmdbId: String(d.movie_results[0].id), tmdbType: 'movie', title: d.movie_results[0].title };
            if (d.tv_results?.length) return { tmdbId: String(d.tv_results[0].id), tmdbType: 'tv', title: d.tv_results[0].name };
        }
    } catch (e) {
        console.log(`[ShowBox] TMDB lookup failed: ${e.message}`);
    }
    return null;
};

const checkCookieQuota = async (cookie) => {
    try {
        const res = await axios.get('https://www.febbox.com/console/user_cards', {
            headers: {
                'Cookie': cookie.startsWith('ui=') ? cookie : `ui=${cookie}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 8000,
            validateStatus: () => true
        });
        if (res.status === 200 && res.data?.data?.flow) {
            const flow = res.data.data.flow;
            const remaining = (Number(flow.traffic_limit_mb) || 0) - (Number(flow.traffic_usage_mb) || 0);
            return { ok: true, remainingMB: remaining, cookie };
        }
    } catch (e) {
        console.log(`[ShowBox] Quota check failed: ${e.message}`);
    }
    return { ok: false, remainingMB: -1, cookie };
};

const selectBestCookie = async (cookies) => {
    let cookieArray = [];
    if (typeof cookies === 'string' && cookies.trim()) {
        cookieArray = [cookies.trim()];
    } else if (Array.isArray(cookies)) {
        cookieArray = cookies.filter(c => c?.trim()).map(c => c.trim());
    }
    if (!cookieArray.length) return { cookie: null, remainingMB: -1 };

    if (cookieArray.length === 1) {
        const q = await checkCookieQuota(cookieArray[0]);
        console.log(`[ShowBox] Cookie ${q.ok ? `OK (${q.remainingMB} MB remaining)` : 'quota check failed'}`);
        return { cookie: q.cookie, remainingMB: q.remainingMB };
    }

    const results = await Promise.all(cookieArray.map(c => checkCookieQuota(c)));
    const good = results.filter(r => r.ok).sort((a, b) => b.remainingMB - a.remainingMB);
    if (good.length) {
        console.log(`[ShowBox] Best cookie: ${good[0].remainingMB} MB remaining`);
        return { cookie: good[0].cookie, remainingMB: good[0].remainingMB };
    }
    console.log(`[ShowBox] All quota checks failed, using first cookie`);
    return { cookie: cookieArray[0], remainingMB: -1 };
};

const getStreamsFromTmdbId = async (tmdbType, tmdbId, seasonNum, episodeNum, regionPreference, cookies) => {
    console.log(`[ShowBox] Fetching ${tmdbType}/${tmdbId}${seasonNum != null ? ` S${seasonNum}E${episodeNum}` : ''}`);

    const { cookie: selectedCookie } = await selectBestCookie(cookies);
    const oss = regionPreference || 'USA7';

    let apiUrl;
    if (tmdbType === 'tv' || tmdbType === 'series') {
        if (seasonNum == null || episodeNum == null) return [];
        apiUrl = `${FEBAPI_BASE_URL}/tv/${tmdbId}/oss=${oss}/${seasonNum}/${episodeNum}`;
    } else {
        apiUrl = `${FEBAPI_BASE_URL}/movie/${tmdbId}/oss=${oss}`;
    }

    if (selectedCookie) {
        apiUrl += `?cookie=${encodeURIComponent(selectedCookie)}`;
    }

    console.log(`[ShowBox] GET ${apiUrl.replace(/\?cookie=.*/, '?cookie=***')}`);

    const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: { 'User-Agent': 'NuvioStreamsAddon/1.0' }
    });

    if (!response.data?.success) {
        console.log(`[ShowBox] API returned no success, data: ${JSON.stringify(response.data).slice(0, 200)}`);
        return [];
    }

    const streams = [];
    for (const version of response.data.versions || []) {
        for (const link of version.links || []) {
            if (!link.url) continue;
            streams.push({
                name: link.name || 'Auto',
                title: version.name || 'Unknown',
                url: link.url,
                quality: parseQualityFromLabel(link.quality || link.name),
                codecs: extractCodecDetails(version.name || ''),
                size: link.size || version.size || 'Unknown',
                provider: 'ShowBox'
            });
        }
    }

    console.log(`[ShowBox] Found ${streams.length} streams`);
    return streams;
};

// Main export for Stremio addon
const getShowboxStreams = async ({ imdbId, type, season, episode, uiCookie, tmdbApiKey, sbProxy }) => {
    // Step 1: Convert IMDB to TMDB
    const info = await convertImdbToTmdb(imdbId, type === 'series' ? 'tv' : 'movie');
    if (!info) { console.log(`[ShowBox] Could not resolve TMDB ID for ${imdbId}`); return []; }
    console.log(`[ShowBox] Resolved: ${info.title} (TMDB: ${info.tmdbId})`);

    // Step 2: Get streams
    const rawStreams = await getStreamsFromTmdbId(
        info.tmdbType,
        info.tmdbId,
        type === 'series' ? season : null,
        type === 'series' ? episode : null,
        process.env.SHOWBOX_REGION || 'USA7',
        uiCookie || null
    );

    // Step 3: Convert to Stremio format
    return rawStreams.map(s => {
        const codecStr = s.codecs?.length ? ` · ${s.codecs.join(' ')}` : '';
        return {
            url: s.url,
            name: `ShowBox\n${s.quality}`,
            description: `${s.title}\n${s.size}${codecStr}`,
            quality: s.quality,
            behaviorHints: { notWebReady: false, filename: s.title }
        };
    });
};

module.exports = { getShowboxStreams, convertImdbToTmdb, getStreamsFromTmdbId };
