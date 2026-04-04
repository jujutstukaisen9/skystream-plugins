(function() {
    "use strict";

    const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    const METAHUB_LOGO_URL = "https://live.metahub.space/logo/medium";

    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };

    const getBaseUrl = () => manifest?.baseUrl || "https://cinemacity.cc";

    const getHeaders = () => ({
        ...DEFAULT_HEADERS,
        "Cookie": decodeBase64("ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=")
    });

    function decodeBase64(str) {
        try {
            return atob(str);
        } catch (e) {
            return "";
        }
    }

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return getBaseUrl() + url;
        if (!url.startsWith("http")) return getBaseUrl() + "/" + url;
        return url;
    }

    function extractQuality(url) {
        if (!url) return "Auto";
        const u = url.toLowerCase();
        if (u.includes("2160p") || u.includes("4k")) return "4K";
        if (u.includes("1440p")) return "1440p";
        if (u.includes("1080p")) return "1080p";
        if (u.includes("720p")) return "720p";
        if (u.includes("480p")) return "480p";
        if (u.includes("360p")) return "360p";
        return "Auto";
    }

    function parseSubtitles(raw) {
        const tracks = [];
        if (!raw || typeof raw !== "string") return tracks;
        const regex = /\[(.+?)](https?:\/\/.+)/;
        raw.split(",").forEach(entry => {
            const m = regex.exec(entry.trim());
            if (m) tracks.push({ language: m[1], subtitleUrl: m[2] });
        });
        return tracks;
    }

    async function fetchTmdbId(imdbId, type) {
        if (!imdbId) return null;
        try {
            const metaType = type === "series" ? "tv" : "movie";
            const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            const res = await http_get(url);
            const data = JSON.parse(res.body);
            const movieResults = data.movie_results || [];
            const tvResults = data.tv_results || [];
            if (movieResults.length > 0) return movieResults[0].id;
            if (tvResults.length > 0) return tvResults[0].id;
            return null;
        } catch (e) { return null; }
    }

    async function fetchTmdbCredits(tmdbId, type) {
        if (!tmdbId) return null;
        try {
            const metaType = type === "series" ? "tv" : "movie";
            const url = `https://api.themoviedb.org/3/${metaType}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
            const res = await http_get(url);
            return JSON.parse(res.body);
        } catch (e) { return null; }
    }

    async function fetchCinemetaData(imdbId, type) {
        if (!imdbId) return null;
        try {
            const metaType = type === "series" ? "series" : "movie";
            const url = `${CINEMETA_URL}/${metaType}/${imdbId}.json`;
            const res = await http_get(url);
            const text = res.body;
            if (text && text.startsWith("{")) return JSON.parse(text);
            return null;
        } catch (e) { return null; }
    }

    function toSearchResult(element) {
        try {
            const anchor = element.querySelector("a");
            if (!anchor) return null;
            const anchorText = anchor.textContent || "";
            let title = anchorText.split("(")[0]?.trim() || "Unknown";
            if (!title) title = element.textContent.split("\n")[0]?.trim() || "Unknown";
            let href = anchor.getAttribute("href") || "";
            href = fixUrl(href);
            const posterEl = element.querySelector(".dar-short_bg img, img");
            let posterUrl = posterEl?.getAttribute("src") || posterEl?.getAttribute("data-src") || "";
            posterUrl = fixUrl(posterUrl);
            const scoreEl = element.querySelector(".rating-color");
            const scoreText = scoreEl?.textContent?.trim() || "";
            const score = scoreText ? parseFloat(scoreText.replace(",", ".")) / 10 : null;
            const isSeries = href.includes("/tv-series/") || href.includes("/series/");
            return new MultimediaItem({ title, url: href, posterUrl, type: isSeries ? "series" : "movie", score: score || 0 });
        } catch (e) { return null; }
    }

    async function getHome(cb) {
        try {
            const categories = [
                { name: "Movies", path: "movies" },
                { name: "TV Series", path: "tv-series" },
                { name: "Anime", path: "xfsearch/genre/anime" },
                { name: "Asian", path: "xfsearch/genre/asian" },
                { name: "Animation", path: "xfsearch/genre/animation" },
                { name: "Documentary", path: "xfsearch/genre/documentary" }
            ];
            const homeData = {};
            const headers = getHeaders();
            for (const cat of categories) {
                try {
                    const url = `${getBaseUrl()}/${cat.path}`;
                    const res = await http_get(url, headers);
                    if (res.status !== 200) continue;
                    const doc = await parseHtml(res.body);
                    const items = doc.querySelectorAll("div.dar-short_item");
                    const results = items.map(item => toSearchResult(item)).filter(Boolean);
                    if (results.length > 0) homeData[cat.name] = results;
                } catch (e) { console.error(`Error fetching ${cat.name}:`, e.message); }
            }
            if (Object.keys(homeData).length === 0) {
                cb({ success: false, errorCode: "NO_CONTENT", message: "No content available" });
                return;
            }
            cb({ success: true, data: homeData });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: e.message }); }
    }

    async function search(query, cb) {
        try {
            const headers = getHeaders();
            const url = `${getBaseUrl()}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
            const res = await http_get(url, headers);
            if (res.status !== 200) { cb({ success: false, errorCode: "SEARCH_ERROR" }); return; }
            const doc = await parseHtml(res.body);
            const results = doc.querySelectorAll("div.dar-short_item").map(item => toSearchResult(item)).filter(Boolean);
            cb({ success: true, data: results });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message }); }
    }

    async function load(url, cb) {
        try {
            const headers = getHeaders();
            const res = await http_get(url, headers);
            if (res.status !== 200) { cb({ success: false, errorCode: "LOAD_ERROR" }); return; }
            const doc = await parseHtml(res.body);
            const body = res.body;
            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
            let title = ogTitle.split("(")[0]?.trim() || "Unknown Title";
            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
            const bgposter = doc.querySelector("div.dar-full_bg a")?.getAttribute("href") || "";
            const descriptionsEl = doc.querySelector("#about div.ta-full_text1");
            const descriptions = descriptionsEl?.textContent?.trim() || "";
            const recItems = doc.querySelectorAll("div.ta-rel > div.ta-rel_item");
            const recommendations = recItems.map(item => {
                const a = item.querySelector("a");
                if (!a) return null;
                return new MultimediaItem({
                    title: a.textContent.split("(")[0]?.trim() || "Unknown",
                    url: fixUrl(item.querySelector("div > a")?.getAttribute("href") || ""),
                    posterUrl: fixUrl(item.querySelector("div > a")?.getAttribute("href") || ""),
                    type: "movie",
                    score: parseFloat(item.querySelector("span.rating-color1")?.textContent || "0") / 10
                });
            }).filter(Boolean);
            const yearMatch = ogTitle.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            const isMovie = url.includes("/movies/") || url.includes("/movie/");
            const tvType = isMovie ? "movie" : "series";
            const imdbIdMatch = body.match(/tt\d+/);
            const imdbId = imdbIdMatch ? imdbIdMatch[0] : null;
            let tmdbId = null, logoPath = null, castList = [], responseData = null, epMetaMap = {};
            if (imdbId) {
                tmdbId = await fetchTmdbId(imdbId, tvType);
                if (tmdbId) {
                    logoPath = `${METAHUB_LOGO_URL}/${imdbId}/img`;
                    const creditsData = await fetchTmdbCredits(tmdbId, tvType);
                    if (creditsData?.cast) {
                        castList = creditsData.cast.map(c => ({
                            actor: new Actor({ name: c.name || c.original_name || "", image: c.profile_path ? TMDB_IMAGE_BASE + c.profile_path : null }),
                            roleString: c.character
                        }));
                    }
                }
                responseData = await fetchCinemetaData(imdbId, tvType);
                if (responseData?.meta) {
                    if (responseData.meta.videos) {
                        responseData.meta.videos.forEach(v => {
                            if (v.season != null && v.episode != null) epMetaMap[`${v.season}:${v.episode}`] = v;
                        });
                    }
                }
            }
            let playerJson = null;
            const scriptMatch = body.match(/atob\(["']([^"']+)["']\)/);
            if (scriptMatch) {
                try {
                    const decoded = atob(scriptMatch[1]);
                    const dataMatch = decoded.match(/\{[\s\S]*\}/);
                    if (dataMatch) playerJson = JSON.parse(dataMatch[0]);
                } catch (e) {}
            }
            if (!playerJson) playerJson = { file: url, subtitle: "" };
            let fileArray = [];
            if (Array.isArray(playerJson.file)) fileArray = playerJson.file;
            else if (typeof playerJson.file === "string") {
                const trimmed = playerJson.file.trim();
                if (trimmed.startsWith("[")) try { fileArray = JSON.parse(trimmed); } catch (e) {}
                else if (trimmed.startsWith("{")) try { fileArray = [JSON.parse(trimmed)]; } catch (e) {}
                else if (trimmed) fileArray = [{ file: trimmed }];
            }
            if (tvType === "series") {
                const seasonRegex = /Season\s*(\d+)/i;
                const episodeRegex = /Episode\s*(\d+)/i;
                const episodeList = [];
                for (const seasonJson of fileArray) {
                    const sMatch = seasonRegex.exec(seasonJson.title || "");
                    if (!sMatch) continue;
                    const seasonNumber = parseInt(sMatch[1]);
                    const episodes = seasonJson.folder || [];
                    for (const epJson of episodes) {
                        const eMatch = episodeRegex.exec(epJson.title || "");
                        if (!eMatch) continue;
                        const episodeNumber = parseInt(eMatch[1]);
                        const streamUrls = [];
                        if (epJson.file?.trim()) streamUrls.push(epJson.file.trim());
                        (epJson.folder || []).forEach(s => { if (s.file?.trim()) streamUrls.push(s.file.trim()); });
                        if (!streamUrls.length) continue;
                        const epMeta = epMetaMap[`${seasonNumber}:${episodeNumber}`];
                        episodeList.push(new Episode({
                            name: epMeta?.name || `S${seasonNumber}E${episodeNumber}`,
                            url: JSON.stringify({ streams: streamUrls, subtitleTracks: parseSubtitles(epJson.subtitle || "") }),
                            season: seasonNumber,
                            episode: episodeNumber,
                            description: epMeta?.overview || "",
                            posterUrl: epMeta?.thumbnail || poster,
                            airDate: epMeta?.released || ""
                        }));
                    }
                }
                episodeList.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
                cb({ success: true, data: new MultimediaItem({
                    title: responseData?.meta?.name || title,
                    url, posterUrl: poster, bannerUrl: responseData?.meta?.background || bgposter,
                    logoUrl: logoPath, type: "series",
                    description: responseData?.meta?.description || descriptions,
                    year: year || (responseData?.meta?.year ? parseInt(responseData.meta.year) : null),
                    score: responseData?.meta?.imdbRating ? parseFloat(responseData.meta.imdbRating) / 10 : 0,
                    genres: responseData?.meta?.genres, recommendations,
                    cast: castList.map(c => c.actor), episodes: episodeList,
                    syncData: { imdb: imdbId, tmdb: tmdbId }
                })});
            } else {
                const streamUrls = [];
                fileArray.forEach(item => {
                    if (item.file?.trim()) streamUrls.push(item.file.trim());
                    (item.folder || []).forEach(s => { if (s.file?.trim()) streamUrls.push(s.file.trim()); });
                });
                cb({ success: true, data: new MultimediaItem({
                    title: responseData?.meta?.name || title,
                    url, posterUrl: poster, bannerUrl: responseData?.meta?.background || bgposter,
                    logoUrl: logoPath, type: "movie",
                    description: responseData?.meta?.description || descriptions,
                    year: year || (responseData?.meta?.year ? parseInt(responseData.meta.year) : null),
                    score: responseData?.meta?.imdbRating ? parseFloat(responseData.meta.imdbRating) / 10 : 0,
                    genres: responseData?.meta?.genres, recommendations,
                    cast: castList.map(c => c.actor),
                    episodes: [new Episode({ name: title, url: JSON.stringify({ streamUrl: streamUrls[0] || url, subtitleTracks: parseSubtitles(playerJson.subtitle || "") }), season: 1, episode: 1, posterUrl: poster })],
                    syncData: { imdb: imdbId, tmdb: tmdbId }
                })});
            }
        } catch (e) { console.error("Load error:", e); cb({ success: false, errorCode: "LOAD_ERROR", message: e.message }); }
    }

    async function loadStreams(url, cb) {
        try {
            let data;
            try { data = JSON.parse(url); } catch (e) { data = { streams: [url], subtitleTracks: [] }; }
            const subtitleTracks = data.subtitleTracks || [];
            const streamUrls = data.streams || (data.streamUrl ? [data.streamUrl] : []);
            if (!streamUrls.length && typeof url === "string" && url.startsWith("http")) streamUrls.push(url);
            const streams = streamUrls.filter(s => s && typeof s === "string").map(streamUrl => new StreamResult({
                url: streamUrl, quality: extractQuality(streamUrl),
                headers: { "Referer": getBaseUrl() + "/" },
                subtitles: subtitleTracks.map(t => ({ url: t.subtitleUrl || t.url, label: t.language || "Unknown", lang: t.language || "en" }))
            }));
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: e.message }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
