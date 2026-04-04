(function () {
    // ─────────────────────────────────────────────────────────────────────────────
    //  MovieBox SkyStream Plugin
    //  Source: MovieBoxProvider (CloudStream / Kotlin) by NivinCNC / CNCVerse
    //  Converted to: SkyStream Gen 2 JavaScript plugin
    //
    //  Concept mapping
    //  ───────────────────────────────────────────────────────────────
    //  Kotlin MainAPI class          → IIFE module (plugin.js)
    //  mainUrl / companion object    → manifest.baseUrl (injected at runtime)
    //  getMainPage()                 → getHome(cb)
    //  search()                      → search(query, cb)
    //  load()                        → load(url, cb)
    //  loadLinks()                   → loadStreams(dataStr, cb)
    //  newMovieSearchResponse()      → new MultimediaItem({ type:"movie" })
    //  newTvSeriesLoadResponse()     → new MultimediaItem({ type:"series", episodes:[…] })
    //  newEpisode()                  → new Episode({…})
    //  newExtractorLink()            → new StreamResult({…})
    //  newSubtitleFile()             → subtitle object in StreamResult.subtitles
    //  base64Decode(…)               → atob(…)
    //  HmacMD5 / MD5                → crypto helpers below (pure JS)
    //  app.get / app.post            → http_get / http_post (SkyStream globals)
    // ─────────────────────────────────────────────────────────────────────────────

    // ── Constants ────────────────────────────────────────────────────────────────

    const API_BASE   = "https://api3.aoneroom.com";          // mainUrl (never changes – base URL mirrors can override via manifest)
    const UA_MBOX    = "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)";
    const UA_ONEROOM = "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; sdk_gphone64_x86_64; Build/TQ3A.230901.001; Cronet/145.0.7582.0)";
    const PKG_MBOX    = "com.community.mbox.in";
    const PKG_ONEROOM = "com.community.oneroom";
    const GAID_MBOX    = "d7578036d13336cc";
    const GAID_ONEROOM = "1b2212c1-dadf-43c3-a0c8-bd6ce48ae22d";
    const REGION_IN  = "IN";
    const REGION_US  = "US";
    const TZ         = "Asia/Calcutta";

    // Decoded once from base64:
    //   secretKeyDefault = base64Decode("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==")
    //   secretKeyAlt     = base64Decode("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==")
    const SECRET_KEY_DEFAULT = atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
    const SECRET_KEY_ALT     = atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==");

    // Home categories  (maps categoryType-id  →  label;  pipe-delimited entries = list API)
    const HOME_CATEGORIES = [
        { data: "4516404531735022304", name: "Trending" },
        { data: "5692654647815587592", name: "Trending in Cinema" },
        { data: "414907768299210008",  name: "Bollywood" },
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
        { data: "1|1",                             name: "Movies" },
        { data: "1|2",                             name: "Series" },
        { data: "1|1006",                          name: "Anime (All)" },
        { data: "1|1;country=India",               name: "Indian Movies" },
        { data: "1|2;country=India",               name: "Indian Series" },
        { data: "1|1;classify=Hindi dub;country=United States", name: "USA Movies" },
        { data: "1|2;classify=Hindi dub;country=United States", name: "USA Series" },
        { data: "1|1;country=Japan",               name: "Japan Movies" },
        { data: "1|2;country=Japan",               name: "Japan Series" },
        { data: "1|1;country=Korea",               name: "Korean Movies" },
        { data: "1|2;country=Korea",               name: "Korean Series" },
        { data: "1|1;country=China",               name: "China Movies" },
        { data: "1|2;country=China",               name: "China Series" },
        { data: "1|1;country=Nigeria",             name: "Nollywood Movies" },
        { data: "1|2;country=Nigeria",             name: "Nollywood Series" },
        { data: "1|1;classify=Hindi dub;genre=Action",  name: "Action Movies" },
        { data: "1|1;classify=Hindi dub;genre=Crime",   name: "Crime Movies" },
        { data: "1|1;classify=Hindi dub;genre=Comedy",  name: "Comedy Movies" },
        { data: "1|1;classify=Hindi dub;genre=Romance", name: "Romance Movies" },
        { data: "1|2;classify=Hindi dub;genre=Crime",   name: "Crime Series" },
        { data: "1|2;classify=Hindi dub;genre=Comedy",  name: "Comedy Series" },
        { data: "1|2;classify=Hindi dub;genre=Romance", name: "Romance Series" },
    ];

    // ── Pure-JS crypto helpers (MD5 + HmacMD5) ──────────────────────────────────
    // Required because SkyStream sandbox does not expose Node's `crypto` module.
    // Only md5() and hmacMD5() are needed.

    function md5(input) {
        // input: Uint8Array or string
        const bytes = typeof input === "string" ? strToBytes(input) : input;
        return _md5hex(bytes);
    }

    function hmacMD5(keyBytes, messageBytes) {
        // Returns raw bytes (Uint8Array)
        const BLOCK = 64;
        let k = keyBytes.length > BLOCK ? hexToBytes(_md5hex(keyBytes)) : keyBytes;
        const kPad = new Uint8Array(BLOCK);
        kPad.set(k);
        const ipad = kPad.map(b => b ^ 0x36);
        const opad = kPad.map(b => b ^ 0x5c);
        const inner = concat(ipad, messageBytes);
        const innerHash = hexToBytes(_md5hex(inner));
        return hexToBytes(_md5hex(concat(opad, innerHash)));
    }

    // ── Low-level MD5 ────────────────────────────────────────────────────────────
    function _md5hex(bytes) {
        let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
        const msg = _md5Pad(bytes);
        const words = new Uint32Array(msg.buffer);
        const S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
                   5, 9,14,20, 5, 9,14,20, 5, 9,14,20, 5, 9,14,20,
                   4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
                   6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
        const T = new Uint32Array(64);
        for (let i = 0; i < 64; i++) T[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
        for (let i = 0; i < words.length; i += 16) {
            let aa = a, bb = b, cc = c, dd = d;
            for (let j = 0; j < 64; j++) {
                let f, g;
                if (j < 16)      { f = (b & c) | (~b & d);   g = j; }
                else if (j < 32) { f = (d & b) | (~d & c);   g = (5*j+1)%16; }
                else if (j < 48) { f = b ^ c ^ d;             g = (3*j+5)%16; }
                else             { f = c ^ (b | ~d);          g = (7*j)%16; }
                const tmp = d;
                d = c; c = b;
                const x = (aa + f + words[i + g] + T[j]) >>> 0;
                const rot = S[j];
                b = (b + ((x << rot) | (x >>> (32 - rot)))) >>> 0;
                aa = tmp;
            }
            a = (a + aa) >>> 0; b = (b + bb) >>> 0;
            c = (c + cc) >>> 0; d = (d + dd) >>> 0;
        }
        return [a, b, c, d].map(v => {
            const h = v.toString(16).padStart(8, "0");
            return h.replace(/../g, m => m[1] + m[0]).replace(/../g, m => m[1] + m[0]);
        }).join("").replace(/(..)(..)(..)(..)/g, (_, a, b, c, d) => {
            // already in little-endian words – just format per byte
            return _;
        });
    }

    // Proper little-endian MD5
    function _md5hex2(data) {
        // data: Uint8Array
        function safeAdd(x, y) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xFFFF); }
        function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
        function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
        function md5ff(a,b,c,d,x,s,t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
        function md5gg(a,b,c,d,x,s,t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function md5hh(a,b,c,d,x,s,t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
        function md5ii(a,b,c,d,x,s,t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

        const len8 = data.length;
        const nBits = len8 * 8;
        const nPadded = ((len8 + 8) >>> 6) + 1;
        const m = new Int32Array(nPadded * 16);
        for (let i = 0; i < len8; i++) m[i >> 2] |= data[i] << ((i % 4) * 8);
        m[len8 >> 2] |= 0x80 << ((len8 % 4) * 8);
        m[nPadded * 16 - 2] = nBits & 0xFFFFFFFF;
        m[nPadded * 16 - 1] = Math.floor(nBits / 0x100000000);

        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let i = 0; i < m.length; i += 16) {
            const [oa,ob,oc,od] = [a,b,c,d];
            a=md5ff(a,b,c,d,m[i+0],7,-680876936);  d=md5ff(d,a,b,c,m[i+1],12,-389564586);
            c=md5ff(c,d,a,b,m[i+2],17,606105819);  b=md5ff(b,c,d,a,m[i+3],22,-1044525330);
            a=md5ff(a,b,c,d,m[i+4],7,-176418897);  d=md5ff(d,a,b,c,m[i+5],12,1200080426);
            c=md5ff(c,d,a,b,m[i+6],17,-1473231341); b=md5ff(b,c,d,a,m[i+7],22,-45705983);
            a=md5ff(a,b,c,d,m[i+8],7,1770035416);  d=md5ff(d,a,b,c,m[i+9],12,-1958414417);
            c=md5ff(c,d,a,b,m[i+10],17,-42063); b=md5ff(b,c,d,a,m[i+11],22,-1990404162);
            a=md5ff(a,b,c,d,m[i+12],7,1804603682); d=md5ff(d,a,b,c,m[i+13],12,-40341101);
            c=md5ff(c,d,a,b,m[i+14],17,-1502002290); b=md5ff(b,c,d,a,m[i+15],22,1236535329);
            a=md5gg(a,b,c,d,m[i+1],5,-165796510);  d=md5gg(d,a,b,c,m[i+6],9,-1069501632);
            c=md5gg(c,d,a,b,m[i+11],14,643717713); b=md5gg(b,c,d,a,m[i+0],20,-373897302);
            a=md5gg(a,b,c,d,m[i+5],5,-701558691);  d=md5gg(d,a,b,c,m[i+10],9,38016083);
            c=md5gg(c,d,a,b,m[i+15],14,-660478335); b=md5gg(b,c,d,a,m[i+4],20,-405537848);
            a=md5gg(a,b,c,d,m[i+9],5,568446438);   d=md5gg(d,a,b,c,m[i+14],9,-1019803690);
            c=md5gg(c,d,a,b,m[i+3],14,-187363961); b=md5gg(b,c,d,a,m[i+8],20,1163531501);
            a=md5gg(a,b,c,d,m[i+13],5,-1444681467); d=md5gg(d,a,b,c,m[i+2],9,-51403784);
            c=md5gg(c,d,a,b,m[i+7],14,1735328473); b=md5gg(b,c,d,a,m[i+12],20,-1926607734);
            a=md5hh(a,b,c,d,m[i+5],4,-378558);      d=md5hh(d,a,b,c,m[i+8],11,-2022574463);
            c=md5hh(c,d,a,b,m[i+11],16,1839030562); b=md5hh(b,c,d,a,m[i+14],23,-35309556);
            a=md5hh(a,b,c,d,m[i+1],4,-1530992060); d=md5hh(d,a,b,c,m[i+4],11,1272893353);
            c=md5hh(c,d,a,b,m[i+7],16,-155497632); b=md5hh(b,c,d,a,m[i+10],23,-1094730640);
            a=md5hh(a,b,c,d,m[i+13],4,681279174);  d=md5hh(d,a,b,c,m[i+0],11,-358537222);
            c=md5hh(c,d,a,b,m[i+3],16,-722521979); b=md5hh(b,c,d,a,m[i+6],23,76029189);
            a=md5hh(a,b,c,d,m[i+9],4,-640364487);  d=md5hh(d,a,b,c,m[i+12],11,-421815835);
            c=md5hh(c,d,a,b,m[i+15],16,530742520); b=md5hh(b,c,d,a,m[i+2],23,-995338651);
            a=md5ii(a,b,c,d,m[i+0],6,-198630844);  d=md5ii(d,a,b,c,m[i+7],10,1126891415);
            c=md5ii(c,d,a,b,m[i+14],15,-1416354905); b=md5ii(b,c,d,a,m[i+5],21,-57434055);
            a=md5ii(a,b,c,d,m[i+12],6,1700485571); d=md5ii(d,a,b,c,m[i+3],10,-1894986606);
            c=md5ii(c,d,a,b,m[i+10],15,-1051523);  b=md5ii(b,c,d,a,m[i+1],21,-2054922799);
            a=md5ii(a,b,c,d,m[i+8],6,1873313359);  d=md5ii(d,a,b,c,m[i+15],10,-30611744);
            c=md5ii(c,d,a,b,m[i+6],15,-1560198380); b=md5ii(b,c,d,a,m[i+13],21,1309151649);
            a=md5ii(a,b,c,d,m[i+4],6,-145523070);  d=md5ii(d,a,b,c,m[i+11],10,-1120210379);
            c=md5ii(c,d,a,b,m[i+2],15,718787259);  b=md5ii(b,c,d,a,m[i+9],21,-343485551);
            a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od);
        }
        const res = new Uint8Array(16);
        [a,b,c,d].forEach((v,i) => {
            res[i*4]   = v & 0xFF;
            res[i*4+1] = (v >> 8) & 0xFF;
            res[i*4+2] = (v >> 16) & 0xFF;
            res[i*4+3] = (v >> 24) & 0xFF;
        });
        return Array.from(res).map(b => b.toString(16).padStart(2,"0")).join("");
    }

    // Properly replace the broken md5 with _md5hex2
    // (We keep _md5hex as alias for readability throughout the rest of the code)
    function md5Hex(input) {
        const bytes = typeof input === "string" ? strToBytes(input) : input;
        return _md5hex2(bytes);
    }

    function hmacMD5Bytes(keyStr, messageBytes) {
        const BLOCK = 64;
        let k = strToBytes(keyStr);
        if (k.length > BLOCK) k = hexToBytes(_md5hex2(k));
        const kPad = new Uint8Array(BLOCK);
        kPad.set(k);
        const ipad = kPad.map(b => b ^ 0x36);
        const opad = kPad.map(b => b ^ 0x5c);
        const innerHash = hexToBytes(_md5hex2(concat(ipad, messageBytes)));
        return _md5hex2(concat(opad, innerHash));
    }

    // ── Byte / string utilities ──────────────────────────────────────────────────
    function strToBytes(s) {
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
        return out;
    }
    function hexToBytes(hex) {
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
        return out;
    }
    function concat(a, b) {
        const out = new Uint8Array(a.length + b.length);
        out.set(a, 0);
        out.set(b, a.length);
        return out;
    }
    function bytesToBase64(bytes) {
        let s = "";
        for (const b of bytes) s += String.fromCharCode(b);
        return btoa(s);
    }
    function _md5Pad(data) {
        // kept only as an internal shim – unused after switch to _md5hex2
        return data;
    }

    // ── Device ID (generated once per session) ────────────────────────────────────
    function generateDeviceId() {
        let id = "";
        const chars = "0123456789abcdef";
        for (let i = 0; i < 32; i++) id += chars[Math.floor(Math.random() * 16)];
        return id;
    }
    const DEVICE_ID = generateDeviceId();

    // ── Random brand/model ────────────────────────────────────────────────────────
    const BRAND_MODELS = {
        Samsung: ["SM-S918B", "SM-A528B", "SM-M336B"],
        Xiaomi:  ["2201117TI", "M2012K11AI", "Redmi Note 11"],
        OnePlus: ["LE2111", "CPH2449", "IN2023"],
        Google:  ["Pixel 6", "Pixel 7", "Pixel 8"],
        Realme:  ["RMX3085", "RMX3360", "RMX3551"],
    };
    function randomBrandModel() {
        const brands = Object.keys(BRAND_MODELS);
        const brand = brands[Math.floor(Math.random() * brands.length)];
        const models = BRAND_MODELS[brand];
        const model = models[Math.floor(Math.random() * models.length)];
        return { brand, model };
    }

    // ── Auth token generation (mirrors Kotlin exactly) ────────────────────────────
    //  generateXClientToken: "$timestamp,$md5(reversed($timestamp))"
    function generateXClientToken() {
        const ts = Date.now().toString();
        const reversed = ts.split("").reverse().join("");
        const hash = md5Hex(reversed);
        return `${ts},${hash}`;
    }

    //  buildCanonicalString: mirrors Kotlin buildCanonicalString()
    function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
        const parsed = new URL(url);
        const path = parsed.pathname;

        let query = "";
        const paramNames = [...parsed.searchParams.keys()].sort();
        if (paramNames.length > 0) {
            query = paramNames
                .map(k => parsed.searchParams.getAll(k).map(v => `${k}=${v}`).join("&"))
                .join("&");
        }
        const canonicalUrl = query ? `${path}?${query}` : path;

        let bodyHash = "";
        let bodyLength = "";
        if (body != null) {
            const bodyBytes = strToBytes(body);
            const trimmed = bodyBytes.length > 102400 ? bodyBytes.slice(0, 102400) : bodyBytes;
            bodyHash = md5Hex(trimmed);
            bodyLength = bodyBytes.length.toString();
        }

        return [
            method.toUpperCase(),
            accept  || "",
            contentType || "",
            bodyLength,
            timestamp.toString(),
            bodyHash,
            canonicalUrl,
        ].join("\n");
    }

    //  generateXTrSignature: mirrors Kotlin generateXTrSignature()
    function generateXTrSignature(method, accept, contentType, url, body, useAltKey) {
        const timestamp = Date.now();
        const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
        const secretKey = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
        const sig = hmacMD5Bytes(secretKey, strToBytes(canonical));
        const sigB64 = bytesToBase64(hexToBytes(sig));
        return `${timestamp}|2|${sigB64}`;
    }

    // ── Header factories ──────────────────────────────────────────────────────────
    function makeClientInfo(pkg, versionName, versionCode, region, gaid, bm) {
        return JSON.stringify({
            package_name: pkg,
            version_name: versionName,
            version_code: versionCode,
            os: "android",
            os_version: region === REGION_IN ? "16" : "13",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: gaid,
            brand: bm.brand,
            model: bm.model,
            system_language: "en",
            net: "NETWORK_WIFI",
            region,
            timezone: TZ,
            sp_code: "",
        });
    }

    function postHeaders(url, body) {
        const bm = randomBrandModel();
        const xct = generateXClientToken();
        const xts = generateXTrSignature("POST", "application/json", "application/json; charset=utf-8", url, body);
        return {
            "user-agent": UA_MBOX,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xct,
            "x-tr-signature": xts,
            "x-client-info": makeClientInfo(PKG_MBOX, "3.0.03.0529.03", 50020042, REGION_IN, GAID_MBOX, bm),
            "x-client-status": "0",
        };
    }

    function getHeaders(url) {
        const bm = randomBrandModel();
        const xct = generateXClientToken();
        const xts = generateXTrSignature("GET", "application/json", "application/json", url);
        return {
            "user-agent": UA_MBOX,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xct,
            "x-tr-signature": xts,
            "x-client-info": makeClientInfo(PKG_MBOX, "3.0.03.0529.03", 50020042, REGION_IN, GAID_MBOX, bm),
            "x-client-status": "0",
            "x-play-mode": "2",
        };
    }

    function playHeaders(url, token) {
        const bm = randomBrandModel();
        const xct = generateXClientToken();
        const xts = generateXTrSignature("GET", "application/json", "application/json", url);
        const info = {
            package_name: PKG_ONEROOM,
            version_name: "3.0.13.0325.03",
            version_code: 50020088,
            os: "android",
            os_version: "13",
            install_ch: "ps",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: GAID_ONEROOM,
            brand: bm.model,
            model: bm.brand,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: REGION_US,
            timezone: TZ,
            sp_code: "",
            "X-Play-Mode": "1",
            "X-Idle-Data": "1",
            "X-Family-Mode": "0",
            "X-Content-Mode": "0",
        };
        return {
            "Authorization": `Bearer ${token || ""}`,
            "user-agent": UA_ONEROOM,
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xct,
            "x-tr-signature": xts,
            "x-client-info": JSON.stringify(info),
            "x-client-status": "0",
        };
    }

    function subHeaders(url, token, bm) {
        const xct = generateXClientToken();
        const xts = generateXTrSignature("GET", "", "", url);
        const info = {
            package_name: PKG_ONEROOM,
            version_name: "3.0.13.0325.03",
            version_code: 50020088,
            os: "android",
            os_version: "13",
            install_ch: "ps",
            device_id: DEVICE_ID,
            install_store: "ps",
            gaid: GAID_ONEROOM,
            brand: bm.model,
            model: bm.brand,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: REGION_US,
            timezone: TZ,
            sp_code: "",
            "X-Play-Mode": "1",
            "X-Idle-Data": "1",
            "X-Family-Mode": "0",
            "X-Content-Mode": "0",
        };
        return {
            "Authorization": `Bearer ${token || ""}`,
            "user-agent": UA_ONEROOM,
            "Accept": "",
            "x-client-info": JSON.stringify(info),
            "X-Client-Status": "0",
            "Content-Type": "",
            "X-Client-Token": xct,
            "x-tr-signature": xts,
        };
    }

    // ── Quality helper ────────────────────────────────────────────────────────────
    function getHighestQuality(resolutionsStr) {
        const s = resolutionsStr || "";
        for (const q of ["2160", "1440", "1080", "720", "480", "360", "240"]) {
            if (s.includes(q)) return q + "p";
        }
        return "Auto";
    }

    function inferStreamType(url, format) {
        if (!url) return "hls";
        const u = url.toLowerCase();
        const f = (format || "").toLowerCase();
        if (u.startsWith("magnet:")) return "magnet";
        if (u.includes(".mpd")) return "dash";
        if (u.endsWith(".torrent")) return "torrent";
        if (f === "hls" || u.endsWith(".m3u8") || u.includes(".m3u8")) return "hls";
        if (u.includes(".mp4") || u.includes(".mkv")) return "mp4";
        return "hls";
    }

    // ── Item builder ──────────────────────────────────────────────────────────────
    function subjectTypeToStr(n) {
        return (n === 2 || n === 7) ? "series" : "movie";
    }

    function mapItem(item) {
        if (!item) return null;
        const title = (item.title || "").split("[")[0].trim();
        const id    = item.subjectId;
        if (!title || !id) return null;
        const poster = item.cover && item.cover.url ? item.cover.url : undefined;
        const type   = subjectTypeToStr(item.subjectType || 1);
        const score  = parseFloat(item.imdbRatingValue) || undefined;
        return new MultimediaItem({ title, url: id, posterUrl: poster, type, score });
    }

    // ── Duration parser ────────────────────────────────────────────────────────────
    function parseDuration(dur) {
        if (!dur) return undefined;
        const m = /(\d+)h\s*(\d+)m/.exec(dur);
        if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
        const plain = parseInt(dur.replace("m", "").trim());
        return isNaN(plain) ? undefined : plain;
    }

    // ── HTTP wrappers ─────────────────────────────────────────────────────────────
    // SkyStream provides global http_get(url, headers) and http_post(url, headers, body)
    async function apiGet(url) {
        const h = getHeaders(url);
        const res = await http_get(url, h);
        if (res.status !== 200) throw new Error(`GET ${url} => ${res.status}`);
        return JSON.parse(res.body);
    }

    async function apiPost(url, body) {
        const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
        const h = postHeaders(url, bodyStr);
        const res = await http_post(url, h, bodyStr);
        if (res.status !== 200) throw new Error(`POST ${url} => ${res.status}`);
        return JSON.parse(res.body);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  getHome  →  getMainPage()
    //  Builds every category in HOME_CATEGORIES.
    //  "Trending" goes first so SkyStream promotes it to the Hero Carousel.
    // ─────────────────────────────────────────────────────────────────────────────
    async function getHome(cb) {
        try {
            const results = {};
            const PAGE = 1;
            const PER_PAGE = 15;

            await Promise.all(HOME_CATEGORIES.map(async ({ data: catData, name: catName }) => {
                try {
                    let items = [];

                    if (catData.includes("|")) {
                        // List API  (POST)
                        const url  = `${API_BASE}/wefeed-mobile-bff/subject-api/list`;

                        // Parse "pg|channelId;key=val;…"
                        const mainPart = catData.split(";")[0];
                        const [pgStr, channelId] = mainPart.split("|");
                        const pg = parseInt(pgStr) || 1;

                        const options = {};
                        catData.split(";").slice(1).forEach(seg => {
                            const [k, v] = seg.split("=");
                            if (k && v) options[k] = v;
                        });

                        const classify = options["classify"] || "All";
                        const country  = options["country"]  || "All";
                        const year     = options["year"]     || "All";
                        const genre    = options["genre"]    || "All";
                        const sort     = options["sort"]     || "ForYou";

                        const body = JSON.stringify({
                            page: pg, perPage: PER_PAGE, channelId,
                            classify, country, year, genre, sort,
                        });

                        const json = await apiPost(url, body);
                        const raw  = (json.data && (json.data.items || json.data.subjects)) || [];
                        items = raw.map(mapItem).filter(Boolean);

                    } else {
                        // Ranking API  (GET)
                        const url = `${API_BASE}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${encodeURIComponent(catData)}&page=${PAGE}&perPage=${PER_PAGE}`;
                        const json = await apiGet(url);
                        const raw  = (json.data && (json.data.items || json.data.subjects)) || [];
                        items = raw.map(mapItem).filter(Boolean);
                    }

                    if (items.length > 0) results[catName] = items;
                } catch (_) {
                    // skip failing category silently
                }
            }));

            // Ensure Trending is first so it becomes the Hero Carousel
            const ordered = {};
            if (results["Trending"]) ordered["Trending"] = results["Trending"];
            for (const k of Object.keys(results)) {
                if (k !== "Trending") ordered[k] = results[k];
            }

            cb({ success: true, data: ordered });
        } catch (e) {
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  search  →  search()
    //  POST /wefeed-mobile-bff/subject-api/search/v2
    // ─────────────────────────────────────────────────────────────────────────────
    async function search(query, cb) {
        try {
            const url  = `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;
            const body = JSON.stringify({ page: 1, perPage: 20, keyword: query });
            const json = await apiPost(url, body);

            const raw     = (json.data && json.data.results) || [];
            const results = [];

            for (const group of raw) {
                const subjects = group.subjects || [];
                for (const s of subjects) {
                    const item = mapItem(s);
                    if (item) results.push(item);
                }
            }

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  load  →  load()
    //  GET /wefeed-mobile-bff/subject-api/get?subjectId=…
    //  For series: also fetches season-info to build episodes.
    //  The episode URL is encoded as "subjectId|season|episode" for loadStreams.
    // ─────────────────────────────────────────────────────────────────────────────
    async function load(url, cb) {
        try {
            // Extract subjectId from the URL string (mirrors Kotlin load())
            let id = url;
            const m = /subjectId=([^&]+)/.exec(url);
            if (m) id = m[1];
            else if (url.includes("/")) id = url.split("/").pop();

            const finalUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(id)}`;
            const json = await apiGet(finalUrl);
            const data = json.data;
            if (!data) return cb({ success: false, errorCode: "PARSE_ERROR", message: "No data" });

            const title       = (data.title || "").split("[")[0].trim() || "Unknown";
            const description = data.description || "";
            const releaseDate = data.releaseDate || "";
            const year        = parseInt(releaseDate.substring(0, 4)) || undefined;
            const duration    = parseDuration(data.duration);
            const genre       = data.genre || "";
            const tags        = genre ? genre.split(",").map(s => s.trim()) : [];
            const score       = parseFloat(data.imdbRatingValue) || undefined;
            const posterUrl   = data.cover && data.cover.url ? data.cover.url : undefined;
            const subjectType = data.subjectType || 1;
            const type        = subjectTypeToStr(subjectType);

            // Cast
            const cast = [];
            for (const staff of (data.staffList || [])) {
                if (staff.staffType === 1 && staff.name) {
                    cast.push(new Actor({
                        name:  staff.name,
                        image: staff.avatarUrl || undefined,
                        role:  staff.character  || undefined,
                    }));
                }
            }

            // ── Series path ───────────────────────────────────────────────────
            if (type === "series") {
                // Collect all subjectIds (original + dubs)
                const allIds = [id];
                for (const dub of (data.dubs || [])) {
                    const sid = dub.subjectId;
                    if (sid && !allIds.includes(sid)) allIds.push(sid);
                }

                // episodeMap: { season: Set<episode> }
                const episodeMap = {};

                await Promise.all(allIds.map(async (sid) => {
                    try {
                        const seasonUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/season-info?subjectId=${encodeURIComponent(sid)}`;
                        const sj = await apiGet(seasonUrl);
                        const seasons = (sj.data && sj.data.seasons) || [];
                        for (const s of seasons) {
                            const sn    = s.se    || 1;
                            const maxEp = s.maxEp || 1;
                            if (!episodeMap[sn]) episodeMap[sn] = new Set();
                            for (let ep = 1; ep <= maxEp; ep++) episodeMap[sn].add(ep);
                        }
                    } catch (_) {}
                }));

                const episodes = [];
                const sortedSeasons = Object.keys(episodeMap).map(Number).sort((a, b) => a - b);

                for (const sn of sortedSeasons) {
                    const sortedEps = [...episodeMap[sn]].sort((a, b) => a - b);
                    for (const ep of sortedEps) {
                        episodes.push(new Episode({
                            name:    `S${sn}E${ep}`,
                            season:  sn,
                            episode: ep,
                            url:     `${id}|${sn}|${ep}`,
                            posterUrl,
                        }));
                    }
                }

                // Fallback: at least S01E01
                if (episodes.length === 0) {
                    episodes.push(new Episode({ name: "Episode 1", season: 1, episode: 1, url: `${id}|1|1`, posterUrl }));
                }

                cb({
                    success: true,
                    data: new MultimediaItem({
                        title, url: finalUrl, posterUrl, type: "series",
                        year, score, duration, description,
                        cast, episodes,
                    }),
                });
                return;
            }

            // ── Movie path ────────────────────────────────────────────────────
            cb({
                success: true,
                data: new MultimediaItem({
                    title, url: finalUrl, posterUrl, type: "movie",
                    year, score, duration, description, cast,
                    episodes: [new Episode({ name: "Full Movie", season: 1, episode: 1, url: `${id}|0|0`, posterUrl })],
                }),
            });

        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  loadStreams  →  loadLinks()
    //  dataStr = "subjectId|season|episode"  (episode URL from load())
    //
    //  Flow mirrors Kotlin loadLinks():
    //    1. GET subject detail  →  collect dub subjectIds + extract Bearer token
    //    2. For each subjectId: GET play-info  →  streams array  →  StreamResult
    //    3. For each stream: GET captions (two endpoints)  →  subtitles
    //    4. Fallback: if streams empty, GET subject detail again for resourceDetectors
    // ─────────────────────────────────────────────────────────────────────────────
    async function loadStreams(dataStr, cb) {
        try {
            const parts = dataStr.split("|");
            let originalSubjectId = parts[0];

            // Handle URL-style IDs that slipped through
            if (originalSubjectId.includes("subjectId=")) {
                const mm = /subjectId=([^&]+)/.exec(originalSubjectId);
                if (mm) originalSubjectId = mm[1];
            } else if (originalSubjectId.includes("/")) {
                originalSubjectId = originalSubjectId.split("/").pop();
            }

            const season  = parts.length > 1 ? (parseInt(parts[1]) || 0) : 0;
            const episode = parts.length > 2 ? (parseInt(parts[2]) || 0) : 0;

            // ── Step 1: GET subject to extract token + dubs ──────────────────
            const subjectUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(originalSubjectId)}`;
            const bm = randomBrandModel();
            const subjectHdrs = playHeaders(subjectUrl, null);
            const subjectRes = await http_get(subjectUrl, subjectHdrs);

            let token = null;
            const subjectIds = []; // [{ id, lang }]
            let originalLangName = "Original";

            if (subjectRes.status === 200) {
                let subJson;
                try { subJson = JSON.parse(subjectRes.body); } catch (_) {}

                if (subJson && subJson.data) {
                    const dubs = subJson.data.dubs || [];
                    for (const dub of dubs) {
                        if (dub.subjectId === originalSubjectId) {
                            originalLangName = dub.lanName || "Original";
                        } else if (dub.subjectId && dub.lanName) {
                            subjectIds.push({ id: dub.subjectId, lang: dub.lanName });
                        }
                    }
                }

                // Extract token from x-user response header
                const xUser = subjectRes.headers && (subjectRes.headers["x-user"] || subjectRes.headers["X-User"]);
                if (xUser) {
                    try {
                        const xu = JSON.parse(xUser);
                        token = xu.token || null;
                    } catch (_) {}
                }
            }

            // Original ID goes first
            subjectIds.unshift({ id: originalSubjectId, lang: originalLangName });

            // ── Step 2: Fetch streams for each subjectId ──────────────────────
            const streams = [];
            const subtitles = [];

            await Promise.all(subjectIds.map(async ({ id: sid, lang }) => {
                try {
                    const playUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?subjectId=${encodeURIComponent(sid)}&se=${season}&ep=${episode}`;
                    const ph = playHeaders(playUrl, token);
                    const playRes = await http_get(playUrl, ph);

                    if (playRes.status !== 200) return;

                    let playJson;
                    try { playJson = JSON.parse(playRes.body); } catch (_) { return; }

                    const playData   = playJson.data || {};
                    const rawStreams = playData.streams || [];
                    const langLabel  = lang.replace(/dub/gi, "Audio");

                    for (const s of rawStreams) {
                        const sUrl   = s.url;
                        if (!sUrl) continue;
                        const format = s.format || "";
                        const res    = s.resolutions || "";
                        const quality = getHighestQuality(res);
                        const signCookie = s.signCookie || null;
                        const streamId = s.id || `${sid}|${season}|${episode}`;
                        const stType = inferStreamType(sUrl, format);

                        const hdrs = { Referer: API_BASE };
                        if (signCookie) hdrs["Cookie"] = signCookie;

                        streams.push(new StreamResult({
                            url:     sUrl,
                            quality: quality,
                            headers: hdrs,
                        }));

                        // ── Captions endpoint 1: get-stream-captions ─────────
                        try {
                            const capUrl1 = `${API_BASE}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${encodeURIComponent(sid)}&streamId=${encodeURIComponent(streamId)}`;
                            const ch1 = subHeaders(capUrl1, token, bm);
                            const capRes1 = await http_get(capUrl1, ch1);
                            if (capRes1.status === 200) {
                                let capJson1;
                                try { capJson1 = JSON.parse(capRes1.body); } catch (_) {}
                                const ext1 = (capJson1 && capJson1.data && capJson1.data.extCaptions) || [];
                                for (const cap of ext1) {
                                    if (cap.url) {
                                        subtitles.push({ url: cap.url, label: `${cap.language || cap.lanName || cap.lan || "Unknown"} (${langLabel})`, lang: cap.lan || cap.language || "un" });
                                    }
                                }
                            }
                        } catch (_) {}

                        // ── Captions endpoint 2: get-ext-captions ───────────
                        try {
                            const capUrl2 = `${API_BASE}/wefeed-mobile-bff/subject-api/get-ext-captions?subjectId=${encodeURIComponent(sid)}&resourceId=${encodeURIComponent(streamId)}&episode=0`;
                            const ch2 = subHeaders(capUrl2, token, bm);
                            const capRes2 = await http_get(capUrl2, ch2);
                            if (capRes2.status === 200) {
                                let capJson2;
                                try { capJson2 = JSON.parse(capRes2.body); } catch (_) {}
                                const ext2 = (capJson2 && capJson2.data && capJson2.data.extCaptions) || [];
                                for (const cap of ext2) {
                                    if (cap.url) {
                                        subtitles.push({ url: cap.url, label: `${cap.lan || cap.lanName || cap.language || "Unknown"} (${langLabel})`, lang: cap.lan || "un" });
                                    }
                                }
                            }
                        } catch (_) {}
                    }

                    // ── Fallback: resourceDetectors (Ep mismatch fix) ────────
                    if (rawStreams.length === 0) {
                        try {
                            const fbUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(sid)}`;
                            const fbH = playHeaders(fbUrl, token);
                            fbH["x-tr-signature"] = generateXTrSignature("GET", "application/json", "application/json", fbUrl);
                            const fbRes = await http_get(fbUrl, fbH);
                            if (fbRes.status === 200) {
                                let fbJson;
                                try { fbJson = JSON.parse(fbRes.body); } catch (_) {}
                                const detectors = (fbJson && fbJson.data && fbJson.data.resourceDetectors) || [];
                                for (const det of detectors) {
                                    for (const video of (det.resolutionList || [])) {
                                        const link = video.resourceLink;
                                        if (!link) continue;
                                        const q = (video.resolution || 0) + "p";
                                        streams.push(new StreamResult({
                                            url:     link,
                                            quality: q,
                                            headers: { Referer: API_BASE },
                                        }));
                                    }
                                }
                            }
                        } catch (_) {}
                    }
                } catch (_) {}
            }));

            // Attach all subtitles to every stream result (SkyStream flat model)
            const finalStreams = streams.map(s => {
                s.subtitles = subtitles;
                return s;
            });

            cb({ success: true, data: finalStreams });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // ── Register exports ──────────────────────────────────────────────────────────
    globalThis.getHome     = getHome;
    globalThis.search      = search;
    globalThis.load        = load;
    globalThis.loadStreams  = loadStreams;

})();

// ═════════════════════════════════════════════════════════════════════════════
//  MOCK TEST CASES  (run manually or via `skystream test`)
//
//  These validate the four core functions without a live SkyStream runtime.
//  Run in Node.js:
//    node -e "$(cat plugin.js)" -- but note that MultimediaItem / Episode /
//    StreamResult / Actor / http_get / http_post must be stubbed first.
//
//  Below are usage examples for the skystream CLI:
//
//  1. getHome:
//     skystream test -f getHome
//     Expected: data object with "Trending", "Bollywood", "Movies", etc.
//
//  2. search:
//     skystream test -f search -q "Pushpa"
//     Expected: array of MultimediaItem with title, url (subjectId), posterUrl, type
//
//  3. load – movie:
//     skystream test -f load -q "3456789012345678901"
//     (use a real subjectId from search above)
//     Expected: MultimediaItem with episodes: [{ name:"Full Movie", url:"<id>|0|0" }]
//
//  4. load – series:
//     skystream test -f load -q "7890123456789012345"
//     Expected: MultimediaItem type:"series" with episodes array sorted by season/ep
//
//  5. loadStreams – movie:
//     skystream test -f loadStreams -q "<subjectId>|0|0"
//     Expected: array of StreamResult with url (HLS/MP4/DASH), quality, headers
//
//  6. loadStreams – series episode:
//     skystream test -f loadStreams -q "<subjectId>|1|3"
//     Expected: streams for season 1 episode 3; may include subtitle tracks
// ═════════════════════════════════════════════════════════════════════════════
