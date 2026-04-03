/**
 * MovieBox Provider for SkyStream
 * Ported from Kotlin CloudStream Extension by NivinCNC
 * https://github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension
 */
(function() {
    // --- Constants ---
    const MAIN_URL = manifest.baseUrl || "https://api3.aoneroom.com";
    
    // Base64 decoded secret keys from original plugin
    const SECRET_KEY_DEFAULT = atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
    const SECRET_KEY_ALT = atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==");
    
    // TMDB API for metadata
    const TMDB_API = "https://api.themoviedb.org/3";
    const TMDB_API_KEY = "98ae14df2b8d8f8f8136499daf79f0e0";
    const TMDB_API_KEY_2 = "1865f43a0549ca50d341dd9ab8b29f49";
    
    // Cinemeta for additional metadata
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    
    // --- Helper Functions ---
    
    // Generate MD5 hash (using built-in crypto or fallback)
    async function md5(data) {
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const msgBuffer = new TextEncoder().encode(data);
            const hashBuffer = await crypto.subtle.digest('MD5', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        // Fallback: simple hash for signature purposes
        let hash = 0;
        const str = data;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(32, '0').substring(0, 32);
    }
    
    // Reverse a string
    function reverseString(input) {
        return input.split('').reverse().join('');
    }
    
    // Generate X-Client-Token
    function generateXClientToken(hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now().toString();
        const reversed = reverseString(timestamp);
        // Use timestamp hash as simplified signature
        const hash = md5(reversed).substring(0, 32);
        return `${timestamp},${hash}`;
    }
    
    // Generate random device ID
    function generateDeviceId() {
        const chars = '0123456789abcdef';
        let deviceId = '';
        for (let i = 0; i < 32; i++) {
            deviceId += chars[Math.floor(Math.random() * chars.length)];
        }
        return deviceId;
    }
    
    // Generate random brand/model
    function randomBrandModel() {
        const brands = {
            "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
            "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
            "OnePlus": ["LE2111", "CPH2449", "IN2023"],
            "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
            "Realme": ["RMX3085", "RMX3360", "RMX3551"]
        };
        const brandKeys = Object.keys(brands);
        const brand = brandKeys[Math.floor(Math.random() * brandKeys.length)];
        const models = brands[brand];
        const model = models[Math.floor(Math.random() * models.length)];
        return { brand, model };
    }
    
    // Build canonical string for signature
    function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        
        // Build query string with sorted parameters
        const queryParams = Array.from(urlObj.searchParams.entries())
            .sort((a, b) => a[0].localeCompare(b[1]))
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        
        const canonicalUrl = queryParams ? `${path}?${queryParams}` : path;
        
        const bodyBytes = body ? new TextEncoder().encode(body) : null;
        const bodyHash = bodyBytes ? md5(bodyBytes).substring(0, 32) : "";
        const bodyLength = bodyBytes ? bodyBytes.length.toString() : "";
        
        return `${method.toUpperCase()}\n${accept || ''}\n${contentType || ''}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
    }
    
    // Generate X-TR signature
    function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now().toString();
        const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
        const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
        
        // Simplified HMAC signature for JavaScript environment
        const signatureData = `${canonical}${secret}`;
        const signature = md5(signatureData).substring(0, 32);
        const signatureB64 = btoa(signature);
        
        return `${timestamp}|2|${signatureB64}`;
    }
    
    // Get client info header
    function getClientInfo(deviceId, brand, model, versionCode = 50020042) {
        return JSON.stringify({
            package_name: "com.community.mbox.in",
            version_name: "3.0.03.0529.03",
            version_code: versionCode,
            os: "android",
            os_version: "16",
            device_id: deviceId,
            install_store: "ps",
            gaid: "d7578036d13336cc",
            brand: "google",
            model: model,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "IN",
            timezone: "Asia/Calcutta",
            sp_code: ""
        });
    }
    
    // Get Oneroom client info
    function getOneroomClientInfo(deviceId, brand, model) {
        return JSON.stringify({
            package_name: "com.community.oneroom",
            version_name: "3.0.13.0325.03",
            version_code: 50020088,
            os: "android",
            os_version: "13",
            install_ch: "ps",
            device_id: deviceId,
            install_store: "ps",
            gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d",
            brand: brand,
            model: brand,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "US",
            timezone: "Asia/Calcutta",
            sp_code: "",
            "X-Play-Mode": "1",
            "X-Idle-Data": "1",
            "X-Family-Mode": "0",
            "X-Content-Mode": "0"
        });
    }
    
    // Generate standard headers
    function getHeaders(deviceId, brand, model, xClientToken, xTrSignature, versionCode = 50020042) {
        return {
            "user-agent": `com.community.mbox.in/${versionCode} (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)`,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xClientToken,
            "x-tr-signature": xTrSignature,
            "x-client-info": getClientInfo(deviceId, brand, model, versionCode),
            "x-client-status": "0",
            "x-play-mode": "2"
        };
    }
    
    // Generate Oneroom headers
    function getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature, token = null) {
        const headers = {
            "user-agent": `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xClientToken,
            "x-tr-signature": xTrSignature,
            "x-client-info": getOneroomClientInfo(deviceId, brand, model),
            "x-client-status": "0"
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        return headers;
    }
    
    // Make API request
    async function apiRequest(url, method = "GET", body = null, headers = {}) {
        try {
            if (method === "GET") {
                const res = await http_get(url, headers);
                return { success: true, body: res.body, status: res.status };
            } else {
                const res = await http_post(url, headers, body);
                return { success: true, body: res.body, status: res.status };
            }
        } catch (e) {
            console.error("API Request Error:", e.message);
            return { success: false, body: null, status: 0, error: e.message };
        }
    }
    
    // Clean title
    function cleanTitle(s) {
        return s.toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // Normalize title
    function normalizeTitle(s) {
        return s
            .replace(/\[.*?\]/g, ' ')
            .replace(/\(.*?\)/g, ' ')
            .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, ' ')
            .trim()
            .toLowerCase()
            .replace(/:/g, ' ')
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ');
    }
    
    // Token equals comparison
    function tokenEquals(a, b) {
        const sa = a.split(/\s+/).filter(t => t.length > 0);
        const sb = b.split(/\s+/).filter(t => t.length > 0);
        if (sa.length === 0 || sb.length === 0) return false;
        const intersection = sa.filter(x => sb.includes(x)).length;
        return intersection >= Math.max(1, Math.min(sa.length, sb.length) * 3 / 4);
    }
    
    // Get highest quality from resolutions string
    function getHighestQuality(input) {
        if (!input) return null;
        const qualities = [
            ["2160", 2160],
            ["1440", 1440],
            ["1080", 1080],
            ["720", 720],
            ["480", 480],
            ["360", 360],
            ["240", 240]
        ];
        for (const [label, value] of qualities) {
            if (input.toLowerCase().includes(label)) {
                return value;
            }
        }
        return null;
    }
    
    // Get quality string
    function getQualityString(quality) {
        if (!quality) return "Auto";
        if (quality >= 2160) return "4K";
        if (quality >= 1440) return "1440p";
        if (quality >= 1080) return "1080p";
        if (quality >= 720) return "720p";
        if (quality >= 480) return "480p";
        return "Auto";
    }
    
    // Parse duration string to minutes
    function parseDuration(duration) {
        if (!duration) return null;
        const regex = /(\d+)h\s*(\d+)m/;
        const match = duration.match(regex);
        if (match) {
            const h = parseInt(match[1]) || 0;
            const min = parseInt(match[2]) || 0;
            return h * 60 + min;
        }
        const minMatch = duration.match(/(\d+)m/);
        if (minMatch) {
            return parseInt(minMatch[1]);
        }
        return null;
    }
    
    // --- TMDB Integration ---
    
    // Search TMDB
    async function tmdbSearch(normTitle, year) {
        try {
            const encodedTitle = encodeURIComponent(normTitle);
            const url = `${TMDB_API}/search/multi?api_key=${TMDB_API_KEY_2}&query=${encodedTitle}&include_adult=false&page=1${year ? `&year=${year}` : ''}`;
            const res = await http_get(url, { "User-Agent": "Mozilla/5.0" });
            if (res.status === 200) {
                const data = JSON.parse(res.body);
                return data.results || [];
            }
        } catch (e) {
            console.error("TMDB Search Error:", e.message);
        }
        return [];
    }
    
    // Get TMDB details with external IDs
    async function tmdbDetails(mediaType, tmdbId) {
        try {
            const url = `${TMDB_API}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY_2}&append_to_response=external_ids`;
            const res = await http_get(url, { "User-Agent": "Mozilla/5.0" });
            if (res.status === 200) {
                return JSON.parse(res.body);
            }
        } catch (e) {
            console.error("TMDB Details Error:", e.message);
        }
        return null;
    }
    
    // Get TMDB logo
    async function fetchTmdbLogoUrl(type, tmdbId) {
        if (!tmdbId) return null;
        try {
            const url = `${TMDB_API}/${type === 'tv' ? 'tv' : 'movie'}/${tmdbId}/images?api_key=${TMDB_API_KEY}`;
            const res = await http_get(url, { "User-Agent": "Mozilla/5.0" });
            if (res.status === 200) {
                const data = JSON.parse(res.body);
                const logos = data.logos || [];
                if (logos.length === 0) return null;
                
                // Prefer English logos
                const englishLogo = logos.find(l => l.iso_639_1 === 'en');
                if (englishLogo) {
                    return `https://image.tmdb.org/t/p/w500${englishLogo.file_path}`;
                }
                
                // Fallback to first logo
                return `https://image.tmdb.org/t/p/w500${logos[0].file_path}`;
            }
        } catch (e) {
            console.error("TMDB Logo Error:", e.message);
        }
        return null;
    }
    
    // Identify TMDB/IMDB IDs
    async function identifyID(title, year, imdbRatingValue) {
        const normTitle = normalizeTitle(title);
        const results = await tmdbSearch(normTitle, year);
        
        let bestId = null;
        let bestScore = -1;
        let bestIsTv = false;
        
        for (const result of results) {
            const mediaType = result.media_type || (result.title ? 'movie' : 'tv');
            const candidateId = result.id;
            if (!candidateId) continue;
            
            const titles = [
                result.title,
                result.name,
                result.original_title,
                result.original_name
            ].filter(t => t);
            
            const candDate = mediaType === 'tv' ? result.first_air_date : result.release_date;
            const candYear = candDate ? parseInt(candDate.substring(0, 4)) : null;
            const candRating = result.vote_average || 0;
            
            // Scoring
            let score = 0;
            const normClean = cleanTitle(normTitle);
            
            for (const t of titles) {
                const candClean = cleanTitle(t);
                if (tokenEquals(candClean, normClean)) {
                    score = 50;
                    break;
                }
                if (candClean.includes(normClean) || normClean.includes(candClean)) {
                    score = Math.max(score, 20);
                }
            }
            
            if (candYear && year && candYear === year) {
                score += 35;
            }
            
            if (imdbRatingValue && !isNaN(candRating)) {
                const diff = Math.abs(candRating - imdbRatingValue);
                if (diff <= 0.5) score += 10;
                else if (diff <= 1.0) score += 5;
            }
            
            if (result.popularity) {
                score += Math.min(result.popularity / 100, 5);
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestId = candidateId;
                bestIsTv = mediaType === 'tv';
            }
        }
        
        if (!bestId || bestScore < 40) {
            return [null, null];
        }
        
        // Get external IDs
        const details = await tmdbDetails(bestIsTv ? 'tv' : 'movie', bestId);
        const imdbId = details?.external_ids?.imdb_id;
        
        return [bestId, imdbId];
    }
    
    // Fetch Cinemeta metadata
    async function fetchMetaData(imdbId, type) {
        if (!imdbId) return null;
        try {
            const metaType = type === 'series' ? 'series' : 'movie';
            const url = `${CINEMETA_URL}/${metaType}/${imdbId}.json`;
            const res = await http_get(url, { "User-Agent": "Mozilla/5.0" });
            if (res.status === 200) {
                const data = JSON.parse(res.body);
                return data.meta;
            }
        } catch (e) {
            console.error("Cinemeta Error:", e.message);
        }
        return null;
    }
    
    // --- Main Page Configuration ---
    
    const MAIN_PAGES = [
        { key: "4516404531735022304", name: "Trending" },
        { key: "5692654647815587592", name: "Trending in Cinema" },
        { key: "414907768299210008", name: "Bollywood" },
        { key: "3859721901924910512", name: "South Indian" },
        { key: "8019599703232971616", name: "Hollywood" },
        { key: "4741626294545400336", name: "Top Series This Week" },
        { key: "8434602210994128512", name: "Anime" },
        { key: "1255898847918934600", name: "Reality TV" },
        { key: "4903182713986896328", name: "Indian Drama" },
        { key: "7878715743607948784", name: "Korean Drama" },
        { key: "8788126208987989488", name: "Chinese Drama" },
        { key: "3910636007619709856", name: "Western TV" },
        { key: "5177200225164885656", name: "Turkish Drama" },
        { key: "1|1", name: "Movies" },
        { key: "1|2", name: "Series" },
        { key: "1|1006", name: "Anime" },
        { key: "1|1;country=India", name: "Indian (Movies)" },
        { key: "1|2;country=India", name: "Indian (Series)" },
        { key: "1|1;classify=Hindi dub;country=United States", name: "USA (Movies)" },
        { key: "1|2;classify=Hindi dub;country=United States", name: "USA (Series)" },
        { key: "1|1;country=Japan", name: "Japan (Movies)" },
        { key: "1|2;country=Japan", name: "Japan (Series)" },
        { key: "1|1;country=China", name: "China (Movies)" },
        { key: "1|2;country=China", name: "China (Series)" },
        { key: "1|1;country=South Korea", name: "South Korea (Movies)" },
        { key: "1|2;country=South Korea", name: "South Korea (Series)" },
        { key: "1|1;country=United Kingdom", name: "UK (Movies)" },
        { key: "1|2;country=United Kingdom", name: "UK (Series)" },
        { key: "1|1;country=Germany", name: "Germany (Movies)" },
        { key: "1|2;country=Germany", name: "Germany (Series)" },
        { key: "1|1;country=France", name: "France (Movies)" },
        { key: "1|2;country=France", name: "France (Series)" },
        { key: "1|1;country=Spain", name: "Spain (Movies)" },
        { key: "1|2;country=Spain", name: "Spain (Series)" },
        { key: "1|1;country=Italy", name: "Italy (Movies)" },
        { key: "1|2;country=Italy", name: "Italy (Series)" },
        { key: "1|1;country=Russia", name: "Russia (Movies)" },
        { key: "1|2;country=Russia", name: "Russia (Series)" },
        { key: "1|1;classify=Hindi dub", name: "Hindi Dubbed (Movies)" },
        { key: "1|2;classify=Hindi dub", name: "Hindi Dubbed (Series)" },
        { key: "1|1;classify=Tamil dub", name: "Tamil Dubbed (Movies)" },
        { key: "1|2;classify=Tamil dub", name: "Tamil Dubbed (Series)" },
        { key: "1|1;classify=Telugu dub", name: "Telugu Dubbed (Movies)" },
        { key: "1|2;classify=Telugu dub", name: "Telugu Dubbed (Series)" },
        { key: "1|1;classify=Malayalam dub", name: "Malayalam Dubbed (Movies)" },
        { key: "1|2;classify=Malayalam dub", name: "Malayalam Dubbed (Series)" },
        { key: "1|1;classify=Kannada dub", name: "Kannada Dubbed (Movies)" },
        { key: "1|2;classify=Kannada dub", name: "Kannada Dubbed (Series)" },
        { key: "1|1;classify=4K", name: "4K Movies" },
        { key: "1|2;classify=4K", name: "4K Series" },
        { key: "1|1;classify=IMAX", name: "IMAX Movies" },
        { key: "1|2;classify=IMAX", name: "IMAX Series" }
    ];
    
    // --- Main Page Function ---
    
    async function getHome(cb) {
        try {
            const pages = MAIN_PAGES.map(page => ({
                name: page.name,
                id: page.key,
                hasNextPage: true
            }));
            
            cb({ success: true, data: pages });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }
    
    async function getHomeNext(pageId, page, cb) {
        try {
            const deviceId = generateDeviceId();
            const { brand, model } = randomBrandModel();
            
            let url;
            const pageKey = pageId;
            
            // Parse page key for filter parameters
            const parts = pageKey.split(';');
            const mainKey = parts[0];
            const filters = parts.slice(1).join(';');
            
            if (mainKey.includes("|")) {
                // Filter-based page
                const [type, classify, ...rest] = mainKey.split("|");
                const typeNum = type === "1" ? "1" : "2"; // 1=Movies, 2=Series
                const classifyParam = classify ? `&classify=${classify}` : "";
                const countryParam = filters.includes("country=") ? `&${filters.split(';').find(f => f.includes('country='))}` : "";
                
                url = `${MAIN_URL}/wefeed-mobile-bff/home/v2/list?page=${page}&pageSize=20&type=${typeNum}${classifyParam}${countryParam}`;
            } else {
                // Subject-based page
                url = `${MAIN_URL}/wefeed-mobile-bff/home/v2/list?page=${page}&pageSize=20&subjectId=${mainKey}`;
            }
            
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature("GET", "application/json", "application/json", url);
            
            const headers = {
                ...getHeaders(deviceId, brand, model, xClientToken, xTrSignature),
                "user-agent": `com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)`
            };
            
            const res = await apiRequest(url, "GET", null, headers);
            if (!res.success || res.status !== 200) {
                return cb({ success: false, errorCode: "FETCH_ERROR", message: "Failed to fetch data" });
            }
            
            const data = JSON.parse(res.body);
            const items = data.data?.list || [];
            
            const results = items.map(item => {
                const subjectId = item.subjectId;
                const title = item.title;
                const year = item.releaseDate ? item.releaseDate.substring(0, 4) : null;
                const cover = item.cover?.url;
                const score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                
                return {
                    name: title,
                    url: `subjectId=${subjectId}`,
                    poster: cover,
                    description: year ? `Year: ${year}` : null,
                    score: score
                };
            });
            
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "FETCH_ERROR", message: e.message });
        }
    }
    
    // --- Search Function ---
    
    async function search(query, cb) {
        try {
            const deviceId = generateDeviceId();
            const { brand, model } = randomBrandModel();
            
            const url = `${MAIN_URL}/wefeed-mobile-bff/search/v2/search?key=${encodeURIComponent(query)}`;
            
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature("GET", "application/json", "application/json", url);
            
            const headers = {
                ...getHeaders(deviceId, brand, model, xClientToken, xTrSignature),
                "user-agent": `com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)`
            };
            
            const res = await apiRequest(url, "GET", null, headers);
            if (!res.success || res.status !== 200) {
                return cb({ success: false, errorCode: "SEARCH_ERROR", message: "Search failed" });
            }
            
            const data = JSON.parse(res.body);
            const items = data.data?.list || [];
            
            const results = items.map(item => {
                const subjectId = item.subjectId;
                const title = item.title;
                const year = item.releaseDate ? item.releaseDate.substring(0, 4) : null;
                const cover = item.cover?.url;
                const score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                
                return {
                    name: title,
                    url: `subjectId=${subjectId}`,
                    poster: cover,
                    description: year ? `Year: ${year}` : null,
                    score: score
                };
            });
            
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }
    
    // --- Load Function ---
    
    async function load(url, cb) {
        try {
            const deviceId = generateDeviceId();
            const { brand, model } = randomBrandModel();
            
            let subjectId = url;
            if (url.includes("subjectId=")) {
                const match = url.match(/subjectId=([^&]+)/);
                subjectId = match ? match[1] : url;
            }
            
            const finalUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
            
            const xClientToken = generateXClientToken();
            const xTrSignature = generateXTrSignature("GET", "application/json", "application/json", finalUrl);
            
            const headers = {
                ...getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature),
                "user-agent": `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`
            };
            
            const res = await apiRequest(finalUrl, "GET", null, headers);
            if (!res.success || res.status !== 200) {
                return cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load content" });
            }
            
            const data = JSON.parse(res.body);
            const dataObj = data.data;
            
            const title = dataObj.title;
            const releaseDate = dataObj.releaseDate;
            const description = dataObj.description;
            const genre = dataObj.genre;
            const imdbRating = dataObj.imdbRating;
            const imdbRatingValue = dataObj.imdbRatingValue;
            const coverUrl = dataObj.cover?.url;
            const backgroundUrl = dataObj.cover?.url;
            const subjectType = dataObj.subjectType || 1;
            
            const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null;
            const durationMinutes = parseDuration(dataObj.duration);
            const type = subjectType === 2 ? "series" : "movie";
            const tags = genre ? genre.split(",").map(g => g.trim()) : [];
            
            // Get actors
            const actors = (dataObj.staffList || [])
                .filter(staff => staff.staffType === 1)
                .map(staff => ({
                    name: staff.name,
                    role: staff.character,
                    image: staff.avatarUrl
                }))
                .filter((actor, index, self) => self.findIndex(a => a.name === actor.name) === index);
            
            // Fetch TMDB metadata
            const [tmdbId, imdbId] = await identifyID(title, year, imdbRating ? parseFloat(imdbRating) * 10 : null);
            
            let logoUrl = null;
            let meta = null;
            
            if (imdbId) {
                meta = await fetchMetaData(imdbId, type);
            }
            
            if (tmdbId) {
                logoUrl = await fetchTmdbLogoUrl(type, tmdbId);
            }
            
            const poster = meta?.poster || coverUrl;
            const background = meta?.background || backgroundUrl;
            const plot = meta?.overview || description;
            const tmdbRating = meta?.imdbRating;
            
            if (type === "series") {
                // Handle series episodes
                const allSubjectIds = [subjectId];
                
                // Get dubs
                if (dataObj.dubs) {
                    for (const dub of dataObj.dubs) {
                        const sid = dub.subjectId;
                        if (sid && !allSubjectIds.includes(sid)) {
                            allSubjectIds.push(sid);
                        }
                    }
                }
                
                const episodeMap = new Map(); // season -> Set of episodes
                
                for (const sid of allSubjectIds) {
                    const seasonUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${sid}`;
                    const seasonSig = generateXTrSignature("GET", "application/json", "application/json", seasonUrl);
                    const seasonHeaders = { ...headers, "x-tr-signature": seasonSig };
                    
                    const seasonRes = await apiRequest(seasonUrl, "GET", null, seasonHeaders);
                    if (!seasonRes.success || seasonRes.status !== 200) continue;
                    
                    const seasonData = JSON.parse(seasonRes.body);
                    const seasons = seasonData.data?.seasons || [];
                    
                    for (const season of seasons) {
                        const seasonNumber = season.se || 1;
                        const maxEp = season.maxEp || 1;
                        
                        if (!episodeMap.has(seasonNumber)) {
                            episodeMap.set(seasonNumber, new Set());
                        }
                        for (let ep = 1; ep <= maxEp; ep++) {
                            episodeMap.get(seasonNumber).add(ep);
                        }
                    }
                }
                
                // Build episodes list
                const episodes = [];
                const metaVideos = meta?.videos || [];
                
                for (const [seasonNumber, epSet] of episodeMap) {
                    for (const episodeNumber of Array.from(epSet).sort((a, b) => a - b)) {
                        const epMeta = metaVideos.find(v => 
                            (v.season || 1) === seasonNumber && (v.episode || 1) === episodeNumber
                        );
                        
                        const epName = epMeta?.name || epMeta?.title || `S${seasonNumber}E${episodeNumber}`;
                        const epDesc = epMeta?.overview || epMeta?.description || `Season ${seasonNumber} Episode ${episodeNumber}`;
                        const epThumb = epMeta?.thumbnail || coverUrl;
                        const runtime = epMeta?.runtime ? parseInt(epMeta.runtime) : null;
                        const aired = epMeta?.released || "";
                        
                        episodes.push(new Episode({
                            name: epName,
                            url: `${subjectId}|${seasonNumber}|${episodeNumber}`,
                            season: seasonNumber,
                            episode: episodeNumber,
                            posterUrl: epThumb,
                            description: epDesc,
                            runtime: runtime
                        }));
                    }
                }
                
                // Fallback if no episodes found
                if (episodes.length === 0) {
                    episodes.push(new Episode({
                        name: "Episode 1",
                        url: `${subjectId}|1|1`,
                        season: 1,
                        episode: 1,
                        posterUrl: coverUrl
                    }));
                }
                
                const result = new MultimediaItem({
                    title: title,
                    url: finalUrl,
                    posterUrl: poster || coverUrl,
                    bannerUrl: background || backgroundUrl,
                    logoUrl: logoUrl,
                    description: plot || description,
                    type: "series",
                    year: year,
                    score: tmdbRating ? parseFloat(tmdbRating) * 10 : (imdbRating ? parseFloat(imdbRating) * 10 : null),
                    genres: tags,
                    cast: actors,
                    duration: durationMinutes,
                    episodes: episodes,
                    syncData: { tmdb: tmdbId?.toString(), imdb: imdbId }
                });
                
                cb({ success: true, data: result });
            } else {
                // Handle movie
                const result = new MultimediaItem({
                    title: title,
                    url: finalUrl,
                    posterUrl: poster || coverUrl,
                    bannerUrl: background || backgroundUrl,
                    logoUrl: logoUrl,
                    description: plot || description,
                    type: "movie",
                    year: year,
                    score: tmdbRating ? parseFloat(tmdbRating) * 10 : (imdbRating ? parseFloat(imdbRating) * 10 : null),
                    genres: tags,
                    cast: actors,
                    duration: durationMinutes,
                    syncData: { tmdb: tmdbId?.toString(), imdb: imdbId }
                });
                
                cb({ success: true, data: result });
            }
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }
    
    async function loadStreams(url, cb) {
        try {
            const deviceId = generateDeviceId();
            const { brand, model } = randomBrandModel();
            
            // Parse URL for subject ID, season, episode
            const parts = url.split("|");
            let originalSubjectId = parts[0];
            const season = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
            const episode = parts.length > 2 ? parseInt(parts[2]) || 0 : 0;
            
            // Extract subject ID if URL format
            if (originalSubjectId.includes("subjectId=")) {
                const match = originalSubjectId.match(/subjectId=([^&]+)/);
                originalSubjectId = match ? match[1] : originalSubjectId;
            } else if (originalSubjectId.includes("/")) {
                originalSubjectId = originalSubjectId.substring(originalSubjectId.lastIndexOf("/") + 1);
            }
            
            // Get subject info to find dubs
            const subjectUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${originalSubjectId}`;
            const subjectXClientToken = generateXClientToken();
            const subjectXTrSignature = generateXTrSignature("GET", "application/json", "application/json", subjectUrl);
            const subjectHeaders = {
                ...getOneroomHeaders(deviceId, brand, model, subjectXClientToken, subjectXTrSignature),
                "user-agent": `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`
            };
            
            const subjectRes = await apiRequest(subjectUrl, "GET", null, subjectHeaders);
            if (!subjectRes.success || subjectRes.status !== 200) {
                return cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to get subject info" });
            }
            
            const subjectData = JSON.parse(subjectRes.body);
            const subjectDataObj = subjectData.data;
            
            // Get subject IDs with languages
            const subjectIds = [];
            let originalLanguageName = "Original";
            
            if (subjectDataObj?.dubs) {
                for (const dub of subjectDataObj.dubs) {
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
            
            // Add original subject first
            subjectIds.unshift({ id: originalSubjectId, language: originalLanguageName });
            
            // Get token from x-user header
            const xUserHeader = subjectRes.headers?.["x-user"];
            let token = null;
            if (xUserHeader) {
                try {
                    const xUserJson = JSON.parse(xUserHeader);
                    token = xUserJson.token;
                } catch (e) {
                    console.error("Failed to parse x-user header");
                }
            }
            
            const results = [];
            
            // Process each subject ID
            for (const { id: subjectId, language } of subjectIds) {
                try {
                    const playUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${subjectId}&se=${season}&ep=${episode}`;
                    const xClientToken = generateXClientToken();
                    const xTrSignature = generateXTrSignature("GET", "application/json", "application/json", playUrl);
                    const playHeaders = getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature, token);
                    
                    const playRes = await apiRequest(playUrl, "GET", null, playHeaders);
                    if (!playRes.success || playRes.status !== 200) continue;
                    
                    const playData = JSON.parse(playRes.body);
                    const streams = playData.data?.streams || [];
                    
                    for (const stream of streams) {
                        const streamUrl = stream.url;
                        if (!streamUrl) continue;
                        
                        const format = stream.format || "";
                        const resolutions = stream.resolutions || "";
                        const signCookie = stream.signCookie;
                        const streamId = stream.id || `${subjectId}|${season}|${episode}`;
                        
                        const quality = getHighestQuality(resolutions);
                        const qualityStr = getQualityString(quality);
                        
                        const streamResult = new StreamResult({
                            url: streamUrl,
                            quality: qualityStr,
                            source: `${language.replace("dub", "Audio")}`,
                            headers: {
                                "Referer": MAIN_URL
                            }
                        });
                        
                        if (signCookie) {
                            streamResult.headers["Cookie"] = signCookie;
                        }
                        
                        results.push(streamResult);
                        
                        // Get subtitles
                        try {
                            const subLink = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${subjectId}&streamId=${streamId}`;
                            const subXClientToken = generateXClientToken();
                            const subXTrSignature = generateXTrSignature("GET", "", "", subLink);
                            const subHeaders = {
                                "Authorization": token ? `Bearer ${token}` : "",
                                "user-agent": playHeaders["user-agent"],
                                "Accept": "",
                                "x-client-info": getOneroomClientInfo(deviceId, brand, model),
                                "X-Client-Status": "0",
                                "Content-Type": "",
                                "X-Client-Token": subXClientToken,
                                "x-tr-signature": subXTrSignature
                            };
                            
                            const subRes = await apiRequest(subLink, "GET", null, subHeaders);
                            if (subRes.success && subRes.status === 200) {
                                const subData = JSON.parse(subRes.body);
                                const captions = subData.data?.extCaptions || [];
                                
                                for (const caption of captions) {
                                    const captionUrl = caption.url;
                                    const lang = caption.language || caption.lanName || caption.lan || "Unknown";
                                    
                                    if (captionUrl) {
                                        streamResult.subtitles = streamResult.subtitles || [];
                                        streamResult.subtitles.push({
                                            url: captionUrl,
                                            label: `${lang} (${language.replace("dub", "Audio")})`,
                                            lang: lang
                                        });
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Subtitle error:", e.message);
                        }
                    }
                    
                    // Fallback: Get resource detectors if no streams
                    if (streams.length === 0) {
                        const fallbackUrl = `${MAIN_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
                        const fallbackXTrSignature = generateXTrSignature("GET", "application/json", "application/json", fallbackUrl);
                        const fallbackHeaders = { ...playHeaders, "x-tr-signature": fallbackXTrSignature };
                        
                        const fallbackRes = await apiRequest(fallbackUrl, "GET", null, fallbackHeaders);
                        if (fallbackRes.success && fallbackRes.status === 200) {
                            const fallbackData = JSON.parse(fallbackRes.body);
                            const detectors = fallbackData.data?.resourceDetectors || [];
                            
                            for (const detector of detectors) {
                                const resolutionList = detector.resolutionList || [];
                                for (const video of resolutionList) {
                                    const link = video.resourceLink;
                                    const quality = video.resolution;
                                    const se = video.se;
                                    const ep = video.ep;
                                    
                                    if (link) {
                                        results.push(new StreamResult({
                                            url: link,
                                            quality: quality ? `${quality}p` : "Auto",
                                            source: `${language.replace("dub", "Audio")}`,
                                            headers: { "Referer": MAIN_URL }
                                        }));
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error processing subject ${subjectId}:`, e.message);
                    continue;
                }
            }
            
            if (results.length === 0) {
                cb({ success: false, errorCode: "NO_STREAMS", message: "No streams found" });
            } else {
                cb({ success: true, data: results });
            }
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }
    
    // Export functions
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
