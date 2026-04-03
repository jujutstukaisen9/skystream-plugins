(function() {
    /** @typedef {Object} Response
     * @property {boolean} success
     * @property {any} [data]
     * @property {string} [errorCode]
     * @property {string} [message]
     */

    /** @type {import('@skystream/sdk').Manifest} */
    // var manifest is injected at runtime

    const MAIN_URL = manifest.baseUrl;
    const SECRET_KEY_DEFAULT = Uint8Array.from(atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw=="), c => c.charCodeAt(0));
    const SECRET_KEY_ALT = Uint8Array.from(atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ=="), c => c.charCodeAt(0));
    
    const BRAND_MODELS = {
        "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
        "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
        "OnePlus": ["LE2111", "CPH2449", "IN2023"],
        "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
        "Realme": ["RMX3085", "RMX3360", "RMX3551"]
    };

    // Generate a random device ID
    function generateDeviceId() {
        const bytes = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const DEVICE_ID = generateDeviceId();

    // Generate random brand and model
    function randomBrandModel() {
        const brands = Object.keys(BRAND_MODELS);
        const brand = brands[Math.floor(Math.random() * brands.length)];
        const models = BRAND_MODELS[brand];
        const model = models[Math.floor(Math.random() * models.length)];
        return { brand, model };
    }

    // MD5 hash function
    function md5(input) {
        const crypto = require('crypto');
        if (input instanceof Uint8Array) {
            return crypto.createHash('md5').update(input).digest('hex');
        }
        return crypto.createHash('md5').update(input).digest('hex');
    }

    // Reverse a string
    function reverseString(input) {
        return input.split('').reverse().join('');
    }

    // Generate X-Client-Token
    function generateXClientToken(hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now().toString();
        const reversed = reverseString(timestamp);
        const hash = md5(reversed);
        return `${timestamp},${hash}`;
    }

    // Build canonical string for signature
    function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
        const parsed = new URL(url);
        const path = parsed.pathname;
        
        // Build query string with sorted parameters
        const query = parsed.searchParams.toString();
        const canonicalUrl = query ? `${path}?${query}` : path;
        
        const bodyBytes = body ? new TextEncoder().encode(body) : null;
        const bodyHash = bodyBytes ? md5(bodyBytes.slice(0, 102400)) : '';
        const bodyLength = bodyBytes ? bodyBytes.length.toString() : '';
        
        return [
            method.toUpperCase(),
            accept || '',
            contentType || '',
            bodyLength,
            timestamp,
            bodyHash,
            canonicalUrl
        ].join('\\n');
    }

    // Generate X-Tr-Signature
    function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now();
        const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
        const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
        const crypto = require('crypto');
        const mac = crypto.createHmac('md5', Buffer.from(secret));
        const signature = mac.update(canonical).digest();
        const signatureB64 = Buffer.from(signature).toString('base64');
        return `${timestamp}|2|${signatureB64}`;
    }

    // Get highest quality from resolutions string
    function getHighestQuality(input) {
        if (!input) return null;
        const qualities = [
            { label: '2160', value: 2160 },
            { label: '1440', value: 1440 },
            { label: '1080', value: 1080 },
            { label: '720', value: 720 },
            { label: '480', value: 480 },
            { label: '360', value: 360 },
            { label: '240', value: 240 }
        ];
        
        for (const { label, value } of qualities) {
            if (input.includes(label)) {
                return value;
            }
        }
        return null;
    }

    // Clean title for comparison
    function cleanTitle(s) {
        return s.toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Token equality check
    function tokenEquals(a, b) {
        const sa = new Set(a.split(/\s+/).filter(Boolean));
        const sb = new Set(b.split(/\s+/).filter(Boolean));
        if (sa.size === 0 || sb.size === 0) return false;
        const intersection = new Set([...sa].filter(x => sb.has(x)));
        return intersection.size >= Math.max(1, Math.min(sa.size, sb.size) * 3 / 4);
    }

    // Normalize title for search
    function normalize(s) {
        return s.replace(/\[.*?\]/g, ' ')
            .replace(/\(.*?\)/g, ' ')
            .replace(/(?i)\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, ' ')
            .trim()
            .toLowerCase()
            .replace(/:/g, ' ')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ');
    }

    // Identify ID using TMDB API
    async function identifyID(title, year, imdbRatingValue) {
        const normTitle = normalize(title);
        const result = await searchAndPick(normTitle, year, imdbRatingValue);
        return result || { tmdbId: null, imdbId: null };
    }

    // Search and pick best match from TMDB
    async function searchAndPick(normTitle, year, imdbRatingValue) {
        const fetchTMDB = async (endpoint, extraParams = '') => {
            const url = `https://api.themoviedb.org/3/${endpoint}?api_key=1865f43a0549ca50d341dd9ab8b29f49${extraParams}&include_adult=false&page=1`;
            try {
                const res = await http_get(url);
                return JSON.parse(res.body).results || [];
            } catch (e) {
                return null;
            }
        };

        const multiResults = await fetchTMDB('search/multi', `&query=${encodeURIComponent(normTitle)}${year ? `&year=${year}` : ''}`);
        const tvResults = await fetchTMDB('search/tv', `&query=${encodeURIComponent(normTitle)}${year ? `&first_air_date_year=${year}` : ''}`);
        const movieResults = await fetchTMDB('search/movie', `&query=${encodeURIComponent(normTitle)}${year ? `&year=${year}` : ''}`);

        const searchQueues = [
            { name: 'multi', results: multiResults },
            { name: 'tv', results: tvResults },
            { name: 'movie', results: movieResults }
        ];

        let bestId = null;
        let bestScore = -1;
        let bestIsTv = false;

        for (const { name, results } of searchQueues) {
            if (!results) continue;
            for (const result of results) {
                const mediaType = name === 'multi' ? result.media_type : name;
                const candidateId = result.id;
                if (!candidateId) continue;

                const titles = [result.title, result.name, result.original_title, result.original_name].filter(t => t);
                const candDate = mediaType === 'tv' ? result.first_air_date : result.release_date;
                const candYear = candDate ? parseInt(candDate.substring(0, 4)) : null;
                const candRating = result.vote_average || 0;

                let score = 0;
                const normClean = cleanTitle(normTitle);
                let titleScore = 0;

                for (const t of titles) {
                    const candClean = cleanTitle(t);
                    if (tokenEquals(candClean, normClean)) {
                        titleScore = 50;
                        break;
                    }
                    if (candClean.includes(normClean) || normClean.includes(candClean)) {
                        titleScore = Math.max(titleScore, 20);
                    }
                }
                score += titleScore;

                if (candYear && year && candYear === year) score += 35;
                if (imdbRatingValue && candRating) {
                    const diff = Math.abs(candRating - imdbRatingValue);
                    if (diff <= 0.5) score += 10;
                    else if (diff <= 1.0) score += 5;
                }
                if (result.popularity) score += Math.min(result.popularity / 100, 5);

                if (score > bestScore) {
                    bestScore = score;
                    bestId = candidateId;
                    bestIsTv = mediaType === 'tv';
                }
            }
        }

        if (!bestId || bestScore < 40) return null;

        // Fetch details for external IDs
        const detailKind = bestIsTv ? 'tv' : 'movie';
        const detailUrl = `https://api.themoviedb.org/3/${detailKind}/${bestId}?api_key=1865f43a0549ca50d341dd9ab8b29f49&append_to_response=external_ids`;
        try {
            const res = await http_get(detailUrl);
            const detailJson = JSON.parse(res.body);
            const imdbId = detailJson.external_ids?.imdb_id;
            return { tmdbId: bestId, imdbId };
        } catch (e) {
            return { tmdbId: bestId, imdbId: null };
        }
    }

    // Fetch metadata from Stremio Cinemeta
    async function fetchMetaData(imdbId, type) {
        if (!imdbId) return null;
        const metaType = type === 'series' ? 'series' : 'movie';
        const url = `https://v3-cinemeta.strem.io/meta/${metaType}/${imdbId}.json`;
        try {
            const res = await http_get(url);
            const data = JSON.parse(res.body);
            return data.meta;
        } catch (e) {
            return null;
        }
    }

    // Fetch TMDB logo URL
    async function fetchTmdbLogoUrl(tmdbAPI, apiKey, type, tmdbId, appLangCode) {
        if (!tmdbId) return null;
        const url = type === 'movie' 
            ? `${tmdbAPI}/movie/${tmdbId}/images?api_key=${apiKey}`
            : `${tmdbAPI}/tv/${tmdbId}/images?api_key=${apiKey}`;
        
        try {
            const res = await http_get(url);
            const json = JSON.parse(res.body);
            const logos = json.logos || [];
            if (logos.length === 0) return null;

            const lang = (appLangCode || '').trim().toLowerCase();
            
            // Try to find language match
            let svgFallback = null;
            for (const logo of logos) {
                const filePath = logo.file_path || '';
                if (!filePath) continue;
                const logoLang = (logo.iso_639_1 || '').trim().toLowerCase();
                if (logoLang === lang) {
                    if (!filePath.endsWith('.svg')) return `https://image.tmdb.org/t/p/w500${filePath}`;
                    svgFallback = logo;
                }
            }
            
            if (svgFallback) return `https://image.tmdb.org/t/p/w500${svgFallback.file_path}`;
            
            // Fallback to highest voted
            let best = null;
            let bestSvg = null;
            
            const voted = (logo) => {
                const vote = logo.vote_average || 0;
                const count = logo.vote_count || 0;
                return vote > 0 && count > 0;
            };
            
            const better = (a, b) => {
                if (!a) return true;
                const aAvg = a.vote_average || 0;
                const aCnt = a.vote_count || 0;
                const bAvg = b.vote_average || 0;
                const bCnt = b.vote_count || 0;
                return bAvg > aAvg || (bAvg === aAvg && bCnt > aCnt);
            };
            
            for (const logo of logos) {
                if (!voted(logo)) continue;
                if (logo.file_path?.endsWith('.svg')) {
                    if (better(bestSvg, logo)) bestSvg = logo;
                } else {
                    if (better(best, logo)) best = logo;
                }
            }
            
            if (best) return `https://image.tmdb.org/t/p/w500${best.file_path}`;
            if (bestSvg) return `https://image.tmdb.org/t/p/w500${bestSvg.file_path}`;
            
            return null;
        } catch (e) {
            return null;
        }
    }

    // Main page categories
    const MAIN_PAGE_TABS = {
        "4516404531735022304": "Trending",
        "5692654647815587592": "Trending in Cinema",
        "414907768299210008": "Bollywood",
        "3859721901924910512": "South Indian",
        "8019599703232971616": "Hollywood",
        "4741626294545400336": "Top Series This Week",
        "8434602210994128512": "Anime",
        "1255898847918934600": "Reality TV",
        "4903182713986896328": "Indian Drama",
        "7878715743607948784": "Korean Drama",
        "8788126208987989488": "Chinese Drama",
        "3910636007619709856": "Western TV",
        "5177200225164885656": "Turkish Drama",
        "1|1": "Movies",
        "1|2": "Series",
        "1|1006": "Anime",
        "1|1;country=India": "Indian (Movies)",
        "1|2;country=India": "Indian (Series)",
        "1|1;classify=Hindi dub;country=United States": "USA (Movies)",
        "1|2;classify=Hindi dub;country=United States": "USA (Series)",
        "1|1;country=Japan": "Japan (Movies)",
        "1|2;country=Japan": "Japan (Series)",
        "1|1;country=China": "China (Movies)",
        "1|2;country=China": "China (Series)",
        "1|1;country=Philippines": "Philippines (Movies)",
        "1|2;country=Philippines": "Philippines (Series)",
        "1|1;country=Thailand": "Thailand(Movies)",
        "1|2;country=Thailand": "Thailand(Series)",
        "1|1;country=Nigeria": "Nollywood (Movies)",
        "1|2;country=Nigeria": "Nollywood (Series)",
        "1|1;country=Korea": "South Korean (Movies)",
        "1|2;country=Korea": "South Korean (Series)",
        "1|1;classify=Hindi dub;genre=Action": "Action (Movies)",
        "1|1;classify=Hindi dub;genre=Crime": "Crime (Movies)",
        "1|1;classify=Hindi dub;genre=Comedy": "Comedy (Movies)",
        "1|1;classify=Hindi dub;genre=Romance": "Romance (Movies)",
        "1|2;classify=Hindi dub;genre=Crime": "Crime (Series)",
        "1|2;classify=Hindi dub;genre=Comedy": "Comedy (Series)",
        "1|2;classify=Hindi dub;genre=Romance": "Romance (Series)"
    };

    // Get main page
    async function getMainPage(cb) {
        try {
            const perPage = 15;
            const results = [];
            
            for (const [tabId, tabName] of Object.entries(MAIN_PAGE_TABS)) {
                try {
                    const url = tabId.includes('|') 
                        ? `${MAIN_URL}/wefeed-mobile-bff/subject-api/list`
                        : `${MAIN_URL}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${tabId}&page=1&perPage=${perPage}`;
                    
                    const xClientToken = generateXClientToken();
                    const xTrSignature = generateXTrSignature('POST', 'application/json', 'application/json; charset=utf-8', url);
                    
                    const headers = {
                        'user-agent': 'com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)',
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'connection': 'keep-alive',
                        'x-client-token': xClientToken,
                        'x-tr-signature': xTrSignature,
                        'x-client-info': JSON.stringify({
                            package_name: 'com.community.mbox.in',
                            version_name: '3.0.03.0529.03',
                            version_code: 50020042,
                            os: 'android',
                            os_version: '16',
                            device_id: DEVICE_ID,
                            install_store: 'ps',
                            gaid: 'd7578036d13336cc',
                            brand: 'google',
                            model: randomBrandModel().model,
                            system_language: 'en',
                            net: 'NETWORK_WIFI',
                            region: 'IN',
                            timezone: 'Asia/Calcutta',
                            sp_code: ''
                        }),
                        'x-client-status': '0'
                    };
                    
                    const requestBody = JSON.stringify({
                        page: 1,
                        perPage: perPage,
                        channelId: tabId.includes('|') ? tabId.split('|')[1] : null,
                        classify: 'All',
                        country: 'All',
                        year: 'All',
                        genre: 'All',
                        sort: 'ForYou'
                    });
                    
                    const response = await http_post(url, headers, requestBody);
                    const data = JSON.parse(response.body);
                    
                    const items = (data.data?.items || data.data?.subjects || []).map(item => {
                        const title = (item.title || item.name || '').split('[')[0].split('(')[0];
                        const id = item.subjectId || item.id;
                        const coverImg = item.cover?.url || item.coverImage?.url;
                        const subjectType = item.subjectType || 1;
                        const type = subjectType === 2 ? 'series' : 'movie';
                        
                        return {
                            name: title,
                            url: id,
                            type: type,
                            posterUrl: coverImg
                        };
                    }).filter(Boolean);
                    
                    if (items.length > 0) {
                        results.push({ name: tabName, items });
                    }
                } catch (e) {
                    console.error(`Error fetching tab ${tabName}:`, e);
                }
            }
            
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'MAINPAGE_ERROR', message: e.message });
        }
    }

    // Search function
    async function search(query, cb) {
        try {
            const url = `${MAIN_URL}/wefeed-mobile-bff/subject-api/search/v2`;
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature('POST', 'application/json', 'application/json; charset=utf-8', url);
            
            const headers = {
                'user-agent': 'com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)',
                'accept': 'application/json',
                'content-type': 'application/json',
                'connection': 'keep-alive',
                'x-client-token': xClientToken,
                'x-tr-signature': xTrSignature,
                'x-client-info': JSON.stringify({
                    package_name: 'com.community.mbox.in',
                    version_name: '3.0.03.0529.03',
                    version_code: 50020042,
                    os: 'android',
                    os_version: '16',
                    device_id: DEVICE_ID,
                    install_store: 'ps',
                    gaid: 'd7578036d13336cc',
                    brand: 'google',
                    model: randomBrandModel().model,
                    system_language: 'en',
                    net: 'NETWORK_WIFI',
                    region: 'IN',
                    timezone: 'Asia/Calcutta',
                    sp_code: ''
                }),
                'x-client-status': '0'
            };
            
            const requestBody = JSON.stringify({
                page: 1,
                perPage: 20,
                keyword: query
            });
            
            const response = await http_post(url, headers, requestBody);
            const data = JSON.parse(response.body);
            const results = [];
            
            for (const result of (data.data?.results || [])) {
                for (const subject of result.subjects || []) {
                    const title = (subject.title || subject.name || '').split('[')[0].split('(')[0];
                    const id = subject.subjectId;
                    const coverImg = subject.cover?.url;
                    const subjectType = subject.subjectType || 1;
                    const type = subjectType === 2 ? 'series' : 'movie';
                    
                    results.push({
                        name: title,
                        url: id,
                        type: type,
                        posterUrl: coverImg
                    });
                }
            }
            
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: e.message });
        }
    }

    // Load media details
    async function load(url, cb) {
        try {
            const id = url.includes('subjectId=') 
                ? url.match(/subjectId=([^&]+)/)[1]
                : url.substring(url.lastIndexOf('/') + 1);
            
            const finalUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${id}`;
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature('GET', 'application/json', 'application/json', finalUrl);
            
            const { brand, model } = randomBrandModel();
            
            const headers = {
                'user-agent': `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
                'accept': 'application/json',
                'content-type': 'application/json',
                'connection': 'keep-alive',
                'x-client-token': xClientToken,
                'x-tr-signature': xTrSignature,
                'x-client-info': JSON.stringify({
                    package_name: 'com.community.oneroom',
                    version_name: '3.0.13.0325.03',
                    version_code: 50020088,
                    os: 'android',
                    os_version: '13',
                    install_ch: 'ps',
                    device_id: DEVICE_ID,
                    install_store: 'ps',
                    gaid: '1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d',
                    brand: model,
                    model: brand,
                    system_language: 'en',
                    net: 'NETWORK_WIFI',
                    region: 'US',
                    timezone: 'Asia/Calcutta',
                    sp_code: '',
                    'X-Play-Mode': '1',
                    'X-Idle-Data': '1',
                    'X-Family-Mode': '0',
                    'X-Content-Mode': '0'
                }),
                'x-client-status': '0',
                'x-play-mode': '2'
            };
            
            const response = await http_get(finalUrl, headers);
            if (response.status !== 200) {
                throw new Error(`Failed to load data: ${response.body}`);
            }
            
            const data = JSON.parse(response.body);
            const mainData = data.data;
            if (!mainData) throw new Error('No data found');
            
            const title = (mainData.title || '').split('[')[0].split('(')[0];
            const description = mainData.description || '';
            const releaseDate = mainData.releaseDate || '';
            const duration = mainData.duration || '';
            const genre = mainData.genre || '';
            const imdbRating = mainData.imdbRatingValue ? parseFloat(mainData.imdbRatingValue) * 10 : null;
            const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null;
            const coverUrl = mainData.cover?.url;
            const backgroundUrl = mainData.cover?.url;
            const subjectType = mainData.subjectType || 1;
            const type = subjectType === 2 ? 'series' : 'movie';
            
            // Extract actors
            const actors = (mainData.staffList || []).filter(staff => staff.staffType === 1).map(staff => ({
                actor: { name: staff.name, avatarUrl: staff.avatarUrl },
                roleString: staff.character
            })).filter(Boolean);
            
            const tags = genre ? genre.split(',').map(g => g.trim()) : [];
            const durationMinutes = duration ? (() => {
                const match = duration.match(/(\d+)h\s*(\d+)m/);
                if (match) {
                    return parseInt(match[1]) * 60 + parseInt(match[2]);
                }
                const minMatch = duration.match(/(\d+)m/);
                if (minMatch) return parseInt(minMatch[1]);
                return null;
            })();
            
            // Identify TMDB and IMDB IDs
            const (tmdbId, imdbId) = await identifyID(title, year, imdbRating);
            
            // Fetch logo
            let logoUrl = null;
            if (tmdbId) {
                logoUrl = await fetchTmdbLogoUrl(
                    'https://api.themoviedb.org/3',
                    '98ae14df2b8d8f8f8136499daf79f0e0',
                    type,
                    tmdbId,
                    'en'
                );
            }
            
            // Fetch metadata
            let meta = null;
            if (imdbId) {
                meta = await fetchMetaData(imdbId, type);
            }
            
            const poster = meta?.poster || coverUrl;
            const background = meta?.background || backgroundUrl;
            const descriptionMeta = meta?.overview || description;
            const imdbRatingMeta = meta?.imdbRating;
            
            if (type === 'series') {
                const allSubjectIds = [id];
                const dubs = mainData.dubs || [];
                for (const dub of dubs) {
                    const dubId = dub.subjectId;
                    const lanName = dub.lanName;
                    if (dubId && lanName && dubId !== id) {
                        allSubjectIds.push({ id: dubId, language: lanName });
                    }
                }
                
                const episodeMap = new Map(); // season -> Set<episode>
                for (const subject of allSubjectIds) {
                    const seasonUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${subject.id || subject}`;
                    const seasonSig = generateXTrSignature('GET', 'application/json', 'application/json', seasonUrl);
                    const seasonHeaders = { ...headers, 'x-tr-signature': seasonSig };
                    
                    try {
                        const seasonResponse = await http_get(seasonUrl, seasonHeaders);
                        const seasonData = JSON.parse(seasonResponse.body);
                        const seasons = seasonData.data?.seasons;
                        if (!seasons || !Array.isArray(seasons) || seasons.length === 0) continue;
                        
                        for (const season of seasons) {
                            const seasonNumber = season.se || 1;
                            const maxEp = season.maxEp || 1;
                            if (!episodeMap.has(seasonNumber)) {
                                episodeMap.set(seasonNumber, new Set());
                            }
                            const episodes = episodeMap.get(seasonNumber);
                            for (let ep = 1; ep <= maxEp; ep++) {
                                episodes.add(ep);
                            }
                        }
                    } catch (e) {
                        console.error(`Error fetching season info for ${subject}:`, e);
                    }
                }
                
                const episodes = [];
                for (const [seasonNumber, episodesSet] of episodeMap) {
                    for (const episodeNumber of [...episodesSet].sort((a,b) => a-b)) {
                        const metaVideos = (meta?.videos || []).filter(v => 
                            v.season === seasonNumber && v.episode === episodeNumber
                        );
                        const metaVideo = metaVideos[0];
                        
                        const epName = metaVideo?.name || metaVideo?.title || `S${seasonNumber}E${episodeNumber}`;
                        const epDesc = metaVideo?.overview || metaVideo?.description || `Season ${seasonNumber} Episode ${episodeNumber}`;
                        const epThumb = metaVideo?.thumbnail || coverUrl;
                        const runtime = metaVideo?.runtime ? parseInt(metaVideo.runtime) : null;
                        const aired = metaVideo?.released || '';
                        
                        episodes.push({
                            name: epName,
                            season: seasonNumber,
                            episode: episodeNumber,
                            posterUrl: epThumb,
                            description: epDesc,
                            runTime: runtime,
                            date: aired
                        });
                    }
                }
                
                if (episodes.length === 0) {
                    episodes.push({
                        name: 'Episode 1',
                        season: 1,
                        episode: 1,
                        posterUrl: coverUrl
                    });
                }
                
                cb({
                    success: true,
                    data: {
                        title,
                        url: finalUrl,
                        type: 'series',
                        episodes,
                        posterUrl: poster,
                        backgroundPosterUrl: background,
                        logoUrl,
                        plot: descriptionMeta,
                        year,
                        tags,
                        actors,
                        score: imdbRatingMeta ? Score.from10(imdbRatingMeta) : (imdbRating ? Score.from10(imdbRating) : null),
                        duration: durationMinutes
                    }
                });
            } else {
                cb({
                    success: true,
                    data: {
                        title,
                        url: finalUrl,
                        type: 'movie',
                        posterUrl: poster,
                        backgroundPosterUrl: background,
                        logoUrl,
                        plot: descriptionMeta,
                        year,
                        tags,
                        actors,
                        score: imdbRatingMeta ? Score.from10(imdbRatingMeta) : (imdbRating ? Score.from10(imdbRating) : null),
                        duration: durationMinutes
                    }
                });
            }
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: e.message });
        }
    }

    // Load streams for media
    async function loadStreams(url, cb) {
        try {
            const parts = url.split('|');
            const originalSubjectId = parts[0].includes('get?subjectId=')
                ? parts[0].match(/subjectId=([^&]+)/)[1]
                : parts[0].substring(parts[0].lastIndexOf('/') + 1);
            
            const season = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
            const episode = parts.length > 2 ? parseInt(parts[2]) || 0 : 0;
            
            const subjectUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${originalSubjectId}`;
            const subjectXClientToken = generateXClientToken();
            const subjectXTrSignature = generateXTrSignature('GET', 'application/json', 'application/json', subjectUrl);
            
            const { brand, model } = randomBrandModel();
            
            const subjectHeaders = {
                'user-agent': `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
                'accept': 'application/json',
                'content-type': 'application/json',
                'connection': 'keep-alive',
                'x-client-token': subjectXClientToken,
                'x-tr-signature': subjectXTrSignature,
                'x-client-info': JSON.stringify({
                    package_name: 'com.community.oneroom',
                    version_name: '3.0.13.0325.03',
                    version_code: 50020088,
                    os: 'android',
                    os_version: '13',
                    install_ch: 'ps',
                    device_id: DEVICE_ID,
                    install_store: 'ps',
                    gaid: '1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d',
                    brand: model,
                    model: brand,
                    system_language: 'en',
                    net: 'NETWORK_WIFI',
                    region: 'US',
                    timezone: 'Asia/Calcutta',
                    sp_code: '',
                    'X-Play-Mode': '1',
                    'X-Idle-Data': '1',
                    'X-Family-Mode': '0',
                    'X-Content-Mode': '0'
                }),
                'x-client-status': '0',
                'x-play-mode': '2'
            };
            
            const subjectResponse = await http_get(subjectUrl, subjectHeaders);
            const mapper = JSON.parse;
            const subjectIds = [];
            let originalLanguageName = 'Original';
            
            if (subjectResponse.status === 200) {
                const subjectRoot = JSON.parse(subjectResponse.body);
                const subjectData = subjectRoot.data;
                const dubs = subjectData?.dubs || [];
                
                for (const dub of dubs) {
                    const dubSubjectId = dub.subjectId;
                    const lanName = dub.lanName;
                    if (dubSubjectId && lanName) {
                        if (dubSubjectId === originalSubjectId) {
                            originalLanguageName = lanName;
                        } else {
                            subjectIds.push({ id: dubSubjectId, language: lanName });
                        }
                    }
                }
            }
            
            subjectIds.unshift({ id: originalSubjectId, language: originalLanguageName });
            
            const xUserHeader = subjectResponse.headers['x-user'];
            let token = null;
            if (xUserHeader) {
                const xUserJson = JSON.parse(xUserHeader);
                token = xUserJson.token;
            }
            
            const allLinks = [];
            
            for (const { id: subjectId, language } of subjectIds) {
                try {
                    const url = `${MAIN_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${subjectId}&se=${season}&ep=${episode}`;
                    const xClientToken = generateXClientToken();
                    const xTrSignature = generateXTrSignature('GET', 'application/json', 'application/json', url);
                    
                    const headers = {
                        'Authorization': `Bearer ${token}`,
                        'user-agent': `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
                        'accept': 'application/json',
                        'content-type': 'application/json',
                        'connection': 'keep-alive',
                        'x-client-token': xClientToken,
                        'x-tr-signature': xTrSignature,
                        'x-client-info': JSON.stringify({
                            package_name: 'com.community.oneroom',
                            version_name: '3.0.13.0325.03',
                            version_code: 50020088,
                            os: 'android',
                            os_version: '13',
                            install_ch: 'ps',
                            device_id: DEVICE_ID,
                            install_store: 'ps',
                            gaid: '1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d',
                            brand: model,
                            model: brand,
                            system_language: 'en',
                            net: 'NETWORK_WIFI',
                            region: 'US',
                            timezone: 'Asia/Calcutta',
                            sp_code: '',
                            'X-Play-Mode': '1',
                            'X-Idle-Data': '1',
                            'X-Family-Mode': '0',
                            'X-Content-Mode': '0'
                        }),
                        'x-client-status': '0'
                    };
                    
                    const response = await http_get(url, headers);
                    if (response.status === 200) {
                        const root = JSON.parse(response.body);
                        const streams = root.data?.streams || [];
                        
                        for (const stream of streams) {
                            const streamUrl = stream.url;
                            if (!streamUrl) continue;
                            
                            const format = stream.format || '';
                            const resolutions = stream.resolutions || '';
                            const signCookie = stream.signCookie || '';
                            
                            const quality = getHighestQuality(resolutions);
                            
                            const link = {
                                source: `${name} ${language.replace('dub', 'Audio')}`,
                                name: `${name} (${language.replace('dub', 'Audio')})`,
                                url: streamUrl,
                                type: streamUrl.startsWith('magnet:') ? 'magnet' :
                                      streamUrl.includes('.mpd') ? 'dash' :
                                      streamUrl.endsWith('.torrent') ? 'torrent' :
                                      format === 'HLS' || streamUrl.endsWith('.m3u8') ? 'm3u8' :
                                      streamUrl.includes('.mp4') || streamUrl.includes('.mkv') ? 'video' : 'unknown',
                                headers: { 'Referer': MAIN_URL }
                            };
                            
                            if (quality) link.quality = quality;
                            if (signCookie) link.headers.Cookie = signCookie;
                            
                            allLinks.push(link);
                        }
                        
                        // Fallback for streams not found
                        if (streams.length === 0) {
                            const fallbackUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
                            const fallbackHeaders = { ...headers, 'x-tr-signature': generateXTrSignature('GET', 'application/json', 'application/json', fallbackUrl) };
                            
                            try {
                                const fallbackResponse = await http_get(fallbackUrl, fallbackHeaders);
                                if (fallbackResponse.status === 200) {
                                    const fallbackRoot = JSON.parse(fallbackResponse.body);
                                    const detectors = fallbackRoot.data?.resourceDetectors || [];
                                    
                                    for (const detector of detectors) {
                                        const resolutionList = detector.resolutionList || [];
                                        for (const video of resolutionList) {
                                            const link = video.resourceLink;
                                            const quality = video.resolution || 0;
                                            if (link) {
                                                allLinks.push({
                                                    source: `${name} ${language.replace('dub', 'Audio')}`,
                                                    name: `${name} S${season}E${episode} ${quality}p (${language.replace('dub', 'Audio')})`,
                                                    url: link,
                                                    type: 'video',
                                                    headers: { 'Referer': MAIN_URL },
                                                    quality: quality
                                                });
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error(`Error in fallback for ${subjectId}:`, e);
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error processing subject ${subjectId}:`, e);
                    continue;
                }
            }
            
            cb({ success: true, data: allLinks });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAMS_ERROR', message: e.message });
        }
    }

    // Export functions to global scope
    globalThis.getMainPage = getMainPage;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
