(function() {
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";

    function getBaseUrl() {
        return manifest?.baseUrl || "https://cinemacity.cc";
    }

    function getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Cookie": "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;"
        };
    }

    function atob(str) {
        return Buffer.from(str, 'base64').toString('utf-8');
    }

    function toSearchResult(el) {
        const a = el.querySelector('a');
        if (!a) return null;

        const title = a.getAttribute('title')?.replace("Download ", "")?.replace(/\s*\(\d{4}\)\s*$/, "")?.trim() || "No Title";
        const href = a.getAttribute('href');
        const img = el.querySelector('img, div.dar-short_bg');
        const posterEl = el.querySelector('div.dar-short_bg a');
        let posterUrl = posterEl?.getAttribute('style') || "";
        const bgMatch = posterUrl.match(/url\(['"]?([^'"()]+)['"]?\)/);
        posterUrl = bgMatch ? bgMatch[1] : "";

        const ratingEl = el.querySelector('span.rating-color');
        const score = ratingEl?.textContent?.trim() || "";

        const isSeries = (href || "").includes("/tv-series/");

        return new MultimediaItem({
            title: title,
            url: href,
            posterUrl: posterUrl,
            type: isSeries ? "tvseries" : "movie",
            score: score ? parseFloat(score) / 10 : 0
        });
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/" },
                { name: "Movies", path: "/movies" },
                { name: "TV Series", path: "/tv-series" },
                { name: "Anime", path: "/xfsearch/genre/anime" },
                { name: "Asian", path: "/xfsearch/genre/asian" },
                { name: "Animation", path: "/xfsearch/genre/animation" },
                { name: "Documentary", path: "/xfsearch/genre/documentary" }
            ];

            const homeData = {};
            for (const section of sections) {
                const url = `${getBaseUrl()}${section.path}`;
                const res = await http_get(url, getHeaders());

                if (res.status !== 200) continue;

                const doc = await parseHtml(res.body);
                const items = Array.from(doc.querySelectorAll('div.dar-short_item'))
                    .map(toSearchResult)
                    .filter(Boolean);

                if (items.length > 0) {
                    homeData[section.name] = items;
                }
            }

            if (Object.keys(homeData).length === 0) {
                cb({ success: false, errorCode: "PARSE_ERROR", message: "No content found" });
                return;
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `${getBaseUrl()}/?do=search&subaction=search&search_start=0&full_search=0&story=${encodedQuery}`;
            const res = await http_get(url, getHeaders());

            if (res.status !== 200) {
                cb({ success: false, errorCode: "SITE_OFFLINE", message: "Search failed" });
                return;
            }

            const doc = await parseHtml(res.body);
            const items = Array.from(doc.querySelectorAll('div.dar-short_item'))
                .map(toSearchResult)
                .filter(Boolean);

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, getHeaders());

            if (res.status !== 200) {
                cb({ success: false, errorCode: "SITE_OFFLINE", message: "Page not found" });
                return;
            }

            const doc = await parseHtml(res.body);

            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || "";
            const title = ogTitle.split("(")[0].trim() || "No Title";
            const yearMatch = ogTitle.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 0;

            const posterUrl = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || "";

            const bgPosterEl = doc.querySelector('div.dar-full_bg a');
            const bgPoster = bgPosterEl?.getAttribute('href') || "";

            const descriptionEl = doc.querySelector('#about div.ta-full_text1');
            const description = descriptionEl?.textContent?.trim() || "";

            const imdbAnchor = doc.querySelector('div.ta-full_rating1 > div');
            const onclick = imdbAnchor?.getAttribute('onclick') || "";
            const imdbMatch = onclick.match(/tt(\d+)/);
            const imdbId = imdbMatch ? `tt${imdbMatch[1]}` : "";

            let metadata = null;
            let tmdbId = "";

            if (imdbId) {
                try {
                    const tmdbRes = await http_get(
                        `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`
                    );
                    const tmdbJson = JSON.parse(tmdbRes.body);
                    const movieResults = tmdbJson.movie_results;
                    const tvResults = tmdbJson.tv_results;

                    if (movieResults && movieResults.length > 0) {
                        tmdbId = movieResults[0].id.toString();
                    } else if (tvResults && tvResults.length > 0) {
                        tmdbId = tvResults[0].id.toString();
                    }
                } catch (e) {
                    console.error("TMDB lookup error:", e);
                }

                try {
                    const isSeries = url.includes("/tv-series/");
                    const metaType = isSeries ? "series" : "movie";
                    const cinemetaRes = await http_get(`${CINEMETA_URL}/${metaType}/${imdbId}.json`);
                    metadata = JSON.parse(cinemetaRes.body);
                } catch (e) {
                    console.error("Cinemeta lookup error:", e);
                }
            }

            const isSeries = url.includes("/tv-series/");
            const type = isSeries ? "tvseries" : "movie";

            const recommendations = [];
            const recEls = doc.querySelectorAll('div.ta-rel > div.ta-rel_item');
            for (const el of recEls) {
                const a = el.querySelector('a');
                if (!a) continue;
                const recTitle = a.textContent?.split("(")[0]?.trim() || "";
                const recHref = a.getAttribute('href') || "";
                const recPoster = doc.querySelector('div > a')?.getAttribute('href') || "";
                const recScore = el.querySelector('span.rating-color1')?.textContent?.trim() || "";

                recommendations.push(new MultimediaItem({
                    title: recTitle,
                    url: recHref,
                    posterUrl: recPoster,
                    type: recHref.includes("/tv-series/") ? "tvseries" : "movie",
                    score: recScore ? parseFloat(recScore) / 10 : 0
                }));
            }

            const scripts = doc.querySelectorAll('script');
            let playerJson = null;

            for (const script of scripts) {
                const scriptData = script.textContent || "";
                if (scriptData.includes("atob(") && scriptData.includes("Playerjs(")) {
                    try {
                        const decoded = atob(scriptData.split('atob("')[1].split('")')[0]);
                        const match = decoded.match(/new Playerjs\(([\s\S]*?)\);/);
                        if (match) {
                            playerJson = JSON.parse(match[1]);
                            break;
                        }
                    } catch (e) {
                        console.error("PlayerJS parse error:", e);
                    }
                }
            }

            if (!playerJson) {
                cb({ success: false, errorCode: "PARSE_ERROR", message: "PlayerJS not found" });
                return;
            }

            const fileData = playerJson.file;
            let fileArray = [];

            if (Array.isArray(fileData)) {
                fileArray = fileData;
            } else if (typeof fileData === "string") {
                const trimmed = fileData.trim();
                if (trimmed.startsWith("[")) {
                    fileArray = JSON.parse(trimmed);
                } else if (trimmed.startsWith("{")) {
                    fileArray = [JSON.parse(trimmed)];
                } else if (trimmed) {
                    fileArray = [{ file: trimmed }];
                } else {
                    cb({ success: false, errorCode: "PARSE_ERROR", message: "Empty stream file" });
                    return;
                }
            }

            const metaInfo = metadata?.meta || {};
            const genres = metaInfo.genres || [];
            const castData = metaInfo.appExtras?.cast || [];

            let item = {
                title: metaInfo.name || title,
                url: url,
                posterUrl: metaInfo.poster || posterUrl,
                bannerUrl: metaInfo.background || bgPoster,
                description: metaInfo.description || description,
                type: type,
                contentType: type,
                year: year || (metaInfo.year ? parseInt(metaInfo.year) : 0),
                score: metaInfo.imdbRating ? parseFloat(metaInfo.imdbRating) / 10 : 0,
                genres: genres,
                cast: castData.map(c => new Actor({ name: c.name, role: c.character })),
                episodes: []
            };

            const trailer = metaInfo.trailers?.[0];
            if (trailer) {
                item.trailers = [new Trailer({ url: `https://youtube.com/watch?v=${trailer.ytId}` })];
            }

            if (isSeries) {
                const episodes = [];

                for (let i = 0; i < fileArray.length; i++) {
                    const seasonObj = fileArray[i];
                    const seasonMatch = (seasonObj.title || "").match(/Season\s*(\d+)/i);
                    if (!seasonMatch) continue;

                    const seasonNum = parseInt(seasonMatch[1]);
                    const folders = seasonObj.folder || [];

                    for (let j = 0; j < folders.length; j++) {
                        const epObj = folders[j];
                        const epMatch = (epObj.title || "").match(/Episode\s*(\d+)/i);
                        if (!epMatch) continue;

                        const epNum = parseInt(epMatch[1]);
                        let streamUrl = epObj.file || "";

                        if (!streamUrl) continue;

                        const epMetaKey = `${seasonNum}:${epNum}`;
                        const epMeta = (metaInfo.videos || []).find(v =>
                            v.season === seasonNum && v.episode === epNum
                        );

                        const epData = {
                            name: epMeta?.name || `S${seasonNum}E${epNum}`,
                            url: streamUrl,
                            season: seasonNum,
                            episode: epNum,
                            posterUrl: epMeta?.thumbnail,
                            description: epMeta?.overview
                        };

                        episodes.push(epData);
                    }
                }

                episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));

                const epObjects = episodes.map(ep =>
                    new Episode({
                        name: ep.name,
                        url: ep.url,
                        season: ep.season,
                        episode: ep.episode,
                        posterUrl: ep.posterUrl,
                        description: ep.description
                    })
                );

                item.episodes = epObjects;
            } else {
                let streamUrl = fileArray[0]?.file || "";

                if (streamUrl) {
                    item.episodes = [new Episode({
                        name: "Play Movie",
                        url: streamUrl,
                        season: 1,
                        episode: 1
                    })];
                }
            }

            cb({ success: true, data: item });
        } catch (e) {
            console.error("Load error:", e);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const streams = [];

            if (!url || typeof url !== "string") {
                cb({ success: false, errorCode: "NOT_FOUND", message: "Invalid URL" });
                return;
            }

            const isJson = url.startsWith("[") || url.startsWith("{");
            let urlsToProcess = [];

            try {
                if (isJson) {
                    const parsed = JSON.parse(url);
                    if (Array.isArray(parsed)) {
                        urlsToProcess = parsed;
                    } else {
                        urlsToProcess = [parsed];
                    }
                } else {
                    urlsToProcess = [url];
                }
            } catch (e) {
                urlsToProcess = [url];
            }

            for (const item of urlsToProcess) {
                const streamUrl = typeof item === "string" ? item : (item.url || "");

                if (!streamUrl) continue;

                let quality = "720p";
                if (streamUrl.includes("2160p") || streamUrl.includes("4k")) quality = "2160p";
                else if (streamUrl.includes("1440p")) quality = "1440p";
                else if (streamUrl.includes("1080p")) quality = "1080p";
                else if (streamUrl.includes("720p")) quality = "720p";
                else if (streamUrl.includes("480p")) quality = "480p";
                else if (streamUrl.includes("360p")) quality = "360p";

                const headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Referer": getBaseUrl() + "/"
                };

                if (streamUrl.includes("m3u8") || streamUrl.includes(".mp4") || streamUrl.includes("googleapis")) {
                    streams.push(new StreamResult({
                        url: streamUrl,
                        quality: quality,
                        headers: headers
                    }));
                } else if (streamUrl.includes("magnet:")) {
                    streams.push(new StreamResult({
                        url: streamUrl,
                        quality: quality,
                        playbackPolicy: "torrent"
                    }));
                } else {
                    streams.push(new StreamResult({
                        url: streamUrl,
                        quality: quality,
                        headers: headers
                    }));
                }
            }

            if (streams.length === 0) {
                cb({ success: false, errorCode: "NOT_FOUND", message: "No streams found" });
                return;
            }

            cb({ success: true, data: streams });
        } catch (e) {
            console.error("LoadStreams error:", e);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
