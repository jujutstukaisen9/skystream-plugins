/**
 * DudeFilms SkyStream Plugin
 * Ported from CloudStream Kotlin extension
 *
 * Features:
 * - Homepage categories (Bollywood, Hollywood, South Indian, Gujarati, Web Series)
 * - Search functionality
 * - IMDB/Cinemeta metadata enrichment
 * - Series episode extraction
 * - Multiple stream extractors (HubCloud, GDFlix, Pixeldrain, etc.)
 */

(function() {
    'use strict';

    // ============================================================================
    // CONSTANTS
    // ============================================================================

    const CINEMETA_URL = 'https://v3-cinemeta.strem.io/meta';
    const IMDB_BASE_URL = 'https://v3-cinemeta.strem.io/meta';

    const DEFAULT_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
    };

    const STREAM_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // Quality patterns for extraction
    const QUALITY_PATTERNS = [
        { pattern: /\b(2160p|4k|uhd|ds4k)\b/i, quality: '4K' },
        { pattern: /\b(1440p|qhd)\b/i, quality: '1440p' },
        { pattern: /\b(1080p|fullhd|fhd)\b/i, quality: '1080p' },
        { pattern: /\b(720p|hd)\b/i, quality: '720p' },
        { pattern: /\b(480p|sd)\b/i, quality: '480p' },
        { pattern: /\b(360p)\b/i, quality: '360p' }
    ];

    // Blocked content patterns
    const BLOCKED_PATTERNS = ['zipfile', 'torrent', 'rar', '7z', 'zip', 'magnet'];

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Decode HTML entities
     */
    function decodeHtml(html) {
        if (!html) return '';
        return html
            .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'");
    }

    /**
     * Clean and fix URL
     */
    function fixUrl(url, base) {
        if (!url) return '';
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (url.startsWith('/')) {
            return (base || manifest.baseUrl) + url;
        }
        if (!url.startsWith('http')) {
            return (base || manifest.baseUrl) + '/' + url;
        }
        return url;
    }

    /**
     * Extract quality from text
     */
    function getQuality(text) {
        if (!text) return 'Auto';
        const lower = text.toLowerCase();
        for (const { pattern, quality } of QUALITY_PATTERNS) {
            if (pattern.test(lower)) {
                return quality;
            }
        }
        return 'Auto';
    }

    /**
     * Clean title by removing season/episode info for movies
     */
    function cleanTitle(raw) {
        if (!raw) return '';
        const trimmed = raw.trim();
        // Keep the full title including season/episode for display
        return trimmed;
    }

    /**
     * Parse episode number from text
     */
    function parseEpisodeNumber(text) {
        if (!text) return null;
        const patterns = [
            /(?:Episode|Ep|E)\s*(\d+)/i,
            /(\d+)\s*(?:Episode|Ep)/i,
            /S\d+E(\d+)/i,
            /E(\d+)/i
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return null;
    }

    /**
     * Parse season number from text
     */
    function parseSeasonNumber(text) {
        if (!text) return 1;
        const patterns = [
            /(?:Season|S)\s*(\d+)/i,
            /S(\d+)/i
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return 1;
    }

    /**
     * Check if button should be blocked
     */
    function isBlockedButton(element) {
        const text = (element.querySelector('span.mb-text')?.textContent ||
                      element.textContent || '').toLowerCase();
        return BLOCKED_PATTERNS.some(blocked => text.includes(blocked));
    }

    /**
     * Safe JSON parse
     */
    function safeParse(jsonStr) {
        if (!jsonStr) return null;
        if (typeof jsonStr === 'object') return jsonStr;
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            return null;
        }
    }

    /**
     * Extract IMDB ID from URL
     */
    function extractImdbId(url) {
        if (!url) return null;
        const match = url.match(/imdb\.com\/title\/(tt\d+)/i);
        return match ? match[1] : null;
    }

    /**
     * Get content type from URL/title
     */
    function getContentType(title, url) {
        const t = (title || '').toLowerCase();
        const u = (url || '').toLowerCase();
        const isSeries = t.includes('series') ||
                         t.includes('season') ||
                         u.includes('/series/') ||
                         u.includes('/tv/') ||
                         u.includes('-season-') ||
                         u.includes('-series-');
        return isSeries ? 'series' : 'movie';
    }

    /**
     * Format file size
     */
    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '';
        if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(2) + ' KB';
        }
        if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    // ============================================================================
    // IMDB/CINEMETA ENRICHMENT
    // ============================================================================

    /**
     * Fetch metadata from Cinemeta
     */
    async function fetchCinemetaData(imdbId, type) {
        if (!imdbId) return null;
        try {
            const url = `${CINEMETA_URL}/${type}/${imdbId}.json`;
            const res = await http_get(url, DEFAULT_HEADERS);
            if (res.status === 200 && res.body) {
                const data = safeParse(res.body);
                if (data && data.meta) {
                    return data.meta;
                }
            }
        } catch (e) {
            console.error('Cinemeta fetch error:', e.message);
        }
        return null;
    }

    /**
     * Get TMDB poster image
     */
    async function getTmdbPoster(tmdbId, type) {
        if (!tmdbId) return null;
        try {
            const apiKey = '98ae14df2b8d8f8f8136499daf79f0e0';
            const url = `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${tmdbId}/images?api_key=${apiKey}`;
            const res = await http_get(url);
            if (res.status === 200) {
                const data = safeParse(res.body);
                if (data && data.posters && data.posters.length > 0) {
                    const poster = data.posters.find(p => p.iso_639_1 === 'en') || data.posters[0];
                    return `https://image.tmdb.org/t/p/w500${poster.file_path}`;
                }
            }
        } catch (e) {
            console.error('TMDB fetch error:', e.message);
        }
        return null;
    }

    // ============================================================================
    // SEARCH RESULT PARSING
    // ============================================================================

    /**
     * Convert DOM element to MultimediaItem
     */
    async function toSearchResult(element) {
        try {
            const link = element.querySelector('h3 a') || element.querySelector('a');
            if (!link) return null;

            const href = link.getAttribute('href');
            if (!href) return null;

            const titleEl = element.querySelector('h3') || link;
            const title = cleanTitle(titleEl.textContent || 'No Title');

            const imgEl = element.querySelector('img');
            let poster = imgEl?.getAttribute('data-src') ||
                         imgEl?.getAttribute('data-lazy-src') ||
                         imgEl?.getAttribute('src') || '';

            // Handle lazy-loaded images
            if (poster.startsWith('data:image')) {
                poster = imgEl?.getAttribute('data-src') || '';
            }

            // Fix poster URL
            if (poster && !poster.startsWith('http')) {
                poster = poster.startsWith('//') ? 'https:' + poster : fixUrl(poster);
            }

            const contentType = getContentType(title, href);

            return new MultimediaItem({
                title: title,
                url: fixUrl(href),
                posterUrl: poster,
                type: contentType,
                quality: getQuality(title)
            });
        } catch (e) {
            console.error('Error parsing search result:', e.message);
            return null;
        }
    }

    // ============================================================================
    // STREAM EXTRACTORS
    // ============================================================================

    /**
     * Extract from HubCloud
     */
    async function extractHubCloud(url, referer, streams) {
        try {
            const headers = { ...STREAM_HEADERS, 'Referer': referer || url };
            const res = await http_get(url, headers);
            if (res.status !== 200) return;

            const doc = await parseHtml(res.body);
            const sizeEl = doc.querySelector('i#size');
            const headerEl = doc.querySelector('div.card-header');

            const size = sizeEl?.textContent?.trim() || '';
            const header = headerEl?.textContent?.trim() || '';
            const quality = getQuality(header) || 'Auto';

            const labelExtras = header ? `[${header}]` : '';
            const sizeExtras = size ? `[${size}]` : '';

            const buttons = await doc.querySelectorAll('a.btn');
            for (const btn of buttons) {
                const link = btn.getAttribute('href');
                const text = (btn.textContent || '').toLowerCase().trim();

                if (!link || !text) continue;

                if (text.includes('fsl server') || text.includes('fslv2')) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `HubCloud FSL`,
                        quality: quality,
                        headers: headers
                    }));
                } else if (text.includes('download file')) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `HubCloud Direct`,
                        quality: quality,
                        headers: headers
                    }));
                } else if (text.includes('buzzserver')) {
                    await extractBuzzServer(link + '/download', url, streams, quality, headers);
                } else if (text.includes('pixeldra') || text.includes('pixeldrain') || text.includes('pixel')) {
                    await extractPixelDrain(link, streams, quality);
                } else if (text.includes('s3 server')) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `HubCloud S3`,
                        quality: quality,
                        headers: headers
                    }));
                } else if (text.includes('mega server')) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `HubCloud Mega`,
                        quality: quality,
                        headers: headers
                    }));
                }
            }
        } catch (e) {
            console.error('HubCloud extraction error:', e.message);
        }
    }

    /**
     * Extract from BuzzServer
     */
    async function extractBuzzServer(url, referer, streams, quality, baseHeaders) {
        try {
            const headers = { ...baseHeaders, 'Referer': referer };
            const res = await http_get(url, headers);

            const redirect = res.headers?.['hx-redirect'] ||
                           res.headers?.['HX-Redirect'] ||
                           res.headers?.['location'];

            if (redirect) {
                streams.push(new StreamResult({
                    url: redirect,
                    source: `BuzzServer`,
                    quality: quality,
                    headers: headers
                }));
            }
        } catch (e) {
            console.error('BuzzServer extraction error:', e.message);
        }
    }

    /**
     * Extract from PixelDrain
     */
    async function extractPixelDrain(url, streams, quality) {
        try {
            const idMatch = url.match(/\/(?:u\/|api\/file\/)([a-zA-Z0-9]+)/);
            if (!idMatch) return;

            const id = idMatch[1];
            streams.push(new StreamResult({
                url: `https://pixeldrain.com/api/file/${id}?download`,
                source: `PixelDrain`,
                quality: quality,
                headers: STREAM_HEADERS
            }));
        } catch (e) {
            console.error('PixelDrain extraction error:', e.message);
        }
    }

    /**
     * Extract from GDFlix
     */
    async function extractGDFlix(url, streams) {
        try {
            // Handle redirect
            let finalUrl = url;
            const res = await http_get(url, STREAM_HEADERS);
            const doc = await parseHtml(res.body);

            // Check for meta refresh redirect
            const metaRefresh = doc.querySelector('meta[http-equiv="refresh"]');
            if (metaRefresh) {
                const content = metaRefresh.getAttribute('content') || '';
                const urlMatch = content.match(/url=([^;]+)/);
                if (urlMatch) {
                    finalUrl = urlMatch[1];
                }
            }

            // Get file info
            const nameEl = doc.querySelector('ul > li.list-group-item:contains(Name)');
            const sizeEl = doc.querySelector('ul > li.list-group-item:contains(Size)');

            const fileName = nameEl?.textContent?.split('Name : ')[1]?.trim() || '';
            const fileSize = sizeEl?.textContent?.split('Size : ')[1]?.trim() || '';
            const quality = getQuality(fileName);

            // Extract download links
            const links = await doc.querySelectorAll('div.text-center a');
            for (const link of links) {
                const text = (link.textContent || '').toLowerCase();
                const href = link.getAttribute('href');

                if (!href) continue;

                if (text.includes('direct dl') || text.includes('direct')) {
                    streams.push(new StreamResult({
                        url: href,
                        source: `GDFlix Direct [${fileSize}]`,
                        quality: quality,
                        headers: STREAM_HEADERS
                    }));
                } else if (text.includes('index links')) {
                    await extractGDFlixIndex(href, streams, quality, fileSize);
                } else if (text.includes('drivebot')) {
                    await extractDriveBot(href, streams, quality, fileSize);
                } else if (text.includes('instant dl')) {
                    const instantRes = await http_get(href, { ...STREAM_HEADERS, 'AllowRedirects': 'false' });
                    const instantRedirect = instantRes.headers?.['location']?.split('url=')[1];
                    if (instantRedirect) {
                        streams.push(new StreamResult({
                            url: instantRedirect,
                            source: `GDFlix Instant [${fileSize}]`,
                            quality: quality,
                            headers: STREAM_HEADERS
                        }));
                    }
                } else if (text.includes('pixeldrain') || text.includes('pixel')) {
                    await extractPixelDrain(href, streams, quality);
                } else if (text.includes('gofile')) {
                    await extractGoFile(href, streams, quality);
                }
            }

            // Cloudflare backup
            try {
                const cfUrl = finalUrl.replace('/file/', '/wfile/');
                const cfRes = await http_get(cfUrl + '?type=1', STREAM_HEADERS);
                const cfDoc = await parseHtml(cfRes.body);
                const cfLink = cfDoc.querySelector('a.btn-success')?.getAttribute('href');
                if (cfLink) {
                    streams.push(new StreamResult({
                        url: cfLink,
                        source: `GDFlix CF [${fileSize}]`,
                        quality: quality,
                        headers: STREAM_HEADERS
                    }));
                }
            } catch (e) {
                // Ignore CF errors
            }
        } catch (e) {
            console.error('GDFlix extraction error:', e.message);
        }
    }

    /**
     * Extract GDFlix Index Links
     */
    async function extractGDFlixIndex(url, streams, quality, fileSize) {
        try {
            const baseUrl = url.includes('gdflix.dad') ? 'https://new6.gdflix.dad' : '';
            const res = await http_get(url, STREAM_HEADERS);
            const doc = await parseHtml(res.body);

            const buttons = await doc.querySelectorAll('a.btn-outline-info');
            for (const btn of buttons) {
                const serverUrl = baseUrl + btn.getAttribute('href');
                try {
                    const serverRes = await http_get(serverUrl, STREAM_HEADERS);
                    const serverDoc = await parseHtml(serverRes.body);
                    const sourceLink = serverDoc.querySelector('div.mb-4 > a')?.getAttribute('href');
                    if (sourceLink) {
                        streams.push(new StreamResult({
                            url: sourceLink,
                            source: `GDFlix Index [${fileSize}]`,
                            quality: quality,
                            headers: STREAM_HEADERS
                        }));
                    }
                } catch (e) {
                    // Skip failed servers
                }
            }
        } catch (e) {
            console.error('GDFlix Index error:', e.message);
        }
    }

    /**
     * Extract DriveBot links
     */
    async function extractDriveBot(url, streams, quality, fileSize) {
        try {
            const baseUrls = ['https://drivebot.sbs', 'https://drivebot.cfd'];
            const idMatch = url.match(/id=([^&]+)/);
            const doMatch = url.match(/do=([^&]+)/);

            if (!idMatch || !doMatch) return;

            const id = idMatch[1];
            const doId = doMatch[1];

            for (const baseUrl of baseUrls) {
                try {
                    const botUrl = `${baseUrl}/download?id=${id}&do=${doId}`;
                    const botRes = await http_get(botUrl, STREAM_HEADERS);

                    if (botRes.status === 200) {
                        const botDoc = await parseHtml(botRes.body);
                        const tokenMatch = botDoc.toString().match(/formData\.append\('token', '([a-f0-9]+)'\)/);
                        const postIdMatch = botDoc.toString().match(/fetch\('\/download\?id=([a-zA-Z0-9/+]+)'\)/);

                        if (tokenMatch && postIdMatch) {
                            const token = tokenMatch[1];
                            const postId = postIdMatch[1];

                            // Post to get final URL
                            const postRes = await http_post(
                                `${baseUrl}/download?id=${postId}`,
                                { ...STREAM_HEADERS, 'Referer': botUrl },
                                `token=${token}`
                            );

                            const urlMatch = postRes.body.match(/"url":"([^"]+)"/);
                            if (urlMatch) {
                                const finalUrl = urlMatch[1].replace(/\\/g, '');
                                streams.push(new StreamResult({
                                    url: finalUrl,
                                    source: `GDFlix DriveBot [${fileSize}]`,
                                    quality: quality,
                                    headers: { ...STREAM_HEADERS, 'Referer': baseUrl }
                                }));
                            }
                        }
                    }
                } catch (e) {
                    // Try next base URL
                }
            }
        } catch (e) {
            console.error('DriveBot extraction error:', e.message);
        }
    }

    /**
     * Extract from GoFile
     */
    async function extractGoFile(url, streams, quality) {
        try {
            // Get server from GoFile
            const serverRes = await http_get('https://api.gofile.io/servers');
            const serverData = safeParse(serverRes.body);

            if (!serverData || serverData.status !== 'ok') return;

            const server = serverData.data?.servers?.[0]?.name;
            if (!server) return;

            // Extract file ID from URL
            const idMatch = url.match(/\/(?:d\/|\\?c=)([a-zA-Z0-9-]+)/);
            if (!idMatch) return;
            const fileId = idMatch[1];

            // Get file content
            const contentRes = await http_get(
                `https://${server}.gofile.io/contents/${fileId}`,
                { ...STREAM_HEADERS, 'Accept': 'application/json' }
            );
            const contentData = safeParse(contentRes.body);

            if (contentData && contentData.data) {
                const children = contentData.data.children || {};
                for (const file of Object.values(children)) {
                    if (file.type === 'file' && file.link) {
                        streams.push(new StreamResult({
                            url: file.link,
                            source: `GoFile - ${file.name}`,
                            quality: getQuality(file.name),
                            headers: STREAM_HEADERS
                        }));
                    }
                }
            }
        } catch (e) {
            console.error('GoFile extraction error:', e.message);
        }
    }

    /**
     * Extract from HUBCDN
     */
    async function extractHubCdn(url, streams) {
        try {
            const res = await http_get(url, STREAM_HEADERS);
            if (res.status !== 200) return;

            const doc = await parseHtml(res.body);
            const scriptEl = doc.querySelector('script');
            const scriptText = scriptEl?.textContent || '';

            // Find encoded URL
            const encodedMatch = scriptText.match(/reurl\s*=\s*"([^"]+)"/);
            if (!encodedMatch) {
                // Try alternative extraction
                const base64Match = scriptText.match(/r=([A-Za-z0-9+/=]+)/);
                if (base64Match) {
                    try {
                        const decoded = atob(base64Match[1]);
                        const linkMatch = decoded.match(/link=([^&]+)/);
                        if (linkMatch) {
                            streams.push(new StreamResult({
                                url: linkMatch[1],
                                source: 'HUBCDN',
                                quality: 'Auto',
                                headers: STREAM_HEADERS
                            }));
                        }
                    } catch (e) {
                        // Base64 decode failed
                    }
                }
                return;
            }

            const encoded = encodedMatch[1].split('?r=')[1];
            if (!encoded) return;

            try {
                const decoded = atob(encoded);
                const linkMatch = decoded.match(/link=([^&]+)/);
                if (linkMatch) {
                    streams.push(new StreamResult({
                        url: linkMatch[1],
                        source: 'HUBCDN',
                        quality: 'Auto',
                        headers: STREAM_HEADERS
                    }));
                }
            } catch (e) {
                console.error('HUBCDN decode error:', e.message);
            }
        } catch (e) {
            console.error('HUBCDN extraction error:', e.message);
        }
    }

    /**
     * Extract from HubDrive
     */
    async function extractHubDrive(url, streams) {
        try {
            const res = await http_get(url, { ...STREAM_HEADERS, timeout: 5000 });
            if (res.status !== 200) return;

            const doc = await parseHtml(res.body);
            const btn = doc.querySelector('.btn.btn-primary.btn-user.btn-success1.m-1');
            const href = btn?.getAttribute('href');

            if (!href) return;

            if (href.includes('hubcloud', true)) {
                await extractHubCloud(href, 'HubDrive', streams);
            } else {
                streams.push(new StreamResult({
                    url: href,
                    source: 'HubDrive',
                    quality: 'Auto',
                    headers: STREAM_HEADERS
                }));
            }
        } catch (e) {
            console.error('HubDrive extraction error:', e.message);
        }
    }

    /**
     * Dispatch to appropriate extractor based on URL
     */
    async function extractStream(url, streams, referer) {
        if (!url) return;

        const lowerUrl = url.toLowerCase();
        const headers = { ...STREAM_HEADERS, 'Referer': referer || manifest.baseUrl };

        // Dispatch to appropriate extractor
        if (lowerUrl.includes('hubcloud') || lowerUrl.includes('gamerxyt') || lowerUrl.includes('hub.')) {
            await extractHubCloud(url, referer, streams);
        } else if (lowerUrl.includes('hubdrive') || lowerUrl.includes('drive') || lowerUrl.includes('hubdrive')) {
            await extractHubDrive(url, streams);
        } else if (lowerUrl.includes('gdflix') || lowerUrl.includes('gdfix')) {
            await extractGDFlix(url, streams);
        } else if (lowerUrl.includes('hubcdn') || lowerUrl.includes('hubcdnn')) {
            await extractHubCdn(url, streams);
        } else if (lowerUrl.includes('pixeldrain') || lowerUrl.includes('pixeldra')) {
            await extractPixelDrain(url, streams, 'Auto');
        } else if (lowerUrl.includes('gofile')) {
            await extractGoFile(url, streams, 'Auto');
        } else if (lowerUrl.includes('buzz')) {
            await extractBuzzServer(url + '/download', referer, streams, 'Auto', headers);
        } else {
            // Direct link fallback
            streams.push(new StreamResult({
                url: url,
                source: 'Direct',
                quality: getQuality(url),
                headers: headers
            }));
        }
    }

    // ============================================================================
    // MAIN FUNCTIONS
    // ============================================================================

    /**
     * getHome - Fetch homepage categories
     */
    async function getHome(cb) {
        try {
            const categories = [
                { name: 'Home', path: '' },
                { name: 'Bollywood', path: 'category/bollywood' },
                { name: 'Hollywood', path: 'category/hollywood' },
                { name: 'South Indian', path: 'category/southindian' },
                { name: 'Gujarati', path: 'category/gujarati' },
                { name: 'Web Series', path: 'category/webseries' }
            ];

            const homeData = {};

            for (const cat of categories) {
                try {
                    const url = `${manifest.baseUrl}/${cat.path}`;
                    const res = await http_get(url, DEFAULT_HEADERS);

                    if (res.status !== 200) continue;

                    const doc = await parseHtml(res.body);
                    const items = await doc.querySelectorAll('div.simple-grid-grid-post');

                    const results = [];
                    for (const item of items) {
                        const result = await toSearchResult(item);
                        if (result) results.push(result);
                    }

                    if (results.length > 0) {
                        homeData[cat.name] = results;
                    }
                } catch (e) {
                    console.error(`Error fetching category ${cat.name}:`, e.message);
                }
            }

            // Add Trending section if available
            if (homeData['Home'] && homeData['Home'].length > 0) {
                homeData['Trending'] = homeData['Home'].slice(0, 12);
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: e.message });
        }
    }

    /**
     * search - Search for content
     */
    async function search(query, cb) {
        try {
            if (!query || query.trim().length === 0) {
                cb({ success: true, data: [] });
                return;
            }

            const searchUrl = `${manifest.baseUrl}/page/1/?s=${encodeURIComponent(query)}`;
            const res = await http_get(searchUrl, DEFAULT_HEADERS);

            if (res.status !== 200) {
                cb({ success: false, errorCode: 'SEARCH_ERROR', message: 'Search failed' });
                return;
            }

            const doc = await parseHtml(res.body);
            const items = await doc.querySelectorAll('div.simple-grid-grid-post');

            const results = [];
            for (const item of items) {
                const result = await toSearchResult(item);
                if (result) results.push(result);
            }

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: e.message });
        }
    }

    /**
     * load - Load detailed content page
     */
    async function load(url, cb) {
        try {
            const res = await http_get(url, DEFAULT_HEADERS);

            if (res.status !== 200) {
                cb({ success: false, errorCode: 'LOAD_ERROR', message: 'Page not found' });
                return;
            }

            const doc = await parseHtml(res.body);

            // Extract basic info
            const titleEl = doc.querySelector('#movie_title > a');
            let title = decodeHtml(titleEl?.textContent?.trim() || 'No Title');

            // Get year from title if present
            const yearMatch = title.match(/\((\d{4})\)/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;
            if (yearMatch) {
                title = title.replace(yearMatch[0], '').trim();
            }

            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
            const plot = decodeHtml(doc.querySelector('#summary')?.textContent?.trim() || '');

            // Get content type
            const typeEl = doc.querySelector('h1.post-title a');
            const typeText = typeEl?.textContent || '';
            const contentType = typeText.toLowerCase().includes('movie') ? 'movie' : 'series';

            // Extract IMDB ID
            const imdbLink = doc.querySelector('div span a[href*="imdb.com"]')?.getAttribute('href');
            const imdbId = extractImdbId(imdbLink);

            // Fetch Cinemeta data for enrichment
            let meta = null;
            if (imdbId) {
                meta = await fetchCinemetaData(imdbId, contentType);
            }

            // Build multimedia item
            const multimediaItem = {
                title: meta?.name || title,
                url: url,
                posterUrl: meta?.poster || poster,
                bannerUrl: meta?.background || poster,
                description: meta?.description || plot,
                type: contentType,
                year: meta?.year ? parseInt(meta.year) : year,
                score: meta?.imdbRating ? parseFloat(meta.imdbRating) : 0,
                genres: meta?.genres || [],
                cast: (meta?.appExtras?.cast || []).map(c => c.name).filter(Boolean),
                episodes: []
            };

            // Handle series
            if (contentType === 'series') {
                multimediaItem.episodes = await parseSeriesEpisodes(doc, url, meta);
            } else {
                // Handle movies - collect download links
                multimediaItem.episodes = await parseMovieLinks(doc, url);
            }

            cb({ success: true, data: new MultimediaItem(multimediaItem) });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: e.message });
        }
    }

    /**
     * Parse series episodes from document
     */
    async function parseSeriesEpisodes(doc, baseUrl, meta) {
        const episodes = [];
        const episodeMap = new Map();

        // Process season headers
        const h4Elements = await doc.querySelectorAll('h4');
        for (const h4 of h4Elements) {
            const seasonNum = parseSeasonNumber(h4.textContent);

            // Get next sibling paragraphs
            let sibling = h4.nextElementSibling;
            while (sibling && sibling.tagName.toLowerCase() === 'p') {
                const buttons = await sibling.querySelectorAll('a.maxbutton');

                for (const btn of buttons) {
                    if (isBlockedButton(btn)) continue;

                    const seasonPageUrl = btn.getAttribute('href');
                    if (!seasonPageUrl) continue;

                    // Fetch season page to get episodes
                    try {
                        const seasonRes = await http_get(fixUrl(seasonPageUrl), DEFAULT_HEADERS);
                        const seasonDoc = await parseHtml(seasonRes.body);

                        const epButtons = await seasonDoc.querySelectorAll('a.maxbutton-ep');
                        for (const epBtn of epButtons) {
                            const epUrl = epBtn.getAttribute('href');
                            const epText = epBtn.textContent || '';
                            const epNum = parseEpisodeNumber(epText);

                            if (!epNum || !epUrl) continue;

                            const key = `${seasonNum}-${epNum}`;
                            if (!episodeMap.has(key)) {
                                // Find metadata for this episode
                                const epMeta = meta?.videos?.find(v =>
                                    v.season === seasonNum && v.episode === epNum
                                );

                                episodeMap.set(key, new Episode({
                                    name: epMeta?.name || epText.trim() || `Episode ${epNum}`,
                                    url: JSON.stringify([fixUrl(epUrl)]),
                                    season: seasonNum,
                                    episode: epNum,
                                    description: epMeta?.overview || '',
                                    posterUrl: epMeta?.thumbnail || ''
                                }));
                            } else {
                                // Add additional URL
                                const existing = safeParse(episodeMap.get(key).url) || [];
                                existing.push(fixUrl(epUrl));
                                episodeMap.get(key).url = JSON.stringify(existing);
                            }
                        }
                    } catch (e) {
                        console.error('Error fetching season page:', e.message);
                    }
                }

                sibling = sibling.nextElementSibling;
            }
        }

        // Convert map to array and sort
        const sortedEpisodes = Array.from(episodeMap.values()).sort((a, b) => {
            if (a.season !== b.season) return a.season - b.season;
            return a.episode - b.episode;
        });

        // If no episodes found, create a default one with the main page URL
        if (sortedEpisodes.length === 0) {
            sortedEpisodes.push(new Episode({
                name: 'All Episodes',
                url: JSON.stringify([baseUrl]),
                season: 1,
                episode: 1
            }));
        }

        return sortedEpisodes;
    }

    /**
     * Parse movie download links
     */
    async function parseMovieLinks(doc, baseUrl) {
        const links = [];

        // Collect all maxbutton links from the page
        const buttons = await doc.querySelectorAll('a.maxbutton');
        for (const btn of buttons) {
            if (isBlockedButton(btn)) continue;

            const href = btn.getAttribute('href');
            if (!href || !href.startsWith('http')) continue;

            const text = btn.textContent || '';
            const quality = getQuality(text) || getQuality(baseUrl);

            links.push({
                url: fixUrl(href),
                quality: quality
            });
        }

        // Also check for direct download section
        const dlSection = doc.querySelector('.entry-content');
        if (dlSection) {
            const dlButtons = await dlSection.querySelectorAll('a');
            for (const btn of dlButtons) {
                const href = btn.getAttribute('href');
                if (!href || !href.startsWith('http')) continue;
                if (isBlockedButton(btn)) continue;

                // Avoid duplicates
                if (!links.some(l => l.url === fixUrl(href))) {
                    const text = btn.textContent || '';
                    links.push({
                        url: fixUrl(href),
                        quality: getQuality(text) || 'Auto'
                    });
                }
            }
        }

        if (links.length === 0) {
            // Return the base URL as fallback
            return [new Episode({
                name: 'Watch',
                url: JSON.stringify([baseUrl]),
                season: 1,
                episode: 1
            })];
        }

        return [new Episode({
            name: 'Watch Movie',
            url: JSON.stringify(links),
            season: 1,
            episode: 1
        })];
    }

    /**
     * loadStreams - Extract video streams from episode URL
     */
    async function loadStreams(url, cb) {
        try {
            const streams = [];

            // Parse the URL data
            let urlsToProcess = [];

            try {
                const parsed = safeParse(url);
                if (Array.isArray(parsed)) {
                    urlsToProcess = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    urlsToProcess = [parsed];
                } else {
                    urlsToProcess = [{ url: url, quality: 'Auto' }];
                }
            } catch (e) {
                urlsToProcess = [{ url: url, quality: 'Auto' }];
            }

            // Process each URL
            for (const item of urlsToProcess) {
                const streamUrl = typeof item === 'string' ? item : item.url;
                const quality = typeof item === 'object' ? item.quality : 'Auto';

                if (!streamUrl) continue;

                // Determine referer
                let referer = manifest.baseUrl;
                try {
                    referer = new URL(streamUrl).origin;
                } catch (e) {}

                await extractStream(streamUrl, streams, referer);
            }

            // Sort streams by quality
            streams.sort((a, b) => {
                const qualityOrder = ['4K', '1440p', '1080p', '720p', '480p', '360p', 'Auto'];
                const aIndex = qualityOrder.indexOf(a.quality);
                const bIndex = qualityOrder.indexOf(b.quality);
                return aIndex - bIndex;
            });

            if (streams.length === 0) {
                cb({ success: true, data: [], message: 'No streams found' });
            } else {
                cb({ success: true, data: streams });
            }
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: e.message });
        }
    }

    // ============================================================================
    // EXPORTS
    // ============================================================================

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

})();
