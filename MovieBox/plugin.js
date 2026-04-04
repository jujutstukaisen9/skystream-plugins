(function() {
    const BASE_URL = "https://api3.aoneroom.com";

    function simpleMd5(str) {
        const rotateLeft = (value, shift) => (value << shift) | (value >>> (32 - shift));
        const addUnsigned = (x, y) => {
            const result = (x & 0x7FFFFFFF) + (y & 0x7FFFFFFF);
            if (x & 0x80000000) { if (y & 0x80000000) return result ^ 0x80000000 ^ 0x80000000; else return result ^ 0x80000000; }
            else { if (y & 0x80000000) return result ^ 0x80000000; else return result; }
        };
        const F = (x, y, z) => (x & y) | (~x & z);
        const G = (x, y, z) => (x & z) | (y & ~z);
        const H = (x, y, z) => x ^ y ^ z;
        const I = (x, y, z) => y ^ (x | ~z);
        const FF = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(F(b, c, d), x), ac), s), b);
        const GG = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(G(b, c, d), x), ac), s), b);
        const HH = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(H(b, c, d), x), ac), s), b);
        const II = (a, b, c, d, x, s, ac) => addUnsigned(rotateLeft(addUnsigned(addUnsigned(I(b, c, d), x), ac), s), b);
        const convertToWordArray = (str) => {
            const lWordLength = [];
            const lMessageLength = str.length;
            const lNumberOfWords = (((lMessageLength + 8) >>> 6) + 1) * 16;
            for (let i = 0; i < lNumberOfWords; i++) lWordLength[i] = 0;
            let lBytePosition = 0, lByteCount = 0;
            while (lByteCount < lMessageLength) {
                const lWordIndex = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordLength[lWordIndex] |= str.charCodeAt(lByteCount) << lBytePosition;
                lByteCount++;
            }
            const lWordIndex = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordLength[lWordIndex] |= 0x80 << lBytePosition;
            lWordLength[lNumberOfWords - 2] = lMessageLength << 3;
            lWordLength[lNumberOfWords - 1] = lMessageLength >>> 29;
            return lWordLength;
        };
        const wordToHex = (value) => {
            let hex = "";
            for (let i = 0; i <= 3; i++) hex += ("0" + ((value >>> (i * 8)) & 255).toString(16)).slice(-2);
            return hex;
        };
        const x = [];
        let k, AA, BB, CC, DD, a, b, c, d;
        const S11 = 7, S12 = 12, S13 = 17, S14 = 22, S21 = 5, S22 = 9, S23 = 14, S24 = 20, S31 = 4, S32 = 11, S33 = 16, S34 = 23, S41 = 6, S42 = 10, S43 = 15, S44 = 21;
        x[0] = convertToWordArray(str);
        a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
        for (k = 0; k < x.length; k += 16) {
            AA = a; BB = b; CC = c; DD = d;
            a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478); d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756); c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB); b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
            a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF); d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A); c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
            a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8); d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF); c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1); b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
            a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122); d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193); c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E); b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
            a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562); d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340); c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51); b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
            a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D); d = GG(d, a, b, c, x[k + 10], S22, 0x2441453); c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681); b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
            a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6); d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6); c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87); b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
            a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905); d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8); c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9); b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
            a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681); c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122); b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
            a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44); d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9); c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60); b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
            a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6); d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA); c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085); b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05);
            a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039); d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5); c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8); b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
            a = II(a, b, c, d, x[k + 0], S41, 0xF4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97); c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7); b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
            a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3); d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92); c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D); b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
            a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F); d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0); c = II(c, d, a, b, x[k + 6], S43, 0xA3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
            a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82); d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235); c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB); b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
            a = addUnsigned(a, AA); b = addUnsigned(b, BB); c = addUnsigned(c, CC); d = addUnsigned(d, DD);
        }
        return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }

    function reverseString(input) { return String(input).split("").reverse().join(""); }

    function generateXClientToken(hardcodedTimestamp = null) {
        const timestamp = (hardcodedTimestamp || Date.now()).toString();
        return `${timestamp},${simpleMd5(reverseString(timestamp))}`;
    }

    function hmacMd5(key, message) {
        const keyBytes = [];
        const keyData = typeof key === 'string' ? key : String.fromCharCode(...key);
        for (let i = 0; i < keyData.length; i++) keyBytes.push(keyData.charCodeAt(i));
        while (keyBytes.length < 64) keyBytes.push(0);
        const ipad = [], opad = [];
        for (let i = 0; i < 64; i++) { ipad.push(keyBytes[i] ^ 0x36); opad.push(keyBytes[i] ^ 0x5C); }
        const innerHash = simpleMd5(String.fromCharCode(...ipad) + message);
        const outerHash = simpleMd5(String.fromCharCode(...opad) + innerHash);
        const result = [];
        for (let i = 0; i < 32; i += 2) result.push(parseInt(outerHash.substr(i, 2), 16));
        return new Uint8Array(result);
    }

    function generateXTrSignature(method, url, body = null, useAltKey = false, hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now();
        let parsed;
        try { parsed = new URL(url); } catch (_) { parsed = { pathname: "/", searchParams: new Map() }; }
        const path = parsed.pathname || "";
        let query = "";
        if (parsed.searchParams && parsed.searchParams.size > 0) {
            const keys = Array.from(parsed.searchParams.keys()).sort();
            query = keys.map(key => parsed.searchParams.getAll(key).map(v => `${key}=${v}`).join("&")).join("&");
        }
        const canonicalUrl = query ? `${path}?${query}` : path;
        let bodyHash = "", bodyLength = "";
        if (body) { bodyHash = simpleMd5(body.slice(0, 102400)); bodyLength = body.length.toString(); }
        const canonical = [method.toUpperCase(), "application/json", "application/json", bodyLength, timestamp.toString(), bodyHash, canonicalUrl].join("\n");
        const secretKeyBase64 = useAltKey ? "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==" : "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
        const signature = hmacMd5(base64Decode(secretKeyBase64), canonical);
        return `${timestamp}|2|${btoa(String.fromCharCode(...signature))}`;
    }

    function generateDeviceId() {
        const bytes = [];
        for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256).toString(16).padStart(2, '0'));
        return bytes.join("");
    }

    const deviceId = generateDeviceId();

    const brandModels = {
        "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
        "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
        "OnePlus": ["LE2111", "CPH2449", "IN2023"],
        "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
        "Realme": ["RMX3085", "RMX3360", "RMX3551"]
    };

    function randomBrandModel() {
        const brands = Object.keys(brandModels);
        const brand = brands[Math.floor(Math.random() * brands.length)];
        return { brand, model: brandModels[brand][Math.floor(Math.random() * brandModels[brand].length)] };
    }

    const mainPageCategories = [
        { data: "4516404531735022304", name: "Trending" },
        { data: "5692654647815587592", name: "Trending in Cinema" },
        { data: "414907768299210008", name: "Bollywood" },
        { data: "3859721901924910512", name: "South Indian" },
        { data: "8019599703232971616", name: "Hollywood" },
        { data: "4741626294545400336", name: "Top Series This Week" },
        { data: "8434602210994128512", name: "Anime" },
        { data: "1255898847918934600", name: "Reality TV" },
        { data: "4903182713986896328", name: "Indian Drama" },
        { data: "7878715743607948784", name: "Korean Drama" },
        { data: "8788126208987989488", name: "Chinese Drama" },
        { data: "3910636007619709856", name: "Western TV" },
        { data: "5177200225164885656", name: "Turkish Drama" },
        { data: "1|1", name: "Movies" },
        { data: "1|2", name: "Series" },
        { data: "1|1006", name: "Anime" },
        { data: "1|1;country=India", name: "Indian (Movies)" },
        { data: "1|2;country=India", name: "Indian (Series)" }
    ];

    const UA = "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)";

    function buildClientInfo(brandModel = null) {
        const bm = brandModel || randomBrandModel();
        return JSON.stringify({
            package_name: "com.community.mbox.in", version_name: "3.0.03.0529.03", version_code: 50020042,
            os: "android", os_version: "16", device_id: deviceId, install_store: "ps", gaid: "d7578036d13336cc",
            brand: "google", model: bm.model, system_language: "en", net: "NETWORK_WIFI", region: "IN", timezone: "Asia/Calcutta", sp_code: ""
        });
    }

    function buildHeaders(url, body = null) {
        return {
            "user-agent": UA, "accept": "application/json", "content-type": "application/json", "connection": "keep-alive",
            "x-client-token": generateXClientToken(), "x-tr-signature": generateXTrSignature(body ? "POST" : "GET", url, body),
            "x-client-info": buildClientInfo(), "x-client-status": "0"
        };
    }

    async function fetchHomePage(data, page = 1) {
        const perPage = 15;
        let url;
        if (data.includes("|")) url = `${BASE_URL}/wefeed-mobile-bff/subject-api/list`;
        else url = `${BASE_URL}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${data}&page=${page}&perPage=${perPage}`;
        const mainParts = data.split(";")[0].split("|");
        const pg = parseInt(mainParts[0]) || 1;
        const channelId = mainParts[1];
        const options = {};
        data.split(";").slice(1).forEach(part => { const [k, v] = part.split("="); if (k && v) options[k] = v; });
        const jsonBody = JSON.stringify({
            page: pg, perPage, channelId, classify: options["classify"] || "All", country: options["country"] || "All",
            year: options["year"] || "All", genre: options["genre"] || "All", sort: options["sort"] || "ForYou"
        });
        return JSON.parse((await http_post(url, { headers: buildHeaders(url, jsonBody), body: jsonBody, contentType: "application/json" })).body);
    }

    function parseItems(root) {
        const items = [];
        const data = root?.data?.items || root?.data?.subjects || [];
        for (const item of data) {
            const title = item.title?.split("[")[0];
            if (!title || !item.subjectId) continue;
            const type = (item.subjectType || 1) === 1 ? "movie" : "series";
            items.push(new MultimediaItem({
                title, url: item.subjectId, posterUrl: item.cover?.url || "", type, contentType: type,
                score: item.imdbRatingValue ? parseFloat(item.imdbRatingValue) : null
            }));
        }
        return items;
    }

    async function getHome(cb) {
        try {
            const data = {};
            for (const cat of mainPageCategories) {
                try {
                    const response = await fetchHomePage(cat.data);
                    const items = parseItems(response);
                    if (items.length > 0) data[cat.name] = items.slice(0, 24);
                } catch (e) { console.error(`Error fetching ${cat.name}:`, e.message); }
            }
            cb({ success: true, data });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: String(e.message) }); }
    }

    async function search(query, cb) {
        try {
            const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/search/v2`;
            const jsonBody = JSON.stringify({ page: 1, perPage: 20, keyword: query });
            const headers = buildHeaders(url, jsonBody);
            const response = JSON.parse((await http_post(url, { headers, body: jsonBody, contentType: "application/json" })).body);
            const items = [];
            for (const result of response?.data?.results || []) {
                for (const subject of result.subjects || []) {
                    if (!subject.title || !subject.subjectId) continue;
                    const type = (subject.subjectType || 1) === 1 ? "movie" : "series";
                    items.push(new MultimediaItem({
                        title: subject.title, url: subject.subjectId, posterUrl: subject.cover?.url || "",
                        type, contentType: type, score: subject.imdbRatingValue ? parseFloat(subject.imdbRatingValue) : null
                    }));
                }
            }
            cb({ success: true, data: items });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e.message) }); }
    }

    async function load(url, cb) {
        try {
            const id = url.split("subjectId=")[1]?.split("&")[0] || url;
            const finalUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${id}`;
            const httpRes = await http_get(finalUrl, { headers: buildHeaders(finalUrl) });
            if (httpRes.status !== 200) throw new Error(`HTTP ${httpRes.status}`);
            const response = typeof httpRes.body === 'string' ? JSON.parse(httpRes.body) : httpRes;
            let data = response?.data;
            if (!data) data = response;
            if (!data) throw new Error("No data");
            const title = data.title?.split("[")[0] || "Unknown";
            const contentType = (data.subjectType || 1) === 1 ? "movie" : "series";
            const coverUrl = data.cover?.url || "";
            const tags = (data.genre || "").split(",").map(t => t.trim()).filter(Boolean);
            let durationMinutes = null;
            const durMatch = (data.duration || "").match(/(\d+)h\s*(\d+)m/);
            if (durMatch) durationMinutes = parseInt(durMatch[1]) * 60 + parseInt(durMatch[2]);
            else durationMinutes = parseInt((data.duration || "").replace("m", "")) || null;
            const actors = [];
            if (data.staffList) {
                for (const staff of data.staffList) {
                    if (staff.staffType === 1) {
                        actors.push(new Actor({ name: staff.name || "", image: staff.avatarUrl || "", role: staff.character || "" }));
                    }
                }
            }
            if (contentType === "series") {
                const allSubjectIds = [id];
                if (data.dubs) for (const dub of data.dubs) if (dub.subjectId && !allSubjectIds.includes(dub.subjectId)) allSubjectIds.push(dub.subjectId);
                const episodeMap = {};
                for (const subjectId of allSubjectIds) {
                    try {
                        const seasonRes = JSON.parse((await http_get(`${BASE_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${subjectId}`, { headers: buildHeaders(`${BASE_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${subjectId}`) })).body);
                        for (const season of seasonRes?.data?.seasons || []) {
                            const sn = season.se || 1;
                            if (!episodeMap[sn]) episodeMap[sn] = new Set();
                            for (let ep = 1; ep <= (season.maxEp || 1); ep++) episodeMap[sn].add(ep);
                        }
                    } catch (_) {}
                }
                const episodes = [];
                for (const seasonNumber of Object.keys(episodeMap).sort((a, b) => parseInt(a) - parseInt(b))) {
                    for (const episodeNumber of Array.from(episodeMap[seasonNumber]).sort((a, b) => a - b)) {
                        episodes.push(new Episode({ name: `S${seasonNumber}E${episodeNumber}`, url: `${id}|${seasonNumber}|${episodeNumber}`, season: parseInt(seasonNumber), episode: episodeNumber, posterUrl: coverUrl }));
                    }
                }
                if (episodes.length === 0) episodes.push(new Episode({ name: "Episode 1", url: `${id}|1|1`, season: 1, episode: 1, posterUrl: coverUrl }));
                cb({ success: true, data: new MultimediaItem({
                    title, url: finalUrl, posterUrl: coverUrl, bannerUrl: coverUrl, description: data.description || "",
                    type: contentType, contentType, year: data.releaseDate ? parseInt(data.releaseDate.substring(0, 4)) : null,
                    tags, actors, score: data.imdbRatingValue ? parseFloat(data.imdbRatingValue) * 10 : null, duration: durationMinutes, episodes
                })});
            } else {
                cb({ success: true, data: new MultimediaItem({
                    title, url: finalUrl, posterUrl: coverUrl, bannerUrl: coverUrl, description: data.description || "",
                    type: contentType, contentType, year: data.releaseDate ? parseInt(data.releaseDate.substring(0, 4)) : null,
                    tags, actors, score: data.imdbRatingValue ? parseFloat(data.imdbRatingValue) * 10 : null, duration: durationMinutes
                })});
            }
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: String(e.message) }); }
    }

    async function loadStreams(url, cb) {
        try {
            const parts = url.split("|");
            let subjectId = parts[0];
            if (subjectId.includes("subjectId=")) subjectId = subjectId.split("subjectId=")[1].split("&")[0];
            const season = parts[1] ? parseInt(parts[1]) : 0;
            const episode = parts[2] ? parseInt(parts[2]) : 0;
            const bm = randomBrandModel();
            const playUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${subjectId}&se=${season}&ep=${episode}`;
            const headers = {
                "user-agent": `com.community.oneroom/50020088 (Linux; U; Android 13; en_US; ${bm.brand}; Build/TQ3A.230901.001; Cronet/145.0.7582.0)`,
                "accept": "application/json", "content-type": "application/json", "connection": "keep-alive",
                "x-client-token": generateXClientToken(), "x-tr-signature": generateXTrSignature("GET", playUrl),
                "x-client-info": JSON.stringify({ package_name: "com.community.oneroom", version_name: "3.0.13.0325.03", version_code: 50020088, os: "android", os_version: "13", install_ch: "ps", device_id: deviceId, install_store: "ps", gaid: "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d", brand: bm.model, model: bm.brand, system_language: "en", net: "NETWORK_WIFI", region: "US", timezone: "Asia/Calcutta", sp_code: "" }),
                "x-client-status": "0"
            };
            const playResponse = JSON.parse((await http_get(playUrl, { headers })).body);
            const streams = [];
            for (const stream of playResponse?.data?.streams || []) {
                if (!stream.url) continue;
                let quality = "Auto";
                if (stream.resolutions?.includes("2160")) quality = "2160p";
                else if (stream.resolutions?.includes("1440")) quality = "1440p";
                else if (stream.resolutions?.includes("1080")) quality = "1080p";
                else if (stream.resolutions?.includes("720")) quality = "720p";
                else if (stream.resolutions?.includes("480")) quality = "480p";
                let streamType = "VIDEO";
                if (stream.url.startsWith("magnet:")) streamType = "TORRENT";
                else if (stream.url.includes(".mpd")) streamType = "DASH";
                else if (stream.url.endsWith(".m3u8") || stream.format === "HLS") streamType = "M3U8";
                streams.push(new StreamResult({ url: stream.url, quality, name: "MovieBox", source: "MovieBox", type: streamType, headers: { "Referer": BASE_URL } }));
            }
            cb({ success: true, data: streams.length > 0 ? streams : [] });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: String(e.message) }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
