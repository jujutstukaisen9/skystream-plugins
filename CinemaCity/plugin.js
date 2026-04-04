/**
 * DudeFilms - SkyStream Plugin for cinemacity.cc
 * Movies, TV Series, Anime Streaming
 */

(function() {
    "use strict";

    const BASE_URL = "https://cinemacity.cc";
    const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": atob("ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=")
    };

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return BASE_URL + url;
        if (!url.startsWith("http")) return BASE_URL + "/" + url;
        return url;
    }

    function getQuality(url) {
        if (!url) return "Auto";
        const u = url.toLowerCase();
        if (u.includes("2160") || u.includes("4k")) return "4K";
        if (u.includes("1080")) return "1080p";
        if (u.includes("720")) return "720p";
        if (u.includes("480")) return "480p";
        if (u.includes("360")) return "360p";
        return "Auto";
    }

    function parseSubs(raw) {
        const tracks = [];
        if (!raw) return tracks;
        const regex = /\[([^\]]+)](https?:\/\/.+)/g;
        let match;
        while ((match = regex.exec(raw)) !== null) {
            tracks.push({ language: match[1], url: match[2] });
        }
        return tracks;
    }

    function toSearchItem(el) {
        try {
            const link = el.querySelector("a");
            if (!link) return null;

            let title = link.textContent?.split("(")[0]?.trim() || "Unknown";
            let href = fixUrl(link.getAttribute("href") || "");
            
            const img = el.querySelector(".dar-short_bg a img, img");
            let poster = fixUrl(img?.getAttribute("src") || img?.getAttribute("data-src") || "");
            
            const rating = el.querySelector(".rating-color")?.textContent?.trim() || "";
            const score = rating ? parseFloat(rating.replace(",", ".")) / 10 : 0;
            
            const isSeries = href.includes("/tv-series/");
            const type = isSeries ? "series" : "movie";

            return new MultimediaItem({ title, url: href, posterUrl: poster, type, score });
        } catch (e) { return null; }
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Movies", path: "movies" },
                { name: "TV Series", path: "tv-series" },
                { name: "Anime", path: "xfsearch/genre/anime" },
                { name: "Asian", path: "xfsearch/genre/asian" },
                { name: "Animation", path: "xfsearch/genre/animation" },
                { name: "Documentary", path: "xfsearch/genre/documentary" }
            ];

            const homeData = {};

            for (const sec of sections) {
                try {
                    const res = await http_get(`${BASE_URL}/${sec.path}`, HEADERS);
                    if (res.status !== 200) continue;

                    const doc = await parseHtml(res.body);
                    const items = doc.querySelectorAll("div.dar-short_item");
                    const results = items.map(toSearchItem).filter(Boolean);

                    if (results.length > 0) homeData[sec.name] = results;
                } catch (e) {}
            }

            if (!Object.keys(homeData).length) {
                cb({ success: false, errorCode: "NO_CONTENT" });
                return;
            }
            cb({ success: true, data: homeData });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: e.message }); }
    }

    async function search(query, cb) {
        try {
            const url = `${BASE_URL}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`;
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) { cb({ success: false, errorCode: "SEARCH_ERROR" }); return; }

            const doc = await parseHtml(res.body);
            const results = doc.querySelectorAll("div.dar-short_item").map(toSearchItem).filter(Boolean);
            cb({ success: true, data: results });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message }); }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) { cb({ success: false, errorCode: "LOAD_ERROR" }); return; }

            const doc = await parseHtml(res.body);
            const body = res.body;

            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
            const title = ogTitle.split("(")[0]?.trim() || "Unknown";
            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
            const bgposter = doc.querySelector("div.dar-full_bg a")?.getAttribute("href") || "";
            const description = doc.querySelector("#about div.ta-full_text1")?.textContent?.trim() || "";
            
            const yearMatch = ogTitle.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            const isMovie = url.includes("/movies/");
            const type = isMovie ? "movie" : "series";

            const recs = doc.querySelectorAll("div.ta-rel_item").map(el => {
                const a = el.querySelector("a");
                if (!a) return null;
                return new MultimediaItem({
                    title: a.textContent.split("(")[0]?.trim() || "Unknown",
                    url: fixUrl(el.querySelector("div > a")?.getAttribute("href") || ""),
                    posterUrl: fixUrl(el.querySelector("div > a")?.getAttribute("href") || ""),
                    type: "movie"
                });
            }).filter(Boolean);

            const imdbMatch = body.match(/tt\d+/);
            const imdbId = imdbMatch?.[0] || null;

            let cinemeta = null;
            if (imdbId) {
                try {
                    const metaType = type === "series" ? "series" : "movie";
                    const mRes = await http_get(`${CINEMETA_URL}/${metaType}/${imdbId}.json`);
                    if (mRes.body?.startsWith("{")) cinemeta = JSON.parse(mRes.body);
                } catch (e) {}
            }

            let playerData = { file: url, subtitle: "" };
            const base64Match = body.match(/atob\(["']([^"']+)["']\)/);
            if (base64Match) {
                try {
                    const decoded = atob(base64Match[1]);
                    const jsonMatch = decoded.match(/\{[\s\S]*\}/);
                    if (jsonMatch) playerData = JSON.parse(jsonMatch[0]);
                } catch (e) {}
            }

            let files = [];
            if (Array.isArray(playerData.file)) files = playerData.file;
            else if (typeof playerData.file === "string") {
                const f = playerData.file.trim();
                if (f.startsWith("[")) try { files = JSON.parse(f); } catch (e) {}
                else if (f.startsWith("{")) try { files = [JSON.parse(f)]; } catch (e) {}
                else if (f) files = [{ file: f }];
            }

            const subs = parseSubs(playerData.subtitle || "");

            if (type === "series") {
                const epRegex = /Season\s*(\d+)/i;
                const epNumRegex = /Episode\s*(\d+)/i;
                const episodes = [];

                for (const season of files) {
                    const sMatch = epRegex.exec(season.title || "");
                    if (!sMatch) continue;
                    const seasonNum = parseInt(sMatch[1]);

                    for (const ep of (season.folder || [])) {
                        const eMatch = epNumRegex.exec(ep.title || "");
                        if (!eMatch) continue;
                        const epNum = parseInt(eMatch[1]);

                        const urls = [];
                        if (ep.file?.trim()) urls.push(ep.file.trim());
                        (ep.folder || []).forEach(s => { if (s.file?.trim()) urls.push(s.file.trim()); });
                        if (!urls.length) continue;

                        episodes.push(new Episode({
                            name: `S${seasonNum}E${epNum}`,
                            url: JSON.stringify({ streams: urls, subs: parseSubs(ep.subtitle) }),
                            season: seasonNum,
                            episode: epNum
                        }));
                    }
                }

                episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

                cb({ success: true, data: new MultimediaItem({
                    title: cinemeta?.meta?.name || title,
                    url, posterUrl: poster, bannerUrl: bgposter,
                    type: "series",
                    description: cinemeta?.meta?.description || description,
                    year: year || (cinemeta?.meta?.year ? parseInt(cinemeta.meta.year) : null),
                    genres: cinemeta?.meta?.genres,
                    recommendations: recs,
                    episodes
                })});
            } else {
                const urls = [];
                files.forEach(f => {
                    if (f.file?.trim()) urls.push(f.file.trim());
                    (f.folder || []).forEach(s => { if (s.file?.trim()) urls.push(s.file.trim()); });
                });

                cb({ success: true, data: new MultimediaItem({
                    title: cinemeta?.meta?.name || title,
                    url, posterUrl: poster, bannerUrl: bgposter,
                    type: "movie",
                    description: cinemeta?.meta?.description || description,
                    year: year || (cinemeta?.meta?.year ? parseInt(cinemeta.meta.year) : null),
                    genres: cinemeta?.meta?.genres,
                    recommendations: recs,
                    episodes: [new Episode({
                        name: title,
                        url: JSON.stringify({ streams: urls.length ? urls : [url], subs }),
                        season: 1,
                        episode: 1
                    })]
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: e.message }); }
    }

    async function loadStreams(dataUrl, cb) {
        try {
            let data;
            try { data = JSON.parse(dataUrl); } catch (e) { data = { streams: [dataUrl], subs: [] }; }

            const subs = data.subs || [];
            const urls = data.streams || [];

            const streams = urls.filter(u => u && typeof u === "string").map(url => 
                new StreamResult({
                    url,
                    quality: getQuality(url),
                    headers: { Referer: BASE_URL + "/" },
                    subtitles: subs.map(s => ({ url: s.url, lang: s.language || "en", label: s.language || "Unknown" }))
                })
            );

            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: e.message }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
