/**
 * SkyStream Plugin: Cinemacity
 *
 * Migration from CloudStream Kotlin Provider
 * Full feature parity implementation
 *
 * @author MiniMax Agent
 * @version 1.0.0
 */

(function() {
    "use strict";

    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest is injected at runtime

    // =========================================================================
    // CONSTANTS - Mirrors Kotlin companion object
    // =========================================================================

    const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
    const TMDB_LOGO_BASE = "https://live.metahub.space/logo/medium";

    // Decoded cookie from base64 - mirrors Kotlin's base64Decode()
    const COOKIE = atob("ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=");

    const BASE_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cookie": COOKIE,
        "Referer": `${manifest.baseUrl}/`
    };

    // =========================================================================
    // UTILITY FUNCTIONS - Mirrors Kotlin utility methods
    // =========================================================================

    /**
     * HTML entity decode - mirrors Kotlin's decodeHTML
     */
    function decodeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    }

    /**
     * Strip HTML tags - mirrors Kotlin's stripTags
     */
    function stripTags(str) {
        if (!str) return "";
        return str
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&nbsp;/g, " ")
            .trim();
    }

    /**
     * Resolve relative URLs - mirrors Kotlin's fixUrl
     */
    function fixUrl(href, base) {
        if (!href) return "";
        if (href.startsWith("//")) return "https:" + href;
        if (href.startsWith("/")) return (base || manifest.baseUrl).replace(/\/$/, "") + href;
        if (href.startsWith("http")) return href;
        return (base || manifest.baseUrl).replace(/\/$/, "") + "/" + href;
    }

    /**
     * Extract quality from URL - mirrors Kotlin's extractQuality()
     */
    function extractQuality(url) {
        if (!url) return 0;
        const s = url.toLowerCase();
        if (s.includes("2160p") || s.includes("4k")) return 2160;
        if (s.includes("1440p")) return 1440;
        if (s.includes("1080p")) return 1080;
        if (s.includes("720p")) return 720;
        if (s.includes("480p")) return 480;
        if (s.includes("360p")) return 360;
        return 0;
    }

    /**
     * Get quality string from text - mirrors Kotlin's getQualityFromString
     */
    function getQualityFromString(str) {
        if (!str) return "Auto";
        const s = str.toUpperCase();
        if (s.includes("4K") || s.includes("2160")) return "4K";
        if (s.includes("1080")) return "1080p";
        if (s.includes("720")) return "720p";
        if (s.includes("480")) return "480p";
        if (s.includes("360")) return "360p";
        if (s.includes("TS") || s.includes("TC")) return "TS";
        return "HD";
    }

    /**
     * Parse subtitles from raw string - mirrors Kotlin's parseSubtitles()
     */
    function parseSubtitles(rawSubtitle) {
        const subtitles = [];
        if (!rawSubtitle) return subtitles;

        const parts = rawSubtitle.split(",");
        for (const part of parts) {
            const trimmed = part.trim();
            const match = trimmed.match(/\[(.+?)](https?:\/\/.+)/);
            if (match) {
                subtitles.push({
                    url: match[2],
                    lang: match[1],
                    label: match[1]
                });
            }
        }
        return subtitles;
    }

    /**
     * Parse TMDB credits - mirrors Kotlin's parseCredits()
     */
    function parseCredits(creditsJson) {
        if (!creditsJson) return [];
        try {
            const data = JSON.parse(creditsJson);
            const castArr = data.cast || [];
            return castArr.slice(0, 20).map(c => {
                const name = c.name || c.original_name || "Unknown";
                const profile = c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null;
                const character = c.character || null;
                return new Actor({
                    name: name,
                    role: character,
                    image: profile
                });
            });
        } catch (e) {
            return [];
        }
    }

    /**
     * Extract IMDB ID from HTML - mirrors Kotlin's IMDB extraction
     */
    function extractImdbId(html) {
        // Method 1: Look for IMDB links in meta tags
        const imdbMetaMatch = html.match(/href="[^"]*imdb\.com\/title\/(tt\d+)[^"]*"/i);
        if (imdbMetaMatch) return imdbMetaMatch[1];

        // Method 2: Look for onclick handlers with IMDB
        const onclickMatch = html.match(/onclick=["'][^"']*(tt\d+)[^"']*["']/i);
        if (onclickMatch) return onclickMatch[1];

        // Method 3: Look for IMDB in data attributes
        const dataMatch = html.match(/data-imdb=["'](tt\d+)["']/i);
        if (dataMatch) return dataMatch[1];

        return null;
    }

    /**
     * Get TMDB ID from IMDB ID - mirrors Kotlin's TMDB lookup
     */
    async function tmdbIdFromImdb(imdbId) {
        if (!imdbId) return null;
        try {
            const res = await http_get(
                `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
                BASE_HEADERS
            );
            const data = JSON.parse(res.body);
            const movieId = data.movie_results?.[0]?.id;
            const tvId = data.tv_results?.[0]?.id;
            return movieId || tvId || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Fetch TMDB credits - mirrors Kotlin's credits fetch
     */
    async function fetchTMDB(tmdbId, type) {
        if (!tmdbId) return null;
        try {
            const res = await http_get(
                `https://api.themoviedb.org/3/${type}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`,
                BASE_HEADERS
            );
            return res.body;
        } catch (e) {
            return null;
        }
    }

    /**
     * Fetch Cinemeta metadata - mirrors Kotlin's cinemeta fetch
     */
    async function fetchCinemeta(imdbId, type) {
        if (!imdbId) return null;
        try {
            const res = await http_get(
                `${CINEMETA_URL}/${type}/${imdbId}.json`,
                BASE_HEADERS
            );
            const text = res.body.trim();
            if (text.startsWith("{")) {
                return JSON.parse(text);
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Decode base64 - mirrors Kotlin's base64Decode
     */
    function decodeBase64(str) {
        try {
            return atob(str);
        } catch (e) {
            return "";
        }
    }

    /**
     * Extract PlayerJS data - mirrors Kotlin's PlayerJS parsing
     */
    function parsePlayerJs(html) {
        // Find script tags containing atob()
        const scriptPattern = /<script[^>]*>([\s\S]*?)atob\("([\s\S]*?)"\)[\s\S]*?<\/script>/gi;
        let match;
        let playerScript = null;

        while ((match = scriptPattern.exec(html)) !== null) {
            if (match[1].includes("Playerjs") || match[1].includes("playerjs")) {
                playerScript = match[1];
                break;
            }
        }

        if (!playerScript) {
            // Fallback: look for second script with atob
            const scripts = html.match(/<script[^>]*>[\s\S]*?atob\("[\s\S]*?"\)[\s\S]*?<\/script>/gi);
            if (scripts && scripts.length >= 2) {
                playerScript = scripts[1];
            }
        }

        if (!playerScript) {
            return null;
        }

        try {
            // Extract base64 content
            const base64Match = playerScript.match(/atob\("([\s\S]*?)"\)/);
            if (!base64Match) return null;

            const decoded = atob(base64Match[1]);

            // Extract Playerjs configuration
            const playerMatch = decoded.match(/new\s+Playerjs\s*\(\s*([\s\S]*?)\s*\)\s*;/);
            if (!playerMatch) return null;

            // Try to parse as JSON
            let playerConfig = null;
            try {
                playerConfig = JSON.parse(playerMatch[1]);
            } catch (e) {
                // Try cleaning up the string
                const cleaned = playerMatch[1]
                    .replace(/,\s*}/g, "}")
                    .replace(/,\s*]/g, "]");
                try {
                    playerConfig = JSON.parse(cleaned);
                } catch (e2) {
                    // Manual parsing fallback
                    playerConfig = manualParsePlayer(playerMatch[1]);
                }
            }

            return playerConfig;
        } catch (e) {
            return null;
        }
    }

    /**
     * Manual player config parser fallback
     */
    function manualParsePlayer(str) {
        const config = {};

        // Extract file field
        const fileMatch = str.match(/file\s*:\s*(?:(\[[\s\S]*?\])|"([^"]+)"|'([^']+)'|(\d+))/);
        if (fileMatch) {
            if (fileMatch[1]) {
                // Array
                try {
                    config.file = JSON.parse(fileMatch[1]);
                } catch (e) {
                    config.file = parseFileArray(fileMatch[1]);
                }
            } else {
                config.file = fileMatch[2] || fileMatch[3] || fileMatch[4] || "";
            }
        }

        // Extract subtitle field
        const subtitleMatch = str.match(/subtitle\s*:\s*(?:(\[[\s\S]*?\])|"([^"]+)"|'([^']+)'|(\d+))/i);
        if (subtitleMatch) {
            if (subtitleMatch[1]) {
                config.subtitle = subtitleMatch[1];
            } else {
                config.subtitle = subtitleMatch[2] || subtitleMatch[3] || subtitleMatch[4] || "";
            }
        }

        return config;
    }

    /**
     * Parse file array from string
     */
    function parseFileArray(str) {
        const items = [];
        const objPattern = /\{([^}]+)\}/g;
        let match;

        while ((match = objPattern.exec(str)) !== null) {
            const objStr = match[1];
            const obj = {};

            const fileMatch = objStr.match(/file\s*:\s*"([^"]+)"/);
            const titleMatch = objStr.match(/title\s*:\s*"([^"]+)"/);
            const folderMatch = objStr.match(/folder\s*:\s*(\[[\s\S]*?\])/);

            if (fileMatch) obj.file = fileMatch[1];
            if (titleMatch) obj.title = titleMatch[1];
            if (folderMatch) {
                try {
                    obj.folder = JSON.parse(folderMatch[1]);
                } catch (e) {
                    obj.folder = [];
                }
            }

            if (Object.keys(obj).length > 0) {
                items.push(obj);
            }
        }

        return items.length > 0 ? items : str;
    }

    // =========================================================================
    // ITEM PARSING - Mirrors Kotlin's toSearchResult()
    // =========================================================================

    /**
     * Parse search results from HTML - mirrors Kotlin's Element.toSearchResult()
     */
    function parseSearchItem(element) {
        try {
            // Find the main link with title
            const link = element.querySelector("a");
            if (!link) return null;

            const href = fixUrl(link.getAttribute("href"));
            if (!href) return null;

            // Extract title (before year in parentheses)
            let title = link.textContent || link.getAttribute("title") || "";
            title = decodeHtml(title);
            title = title.split("(")[0].trim();

            // Extract poster
            const posterEl = element.querySelector(".dar-short_bg a, .poster-img");
            const posterUrl = posterEl ? fixUrl(posterEl.getAttribute("href") || posterEl.getAttribute("src")) : null;

            // Extract rating
            const ratingEl = element.querySelector(".rating-color, .rating");
            let score = null;
            if (ratingEl) {
                const ratingText = ratingEl.textContent.trim();
                const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                if (ratingMatch) {
                    score = parseFloat(ratingMatch[1]);
                    if (score > 10) score = score / 10; // Normalize if out of 100
                }
            }

            // Extract quality
            const qualityEl = element.querySelector(".dar-short_bg.e-cover span");
            let quality = "HD";
            if (qualityEl) {
                const qualityText = qualityEl.textContent;
                if (qualityText && qualityText.toLowerCase().includes("ts")) {
                    quality = "TS";
                }
            }

            // Determine type
            const type = href.includes("/tv-series/") ? "series" : "movie";

            return new MultimediaItem({
                title: title,
                url: href,
                posterUrl: posterUrl,
                type: type,
                score: score,
                quality: quality
            });
        } catch (e) {
            return null;
        }
    }

    /**
     * Parse homepage items from HTML
     */
    function parseItems(html) {
        const items = [];

        // Try different selectors that Cinemacity might use
        const selectors = [
            "div.dar-short_item",
            "div.short-item",
            "article.post",
            "div.movie-item",
            "div.item"
        ];

        for (const selector of selectors) {
            const elements = html.querySelectorAll(selector);
            if (elements.length > 0) {
                for (const el of elements) {
                    const item = parseSearchItem(el);
                    if (item) items.push(item);
                }
                break;
            }
        }

        // Fallback: try regex parsing for movie items
        if (items.length === 0) {
            const regexPattern = /<a[^>]+href="([^"]+\.(?:movie|tv-series)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            while ((match = regexPattern.exec(html)) !== null) {
                const href = match[1];
                const content = match[2];

                // Extract title
                const titleMatch = content.match(/>([^<(]+)/);
                if (!titleMatch) continue;

                const title = decodeHtml(titleMatch[1].trim());
                if (!title) continue;

                items.push(new MultimediaItem({
                    title: title.split("(")[0].trim(),
                    url: href,
                    type: href.includes("/tv-series/") ? "series" : "movie"
                }));
            }
        }

        return items;
    }

    // =========================================================================
    // EPISODE PARSING - Mirrors Kotlin's episode building
    // =========================================================================

    /**
     * Parse series episodes from player config - mirrors Kotlin's episode building
     */
    function buildSeriesEpisodes(playerConfig, responseData) {
        const episodes = [];
        if (!playerConfig || !playerConfig.file) return episodes;

        const fileArray = Array.isArray(playerConfig.file) ? playerConfig.file : [playerConfig.file];

        // Build episode metadata map from Cinemeta
        const epMetaMap = {};
        if (responseData?.meta?.videos) {
            for (const v of responseData.meta.videos) {
                if (v.season && v.episode) {
                    epMetaMap[`${v.season}:${v.episode}`] = v;
                }
            }
        }

        for (const seasonObj of fileArray) {
            // Extract season number
            const seasonMatch = seasonObj.title?.match(/Season\s*(\d+)/i);
            if (!seasonMatch) continue;
            const seasonNumber = parseInt(seasonMatch[1], 10);

            // Get episodes from folder
            const folder = seasonObj.folder || [];
            for (const epObj of folder) {
                // Extract episode number
                const epMatch = epObj.title?.match(/Episode\s*(\d+)/i);
                if (!epMatch) continue;
                const episodeNumber = parseInt(epMatch[1], 10);

                // Build stream data
                const streamUrls = [];
                if (epObj.file) {
                    streamUrls.push(epObj.file);
                }
                if (Array.isArray(epObj.folder)) {
                    for (const source of epObj.folder) {
                        if (source.file) streamUrls.push(source.file);
                    }
                }

                if (streamUrls.length === 0) continue;

                const metaKey = `${seasonNumber}:${episodeNumber}`;
                const epMeta = epMetaMap[metaKey];

                // Parse subtitles for episode
                const subtitles = parseSubtitles(epObj.subtitle);

                episodes.push(new Episode({
                    name: epMeta?.name || `S${seasonNumber}E${episodeNumber}`,
                    url: JSON.stringify({
                        streams: streamUrls,
                        subtitleTracks: subtitles
                    }),
                    season: seasonNumber,
                    episode: episodeNumber,
                    description: epMeta?.overview || null,
                    posterUrl: epMeta?.thumbnail || null,
                    aired: epMeta?.released || null
                }));
            }
        }

        // Sort episodes
        episodes.sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.episode - b.episode;
        });

        return episodes;
    }

    /**
     * Build movie stream data - mirrors Kotlin's movie handling
     */
    function buildMovieData(playerConfig) {
        const streams = [];
        const subtitles = [];

        if (!playerConfig) return { streams, subtitles };

        // Parse streams from file field
        if (Array.isArray(playerConfig.file)) {
            for (const item of playerConfig.file) {
                if (item.file) {
                    if (!item.folder) {
                        // Direct stream
                        streams.push(item.file);
                    }
                }
            }
        } else if (playerConfig.file) {
            streams.push(playerConfig.file);
        }

        // Parse subtitles
        const rawSubtitle = playerConfig.subtitle;
        if (rawSubtitle) {
            if (Array.isArray(playerConfig.file) && playerConfig.file[0]?.subtitle) {
                subtitles.push(...parseSubtitles(playerConfig.file[0].subtitle));
            } else {
                subtitles.push(...parseSubtitles(rawSubtitle));
            }
        }

        return { streams, subtitles };
    }

    // =========================================================================
    // CORE FUNCTIONS - SkyStream required exports
    // =========================================================================

    /**
     * getHome - Homepage with sections
     * Mirrors: Kotlin's getMainPage()
     */
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

            const homeData = {};

            for (const section of sections) {
                try {
                    const url = section.path
                        ? `${manifest.baseUrl}/${section.path}`
                        : manifest.baseUrl;

                    const res = await http_get(url, BASE_HEADERS);
                    if (res.status !== 200) continue;

                    const html = await parseHtml(res.body);
                    const items = parseItems(html);

                    if (items.length > 0) {
                        homeData[section.name] = items;
                    }
                } catch (e) {
                    console.error(`Section [${section.name}] failed: ${e.message}`);
                }
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    /**
     * search - Search functionality
     * Mirrors: Kotlin's search()
     */
    async function search(query, cb) {
        try {
            const searchUrl = `${manifest.baseUrl}/index.php?do=search&subaction=search&full_search=0&story=${encodeURIComponent(query)}`;

            const res = await http_get(searchUrl, BASE_HEADERS);
            if (res.status !== 200) {
                cb({ success: true, data: [] });
                return;
            }

            const html = await parseHtml(res.body);
            const items = parseItems(html);

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    /**
     * load - Load detail page with metadata and episodes
     * Mirrors: Kotlin's load()
     */
    async function load(url, cb) {
        try {
            const res = await http_get(url, BASE_HEADERS);
            if (res.status !== 200) {
                cb({ success: false, errorCode: "SITE_OFFLINE" });
                return;
            }

            const html = await parseHtml(res.body);

            // Extract basic metadata
            const ogTitle = html.querySelector("meta[property='og:title']")?.content || "";
            let title = ogTitle.split("(")[0].trim() || "Unknown";

            const poster = html.querySelector("meta[property='og:image']")?.content || "";
            const background = html.querySelector(".dar-full_bg a")?.getAttribute("href") || poster;

            // Extract IMDB ID
            const imdbId = extractImdbId(res.body);

            // Determine content type
            const isSeries = url.includes("/tv-series/");
            const type = isSeries ? "series" : "movie";
            const cinemetaType = isSeries ? "series" : "movie";

            // Initialize metadata
            let description = null;
            let genres = null;
            let year = null;
            let rating = null;
            let logoUrl = null;
            let trailer = null;
            let recommendations = [];

            // Fetch TMDB data for enrichment
            const tmdbId = await tmdbIdFromImdb(imdbId);
            let castList = [];

            if (tmdbId) {
                // Fetch TMDB credits
                const creditsJson = await fetchTMDB(tmdbId, cinemetaType);
                castList = parseCredits(creditsJson);

                // Set logo URL
                if (imdbId) {
                    logoUrl = `${TMDB_LOGO_BASE}/${imdbId}/img`;
                }
            }

            // Fetch Cinemeta metadata
            const responseData = await fetchCinemeta(imdbId, cinemetaType);

            if (responseData?.meta) {
                const meta = responseData.meta;
                description = meta.description || description;
                genres = meta.genres || genres;
                year = parseInt(meta.year) || year;
                rating = parseFloat(meta.imdbRating) || rating;

                if (meta.background) {
                    // Background is already a URL
                }
            }

            // Extract description from page if not from Cinemeta
            if (!description) {
                const descEl = html.querySelector("#about .ta-full_text1, .description, .summary");
                if (descEl) {
                    description = stripTags(descEl.innerHTML);
                }
            }

            // Extract year from title if not found
            if (!year) {
                const yearMatch = ogTitle.match(/\((\d{4})\)/);
                if (yearMatch) {
                    year = parseInt(yearMatch[1], 10);
                }
            }

            // Extract audio language
            let audioLanguages = null;
            const audioEl = html.querySelector("li");
            if (audioEl) {
                const liText = audioEl.textContent || "";
                if (liText.toLowerCase().includes("audio")) {
                    audioLanguages = stripTags(liText.split(":")[1] || "");
                }
            }

            // Extract recommendations
            const recItems = html.querySelectorAll(".ta-rel_item, .recommendation-item, .related-item");
            for (const recEl of recItems) {
                const recLink = recEl.querySelector("a");
                if (recLink) {
                    const recTitle = recLink.textContent.split("(")[0].trim();
                    const recUrl = fixUrl(recLink.getAttribute("href"));
                    const recScore = recEl.querySelector(".rating-color")?.textContent;

                    if (recTitle && recUrl) {
                        recommendations.push(new MultimediaItem({
                            title: recTitle,
                            url: recUrl,
                            posterUrl: null,
                            type: recUrl.includes("/tv-series/") ? "series" : "movie",
                            score: recScore ? parseFloat(recScore) : null
                        }));
                    }
                }
            }

            // Extract trailer
            const trailerMatch = res.body.match(/data-vbg="([^"]+)"/);
            if (trailerMatch) {
                trailer = [{ url: trailerMatch[1] }];
            }

            // Parse PlayerJS
            const playerConfig = parsePlayerJs(res.body);

            if (isSeries) {
                // Build series response
                const episodes = buildSeriesEpisodes(playerConfig, responseData);

                // Build full description with audio languages
                let fullDescription = description || "";
                if (audioLanguages) {
                    fullDescription += ` - Audio: ${audioLanguages}`;
                }

                cb({
                    success: true,
                    data: new MultimediaItem({
                        title: responseData?.meta?.name || title,
                        url: url,
                        posterUrl: poster,
                        bannerUrl: background,
                        logoUrl: logoUrl,
                        type: "series",
                        description: fullDescription,
                        year: year,
                        score: rating,
                        genres: genres,
                        cast: castList,
                        episodes: episodes,
                        recommendations: recommendations.length > 0 ? recommendations : undefined,
                        trailers: trailer?.map(t => new Trailer({ url: t.url })),
                        contentRating: responseData?.meta?.appExtras?.certification
                    })
                });
            } else {
                // Build movie response
                const movieData = buildMovieData(playerConfig);

                // Build full description with audio languages
                let fullDescription = description || "";
                if (audioLanguages) {
                    fullDescription += ` - Audio: ${audioLanguages}`;
                }

                // Encode stream data
                const episodeData = {
                    streams: movieData.streams,
                    subtitleTracks: movieData.subtitles
                };

                cb({
                    success: true,
                    data: new MultimediaItem({
                        title: responseData?.meta?.name || title,
                        url: url,
                        posterUrl: poster,
                        bannerUrl: background,
                        logoUrl: logoUrl,
                        type: "movie",
                        description: fullDescription,
                        year: year,
                        score: rating,
                        genres: genres,
                        cast: castList,
                        episodes: [new Episode({
                            name: "Full Movie",
                            url: JSON.stringify(episodeData),
                            season: 1,
                            episode: 1
                        })],
                        recommendations: recommendations.length > 0 ? recommendations : undefined,
                        trailers: trailer?.map(t => new Trailer({ url: t.url })),
                        contentRating: responseData?.meta?.appExtras?.certification
                    })
                });
            }
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    /**
     * loadStreams - Extract playable video streams
     * Mirrors: Kotlin's loadLinks()
     */
    async function loadStreams(dataStr, cb) {
        try {
            let payload;
            try {
                payload = JSON.parse(dataStr);
            } catch (e) {
                cb({ success: true, data: [] });
                return;
            }

            const streams = payload.streams || [];
            const subtitleTracks = payload.subtitleTracks || [];
            const results = [];
            const seenUrls = new Set();

            // Process each stream URL
            for (const streamUrl of streams) {
                if (!streamUrl || typeof streamUrl !== "string") continue;
                if (seenUrls.has(streamUrl)) continue;
                seenUrls.add(streamUrl);

                const quality = extractQuality(streamUrl);
                const qualityLabel = quality > 0 ? `${quality}p` : "Auto";

                results.push(new StreamResult({
                    url: streamUrl,
                    quality: quality,
                    source: qualityLabel,
                    headers: {
                        Referer: manifest.baseUrl + "/"
                    },
                    subtitles: subtitleTracks.map(s => ({
                        url: s.url || s,
                        lang: s.lang || s.label || "Unknown",
                        label: s.label || s.lang || "Unknown"
                    }))
                }));
            }

            // Sort by quality descending
            results.sort((a, b) => (b.quality || 0) - (a.quality || 0));

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    // =========================================================================
    // EXPORTS - SkyStream required exports
    // =========================================================================

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

})();
