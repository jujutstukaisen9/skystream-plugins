(function() {
    const BASE_URL = manifest.baseUrl || "https://api3.aoneroom.com";

    const SECRET_KEY_DEFAULT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
    const SECRET_KEY_ALT = "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";

    const UA = "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)";

    const brandModels = {
        "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
        "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
        "OnePlus": ["LE2111", "CPH2449", "IN2023"],
        "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
        "Realme": ["RMX3085", "RMX3360", "RMX3551"]
    };

    let deviceId = null;

    function generateDeviceId() {
        const hexChars = "0123456789abcdef";
        let result = "";
        for (let i = 0; i < 16; i++) {
            result += hexChars[Math.floor(Math.random() * 16)];
        }
        return result;
    }

    function randomBrandModel() {
        const brands = Object.keys(brandModels);
        const brand = brands[Math.floor(Math.random() * brands.length)];
        const models = brandModels[brand];
        const model = models[Math.floor(Math.random() * models.length)];
        return { brand, model };
    }

    function md5(data) {
        if (typeof crypto_md5 === "function") {
            return crypto_md5(data);
        }
        
        function safeAdd(x, y) {
            const lsw = (x & 0xFFFF) + (y & 0xFFFF);
            const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xFFFF);
        }

        function bitRotateLeft(num, cnt) {
            return (num << cnt) | (num >>> (32 - cnt));
        }

        function md5cmn(q, a, b, x, s, t) {
            return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
        }

        function md5ff(a, b, c, d, x, s, t) {
            return md5cmn((b & c) | (~b & d), a, b, x, s, t);
        }

        function md5gg(a, b, c, d, x, s, t) {
            return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
        }

        function md5hh(a, b, c, d, x, s, t) {
            return md5cmn(b ^ c ^ d, a, b, x, s, t);
        }

        function md5ii(a, b, c, d, x, s, t) {
            return md5cmn(c ^ (b | ~d), a, b, x, s, t);
        }

        const binlMD5 = function(x, len) {
            x[len >> 5] |= 0x80 << (len % 32);
            x[(((len + 64) >>> 9) << 4) + 14] = len;

            let a = 1732584193;
            let b = -271733879;
            let c = -1732584194;
            let d = 271733878;

            for (let i = 0; i < x.length; i += 16) {
                const olda = a;
                const oldb = b;
                const oldc = c;
                const oldd = d;

                a = md5ff(a, b, c, d, x[i], 7, -680876936);
                d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
                c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
                b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
                a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
                d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
                c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
                b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
                a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
                d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
                c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
                b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
                a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
                d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
                c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
                b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

                a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
                d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
                c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
                b = md5gg(b, c, d, a, x[i], 20, -373897302);
                a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
                d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
                c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
                b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
                a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
                d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
                c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
                b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
                a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
                d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
                c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
                b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

                a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
                d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
                c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
                b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
                a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
                d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
                c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
                b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
                a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
                d = md5hh(d, a, b, c, x[i], 11, -358537222);
                c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
                b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
                a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
                d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
                c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
                b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

                a = md5ii(a, b, c, d, x[i], 6, -198630844);
                d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
                c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
                b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
                a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
                d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
                c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
                b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
                a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
                d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
                c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
                b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
                a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
                d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
                c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
                b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

                a = safeAdd(a, olda);
                b = safeAdd(b, oldb);
                c = safeAdd(c, oldc);
                d = safeAdd(d, oldd);
            }
            return [a, b, c, d];
        };

        function binl2hex(binarray) {
            const hexTab = "0123456789abcdef";
            let str = "";
            for (let i = 0; i < binarray.length * 4; i++) {
                str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) +
                    hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xF);
            }
            return str;
        }

        function str2binl(str) {
            const bin = [];
            for (let i = 0; i < str.length * 8; i += 8) {
                bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xFF) << (i % 32);
            }
            return bin;
        }

        return binl2hex(binlMD5(str2binl(data), data.length * 8));
    }

    function reverseString(input) {
        return input.split("").reverse().join("");
    }

    function generateXClientToken(hardcodedTimestamp = null) {
        const timestamp = (hardcodedTimestamp || Date.now()).toString();
        const reversed = reverseString(timestamp);
        const hash = md5(reversed);
        return `${timestamp},${hash}`;
    }

    function base64Decode(str) {
        try {
            return atob(str);
        } catch (e) {
            return "";
        }
    }

    function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
        try {
            const parsedUrl = new URL(url);
            const path = parsedUrl.pathname;
            
            let query = "";
            if (parsedUrl.searchParams && parsedUrl.searchParams.toString()) {
                const keys = Array.from(parsedUrl.searchParams.keys()).sort();
                query = keys.map(key => {
                    return parsedUrl.searchParams.getAll(key).map(value => `${key}=${value}`).join("&");
                }).join("&");
            }
            
            const canonicalUrl = query ? `${path}?${query}` : path;

            let bodyHash = "";
            if (body) {
                const bodyBytes = body.slice(0, 102400);
                bodyHash = md5(bodyBytes);
            }

            const bodyLength = body ? body.length.toString() : "";

            return `${method.toUpperCase()}\n${accept || ""}\n${contentType || ""}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
        } catch (e) {
            return "";
        }
    }

    function hmacMd5(secret, message) {
        if (typeof crypto_hmac_md5 === "function") {
            return crypto_hmac_md5(secret, message);
        }
        
        function str2binl(str) {
            const bin = [];
            for (let i = 0; i < str.length * 8; i += 8) {
                bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xFF) << (i % 32);
            }
            return bin;
        }

        function binl2hex(binarray) {
            const hexTab = "0123456789abcdef";
            let str = "";
            for (let i = 0; i < binarray.length * 4; i++) {
                str += hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) +
                    hexTab.charAt((binarray[i >> 2] >> ((i % 4) * 8)) & 0xF);
            }
            return str;
        }

        function safeAdd(x, y) {
            const lsw = (x & 0xFFFF) + (y & 0xFFFF);
            const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
            return (msw << 16) | (lsw & 0xFFFF);
        }

        function bitRotateLeft(num, cnt) {
            return (num << cnt) | (num >>> (32 - cnt));
        }

        function md5cmn(q, a, b, x, s, t) {
            return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
        }

        function md5ff(a, b, c, d, x, s, t) {
            return md5cmn((b & c) | (~b & d), a, b, x, s, t);
        }

        function md5gg(a, b, c, d, x, s, t) {
            return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
        }

        function md5hh(a, b, c, d, x, s, t) {
            return md5cmn(b ^ c ^ d, a, b, x, s, t);
        }

        function md5ii(a, b, c, d, x, s, t) {
            return md5cmn(c ^ (b | ~d), a, b, x, s, t);
        }

        function binlMD5(x, len) {
            x[len >> 5] |= 0x80 << (len % 32);
            x[(((len + 64) >>> 9) << 4) + 14] = len;

            let a = 1732584193;
            let b = -271733879;
            let c = -1732584194;
            let d = 271733878;

            for (let i = 0; i < x.length; i += 16) {
                const olda = a;
                const oldb = b;
                const oldc = c;
                const oldd = d;

                a = md5ff(a, b, c, d, x[i], 7, -680876936);
                d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
                c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
                b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
                a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
                d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
                c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
                b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
                a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
                d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
                c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
                b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
                a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
                d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
                c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
                b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

                a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
                d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
                c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
                b = md5gg(b, c, d, a, x[i], 20, -373897302);
                a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
                d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
                c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
                b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
                a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
                d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
                c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
                b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
                a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
                d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
                c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
                b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

                a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
                d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
                c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
                b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
                a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
                d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
                c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
                b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
                a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
                d = md5hh(d, a, b, c, x[i], 11, -358537222);
                c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
                b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
                a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
                d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
                c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
                b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

                a = md5ii(a, b, c, d, x[i], 6, -198630844);
                d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
                c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
                b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
                a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
                d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
                c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
                b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
                a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
                d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
                c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
                b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
                a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
                d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
                c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
                b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

                a = safeAdd(a, olda);
                b = safeAdd(b, oldb);
                c = safeAdd(c, oldc);
                d = safeAdd(d, oldd);
            }
            return [a, b, c, d];
        }

        function hmac(key, data) {
            if (typeof key === 'string') {
                key = str2binl(key);
            }
            if (key.length < 16) {
                const newKey = new Array(16);
                for (let i = 0; i < 16; i++) {
                    newKey[i] = key[i] || 0;
                }
                key = newKey;
            }

            const oKeyPad = new Array(16);
            const iKeyPad = new Array(16);
            for (let i = 0; i < 16; i++) {
                oKeyPad[i] = key[i] ^ 0x5c5c5c5c;
                iKeyPad[i] = key[i] ^ 0x36363636;
            }

            const iHash = binlMD5(iKeyPad.concat(str2binl(data)), 512 + data.length * 8);
            return binl2hex(binlMD5(oKeyPad.concat(iHash), 512 + 128));
        }

        return hmac(secret, message);
    }

    function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, hardcodedTimestamp = null) {
        const timestamp = hardcodedTimestamp || Date.now();
        const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
        const secret = useAltKey ? base64Decode(SECRET_KEY_ALT) : base64Decode(SECRET_KEY_DEFAULT);
        const signature = hmacMd5(secret, canonical);
        const signatureB64 = btoa(signature);
        return `${timestamp}|2|${signatureB64}`;
    }

    function getClientInfo(model = null) {
        if (!deviceId) deviceId = generateDeviceId();
        const bm = model || randomBrandModel();
        return JSON.stringify({
            package_name: "com.community.mbox.in",
            version_name: "3.0.03.0529.03",
            version_code: 50020042,
            os: "android",
            os_version: "16",
            device_id: deviceId,
            install_store: "ps",
            gaid: "d7578036d13336cc",
            brand: "google",
            model: bm.model,
            system_language: "en",
            net: "NETWORK_WIFI",
            region: "IN",
            timezone: "Asia/Calcutta",
            sp_code: ""
        });
    }

    function getHeaders(url, method = "GET", body = null, contentType = "application/json") {
        const xClientToken = generateXClientToken();
        const isPost = method === "POST";
        const accept = isPost ? "application/json" : "application/json";
        const fullContentType = isPost ? "application/json; charset=utf-8" : contentType;
        
        const xTrSignature = generateXTrSignature(
            method,
            accept,
            fullContentType,
            url,
            body,
            false
        );

        return {
            "user-agent": UA,
            "accept": accept,
            "content-type": fullContentType,
            "connection": "keep-alive",
            "x-client-token": xClientToken,
            "x-tr-signature": xTrSignature,
            "x-client-info": getClientInfo(),
            "x-client-status": "0"
        };
    }

    async function fetchApi(url, method = "GET", body = null) {
        const headers = getHeaders(url, method, body);
        
        const options = {
            headers,
            method
        };

        if (body && method === "POST") {
            options.body = body;
        }

        const response = await fetch(url, options);
        return response.json();
    }

    function parseDuration(duration) {
        if (!duration) return null;
        const match = duration.match(/(\d+)h\s*(\d+)m/);
        if (match) {
            const hours = parseInt(match[1], 10) || 0;
            const minutes = parseInt(match[2], 10) || 0;
            return hours * 60 + minutes;
        }
        const mins = duration.replace("m", "").trim();
        return parseInt(mins, 10) || null;
    }

    function getQualityValue(resolutions) {
        const str = resolutions || "";
        if (str.includes("2160")) return 2160;
        if (str.includes("1440")) return 1440;
        if (str.includes("1080")) return 1080;
        if (str.includes("720")) return 720;
        if (str.includes("480")) return 480;
        if (str.includes("360")) return 360;
        if (str.includes("240")) return 240;
        return null;
    }

    function cleanTitle(title) {
        if (!title) return "";
        return title.split("[")[0].trim();
    }

    const mainPageData = {
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
        "1|1;country=Japan": "Japan (Movies)",
        "1|2;country=Japan": "Japan (Series)",
        "1|1;country=China": "China (Movies)",
        "1|2;country=China": "China (Series)",
        "1|1;country=Korea": "South Korean (Movies)",
        "1|2;country=Korea": "South Korean (Series)"
    };

    async function getHome(cb) {
        try {
            const data = {};
            const perPage = 15;

            for (const [pageKey, categoryName] of Object.entries(mainPageData)) {
                try {
                    let url, requestBody;
                    const isSimple = pageKey.includes("|");
                    
                    if (isSimple) {
                        url = `${BASE_URL}/wefeed-mobile-bff/subject-api/list`;
                        const mainParts = pageKey.split("|");
                        const pg = 1;
                        const channelId = mainParts[1];
                        
                        const options = {};
                        const optsPart = pageKey.split(";")[1] || "";
                        optsPart.split(";").forEach(opt => {
                            const [k, v] = opt.split("=");
                            if (k && v) options[k] = v;
                        });

                        const classify = options["classify"] || "All";
                        const country = options["country"] || "All";
                        const year = options["year"] || "All";
                        const genre = options["genre"] || "All";
                        const sort = options["sort"] || "ForYou";

                        requestBody = JSON.stringify({
                            page: pg,
                            perPage: perPage,
                            channelId: channelId,
                            classify: classify,
                            country: country,
                            year: year,
                            genre: genre,
                            sort: sort
                        });
                    } else {
                        url = `${BASE_URL}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${pageKey}&page=1&perPage=${perPage}`;
                        requestBody = null;
                    }

                    const response = await fetchApi(url, requestBody ? "POST" : "GET", requestBody);
                    
                    const items = response?.data?.items || response?.data?.subjects || [];
                    const mediaItems = [];

                    for (const item of items) {
                        const title = cleanTitle(item.title);
                        if (!title) continue;
                        
                        const id = item.subjectId;
                        if (!id) continue;

                        const posterUrl = item.cover?.url || "";
                        const subjectType = item.subjectType || 1;
                        const type = subjectType === 1 ? "movie" : "series";
                        
                        const rating = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) : null;

                        mediaItems.push(new MultimediaItem({
                            title,
                            url: id,
                            posterUrl,
                            type,
                            score: rating ? rating * 10 : null
                        }));
                    }

                    if (mediaItems.length > 0) {
                        data[categoryName] = mediaItems;
                    }
                } catch (e) {
                    console.log(`Error fetching ${categoryName}:`, e.message);
                }
            }

            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e?.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/search/v2`;
            const body = JSON.stringify({
                page: 1,
                perPage: 20,
                keyword: query
            });

            const response = await fetchApi(url, "POST", body);
            const results = response?.data?.results || [];
            const searchList = [];

            for (const result of results) {
                const subjects = result.subjects || [];
                for (const subject of subjects) {
                    const title = cleanTitle(subject.title);
                    if (!title) continue;

                    const id = subject.subjectId;
                    if (!id) continue;

                    const posterUrl = subject.cover?.url || "";
                    const subjectType = subject.subjectType || 1;
                    const type = subjectType === 1 ? "movie" : "series";
                    const rating = subject.imdbRatingValue ? parseFloat(subject.imdbRatingValue) : null;

                    searchList.push(new MultimediaItem({
                        title,
                        url: id,
                        posterUrl,
                        type,
                        score: rating ? rating * 10 : null
                    }));
                }
            }

            cb({ success: true, data: searchList });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            let subjectId = url;
            const match = url.match(/subjectId=([^&]+)/);
            if (match) {
                subjectId = match[1];
            } else if (url.includes("/")) {
                subjectId = url.substring(url.lastIndexOf("/") + 1);
            }

            const apiUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
            const response = await fetchApi(apiUrl, "GET");
            const data = response.data;

            if (!data) {
                throw new Error("No data returned");
            }

            const title = cleanTitle(data.title);
            const description = data.description || "";
            const releaseDate = data.releaseDate || "";
            const year = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : null;
            const duration = data.duration;
            const durationMinutes = parseDuration(duration);
            const genre = data.genre || "";
            const tags = genre.split(",").map(t => t.trim()).filter(t => t);
            const imdbRating = data.imdbRatingValue ? parseFloat(data.imdbRatingValue) * 10 : null;

            const posterUrl = data.cover?.url || "";
            const backgroundUrl = data.cover?.url || "";

            const subjectType = data.subjectType || 1;
            const isSeries = subjectType === 2 || subjectType === 7;
            const type = isSeries ? "series" : "movie";

            const actors = [];
            const staffList = data.staffList || [];
            for (const staff of staffList) {
                if (staff.staffType === 1) {
                    const name = staff.name;
                    const character = staff.character;
                    const avatarUrl = staff.avatarUrl;
                    if (name) {
                        actors.push(new Actor({
                            name,
                            role: character,
                            image: avatarUrl
                        }));
                    }
                }
            }

            if (isSeries) {
                const allSubjectIds = [subjectId];
                const dubs = data.dubs || [];
                for (const dub of dubs) {
                    const sid = dub.subjectId;
                    const lanName = dub.lanName;
                    if (sid && lanName && !allSubjectIds.includes(sid)) {
                        allSubjectIds.push(sid);
                    }
                }

                const episodeMap = {};

                for (const sid of allSubjectIds) {
                    try {
                        const seasonUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${sid}`;
                        const seasonResponse = await fetchApi(seasonUrl, "GET");
                        const seasons = seasonResponse?.data?.seasons;

                        if (!seasons || !Array.isArray(seasons) || seasons.length === 0) {
                            continue;
                        }

                        for (const season of seasons) {
                            const seasonNumber = season.se || 1;
                            const maxEp = season.maxEp || 1;

                            if (!episodeMap[seasonNumber]) {
                                episodeMap[seasonNumber] = new Set();
                            }

                            for (let ep = 1; ep <= maxEp; ep++) {
                                episodeMap[seasonNumber].add(ep);
                            }
                        }
                    } catch (e) {
                        console.log("Error fetching season:", e.message);
                    }
                }

                const episodes = [];
                const sortedSeasons = Object.keys(episodeMap).map(Number).sort((a, b) => a - b);

                for (const seasonNumber of sortedSeasons) {
                    const epSet = episodeMap[seasonNumber];
                    const sortedEps = Array.from(epSet).sort((a, b) => a - b);

                    for (const episodeNumber of sortedEps) {
                        episodes.push(new Episode({
                            name: `S${seasonNumber}E${episodeNumber}`,
                            url: `${subjectId}|${seasonNumber}|${episodeNumber}`,
                            season: seasonNumber,
                            episode: episodeNumber,
                            posterUrl
                        }));
                    }
                }

                if (episodes.length === 0) {
                    episodes.push(new Episode({
                        name: "Episode 1",
                        url: `${subjectId}|1|1`,
                        season: 1,
                        episode: 1,
                        posterUrl
                    }));
                }

                cb({
                    success: true,
                    data: new MultimediaItem({
                        title,
                        url: apiUrl,
                        posterUrl,
                        backgroundPosterUrl: backgroundUrl,
                        description,
                        type,
                        contentType: type,
                        year,
                        tags,
                        actors,
                        duration: durationMinutes,
                        score: imdbRating,
                        episodes
                    })
                });
            } else {
                cb({
                    success: true,
                    data: new MultimediaItem({
                        title,
                        url: apiUrl,
                        posterUrl,
                        backgroundPosterUrl: backgroundUrl,
                        description,
                        type,
                        contentType: type,
                        year,
                        tags,
                        actors,
                        duration: durationMinutes,
                        score: imdbRating
                    })
                });
            }
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const parts = url.split("|");
            let subjectId = parts[0];
            
            const match = subjectId.match(/subjectId=([^&]+)/);
            if (match) {
                subjectId = match[1];
            } else if (subjectId.includes("/")) {
                subjectId = subjectId.substring(subjectId.lastIndexOf("/") + 1);
            }

            const season = parts[1] ? parseInt(parts[1], 10) : 0;
            const episode = parts[2] ? parseInt(parts[2], 10) : 0;

            const subjectUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
            const subjectResponse = await fetchApi(subjectUrl, "GET");
            const subjectData = subjectResponse.data;

            let subjectIds = [];
            let originalLanguageName = "Original";

            if (subjectData) {
                const dubs = subjectData.dubs || [];
                for (const dub of dubs) {
                    const dubSubjectId = dub.subjectId;
                    const lanName = dub.lanName;
                    if (dubSubjectId && lanName) {
                        if (dubSubjectId === subjectId) {
                            originalLanguageName = lanName;
                        } else {
                            subjectIds.push({ id: dubSubjectId, language: lanName });
                        }
                    }
                }
            }

            subjectIds.unshift({ id: subjectId, language: originalLanguageName });

            const allStreams = [];
            const bm = randomBrandModel();

            for (const { id: sid, language } of subjectIds) {
                try {
                    const playUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${sid}&se=${season}&ep=${episode}`;
                    const response = await fetchApi(playUrl, "GET");
                    const playData = response.data;
                    const streams = playData?.streams;

                    if (streams && Array.isArray(streams)) {
                        for (const stream of streams) {
                            const streamUrl = stream.url;
                            if (!streamUrl) continue;

                            const resolutions = stream.resolutions || "";
                            const format = stream.format || "";
                            const id = stream.id || `${sid}|${season}|${episode}`;
                            
                            const quality = getQualityValue(resolutions);
                            const langLabel = language.replace("dub", "Audio");

                            allStreams.push(new StreamResult({
                                url: streamUrl,
                                quality: quality ? `${quality}p` : "Auto",
                                source: `MovieBox ${langLabel}`,
                                headers: { "Referer": BASE_URL }
                            }));
                        }
                    }

                    if (!streams || streams.length === 0) {
                        const fallbackUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${sid}`;
                        const fallbackResponse = await fetchApi(fallbackUrl, "GET");
                        const detectors = fallbackResponse?.data?.resourceDetectors;

                        if (detectors && Array.isArray(detectors)) {
                            for (const detector of detectors) {
                                const resolutionList = detector.resolutionList || [];
                                for (const video of resolutionList) {
                                    const link = video.resourceLink;
                                    if (!link) continue;

                                    const quality = video.resolution || 0;
                                    const se = video.se || 0;
                                    const ep = video.ep || 0;
                                    const langLabel = language.replace("dub", "Audio");

                                    allStreams.push(new StreamResult({
                                        url: link,
                                        quality: quality > 0 ? `${quality}p` : "Auto",
                                        source: `MovieBox S${se}E${ep} ${langLabel}`,
                                        headers: { "Referer": BASE_URL }
                                    }));
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.log("Error processing stream:", e.message);
                }
            }

            const uniqueStreams = [];
            const seenUrls = new Set();
            for (const stream of allStreams) {
                if (!seenUrls.has(stream.url)) {
                    seenUrls.add(stream.url);
                    uniqueStreams.push(stream);
                }
            }

            cb({ success: true, data: uniqueStreams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
