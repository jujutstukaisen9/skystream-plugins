(function() {

    const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    const METAHUB_LOGO = "https://live.metahub.space/logo/medium";

    const DECODED_COOKIE = "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;";

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    function getBaseHeaders() {
        return {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Referer": `${manifest.baseUrl}/`,
            "Cookie": DECODED_COOKIE
        };
    }

    function safeAtob(str) {
        if (!str) return "";
        try {
            let s = String(str).trim().replace(/-/g, "+").replace(/_/g, "/");
            while (s.length % 4 !== 0) s += "=";
            return atob(s);
        } catch (_) { return ""; }
    }

    function decodeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'");
    }

    function fixUrl(href) {
        if (!href) return "";
        if (href.startsWith("//")) return "https:" + href;
        if (href.startsWith("/")) return manifest.baseUrl.replace(/\/$/, "") + href;
        if (/^https?:\/\//i.test(href)) return href;
        return manifest.baseUrl.replace(/\/$/, "") + "/" + href;
    }

    function getQualityFromString(str) {
        if (!str) return 0;
        const s = str.toLowerCase();
        if (s.includes("2160") || s.includes("4k")) return 2160;
        if (s.includes("1080")) return 1080;
        if (s.includes("720")) return 720;
        if (s.includes("480")) return 480;
        if (s.includes("360")) return 360;
        if (s.includes("ts") || s.includes("cam")) return 360;
        return 0;
    }

    function qualityToLabel(quality) {
        if (quality >= 2160) return "4K";
        if (quality >= 1080) return "1080p";
        if (quality >= 720) return "720p";
        if (quality >= 480) return "480p";
        if (quality >= 360) return "360p";
        return "Auto";
    }

    function extractScore(text) {
        if (!text) return null;
        const m = String(text).match(/(\d+\.?\d*)/);
        return m ? parseFloat(m[1]) / 10 * 10 : null;
    }

    function parseYear(title) {
        const m = String(title).match(/\((\d{4})\)/);
        return m ? parseInt(m[1]) : null;
    }

    async function request(url, headers) {
        return http_get(url, { headers: Object.assign({}, getBaseHeaders(), headers || {}) });
    }

    function parseCredits(creditsJson) {
        if (!creditsJson) return [];
        try {
            const data = JSON.parse(creditsJson);
            return (data.cast || []).slice(0, 20).map(c => new Actor({
                name: c.name, role: c.character,
                image: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : undefined
            }));
        } catch (_) { return []; }
    }

    function parseSubtitles(raw) {
        if (!raw) return [];
        const tracks = [];
        if (typeof raw === "string") {
            raw.split(",").forEach(entry => {
                const match = entry.trim().match(/\[(.+?)](https?:\/\/.+)/);
                if (match) tracks.push({ lang: match[1], url: match[2] });
            });
        }
        return tracks;
    }

    async function tmdbIdFromImdb(imdbId) {
        try {
            const res = await request(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
            const data = JSON.parse(res.body);
            return data.movie_results?.[0]?.id || data.tv_results?.[0]?.id || null;
        } catch (_) { return null; }
    }

    async function getCinemetaData(imdbId, type) {
        if (!imdbId) return null;
        try {
            const res = await request(`${CINEMETA_URL}/${type}/${imdbId}.json`);
            if (res.body && res.body.trim().startsWith("{")) return JSON.parse(res.body);
        } catch (_) {}
        return null;
    }

    function parseSearchItem(el) {
        const anchor = el.querySelector("a");
        if (!anchor) return null;
        const href = fixUrl(anchor.getAttribute("href"));
        if (!href) return null;
        const title = (anchor.textContent || "").split("(")[0].trim();
        if (!title) return null;
        const bgLink = el.querySelector(".dar-short_bg a, [class*='bg'] a");
        const posterUrl = bgLink ? fixUrl(bgLink.getAttribute("href")) : null;
        const ratingEl = el.querySelector("span.rating-color");
        const score = extractScore(ratingEl?.textContent?.trim());
        const qualityEl = el.querySelector(".e-cover span:nth-child(2) a, .e-cover span");
        const qualityText = qualityEl?.textContent?.trim();
        const isSeries = href.includes("/tv-series/");
        return new MultimediaItem({
            title, url: href, posterUrl, type: isSeries ? "series" : "movie",
            score, quality: qualityText || undefined
        });
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "" },
                { name: "Movies", path: "movies" },
                { name: "TV Series", path: "tv-series" },
                { name: "Anime", path: "xfsearch/genre/anime" },
                { name: "Asian", path: "xfsearch/genre/asian" },
                { name: "Animation", path: "xfsearch/genre/animation" },
                { name: "Documentary", path: "xfsearch/genre/documentary" }
            ];
            const data = {};
            for (const sec of sections) {
                try {
                    const url = sec.path ? `${manifest.baseUrl}/${sec.path}` : manifest.baseUrl;
                    const res = await request(url);
                    const doc = parseHtml(res.body);
                    const items = Array.from(doc.querySelectorAll(".dar-short_item")).map(parseSearchItem).filter(Boolean);
                    if (items.length > 0) data[sec.name] = items.slice(0, 30);
                } catch (e) { console.error(`Section [${sec.name}] error: ${e.message}`); }
            }
            cb({ success: true, data });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: String(e?.message || e) }); }
    }

    async function search(query, cb) {
        try {
            const url = `${manifest.baseUrl}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodeURIComponent(query)}`;
            const res = await request(url);
            const doc = parseHtml(res.body);
            const items = Array.from(doc.querySelectorAll(".dar-short_item")).map(parseSearchItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) }); }
    }

    async function load(url, cb) {
        try {
            const res = await request(url);
            const doc = parseHtml(res.body);
            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
            const title = ogTitle.split("(")[0].trim() || "Unknown";
            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
            const bgposter = doc.querySelector(".dar-full_bg a")?.getAttribute("href") || "";

            let audioLanguages = null;
            for (const li of doc.querySelectorAll("li")) {
                const spanEl = li.querySelector("span");
                if (spanEl && spanEl.textContent.toLowerCase().includes("audio language")) {
                    audioLanguages = Array.from(li.querySelectorAll("span:eq(1) a")).map(s => s.textContent.trim()).filter(Boolean).join(", ");
                    break;
                }
            }

            const description = doc.querySelector("#about .ta-full_text1")?.textContent?.trim() || "";
            const year = parseYear(ogTitle);
            const isSeries = url.includes("/tv-series/");

            let imdbId = null;
            for (const div of doc.querySelectorAll(".ta-full_rating1 > div")) {
                const match = (div.getAttribute("onclick") || "").match(/(tt\d+)/i);
                if (match) { imdbId = match[1]; break; }
            }

            let tmdbId = null, logoUrl = null, castList = [], cinemetaData = null;
            if (imdbId) {
                tmdbId = await tmdbIdFromImdb(imdbId);
                logoUrl = `${METAHUB_LOGO}/${imdbId}/img`;
                if (tmdbId) {
                    try {
                        const cr = await request(`https://api.themoviedb.org/3/${isSeries ? "tv" : "movie"}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`);
                        castList = parseCredits(cr.body);
                    } catch (_) {}
                }
                cinemetaData = await getCinemetaData(imdbId, isSeries ? "series" : "movie");
            }

            let finalDescription = description, background = poster, genres = [], imdbRating = null;
            if (cinemetaData?.meta) {
                const meta = cinemetaData.meta;
                finalDescription = meta.description || description;
                background = meta.background || poster;
                genres = meta.genres || [];
                imdbRating = meta.imdbRating ? parseFloat(meta.imdbRating) : null;
            }

            const epMetaMap = {};
            if (cinemetaData?.meta?.videos) {
                for (const v of cinemetaData.meta.videos) {
                    if (v.season != null && v.episode != null) epMetaMap[`${v.season}:${v.episode}`] = v;
                }
            }

            let playerScriptData = null;
            for (const script of doc.querySelectorAll("script")) {
                const text = script.textContent || "";
                if (text.includes("atob") && text.includes("Playerjs")) {
                    const atobMatch = text.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/);
                    if (atobMatch) {
                        try {
                            const decoded = safeAtob(atobMatch[1]);
                            const playerMatch = decoded.match(/new\s+Playerjs\s*\(\s*(\{[^}]+\})\s*\)/s);
                            if (playerMatch) { playerScriptData = JSON.parse(playerMatch[1]); break; }
                        } catch (_) {}
                    }
                }
            }

            if (!playerScriptData) {
                for (const script of doc.querySelectorAll("script")) {
                    const text = script.textContent || "";
                    if (text.includes("Playerjs")) {
                        const playerMatch = text.match(/new\s+Playerjs\s*\(\s*(\{[^}]+(?:\{[^}]+\}[^}]*)*\})\s*\)/s);
                        if (playerMatch) {
                            try { playerScriptData = JSON.parse(playerMatch[1]); break; }
                            catch (_) {
                                const atobPattern = text.match(/atob\s*\(\s*["']([^"']+)["']\s*\)/);
                                if (atobPattern) {
                                    try {
                                        const decoded = safeAtob(atobPattern[1]);
                                        const innerMatch = decoded.match(/new\s+Playerjs\s*\(\s*(\{[^}]+\})\s*\)/s);
                                        if (innerMatch) { playerScriptData = JSON.parse(innerMatch[1]); break; }
                                    } catch (__) {}
                                }
                            }
                        }
                    }
                }
            }

            if (!playerScriptData) return cb({ success: false, errorCode: "PLAYER_NOT_FOUND", message: "PlayerJS not found" });

            const rawFile = playerScriptData.file;
            let fileArray = [];
            if (Array.isArray(rawFile)) fileArray = rawFile;
            else if (typeof rawFile === "string") {
                const trimmed = rawFile.trim();
                if (trimmed.startsWith("[")) try { fileArray = JSON.parse(trimmed); } catch (_) {}
                else if (trimmed.startsWith("{")) try { fileArray = [JSON.parse(trimmed)]; } catch (_) {}
                else if (trimmed) fileArray = [{ file: trimmed }];
            }

            const seasonRegex = /Season\s*(\d+)/i, episodeRegex = /Episode\s*(\d+)/i;
            const episodes = [];

            if (isSeries) {
                for (const seasonObj of fileArray) {
                    if (!seasonObj) continue;
                    const seasonMatch = (seasonObj.title || "").match(seasonRegex);
                    if (!seasonMatch) continue;
                    const seasonNumber = parseInt(seasonMatch[1]);
                    for (const epObj of (seasonObj.folder || [])) {
                        if (!epObj) continue;
                        const epMatch = (epObj.title || "").match(episodeRegex);
                        if (!epMatch) continue;
                        const episodeNumber = parseInt(epMatch[1]);
                        const streamUrls = [];
                        if (epObj.file?.trim()) streamUrls.push(epObj.file.trim());
                        if (Array.isArray(epObj.folder)) {
                            for (const src of epObj.folder) {
                                if (src?.file?.trim()) streamUrls.push(src.file.trim());
                            }
                        }
                        if (!streamUrls.length) continue;
                        const epMeta = epMetaMap[`${seasonNumber}:${episodeNumber}`];
                        episodes.push(new Episode({
                            name: epMeta?.name || `S${seasonNumber}E${episodeNumber}`,
                            url: JSON.stringify({ streams: streamUrls, subtitles: parseSubtitles(epObj.subtitle || null) }),
                            season: seasonNumber, episode: episodeNumber,
                            description: epMeta?.overview || null,
                            posterUrl: epMeta?.thumbnail || null,
                            airDate: epMeta?.released || null
                        }));
                    }
                }
                if (!episodes.length) return cb({ success: false, errorCode: "NO_EPISODES", message: "No episodes found" });
                episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
                cb({ success: true, data: new MultimediaItem({
                    title: cinemetaData?.meta?.name || title, url, posterUrl: poster,
                    bannerUrl: background || bgposter, logoUrl, type: "series",
                    description: buildPlot(finalDescription, audioLanguages),
                    year: year || (cinemetaData?.meta?.year ? parseInt(cinemetaData.meta.year) : null),
                    score: imdbRating, genres, cast: castList,
                    recommendations: parseRecommendations(doc),
                    syncData: { imdb: imdbId, tmdb: tmdbId ? String(tmdbId) : undefined },
                    episodes
                })});
            } else {
                if (!fileArray.length || fileArray[0]?.folder) return cb({ success: false, errorCode: "NO_STREAMS", message: "No streams" });
                const movieFile = fileArray[0]?.file || "";
                const subtitles = parseSubtitles(playerScriptData.subtitle || fileArray[0]?.subtitle);
                cb({ success: true, data: new MultimediaItem({
                    title: cinemetaData?.meta?.name || title, url, posterUrl: poster,
                    bannerUrl: background || bgposter, logoUrl, type: "movie",
                    description: buildPlot(finalDescription, audioLanguages),
                    year: year || (cinemetaData?.meta?.year ? parseInt(cinemetaData.meta.year) : null),
                    score: imdbRating, genres, cast: castList,
                    recommendations: parseRecommendations(doc),
                    syncData: { imdb: imdbId, tmdb: tmdbId ? String(tmdbId) : undefined },
                    episodes: [new Episode({ name: "Watch", url: JSON.stringify({ streams: [movieFile], subtitles }), season: 1, episode: 1 })]
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) }); }
    }

    function buildPlot(description, audioLanguages) {
        if (!description && !audioLanguages) return "";
        if (!audioLanguages) return description;
        if (!description) return `Audio: ${audioLanguages}`;
        return `${description} - Audio: ${audioLanguages}`;
    }

    function parseRecommendations(doc) {
        const items = [];
        for (const item of doc.querySelectorAll(".ta-rel > .ta-rel_item")) {
            const anchor = item.querySelector("a");
            if (!anchor) continue;
            const title = (anchor.textContent || "").split("(")[0].trim();
            const href = fixUrl(anchor.getAttribute("href"));
            const score = extractScore(item.querySelector("span.rating-color1")?.textContent);
            const posterUrl = item.querySelector("div > a")?.getAttribute("href") || null;
            if (title && href) items.push(new MultimediaItem({ title, url: href, posterUrl, type: "movie", score }));
        }
        return items;
    }

    async function loadStreams(dataStr, cb) {
        try {
            const payload = JSON.parse(dataStr);
            const streams = [], subtitles = [];
            if (payload.subtitles?.length) {
                for (const sub of payload.subtitles) {
                    if (sub.url) subtitles.push({ url: sub.url, label: sub.lang || "Unknown", lang: sub.lang || "und" });
                }
            }
            for (const url of (payload.streams || [])) {
                if (!url?.trim()) continue;
                streams.push(new StreamResult({
                    url: url.trim(), quality: qualityToLabel(getQualityFromString(url)),
                    subtitles: subtitles.length ? subtitles : undefined,
                    headers: { Referer: `${manifest.baseUrl}/` }
                }));
            }
            if (!streams.length) return cb({ success: false, errorCode: "NO_STREAMS", message: "No playable streams" });
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
