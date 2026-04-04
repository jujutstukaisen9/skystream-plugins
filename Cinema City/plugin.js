/**
 * CinemaCity SkyStream Plugin
 * Ported from CloudStream Kotlin provider
 *
 * Features:
 * - Homepage categories (Movies, TV Series, Anime, Asian, Animation, Documentary)
 * - Search functionality
 * - TMDB/Cinemeta metadata integration
 * - Stream extraction from PlayerJS
 * - Quality detection
 * - Subtitle support
 */

(function() {
    'use strict';

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    const BASE_URL = manifest?.baseUrl || 'https://cinemacity.cc';
    const TMDB_API_KEY = '1865f43a0549ca50d341dd9ab8b29f49';
    const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';
    const CINEMETA_URL = 'https://v3-cinemeta.strem.io/meta';
    const METAHUB_LOGO = 'https://live.metahub.space/logo/medium';

    // Base64 decoded cookie from Kotlin source
    const COOKIE = atob('ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=');

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Cookie': COOKIE,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': BASE_URL + '/'
    };

    // =========================================================================
    // HELPER FUNCTIONS
    // =========================================================================

    /**
     * Fix URL to ensure proper format
     */
    function fixUrl(url, base) {
        if (!url) return '';
        base = base || BASE_URL;
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (url.startsWith('/')) {
            return base + url;
        }
        if (!url.startsWith('http')) {
            return base + '/' + url;
        }
        return url;
    }

    /**
     * Extract quality from URL or text
     */
    function extractQuality(input) {
        if (!input) return 0;
        const text = String(input).toLowerCase();
        if (text.includes('2160p') || text.includes('4k')) return 2160;
        if (text.includes('1440p')) return 1440;
        if (text.includes('1080p')) return 1080;
        if (text.includes('720p')) return 720;
        if (text.includes('480p')) return 480;
        if (text.includes('360p')) return 360;
        return 0; // Unknown
    }

    /**
     * Parse subtitles from raw string format
     * Format: "[Language]https://subtitle.url"
     */
    function parseSubtitles(raw) {
        const tracks = [];
        if (!raw) return tracks;

        const parts = raw.split(',');
        for (const entry of parts) {
            const match = entry.trim().match(/\[(.+?)\](https?:\/\/.+)/);
            if (match) {
                tracks.push({
                    language: match[1],
                    subtitleUrl: match[2]
                });
            }
        }
        return tracks;
    }

    /**
     * Parse TMDB credits JSON to Actor array
     */
    function parseCredits(jsonText) {
        if (!jsonText) return [];
        try {
            const root = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
            const castArr = root.cast || [];
            return castArr.map(c => {
                const name = c.name || c.original_name || '';
                const profile = c.profile_path ? TMDB_IMAGE_BASE + c.profile_path : null;
                const character = c.character || null;
                return new Actor({
                    name: name,
                    image: profile,
                    role: character
                });
            }).filter(a => a.name);
        } catch (e) {
            console.error('Parse credits error:', e);
            return [];
        }
    }

    /**
     * Fetch JSON with error handling
     */
    async function fetchJson(url, headers) {
        const res = await http_get(url, headers);
        if (res.status !== 200) {
            throw new Error(`HTTP ${res.status}`);
        }
        return JSON.parse(res.body);
    }

    /**
     * Get TMDB metadata for IMDB ID
     */
    async function getTmdbId(imdbId, type) {
        if (!imdbId) return null;
        try {
            const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            const data = await fetchJson(url, {});
            const results = type === 'tv'
                ? (data.tv_results || [])
                : (data.movie_results || []);
            return results[0]?.id || null;
        } catch (e) {
            console.error('TMDB ID lookup error:', e);
            return null;
        }
    }

    /**
     * Get credits from TMDB
     */
    async function getTmdbCredits(tmdbId, type) {
        if (!tmdbId) return null;
        try {
            const endpoint = type === 'tv' ? 'tv' : 'movie';
            const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
            return await fetchJson(url, {});
        } catch (e) {
            console.error('TMDB credits error:', e);
            return null;
        }
    }

    /**
     * Get metadata from Cinemeta
     */
    async function getCinemetaMeta(imdbId, type) {
        if (!imdbId) return null;
        try {
            const typeset = type === 'tv' ? 'series' : 'movie';
            const url = `${CINEMETA_URL}/${typeset}/${imdbId}.json`;
            const data = await fetchJson(url, {});
            return data.meta || null;
        } catch (e) {
            console.error('Cinemeta error:', e);
            return null;
        }
    }

    /**
     * Extract IMDB ID from onclick attribute
     */
    function extractImdbId(onclickAttr) {
        if (!onclickAttr) return null;
        const match = onclickAttr.match(/tt\d+/);
        return match ? match[0] : null;
    }

    /**
     * Extract year from title string like "Movie Name (2024)"
     */
    function extractYear(title) {
        if (!title) return null;
        const match = title.match(/\((\d{4})\)/);
        return match ? parseInt(match[1]) : null;
    }

    // =========================================================================
    // SEARCH RESULT PARSING
    // =========================================================================

    /**
     * Convert DOM element to MultimediaItem search result
     */
    function elementToSearchResult(el) {
        const linkEl = el.querySelector('a');
        if (!linkEl) return null;

        const href = linkEl.getAttribute('href') || '';
        const title = linkEl.textContent?.substringBefore('(')?.trim() || 'Unknown';
        const posterEl = el.querySelector('.dar-short_bg a');
        const posterUrl = posterEl ? fixUrl(posterEl.getAttribute('href')) : null;
        const scoreEl = el.querySelector('span.rating-color');
        const score = scoreEl ? parseFloat(scoreEl.textContent) / 10 * 10 : null;

        // Extract quality from span element
        const qualitySpan = el.querySelector('.dar-short_bg.e-cover > div span:nth-child(2) > a');
        let qualityStr = qualitySpan?.textContent;
        if (!qualityStr) {
            const altSpan = el.querySelector('.dar-short_bg.e-cover > div > span');
            qualityStr = altSpan?.textContent;
        }
        const isTS = qualityStr?.toLowerCase().includes('ts');
        const quality = isTS ? 'TS' : 'HD';

        const type = href.toLowerCase().includes('/tv-series/') ? 'series' : 'movie';

        return new MultimediaItem({
            title: title,
            url: href,
            posterUrl: posterUrl,
            type: type,
            score: score
        });
    }

    // =========================================================================
    // HOME PAGE (getHome)
    // =========================================================================

    async function getHome(cb) {
        try {
            const categories = [
                { path: 'movies', name: 'Movies' },
                { path: 'tv-series', name: 'TV Series' },
                { path: 'xfsearch/genre/anime', name: 'Anime' },
                { path: 'xfsearch/genre/asian', name: 'Asian' },
                { path: 'xfsearch/genre/animation', name: 'Animation' },
                { path: 'xfsearch/genre/documentary', name: 'Documentary' }
            ];

            const homeData = {};

            for (const cat of categories) {
                const url = `${BASE_URL}/${cat.path}`;
                const res = await http_get(url, HEADERS);

                if (res.status !== 200) continue;

                const doc = await parseHtml(res.body);
                const items = Array.from(doc.querySelectorAll('div.dar-short_item'))
                    .map(el => elementToSearchResult(el))
                    .filter(Boolean);

                if (items.length > 0) {
                    homeData[cat.name] = items;
                }
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            console.error('getHome error:', e);
            cb({ success: false, errorCode: 'HOME_ERROR', message: e.message });
        }
    }

    // =========================================================================
    // SEARCH (search)
    // =========================================================================

    async function search(query, cb) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const url = `${BASE_URL}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodedQuery}`;

            const res = await http_get(url, HEADERS);

            if (res.status !== 200) {
                return cb({ success: false, errorCode: 'SEARCH_ERROR', message: 'HTTP ' + res.status });
            }

            const doc = await parseHtml(res.body);
            const items = Array.from(doc.querySelectorAll('div.dar-short_item'))
                .map(el => elementToSearchResult(el))
                .filter(Boolean);

            cb({ success: true, data: items });
        } catch (e) {
            console.error('search error:', e);
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: e.message });
        }
    }

    // =========================================================================
    // LOAD (load)
    // =========================================================================

    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);

            if (res.status !== 200) {
                return cb({ success: false, errorCode: 'LOAD_ERROR', message: 'HTTP ' + res.status });
            }

            const doc = await parseHtml(res.body);

            // Extract basic metadata
            const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
            const title = ogTitle.substringBefore('(').trim();
            const poster = fixUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'));
            const bgposter = doc.querySelector('div.dar-full_bg a')?.getAttribute('href');
            const trailerData = doc.querySelector('div.dar-full_bg.e-cover > div')?.getAttribute('data-vbg');

            // Extract year
            const year = extractYear(ogTitle);

            // Determine media type
            const isTvSeries = url.toLowerCase().includes('/tv-series/');
            const tvType = isTvSeries ? 'series' : 'movie';

            // Get description
            const descriptions = doc.querySelector('#about div.ta-full_text1')?.textContent?.trim() || '';

            // Extract IMDB ID from onclick attributes
            const ratingDivs = doc.querySelectorAll('div.ta-full_rating1 > div');
            let imdbId = null;
            for (const div of ratingDivs) {
                const onclick = div.getAttribute('onclick');
                imdbId = extractImdbId(onclick);
                if (imdbId) break;
            }

            // Extract audio languages
            const audioLangLi = Array.from(doc.querySelectorAll('li')).find(li => {
                const span = li.querySelector('span');
                return span?.textContent?.toLowerCase() === 'audio language';
            });
            const audioLanguages = audioLangLi
                ? Array.from(audioLangLi.querySelectorAll('span:nth-child(2) a'))
                    .map(a => a.textContent?.trim())
                    .filter(Boolean)
                    .join(', ')
                : null;

            // Get recommendations
            const recommendations = Array.from(doc.querySelectorAll('div.ta-rel > div.ta-rel_item')).map(rel => {
                const relTitle = rel.querySelector('a')?.textContent?.substringBefore('(')?.trim() || '';
                const relHref = fixUrl(rel.querySelector('> div > a')?.getAttribute('href'));
                const relScore = rel.querySelector('span.rating-color1')?.textContent;
                const relPoster = rel.querySelector('div > a')?.getAttribute('href');
                return new MultimediaItem({
                    title: relTitle,
                    url: relHref,
                    posterUrl: relPoster,
                    type: 'movie',
                    score: relScore ? parseFloat(relScore) : null
                });
            }).filter(r => r.title);

            // TMDB integration for additional metadata
            let tmdbId = null;
            let logoUrl = null;
            let castList = [];
            let metaInfo = null;

            if (imdbId) {
                tmdbId = await getTmdbId(imdbId, tvType);

                if (tmdbId) {
                    logoUrl = `${METAHUB_LOGO}/${imdbId}/img`;

                    // Get TMDB credits
                    const credits = await getTmdbCredits(tmdbId, tvType);
                    if (credits) {
                        const creditsJson = JSON.stringify({ cast: credits.cast || [] });
                        castList = parseCredits(creditsJson);
                    }

                    // Get Cinemeta metadata
                    metaInfo = await getCinemetaMeta(imdbId, tvType);
                }
            }

            // Build description
            let description = metaInfo?.description || descriptions;
            if (audioLanguages) {
                description = (description || '') + (description ? ' - ' : '') + 'Audio: ' + audioLanguages;
            }

            // Extract genre/tags
            const tags = metaInfo?.genres || [];

            // Extract content rating
            const contentRating = metaInfo?.appExtras?.certification || null;

            // Score
            const score = metaInfo?.imdbRating
                ? parseFloat(metaInfo.imdbRating)
                : null;

            // Parse PlayerJS for stream data
            const playerScripts = doc.querySelectorAll('script');
            let playerData = null;

            for (const script of playerScripts) {
                const data = script.textContent || '';
                if (data.includes('atob')) {
                    // Found player script, decode
                    const b64Match = data.match(/atob\("([^"]+)"\)/);
                    if (b64Match) {
                        try {
                            const decoded = atob(b64Match[1]);
                            const playerjsMatch = decoded.match(/new Playerjs\((.+)\);?$/);
                            if (playerjsMatch) {
                                playerData = JSON.parse(playerjsMatch[1]);
                                break;
                            }
                        } catch (e) {
                            // Continue trying
                        }
                    }
                }
            }

            if (!playerData) {
                return cb({
                    success: false,
                    errorCode: 'PARSE_ERROR',
                    message: 'PlayerJS not found; only torrent links available'
                });
            }

            // Parse file data (handle various formats)
            let fileArray = playerData.file;

            if (typeof fileArray === 'string') {
                fileArray = fileArray.trim();
                if (fileArray.startsWith('[') && fileArray.endsWith(']')) {
                    fileArray = JSON.parse(fileArray);
                } else if (fileArray.startsWith('{') && fileArray.endsWith('}')) {
                    fileArray = [JSON.parse(fileArray)];
                } else if (fileArray) {
                    fileArray = [{ file: fileArray }];
                } else {
                    fileArray = [];
                }
            }

            // Episode metadata map from Cinemeta
            const epMetaMap = {};
            if (metaInfo?.videos) {
                for (const v of metaInfo.videos) {
                    if (v.season && v.episode) {
                        const key = `${v.season}:${v.episode}`;
                        epMetaMap[key] = {
                            name: v.name || v.title,
                            overview: v.overview,
                            thumbnail: v.thumbnail,
                            released: v.released
                        };
                    }
                }
            }

            // Parse subtitle tracks
            const subtitle = playerData.subtitle ||
                (fileArray[0]?.subtitle) || null;
            const subtitleTracks = parseSubtitles(subtitle);

            // Build episodes
            const episodes = [];
            const isSingleFile = !fileArray[0]?.folder;

            if (isTvSeries) {
                // TV Series: parse seasons and episodes
                const seasonRegex = /Season\s*(\d+)/i;
                const episodeRegex = /Episode\s*(\d+)/i;

                for (let i = 0; i < fileArray.length; i++) {
                    const seasonObj = fileArray[i];
                    const seasonTitle = seasonObj.title || '';
                    const seasonMatch = seasonTitle.match(seasonRegex);
                    const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : (i + 1);

                    const folders = seasonObj.folder || [];

                    for (let j = 0; j < folders.length; j++) {
                        const epObj = folders[j];
                        const epTitle = epObj.title || '';
                        const epMatch = epTitle.match(episodeRegex);
                        const epNum = epMatch ? parseInt(epMatch[1]) : (j + 1);

                        // Collect stream URLs
                        const streamUrls = [];
                        if (epObj.file) streamUrls.push(epObj.file);
                        if (epObj.folder) {
                            for (const source of epObj.folder) {
                                if (source.file) streamUrls.push(source.file);
                            }
                        }

                        if (streamUrls.length === 0) continue;

                        // Episode metadata
                        const metaKey = `${seasonNum}:${epNum}`;
                        const epMeta = epMetaMap[metaKey] || {};

                        // Parse episode subtitles
                        const epSubtitles = parseSubtitles(epObj.subtitle);

                        const episodeData = {
                            streams: streamUrls,
                            subtitleTracks: [...subtitleTracks, ...epSubtitles]
                        };

                        episodes.push(new Episode({
                            name: epMeta.name || `S${seasonNum}E${epNum}`,
                            url: JSON.stringify(episodeData),
                            season: seasonNum,
                            episode: epNum,
                            description: epMeta.overview || null,
                            posterUrl: epMeta.thumbnail || poster,
                            airDate: epMeta.released || null
                        }));
                    }
                }
            } else {
                // Movie: single file or array of files
                const streamUrls = [];

                if (isSingleFile && fileArray[0]?.file) {
                    streamUrls.push(fileArray[0].file);
                } else {
                    for (const obj of fileArray) {
                        if (obj.file) streamUrls.push(obj.file);
                    }
                }

                if (streamUrls.length === 0) {
                    return cb({
                        success: false,
                        errorCode: 'PARSE_ERROR',
                        message: 'No stream URLs found'
                    });
                }

                const movieData = {
                    streams: streamUrls,
                    subtitleTracks: subtitleTracks
                };

                episodes.push(new Episode({
                    name: title,
                    url: JSON.stringify(movieData),
                    season: 1,
                    episode: 1,
                    posterUrl: poster
                }));
            }

            // Build result
            const result = new MultimediaItem({
                title: metaInfo?.name || title,
                url: url,
                posterUrl: poster,
                bannerUrl: metaInfo?.background || bgposter,
                logoUrl: logoUrl,
                type: tvType,
                year: year || (metaInfo?.year ? parseInt(metaInfo.year) : null),
                score: score,
                description: description,
                tags: tags,
                cast: castList,
                contentRating: contentRating,
                episodes: episodes,
                recommendations: recommendations
            });

            cb({ success: true, data: result });
        } catch (e) {
            console.error('load error:', e);
            cb({ success: false, errorCode: 'LOAD_ERROR', message: e.message });
        }
    }

    // =========================================================================
    // LOAD STREAMS (loadStreams)
    // =========================================================================

    async function loadStreams(data, cb) {
        try {
            const obj = typeof data === 'string' ? JSON.parse(data) : data;
            const streams = [];

            // Extract subtitle tracks if present
            if (obj.subtitleTracks && Array.isArray(obj.subtitleTracks)) {
                // Subtitles are handled by the app automatically
                // No need to include in StreamResult unless explicitly required
            }

            // Get stream URLs
            const streamUrls = obj.streams || [];

            if (streamUrls.length === 0 && obj.streamUrl) {
                streamUrls.push(obj.streamUrl);
            }

            if (streamUrls.length === 0) {
                return cb({ success: false, errorCode: 'STREAM_ERROR', message: 'No streams found' });
            }

            // Create StreamResult for each URL
            for (const url of streamUrls) {
                const quality = extractQuality(url);
                streams.push(new StreamResult({
                    url: url,
                    quality: quality ? `${quality}p` : 'Unknown',
                    headers: {
                        'Referer': BASE_URL + '/'
                    }
                }));
            }

            cb({ success: true, data: streams });
        } catch (e) {
            console.error('loadStreams error:', e);
            cb({ success: false, errorCode: 'STREAM_ERROR', message: e.message });
        }
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

})();
