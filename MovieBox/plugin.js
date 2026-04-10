(function () {
    // MovieBox – SkyStream Gen 2 Plugin
    // Ported from CloudStream Kotlin by Phisher98/NivinCNC
    // Fixed exports to match SkyStream convention

    const API_BASE = "https://api3.aoneroom.com";
    const UA_MBOX = "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)";
    const UA_ONEROOM = "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; sdk_gphone64_x86_64; Build/TQ3A.230901.001; Cronet/145.0.7582.0)";
    const PKG_MBOX = "com.community.mbox.in";
    const PKG_ONEROOM = "com.community.oneroom";
    const GAID_MBOX = "d7578036d13336cc";
    const GAID_ONEROOM = "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d";
    const TZ = "Asia/Calcutta";

    function strToBytes(s) {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
        return out;
    }

    function hexToBytes(hex) {
        const out = new Uint8Array(hex.length >>> 1);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }

    function concat(a, b) {
        const out = new Uint8Array(a.length + b.length);
        out.set(a);
        out.set(b, a.length);
        return out;
    }

    function binStrToBytes(s) {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    function b64ToBytes(b64) { return binStrToBytes(atob(b64)); }

    function bytesToBase64(bytes) {
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }

    // MD5 implementation
    function md5(input) {
        function safeAdd(x, y) { const l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
        function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
        function cmn(q, a, b, x, s, t) { return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
        function ff(a,b,c,d,x,s,t) { return cmn((b&c)|(~b&d),a,b,x,s,t); }
        function gg(a,b,c,d,x,s,t) { return cmn((b&d)|(c&~d),a,b,x,s,t); }
        function hh(a,b,c,d,x,s,t) { return cmn(b^c^d,a,b,x,s,t); }
        function ii(a,b,c,d,x,s,t) { return cmn(c^(b|~d),a,b,x,s,t); }

        const len = input.length, nb = len * 8;
        const pad = ((len + 8) >>> 6) + 1;
        const m = new Int32Array(pad * 16);
        for (let i = 0; i < len; i++) m[i >> 2] |= input[i] << ((i % 4) * 8);
        m[len >> 2] |= 0x80 << ((len % 4) * 8);
        m[pad * 16 - 2] = nb & 0xFFFFFFFF;
        m[pad * 16 - 1] = Math.floor(nb / 0x100000000);

        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let i = 0; i < m.length; i += 16) {
            const [oa,ob,oc,od] = [a,b,c,d];
            a=ff(a,b,c,d,m[i+ 0], 7,-680876936);  d=ff(d,a,b,c,m[i+ 1],12,-389564586);
            c=ff(c,d,a,b,m[i+ 2],17, 606105819);  b=ff(b,c,d,a,m[i+ 3],22,-1044525330);
            a=ff(a,b,c,d,m[i+ 4], 7,-176418897);  d=ff(d,a,b,c,m[i+ 5],12,1200080426);
            c=ff(c,d,a,b,m[i+ 6],17,-1473231341); b=ff(b,c,d,a,m[i+ 7],22,-45705983);
            a=ff(a,b,c,d,m[i+ 8], 7,1770035416);  d=ff(d,a,b,c,m[i+ 9],12,-1958414417);
            c=ff(c,d,a,b,m[i+10],17,-42063);       b=ff(b,c,d,a,m[i+11],22,-1990404162);
            a=ff(a,b,c,d,m[i+12], 7,1804603682);  d=ff(d,a,b,c,m[i+13],12,-40341101);
            c=ff(c,d,a,b,m[i+14],17,-1502002290); b=ff(b,c,d,a,m[i+15],22,1236535329);
            a=gg(a,b,c,d,m[i+ 1], 5,-165796510);  d=gg(d,a,b,c,m[i+ 6], 9,-1069501632);
            c=gg(c,d,a,b,m[i+11],14, 643717713);  b=gg(b,c,d,a,m[i+ 0],20,-373897302);
            a=gg(a,b,c,d,m[i+ 5], 5,-701558691);  d=gg(d,a,b,c,m[i+10], 9,38016083);
            c=gg(c,d,a,b,m[i+15],14,-660478335);  b=gg(b,c,d,a,m[i+ 4],20,-405537848);
            a=gg(a,b,c,d,m[i+ 9], 5, 568446438);  d=gg(d,a,b,c,m[i+14], 9,-1019803690);
            c=gg(c,d,a,b,m[i+ 3],14,-187363961);  b=gg(b,c,d,a,m[i+ 8],20,1163531501);
            a=gg(a,b,c,d,m[i+13], 5,-1444681467); d=gg(d,a,b,c,m[i+ 2], 9,-51403784);
            c=gg(c,d,a,b,m[i+ 7],14,1735328473);  b=gg(b,c,d,a,m[i+12],20,-1926607734);
            a=hh(a,b,c,d,m[i+ 5], 4,-378558);     d=hh(d,a,b,c,m[i+ 8],11,-2022574463);
            c=hh(c,d,a,b,m[i+11],16,1839030562);  b=hh(b,c,d,a,m[i+14],23,-35309556);
            a=hh(a,b,c,d,m[i+ 1], 4,-1530992060); d=hh(d,a,b,c,m[i+ 4],11,1272893353);
            c=hh(c,d,a,b,m[i+ 7],16,-155497632);  b=hh(b,c,d,a,m[i+10],23,-1094730640);
            a=hh(a,b,c,d,m[i+13], 4, 681279174);  d=hh(d,a,b,c,m[i+ 0],11,-358537222);
            c=hh(c,d,a,b,m[i+ 3],16,-722521979);  b=hh(b,c,d,a,m[i+ 6],23,76029189);
            a=hh(a,b,c,d,m[i+ 9], 4,-640364487);  d=hh(d,a,b,c,m[i+12],11,-421815835);
            c=hh(c,d,a,b,m[i+15],16, 530742520);  b=hh(b,c,d,a,m[i+ 2],23,-995338651);
            a=ii(a,b,c,d,m[i+ 0], 6,-198630844);  d=ii(d,a,b,c,m[i+ 7],10,1126891415);
            c=ii(c,d,a,b,m[i+14],15,-1416354905); b=ii(b,c,d,a,m[i+ 5],21,-57434055);
            a=ii(a,b,c,d,m[i+12], 6,1700485571);  d=ii(d,a,b,c,m[i+ 3],10,-1894986606);
            c=ii(c,d,a,b,m[i+10],15,-1051523);    b=ii(b,c,d,a,m[i+ 1],21,-2054922799);
            a=ii(a,b,c,d,m[i+ 8], 6,1873313359);  d=ii(d,a,b,c,m[i+15],10,-30611744);
            c=ii(c,d,a,b,m[i+ 6],15,-1560198380); b=ii(b,c,d,a,m[i+13],21,1309151649);
            a=ii(a,b,c,d,m[i+ 4], 6,-145523070);  d=ii(d,a,b,c,m[i+11],10,-1120210379);
            c=ii(c,d,a,b,m[i+ 2],15, 718787259);  b=ii(b,c,d,a,m[i+ 9],21,-343485551);
            a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od);
        }

        const out = new Uint8Array(16);
        [a,b,c,d].forEach((v, wi) => {
            out[wi*4]   =  v        & 0xFF;
            out[wi*4+1] = (v >>  8) & 0xFF;
            out[wi*4+2] = (v >> 16) & 0xFF;
            out[wi*4+3] = (v >> 24) & 0xFF;
        });
        return out;
    }

    function md5Hex(input) {
        const bytes = typeof input === "string" ? strToBytes(input) : input;
        return Array.from(md5(bytes)).map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function hmacMD5(keyBytes, messageBytes) {
        const BLOCK = 64;
        let k = keyBytes;
        if (k.length > BLOCK) k = md5(k);
        const pad = new Uint8Array(BLOCK);
        pad.set(k);
        const ikey = pad.map(b => b ^ 0x36);
        const okey = pad.map(b => b ^ 0x5c);
        const inner = md5(concat(ikey, messageBytes));
        return md5(concat(okey, inner));
    }

    const SECRET_DEFAULT = b64ToBytes(atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw=="));
    const SECRET_ALT     = b64ToBytes(atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ=="));

    function generateDeviceId() {
        let s = "";
        for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
        return s;
    }
    const DEVICE_ID = generateDeviceId();

    const BRANDS = {
        Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
        Xiaomi:  ["2201117TI", "M2012K11AI", "Redmi Note 11"],
        OnePlus: ["LE2111", "CPH2449", "IN2023"],
        Google:  ["Pixel 6", "Pixel 7", "Pixel 8"],
        Realme:  ["RMX3085", "RMX3360", "RMX3551"],
    };

    function randomBM() {
        const keys = Object.keys(BRANDS);
        const brand = keys[Math.floor(Math.random() * keys.length)];
        const models = BRANDS[brand];
        return { brand, model: models[Math.floor(Math.random() * models.length)] };
    }

    function makeXClientToken() {
        const ts = Date.now().toString();
        const rev = ts.split("").reverse().join("");
        return ts + "," + md5Hex(strToBytes(rev));
    }

    function buildCanonical(method, accept, contentType, url, body, timestamp) {
        const qIdx = url.indexOf("?");
        let path = url;
        const protocolEnd = url.indexOf("//");
        if (protocolEnd !== -1) {
            const hostEnd = url.indexOf("/", protocolEnd + 2);
            if (hostEnd !== -1) path = url.slice(hostEnd);
            else path = "/";
        }
        if (qIdx !== -1) path = path.substring(0, path.indexOf("?"));
        const qs = qIdx === -1 ? "" : url.slice(qIdx + 1);
        let canonicalUrl = path;
        if (qs) {
            const pairs = qs.split("&").map(function(p) {
                const eq = p.indexOf("=");
                return [p.slice(0, eq), p.slice(eq + 1)];
            });
            pairs.sort(function(a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
            canonicalUrl = path + "?" + pairs.map(function(pair) {
                return pair[0] + "=" + decodeURIComponent(pair[1]);
            }).join("&");
        }
        let bodyHash = "";
        let bodyLength = "";
        if (body != null) {
            const bb = strToBytes(body);
            const trimmed = bb.length > 102400 ? bb.slice(0, 102400) : bb;
            bodyHash = md5Hex(trimmed);
            bodyLength = bb.length.toString();
        }
        return method.toUpperCase() + "\n" + (accept || "") + "\n" + (contentType || "") + "\n" + bodyLength + "\n" + timestamp.toString() + "\n" + bodyHash + "\n" + canonicalUrl;
    }

    function makeXTrSignature(method, accept, contentType, url, body, useAlt) {
        const ts = Date.now();
        const canonical = buildCanonical(method, accept, contentType, url, body, ts);
        const key = useAlt ? SECRET_ALT : SECRET_DEFAULT;
        const sig = hmacMD5(key, strToBytes(canonical));
        return ts + "|2|" + bytesToBase64(sig);
    }

    function makeClientInfo(pkg, vn, vc, region, gaid, bm, extra) {
        return JSON.stringify(Object.assign({
            package_name: pkg, version_name: vn, version_code: vc,
            os: "android", os_version: region === "IN" ? "16" : "13",
            device_id: DEVICE_ID, install_store: "ps", gaid,
            brand: bm.brand, model: bm.model,
            system_language: "en", net: "NETWORK_WIFI",
            region: region, timezone: TZ, sp_code: "",
        }, extra || {}));
    }

    function getHeaders(url) {
        const bm = randomBM();
        return {
            "user-agent": UA_MBOX,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": makeXClientToken(),
            "x-tr-signature": makeXTrSignature("GET", "application/json", "application/json", url),
            "x-client-info": makeClientInfo(PKG_MBOX, "3.0.03.0529.03", 50020042, "IN", GAID_MBOX, bm),
            "x-client-status": "0",
            "x-play-mode": "2",
        };
    }

    function postHeaders(url, body) {
        const bm = randomBM();
        return {
            "user-agent": UA_MBOX,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": makeXClientToken(),
            "x-tr-signature": makeXTrSignature("POST", "application/json", "application/json; charset=utf-8", url, body),
            "x-client-info": makeClientInfo(PKG_MBOX, "3.0.03.0529.03", 50020042, "IN", GAID_MBOX, bm),
            "x-client-status": "0",
            "x-play-mode": "2",
        };
    }

    function playHeaders(url, token) {
        const bm = randomBM();
        const extra = { install_ch: "ps", "X-Play-Mode": "1", "X-Idle-Data": "1", "X-Family-Mode": "0", "X-Content-Mode": "0" };
        return {
            "Authorization": "Bearer " + (token || ""),
            "user-agent": UA_ONEROOM,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": makeXClientToken(),
            "x-tr-signature": makeXTrSignature("GET", "application/json", "application/json", url),
            "x-client-info": makeClientInfo(PKG_ONEROOM, "3.0.13.0325.03", 50020088, "US", GAID_ONEROOM, { brand: bm.model, model: bm.brand }, extra),
            "x-client-status": "0",
        };
    }

    async function apiGet(url) {
        const res = await http_get(url, getHeaders(url));
        if (res.status !== 200) throw new Error("GET " + res.status + ": " + url);
        return JSON.parse(res.body);
    }

    async function apiPost(url, body) {
        const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
        const res = await http_post(url, postHeaders(url, bodyStr), bodyStr);
        if (res.status !== 200) throw new Error("POST " + res.status + ": " + url);
        return JSON.parse(res.body);
    }

    function topQuality(s) {
        for (const q of ["2160", "1440", "1080", "720", "480", "360", "240"]) {
            if ((s || "").includes(q)) return q + "p";
        }
        return "Auto";
    }

    function subjectTypeStr(n) { return (n === 2 || n === 7) ? "series" : "movie"; }

    function mapItem(item) {
        if (!item) return null;
        const title = (item.title || "").split("[")[0].trim();
        const id = item.subjectId;
        if (!title || !id) return null;
        return new MultimediaItem({
            title,
            url: id,
            posterUrl: item.cover && item.cover.url ? item.cover.url : undefined,
            type: subjectTypeStr(item.subjectType || 1),
            score: parseFloat(item.imdbRatingValue) || undefined,
        });
    }

    function parseDuration(dur) {
        if (!dur) return undefined;
        const m = /(\d+)h\s*(\d+)m/.exec(dur);
        if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
        const v = parseInt(dur.replace("m", "").trim());
        return isNaN(v) ? undefined : v;
    }

    const HOME_CATS = [
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
        { data: "1|1006", name: "Anime (All)" },
        { data: "1|1;country=India", name: "Indian Movies" },
        { data: "1|2;country=India", name: "Indian Series" },
        { data: "1|1;classify=Hindi dub;country=United States", name: "USA Movies" },
        { data: "1|2;classify=Hindi dub;country=United States", name: "USA Series" },
        { data: "1|1;country=Japan", name: "Japan Movies" },
        { data: "1|2;country=Japan", name: "Japan Series" },
        { data: "1|1;country=Korea", name: "Korean Movies" },
        { data: "1|2;country=Korea", name: "Korean Series" },
        { data: "1|1;country=China", name: "China Movies" },
        { data: "1|2;country=China", name: "China Series" },
        { data: "1|1;country=Nigeria", name: "Nollywood Movies" },
        { data: "1|2;country=Nigeria", name: "Nollywood Series" },
        { data: "1|1;classify=Hindi dub;genre=Action", name: "Action Movies" },
        { data: "1|1;classify=Hindi dub;genre=Crime", name: "Crime Movies" },
        { data: "1|1;classify=Hindi dub;genre=Comedy", name: "Comedy Movies" },
        { data: "1|1;classify=Hindi dub;genre=Romance", name: "Romance Movies" },
        { data: "1|2;classify=Hindi dub;genre=Crime", name: "Crime Series" },
        { data: "1|2;classify=Hindi dub;genre=Comedy", name: "Comedy Series" },
        { data: "1|2;classify=Hindi dub;genre=Romance", name: "Romance Series" },
    ];

    async function getHome(cb) {
        try {
            const PER_PAGE = 15;
            const results = {};
            await Promise.all(HOME_CATS.map(async function(cat) {
                const catData = cat.data;
                const catName = cat.name;
                try {
                    let items = [];
                    if (catData.includes("|")) {
                        const url = API_BASE + "/wefeed-mobile-bff/subject-api/list";
                        const mainPart = catData.split(";")[0];
                        const pipeIdx = mainPart.indexOf("|");
                        const channelId = pipeIdx === -1 ? "" : mainPart.slice(pipeIdx + 1);
                        const pg = mainPart.split("|")[0] || "1";
                        const options = {};
                        catData.split(";").forEach(function(part) {
                            const kv = part.split("=");
                            if (kv[0] && kv[1]) options[kv[0]] = kv[1];
                        });
                        const body = {
                            page: parseInt(pg),
                            perPage: PER_PAGE,
                            channelId: channelId,
                            classify: options.classify || "All",
                            country: options.country || "All",
                            year: options.year || "All",
                            genre: options.genre || "All",
                            sort: options.sort || "ForYou"
                        };
                        const data = await apiPost(url, body);
                        items = (data.data && (data.data.items || data.data.subjects) || []).map(mapItem).filter(Boolean);
                    } else {
                        const url = API_BASE + "/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=" + catData + "&page=1&perPage=" + PER_PAGE;
                        const data = await apiGet(url);
                        items = (data.data && (data.data.items || data.data.subjects) || []).map(mapItem).filter(Boolean);
                    }
                    results[catName] = items;
                } catch (e) {
                    results[catName] = [];
                }
            }));
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const url = API_BASE + "/wefeed-mobile-bff/subject-api/search/v2";
            const body = { page: 1, perPage: 20, keyword: query };
            const data = await apiPost(url, body);
            const results = [];
            const hits = data.data && data.data.results || [];
            for (let i = 0; i < hits.length; i++) {
                const result = hits[i];
                const subjects = result.subjects || [];
                for (let j = 0; j < subjects.length; j++) {
                    const subject = subjects[j];
                    const title = (subject.title || "").split("[")[0].trim();
                    const id = subject.subjectId || "";
                    if (!title || !id) continue;
                    results.push(new MultimediaItem({
                        title: title,
                        url: id,
                        posterUrl: subject.cover && subject.cover.url,
                        type: subject.subjectType === 2 ? "series" : "movie",
                        score: parseFloat(subject.imdbRatingValue) || undefined
                    }));
                }
            }
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const id = url.includes("subjectId=") ? url.split("subjectId=")[1].split("&")[0] : url.split("/").pop();
            const finalUrl = API_BASE + "/wefeed-mobile-bff/subject-api/get?subjectId=" + id;
            const data = await apiGet(finalUrl);
            const item = data.data || {};
            const title = (item.title || "").split("[")[0].trim();
            const multimedia = new MultimediaItem({
                title: title,
                url: id,
                posterUrl: item.cover && item.cover.url,
                type: subjectTypeStr(item.subjectType || 1),
                year: item.releaseDate ? parseInt(item.releaseDate.substring(0, 4)) : undefined,
                description: item.description || "",
                duration: parseDuration(item.duration),
                genres: item.genre ? item.genre.split(",").map(function(g){return g.trim();}) : [],
                score: parseFloat(item.imdbRatingValue) || undefined,
                actors: (item.staffList || []).filter(function(s){return s.staffType === 1;})
                    .map(function(s){ return new Actor({ name: s.name, image: s.avatarUrl, role: s.character }); })
            });
            cb({ success: true, data: multimedia });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const id = url;
            const tokenUrl = API_BASE + "/wefeed-mobile-bff/subject-api/play";
            const playBody = { subjectId: id, playMode: 1, quality: "auto" };
            const tokenRes = await http_post(tokenUrl, playHeaders(tokenUrl, ""), JSON.stringify(playBody));
            const playData = JSON.parse(tokenRes.body);

            const streams = [];
            const sources = playData.data && (playData.data.sources || playData.data.playUrls) || [];
            for (let i = 0; i < sources.length; i++) {
                const src = sources[i];
                const streamUrl = src.url || src.playUrl;
                if (!streamUrl) continue;
                const quality = topQuality(src.quality || src.label || streamUrl);
                const audioLang = src.audioLang || src.language || src.lang || "Unknown";
                const provider = "MovieBox";
                const label = provider + " (" + audioLang + " Audio) " + quality;
                streams.push(new StreamResult({
                    name: label,
                    url: streamUrl,
                    source: provider,
                    quality: quality,
                    headers: { "User-Agent": UA_ONEROOM, "Referer": API_BASE },
                    subtitles: (playData.data && playData.data.subtitles || []).map(function(sub){
                        return { url: sub.url, label: sub.label || sub.lang, lang: sub.lang || "en" };
                    })
                }));
            }
            if (streams.length === 0 && playData.data && playData.data.directUrl) {
                streams.push(new StreamResult({
                    name: "MovieBox (Direct) " + topQuality(playData.data.directUrl),
                    url: playData.data.directUrl,
                    source: "MovieBox"
                }));
            }
            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    // EXPORT TO SKYSTREAM - Direct export pattern (FIXED)
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
