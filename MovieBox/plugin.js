(function() {
    const BASE_URL = "https://api3.aoneroom.com";
    const API_VERSION = "3.0.03.0529.03";
    const APP_PACKAGE = "com.community.mbox.in";
    const APP_CODE = 50020042;

    function md5(str) {
        function r(a, b) { return (a << b) | (a >>> (32 - b)); }
        function f(a, b, c, d, e, g, f) { return r((a + ((b & c) | (~b & d) + e + g) | 0), f) + b; }
        function g(a, b, c, d, e, g, f) { return r((a + ((b & d) | (c & ~d) + e + g) | 0), f) + b; }
        function h(a, b, c, d, e, g, f) { return r((a + (b ^ c ^ d + e + g) | 0), f) + b; }
        function i(a, b, c, d, e, g, f) { return r((a + (c ^ (b | ~d) + e + g) | 0), f) + b; }
        
        const k = [];
        for (let i = 0; i < 64; i++) k[i] = 0;
        let l = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            k[l++] |= c;
        }
        k[l] = 128;
        
        const m = str.length * 8;
        k[56] = (m >>> 24) & 255;
        k[57] = (m >>> 16) & 255;
        k[58] = (m >>> 8) & 255;
        k[59] = m & 255;
        
        let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
        
        a = f(a, b, c, d, k[0], 7, 0xd76aa478); d = f(d, a, b, c, k[1], 12, 0xe8c7b756); c = f(c, d, a, b, k[2], 17, 0x242070db); b = f(b, c, d, a, k[3], 22, 0xc1bdceee);
        a = f(a, b, c, d, k[4], 7, 0xf57c0faf); d = f(d, a, b, c, k[5], 12, 0x4787c62a); c = f(c, d, a, b, k[6], 17, 0xa8304613); b = f(b, c, d, a, k[7], 22, 0xfd469501);
        a = f(a, b, c, d, k[8], 7, 0x698098d8); d = f(d, a, b, c, k[9], 12, 0x8b44f7af); c = f(c, d, a, b, k[10], 17, 0xffff5bb1); b = f(b, c, d, a, k[11], 22, 0x895cd7be);
        a = f(a, b, c, d, k[12], 7, 0x6b901122); d = f(d, a, b, c, k[13], 12, 0xfd987193); c = f(c, d, a, b, k[14], 17, 0xa679438e); b = f(b, c, d, a, k[15], 22, 0x49b40821);
        
        a = g(a, b, c, d, k[1], 5, 0xf61e2562); d = g(d, a, b, c, k[6], 9, 0xc040b340); c = g(c, d, a, b, k[11], 14, 0x265e5a51); b = g(b, c, d, a, k[0], 20, 0xe9b6c7aa);
        a = g(a, b, c, d, k[5], 5, 0xd62f105d); d = g(d, a, b, c, k[10], 9, 0x2441453); c = g(c, d, a, b, k[15], 14, 0xd8a1e681); b = g(b, c, d, a, k[4], 20, 0xe7d3fbc8);
        a = g(a, b, c, d, k[9], 5, 0x21e1cde6); d = g(d, a, b, c, k[14], 9, 0xc33707d6); c = g(c, d, a, b, k[3], 14, 0xf4d50d87); b = g(b, c, d, a, k[8], 20, 0x455a14ed);
        a = g(a, b, c, d, k[13], 5, 0xa9e3e905); d = g(d, a, b, c, k[2], 9, 0xfcefa3f8); c = g(c, d, a, b, k[7], 14, 0x676f02d9); b = g(b, c, d, a, k[12], 20, 0x8d2a4c8a);
        
        a = h(a, b, c, d, k[5], 4, 0xfffa3942); d = h(d, a, b, c, k[8], 11, 0x8771f681); c = h(c, d, a, b, k[11], 16, 0x6d9d6122); b = h(b, c, d, a, k[14], 23, 0xfde5380c);
        a = h(a, b, c, d, k[1], 4, 0xa4bea44); d = h(d, a, b, c, k[4], 11, 0x4bdeca9); c = h(c, d, a, b, k[7], 16, 0xf6bb4b60); b = h(b, c, d, a, k[10], 23, 0xbebfbc70);
        a = h(a, b, c, d, k[13], 4, 0x289b7ec6); d = h(d, a, b, c, k[0], 11, 0xeaa127fa); c = h(c, d, a, b, k[3], 16, 0xd4ef3085); b = h(b, c, d, a, k[6], 23, 0x4881d05);
        a = h(a, b, c, d, k[9], 4, 0xd9d4d039); d = h(d, a, b, c, k[12], 11, 0xe6db99e5); c = h(c, d, a, b, k[15], 16, 0x1fa27cf8); b = h(b, c, d, a, k[2], 23, 0xc4ac5665);
        
        a = i(a, b, c, d, k[0], 6, 0xf4292244); d = i(d, a, b, c, k[7], 10, 0x432aff97); c = i(c, d, a, b, k[14], 15, 0xab9423a7); b = i(b, c, d, a, k[5], 21, 0xfc93a039);
        a = i(a, b, c, d, k[12], 6, 0x655b59c3); d = i(d, a, b, c, k[3], 10, 0x8f0ccc92); c = i(c, d, a, b, k[10], 15, 0xffeff47d); b = i(b, c, d, a, k[1], 21, 0x85845dd1);
        a = i(a, b, c, d, k[8], 6, 0x6fa87e4f); d = i(d, a, b, c, k[15], 10, 0xfe2ce6e0); c = i(c, d, a, b, k[6], 15, 0xa3014314); b = i(b, c, d, a, k[13], 21, 0x4e0811a1);
        a = i(a, b, c, d, k[4], 6, 0xf7537e82); d = i(d, a, b, c, k[11], 10, 0xbd3af235); c = i(c, d, a, b, k[2], 15, 0x2ad7d2bb); b = i(b, c, d, a, k[9], 21, 0xeb86d391);
        
        a = (a + 0x67452301) & 0xffffffff;
        b = (b + 0xefcdab89) & 0xffffffff;
        c = (c + 0x98badcfe) & 0xffffffff;
        d = (d + 0x10325476) & 0xffffffff;
        
        const hex = (n) => {
            let s = "";
            for (let i = 0; i < 4; i++) s = ((n >> (i * 8)) & 255).toString(16).padStart(2, '0') + s;
            return s;
        };
        return hex(a) + hex(b) + hex(c) + hex(d);
    }

    function getDeviceId() {
        const hex = "0123456789abcdef";
        let id = "";
        for (let i = 0; i < 32; i++) id += hex[Math.floor(Math.random() * 16)];
        return id;
    }

    const deviceId = getDeviceId();

    const deviceModels = [
        { brand: "Samsung", model: "SM-S918B" },
        { brand: "Xiaomi", model: "Redmi Note 11" },
        { brand: "OnePlus", model: "LE2111" },
        { brand: "Google", model: "Pixel 7" },
        { brand: "Realme", model: "RMX3085" }
    ];

    function getRandomDevice() {
        return deviceModels[Math.floor(Math.random() * deviceModels.length)];
    }

    function generateToken() {
        const ts = Date.now();
        const rev = String(ts).split("").reverse().join("");
        const hash = md5(rev);
        return `${ts},${hash}`;
    }

    function generateSignature(method, url, body) {
        const ts = Date.now();
        let path = "/", query = "";
        try {
            const u = new URL(url);
            path = u.pathname;
            if (u.search) query = u.search.substring(1).split("&").sort().join("&");
        } catch {}
        const finalPath = query ? `${path}?${query}` : path;
        
        let bodyHash = "", bodyLen = "";
        if (body) {
            bodyHash = md5(body.substring(0, 50000));
            bodyLen = body.length.toString();
        }
        
        const canonical = [
            method.toUpperCase(),
            "application/json",
            "application/json",
            bodyLen,
            ts.toString(),
            bodyHash,
            finalPath
        ].join("\n");
        
        const key = base64Decode("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
        const ipad = [], opad = [];
        for (let i = 0; i < 64; i++) {
            ipad.push((key[i] || 0) ^ 0x36);
            opad.push((key[i] || 0) ^ 0x5c);
        }
        
        const innerHash = md5(String.fromCharCode(...ipad) + canonical);
        const sig = md5(String.fromCharCode(...opad) + innerHash);
        
        const bytes = [];
        for (let i = 0; i < 32; i += 2) bytes.push(parseInt(sig.substr(i, 2), 16));
        
        return `${ts}|2|${btoa(String.fromCharCode(...bytes))}`;
    }

    function buildHeaders(apiUrl, body) {
        const device = getRandomDevice();
        return {
            "user-agent": "okhttp/4.12.0",
            "accept": "application/json",
            "content-type": "application/json; charset=UTF-8",
            "x-client-token": generateToken(),
            "x-tr-signature": generateSignature(body ? "POST" : "GET", apiUrl, body),
            "x-client-info": JSON.stringify({
                package_name: APP_PACKAGE,
                version_name: API_VERSION,
                version_code: APP_CODE,
                os: "android",
                os_version: "13",
                device_id: deviceId,
                install_store: "ps",
                gaid: "",
                brand: device.brand,
                model: device.model,
                system_language: "en",
                net: "NETWORK_WIFI",
                region: "IN",
                timezone: "Asia/Kolkata",
                sp_code: ""
            }),
            "x-client-status": "0"
        };
    }

    const homeCategories = [
        { id: "4516404531735022304", name: "Trending" },
        { id: "414907768299210008", name: "Bollywood" },
        { id: "3859721901924910512", name: "South Indian" },
        { id: "8019599703232971616", name: "Hollywood" },
        { id: "4741626294545400336", name: "Top Series" },
        { id: "1|1", name: "Movies" },
        { id: "1|2", name: "Series" }
    ];

    async function getHome(cb) {
        try {
            const result = {};
            for (const cat of homeCategories) {
                try {
                    const apiUrl = `${BASE_URL}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${cat.id}&page=1&perPage=20`;
                    const body = JSON.stringify({ page: 1, perPage: 20, channelId: cat.id, classify: "All", country: "All", year: "All", genre: "All", sort: "ForYou" });
                    const res = await http_post(apiUrl, { headers: buildHeaders(apiUrl, body), body, contentType: "application/json; charset=UTF-8" });
                    const data = JSON.parse(res.body);
                    const items = [];
                    for (const item of data?.data?.items || []) {
                        if (!item.subjectId || !item.title) continue;
                        items.push(new MultimediaItem({
                            title: item.title.split("[")[0].trim(),
                            url: item.subjectId,
                            posterUrl: item.cover?.url || "",
                            type: (item.subjectType || 1) === 1 ? "movie" : "series",
                            contentType: (item.subjectType || 1) === 1 ? "movie" : "series",
                            score: item.imdbRatingValue ? parseFloat(item.imdbRatingValue) : null
                        }));
                    }
                    if (items.length > 0) result[cat.name] = items.slice(0, 20);
                } catch (e) { console.log("Cat error:", e.message); }
            }
            cb({ success: true, data: result });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: e.message }); }
    }

    async function search(query, cb) {
        try {
            const apiUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/search/v2`;
            const body = JSON.stringify({ page: 1, perPage: 30, keyword: query });
            const res = await http_post(apiUrl, { headers: buildHeaders(apiUrl, body), body, contentType: "application/json; charset=UTF-8" });
            const data = JSON.parse(res.body);
            const items = [];
            for (const r of data?.data?.results || []) {
                for (const s of r.subjects || []) {
                    if (!s.subjectId || !s.title) continue;
                    items.push(new MultimediaItem({
                        title: s.title,
                        url: s.subjectId,
                        posterUrl: s.cover?.url || "",
                        type: (s.subjectType || 1) === 1 ? "movie" : "series",
                        contentType: (s.subjectType || 1) === 1 ? "movie" : "series",
                        score: s.imdbRatingValue ? parseFloat(s.imdbRatingValue) : null
                    }));
                }
            }
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message }); }
    }

    async function load(url, cb) {
        try {
            const id = url.split("subjectId=")[1] || url;
            const apiUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${id}`;
            const res = await http_get(apiUrl, { headers: buildHeaders(apiUrl) });
            const data = JSON.parse(res.body);
            const d = data?.data;
            if (!d) throw new Error("No data");
            
            const title = d.title?.split("[")[0] || "Unknown";
            const poster = d.cover?.url || "";
            const isSeries = (d.subjectType || 1) !== 1;
            
            if (isSeries) {
                let episodes = [];
                try {
                    const sUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${id}`;
                    const sRes = await http_get(sUrl, { headers: buildHeaders(sUrl) });
                    const sData = JSON.parse(sRes.body);
                    for (const s of sData?.data?.seasons || []) {
                        const sn = s.se || 1;
                        const max = s.maxEp || 1;
                        for (let e = 1; e <= max; e++) {
                            episodes.push(new Episode({
                                name: `S${sn}E${e}`,
                                url: `${id}|${sn}|${e}`,
                                season: sn,
                                episode: e,
                                posterUrl: poster
                            }));
                        }
                    }
                } catch {}
                if (episodes.length === 0) episodes.push(new Episode({ name: "Episode 1", url: `${id}|1|1`, season: 1, episode: 1, posterUrl: poster }));
                
                cb({ success: true, data: new MultimediaItem({
                    title, url: apiUrl, posterUrl: poster, bannerUrl: poster, description: d.description || "",
                    type: "series", contentType: "series", year: d.releaseDate ? parseInt(d.releaseDate.substring(0, 4)) : null,
                    tags: d.genre ? d.genre.split(",") : [], score: d.imdbRatingValue ? parseFloat(d.imdbRatingValue) : null, episodes
                })});
            } else {
                cb({ success: true, data: new MultimediaItem({
                    title, url: apiUrl, posterUrl: poster, bannerUrl: poster, description: d.description || "",
                    type: "movie", contentType: "movie", year: d.releaseDate ? parseInt(d.releaseDate.substring(0, 4)) : null,
                    tags: d.genre ? d.genre.split(",") : [], score: d.imdbRatingValue ? parseFloat(d.imdbRatingValue) : null
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: e.message }); }
    }

    async function loadStreams(url, cb) {
        try {
            const parts = url.split("|");
            const id = parts[0].split("subjectId=")[1] || parts[0];
            const season = parseInt(parts[1]) || 0;
            const episode = parseInt(parts[2]) || 0;
            
            const apiUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${id}&se=${season}&ep=${episode}`;
            const res = await http_get(apiUrl, { headers: buildHeaders(apiUrl) });
            const data = JSON.parse(res.body);
            
            const streams = [];
            for (const s of data?.data?.streams || []) {
                if (!s.url) continue;
                let quality = "Auto";
                if (s.resolutions?.includes("1080")) quality = "1080p";
                else if (s.resolutions?.includes("720")) quality = "720p";
                else if (s.resolutions?.includes("480")) quality = "480p";
                
                let type = "VIDEO";
                if (s.url.endsWith(".m3u8") || s.format === "HLS") type = "M3U8";
                else if (s.url.startsWith("magnet:")) type = "TORRENT";
                
                streams.push(new StreamResult({
                    url: s.url, quality, name: "MovieBox", source: "MovieBox", type, headers: { "Referer": BASE_URL }
                }));
            }
            
            cb({ success: true, data: streams });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: e.message }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
