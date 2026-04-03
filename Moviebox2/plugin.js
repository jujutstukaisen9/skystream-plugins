/**
 * MovieBox Provider for SkyStream
 * Ported from Kotlin CloudStream Extension by NivinCNC
 * https://github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension
 */
(function() {
    // --- Constants ---
    var MAIN_URL = manifest.baseUrl || "https://api3.aoneroom.com";
    
    // Base64 decoded secret keys from original plugin
    var SECRET_KEY_DEFAULT = atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
    var SECRET_KEY_ALT = atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==");
    
    // TMDB API for metadata
    var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
    var CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    
    // --- Helper Functions ---
    
    // Simple MD5 hash implementation for JavaScript
    function md5(str) {
        function rotateLeft(lValue, iShiftBits) {
            return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
        }
        
        function addUnsigned(lX, lY) {
            var lX4, lY4, lX8, lY8, lResult;
            lX8 = (lX & 0x80000000);
            lY8 = (lY & 0x80000000);
            lX4 = (lX & 0x40000000);
            lY4 = (lY & 0x40000000);
            lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
            if (lX4 & lY4) {
                return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
            }
            if (lX4 | lY4) {
                if (lResult & 0x40000000) {
                    return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
                } else {
                    return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
                }
            } else {
                return (lResult ^ lX8 ^ lY8);
            }
        }
        
        function f(x, y, z) { return (x & y) | ((~x) & z); }
        function g(x, y, z) { return (x & z) | (y & (~z)); }
        function h(x, y, z) { return (x ^ y ^ z); }
        function i(x, y, z) { return (y ^ (x | (~z))); }
        
        function ff(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(f(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        
        function gg(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(g(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        
        function hh(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(h(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        
        function ii(a, b, c, d, x, s, ac) {
            a = addUnsigned(a, addUnsigned(addUnsigned(i(b, c, d), x), ac));
            return addUnsigned(rotateLeft(a, s), b);
        }
        
        function convertToWordArray(str) {
            var lWordCount;
            var lMessageLength = str.length;
            var lNumberOfWords_temp1 = lMessageLength + 8;
            var lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
            var lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
            var lWordArray = Array(lNumberOfWords - 1);
            var lBytePosition = 0;
            var lByteCount = 0;
            
            while (lByteCount < lMessageLength) {
                lWordCount = (lByteCount - (lByteCount % 4)) / 4;
                lBytePosition = (lByteCount % 4) * 8;
                lWordArray[lWordCount] = (lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition));
                lByteCount++;
            }
            
            lWordCount = (lByteCount - (lByteCount % 4)) / 4;
            lBytePosition = (lByteCount % 4) * 8;
            lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
            lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
            lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
            
            return lWordArray;
        }
        
        function wordToHex(lValue) {
            var wordToHexValue = "", wordToHexValue_temp = "", lByte, lCount;
            for (lCount = 0; lCount <= 3; lCount++) {
                lByte = (lValue >>> (lCount * 8)) & 255;
                wordToHexValue_temp = "0" + lByte.toString(16);
                wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2);
            }
            return wordToHexValue;
        }
        
        var x = Array();
        var k, AA, BB, CC, DD, a, b, c, d;
        var S11 = 7, S12 = 12, S13 = 17, S14 = 22;
        var S21 = 5, S22 = 9, S23 = 14, S24 = 20;
        var S31 = 4, S32 = 11, S33 = 16, S34 = 23;
        var S41 = 6, S42 = 10, S43 = 15, S44 = 21;
        
        x = convertToWordArray(str);
        a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;
        
        for (k = 0; k < x.length; k += 16) {
            AA = a; BB = b; CC = c; DD = d;
            a = ff(a, b, c, d, x[k + 0], S11, 0xD76AA478);
            d = ff(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
            c = ff(c, d, a, b, x[k + 2], S13, 0x242070DB);
            b = ff(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
            a = ff(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
            d = ff(d, a, b, c, x[k + 5], S12, 0x4787C62A);
            c = ff(c, d, a, b, x[k + 6], S13, 0xA8304613);
            b = ff(b, c, d, a, x[k + 7], S14, 0xFD469501);
            a = ff(a, b, c, d, x[k + 8], S11, 0x698098D8);
            d = ff(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
            c = ff(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
            b = ff(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
            a = ff(a, b, c, d, x[k + 12], S11, 0x6B901122);
            d = ff(d, a, b, c, x[k + 13], S12, 0xFD987193);
            c = ff(c, d, a, b, x[k + 14], S13, 0xA679438E);
            b = ff(b, c, d, a, x[k + 15], S14, 0x49B40821);
            a = gg(a, b, c, d, x[k + 1], S21, 0xF61E2562);
            d = gg(d, a, b, c, x[k + 6], S22, 0xC040B340);
            c = gg(c, d, a, b, x[k + 11], S23, 0x265E5A51);
            b = gg(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
            a = gg(a, b, c, d, x[k + 5], S21, 0xD62F105D);
            d = gg(d, a, b, c, x[k + 10], S22, 0x2441453);
            c = gg(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
            b = gg(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
            a = gg(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
            d = gg(d, a, b, c, x[k + 14], S22, 0xC33707D6);
            c = gg(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
            b = gg(b, c, d, a, x[k + 8], S24, 0x455A14ED);
            a = gg(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
            d = gg(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
            c = gg(c, d, a, b, x[k + 7], S23, 0x676F02D9);
            b = gg(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
            a = hh(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
            d = hh(d, a, b, c, x[k + 8], S32, 0x8771F681);
            c = hh(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
            b = hh(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
            a = hh(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
            d = hh(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
            c = hh(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
            b = hh(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
            a = hh(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
            d = hh(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
            c = hh(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
            b = hh(b, c, d, a, x[k + 6], S34, 0x4881D05);
            a = hh(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
            d = hh(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
            c = hh(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
            b = hh(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
            a = ii(a, b, c, d, x[k + 0], S41, 0xF4292244);
            d = ii(d, a, b, c, x[k + 7], S42, 0x432AFF97);
            c = ii(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
            b = ii(b, c, d, a, x[k + 5], S44, 0xFC93A039);
            a = ii(a, b, c, d, x[k + 12], S41, 0x655B59C3);
            d = ii(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
            c = ii(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
            b = ii(b, c, d, a, x[k + 1], S44, 0x85845DD1);
            a = ii(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
            d = ii(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
            c = ii(c, d, a, b, x[k + 6], S43, 0xA3014314);
            b = ii(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
            a = ii(a, b, c, d, x[k + 4], S41, 0xF7537E82);
            d = ii(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
            c = ii(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
            b = ii(b, c, d, a, x[k + 9], S44, 0xEB86D391);
            a = addUnsigned(a, AA);
            b = addUnsigned(b, BB);
            c = addUnsigned(c, CC);
            d = addUnsigned(d, DD);
        }
        
        return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
    }
    
    // Reverse a string
    function reverseString(input) {
        var result = "";
        for (var i = input.length - 1; i >= 0; i--) {
            result += input[i];
        }
        return result;
    }
    
    // Generate X-Client-Token
    function generateXClientToken(timestamp) {
        timestamp = timestamp || Date.now().toString();
        var reversed = reverseString(timestamp);
        var hash = md5(reversed).substring(0, 32);
        return timestamp + "," + hash;
    }
    
    // Generate random device ID
    function generateDeviceId() {
        var chars = "0123456789abcdef";
        var deviceId = "";
        for (var i = 0; i < 32; i++) {
            deviceId += chars[Math.floor(Math.random() * chars.length)];
        }
        return deviceId;
    }
    
    // Get random brand and model
    function randomBrandModel() {
        var brands = {
            "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
            "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
            "OnePlus": ["LE2111", "CPH2449", "IN2023"],
            "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
            "Realme": ["RMX3085", "RMX3360", "RMX3551"]
        };
        var brandKeys = Object.keys(brands);
        var brand = brandKeys[Math.floor(Math.random() * brandKeys.length)];
        var models = brands[brand];
        var model = models[Math.floor(Math.random() * models.length)];
        return { brand: brand, model: model };
    }
    
    // Build canonical string for signature
    function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
        var path = url;
        var questionMarkIndex = url.indexOf("?");
        if (questionMarkIndex !== -1) {
            path = url.substring(0, questionMarkIndex);
            var query = url.substring(questionMarkIndex + 1);
            var params = query.split("&").sort();
            query = params.join("&");
            path = path + "?" + query;
        }
        
        var bodyHash = body ? md5(body).substring(0, 32) : "";
        var bodyLength = body ? body.length.toString() : "";
        
        var canonical = method.toUpperCase() + "\n";
        canonical += (accept || "") + "\n";
        canonical += (contentType || "") + "\n";
        canonical += bodyLength + "\n";
        canonical += timestamp + "\n";
        canonical += bodyHash + "\n";
        canonical += path;
        
        return canonical;
    }
    
    // Generate X-TR signature
    function generateXTrSignature(method, accept, contentType, url, body, useAltKey, timestamp) {
        timestamp = timestamp || Date.now().toString();
        var canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
        var secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
        
        // Simplified HMAC signature for JavaScript
        var signatureData = canonical + secret;
        var signature = md5(signatureData).substring(0, 32);
        var signatureB64 = btoa(signature);
        
        return timestamp + "|2|" + signatureB64;
    }
    
    // Get client info header
    function getClientInfo(deviceId, brand, model, versionCode) {
        versionCode = versionCode || 50020042;
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
    function getHeaders(deviceId, brand, model, xClientToken, xTrSignature, versionCode) {
        versionCode = versionCode || 50020042;
        return {
            "user-agent": "com.community.mbox.in/" + versionCode + " (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)",
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
    function getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature, token) {
        var headers = {
            "user-agent": "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + brand + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)",
            "accept": "application/json",
            "content-type": "application/json",
            "connection": "keep-alive",
            "x-client-token": xClientToken,
            "x-tr-signature": xTrSignature,
            "x-client-info": getOneroomClientInfo(deviceId, brand, model),
            "x-client-status": "0"
        };
        if (token) {
            headers["Authorization"] = "Bearer " + token;
        }
        return headers;
    }
    
    // Parse duration string to minutes
    function parseDuration(duration) {
        if (!duration) return null;
        var match = duration.match(/(\d+)h\s*(\d+)m/);
        if (match) {
            var h = parseInt(match[1]) || 0;
            var min = parseInt(match[2]) || 0;
            return h * 60 + min;
        }
        var minMatch = duration.match(/(\d+)m/);
        if (minMatch) {
            return parseInt(minMatch[1]);
        }
        return null;
    }
    
    // Clean title
    function cleanTitle(s) {
        return s.toLowerCase()
            .replace(/[^a-z0-9 ]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    
    // Normalize title
    function normalizeTitle(s) {
        return s
            .replace(/\[.*?\]/g, " ")
            .replace(/\(.*?\)/g, " ")
            .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ")
            .trim()
            .toLowerCase()
            .replace(/:/g, " ")
            .replace(/[^\w\s]/g, " ")
            .replace(/\s+/g, " ");
    }
    
    // Token equals comparison
    function tokenEquals(a, b) {
        var sa = a.split(/\s+/).filter(function(t) { return t.length > 0; });
        var sb = b.split(/\s+/).filter(function(t) { return t.length > 0; });
        if (sa.length === 0 || sb.length === 0) return false;
        var intersection = 0;
        for (var i = 0; i < sa.length; i++) {
            if (sb.indexOf(sa[i]) !== -1) intersection++;
        }
        return intersection >= Math.max(1, Math.min(sa.length, sb.length) * 3 / 4);
    }
    
    // Get highest quality from resolutions string
    function getHighestQuality(input) {
        if (!input) return null;
        var qualities = [
            ["2160", 2160],
            ["1440", 1440],
            ["1080", 1080],
            ["720", 720],
            ["480", 480],
            ["360", 360],
            ["240", 240]
        ];
        for (var i = 0; i < qualities.length; i++) {
            if (input.toLowerCase().indexOf(qualities[i][0]) !== -1) {
                return qualities[i][1];
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
    
    // --- TMDB Integration ---
    
    // Search TMDB
    function tmdbSearch(normTitle, year, cb) {
        var encodedTitle = encodeURIComponent(normTitle);
        var url = "https://api.themoviedb.org/3/search/multi?api_key=" + TMDB_API_KEY + "&query=" + encodedTitle + "&include_adult=false&page=1";
        if (year) {
            url += "&year=" + year;
        }
        
        http_get(url, { "User-Agent": "Mozilla/5.0" }, function(res) {
            if (res.status === 200) {
                try {
                    var data = JSON.parse(res.body);
                    cb(data.results || []);
                } catch (e) {
                    cb([]);
                }
            } else {
                cb([]);
            }
        });
    }
    
    // Get TMDB details with external IDs
    function tmdbDetails(mediaType, tmdbId, cb) {
        var url = "https://api.themoviedb.org/3/" + (mediaType === "tv" ? "tv" : "movie") + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&append_to_response=external_ids";
        
        http_get(url, { "User-Agent": "Mozilla/5.0" }, function(res) {
            if (res.status === 200) {
                try {
                    cb(JSON.parse(res.body));
                } catch (e) {
                    cb(null);
                }
            } else {
                cb(null);
            }
        });
    }
    
    // Get TMDB logo
    function fetchTmdbLogoUrl(type, tmdbId, cb) {
        if (!tmdbId) {
            cb(null);
            return;
        }
        
        var url = "https://api.themoviedb.org/3/" + (type === "tv" ? "tv" : "movie") + "/" + tmdbId + "/images?api_key=98ae14df2b8d8f8f8136499daf79f0e0";
        
        http_get(url, { "User-Agent": "Mozilla/5.0" }, function(res) {
            if (res.status === 200) {
                try {
                    var data = JSON.parse(res.body);
                    var logos = data.logos || [];
                    if (logos.length === 0) {
                        cb(null);
                        return;
                    }
                    
                    // Prefer English logos
                    var englishLogo = null;
                    for (var i = 0; i < logos.length; i++) {
                        if (logos[i].iso_639_1 === "en") {
                            englishLogo = logos[i];
                            break;
                        }
                    }
                    
                    var logo = englishLogo || logos[0];
                    cb("https://image.tmdb.org/t/p/w500" + logo.file_path);
                } catch (e) {
                    cb(null);
                }
            } else {
                cb(null);
            }
        });
    }
    
    // Fetch Cinemeta metadata
    function fetchMetaData(imdbId, type, cb) {
        if (!imdbId) {
            cb(null);
            return;
        }
        
        var metaType = type === "series" ? "series" : "movie";
        var url = CINEMETA_URL + "/" + metaType + "/" + imdbId + ".json";
        
        http_get(url, { "User-Agent": "Mozilla/5.0" }, function(res) {
            if (res.status === 200) {
                try {
                    var data = JSON.parse(res.body);
                    cb(data.meta);
                } catch (e) {
                    cb(null);
                }
            } else {
                cb(null);
            }
        });
    }
    
    // Identify TMDB/IMDB IDs
    function identifyID(title, year, imdbRatingValue, cb) {
        var normTitle = normalizeTitle(title);
        
        tmdbSearch(normTitle, year, function(results) {
            var bestId = null;
            var bestScore = -1;
            var bestIsTv = false;
            
            for (var i = 0; i < results.length; i++) {
                var result = results[i];
                var mediaType = result.media_type || (result.title ? "movie" : "tv");
                var candidateId = result.id;
                if (!candidateId) continue;
                
                var titles = [];
                if (result.title) titles.push(result.title);
                if (result.name) titles.push(result.name);
                if (result.original_title) titles.push(result.original_title);
                if (result.original_name) titles.push(result.original_name);
                
                var candDate = mediaType === "tv" ? result.first_air_date : result.release_date;
                var candYear = candDate ? parseInt(candDate.substring(0, 4)) : null;
                var candRating = result.vote_average || 0;
                
                // Scoring
                var score = 0;
                var normClean = cleanTitle(normTitle);
                
                for (var j = 0; j < titles.length; j++) {
                    var candClean = cleanTitle(titles[j]);
                    if (tokenEquals(candClean, normClean)) {
                        score = 50;
                        break;
                    }
                    if (candClean.indexOf(normClean) !== -1 || normClean.indexOf(candClean) !== -1) {
                        score = Math.max(score, 20);
                    }
                }
                
                if (candYear && year && candYear === year) {
                    score += 35;
                }
                
                if (imdbRatingValue && !isNaN(candRating)) {
                    var diff = Math.abs(candRating - imdbRatingValue);
                    if (diff <= 0.5) score += 10;
                    else if (diff <= 1.0) score += 5;
                }
                
                if (result.popularity) {
                    score += Math.min(result.popularity / 100, 5);
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestId = candidateId;
                    bestIsTv = mediaType === "tv";
                }
            }
            
            if (!bestId || bestScore < 40) {
                cb([null, null]);
                return;
            }
            
            // Get external IDs
            tmdbDetails(bestIsTv ? "tv" : "movie", bestId, function(details) {
                var imdbId = details ? details.external_ids ? details.external_ids.imdb_id : null : null;
                cb([bestId, imdbId]);
            });
        });
    }
    
    // --- Main Page Configuration ---
    
    var MAIN_PAGES = [
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
        { key: "1|2;classify=4K", name: "4K Series" }
    ];
    
    // --- Core Functions ---
    
    async function getHome(cb) {
        try {
            var pages = [];
            for (var i = 0; i < MAIN_PAGES.length; i++) {
                pages.push({
                    name: MAIN_PAGES[i].name,
                    id: MAIN_PAGES[i].key,
                    hasNextPage: true
                });
            }
            
            cb({ success: true, data: pages });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }
    
    async function getHomeNext(pageId, page, cb) {
        try {
            var deviceId = generateDeviceId();
            var brandModel = randomBrandModel();
            var brand = brandModel.brand;
            var model = brandModel.model;
            
            var url;
            var pageKey = pageId;
            
            // Parse page key for filter parameters
            var parts = pageKey.split(";");
            var mainKey = parts[0];
            var filters = parts.slice(1).join(";");
            
            if (mainKey.indexOf("|") !== -1) {
                // Filter-based page
                var typeParts = mainKey.split("|");
                var typeNum = typeParts[0] === "1" ? "1" : "2"; // 1=Movies, 2=Series
                var classifyParam = "";
                var countryParam = "";
                
                if (filters.indexOf("classify=") !== -1) {
                    var classifyMatch = filters.match(/classify=([^;]+)/);
                    if (classifyMatch) {
                        classifyParam = "&classify=" + classifyMatch[1];
                    }
                }
                
                if (filters.indexOf("country=") !== -1) {
                    var countryMatch = filters.match(/country=([^;]+)/);
                    if (countryMatch) {
                        countryParam = "&country=" + countryMatch[1];
                    }
                }
                
                url = MAIN_URL + "/wefeed-mobile-bff/home/v2/list?page=" + page + "&pageSize=20&type=" + typeNum + classifyParam + countryParam;
            } else {
                // Subject-based page
                url = MAIN_URL + "/wefeed-mobile-bff/home/v2/list?page=" + page + "&pageSize=20&subjectId=" + mainKey;
            }
            
            var xClientToken = generateXClientToken();
            var xTrSignature = generateXTrSignature("GET", "application/json", "application/json", url);
            
            var headers = getHeaders(deviceId, brand, model, xClientToken, xTrSignature);
            
            http_get(url, headers, function(res) {
                if (res.status !== 200) {
                    cb({ success: false, errorCode: "FETCH_ERROR", message: "Failed to fetch data" });
                    return;
                }
                
                try {
                    var data = JSON.parse(res.body);
                    var items = data.data ? data.data.list : [];
                    if (!items) items = [];
                    
                    var results = [];
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var subjectId = item.subjectId;
                        var title = item.title;
                        var year = item.releaseDate ? item.releaseDate.substring(0, 4) : null;
                        var cover = item.cover ? item.cover.url : null;
                        var score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                        
                        results.push({
                            name: title,
                            url: "subjectId=" + subjectId,
                            poster: cover,
                            description: year ? "Year: " + year : null,
                            score: score
                        });
                    }
                    
                    cb({ success: true, data: results });
                } catch (e) {
                    cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
                }
            });
        } catch (e) {
            cb({ success: false, errorCode: "FETCH_ERROR", message: e.message });
        }
    }
    
    async function search(query, cb) {
        try {
            var deviceId = generateDeviceId();
            var brandModel = randomBrandModel();
            var brand = brandModel.brand;
            var model = brandModel.model;
            
            var url = MAIN_URL + "/wefeed-mobile-bff/search/v2/search?key=" + encodeURIComponent(query);
            
            var xClientToken = generateXClientToken();
            var xTrSignature = generateXTrSignature("GET", "application/json", "application/json", url);
            
            var headers = getHeaders(deviceId, brand, model, xClientToken, xTrSignature);
            
            http_get(url, headers, function(res) {
                if (res.status !== 200) {
                    cb({ success: false, errorCode: "SEARCH_ERROR", message: "Search failed" });
                    return;
                }
                
                try {
                    var data = JSON.parse(res.body);
                    var items = data.data ? data.data.list : [];
                    if (!items) items = [];
                    
                    var results = [];
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var subjectId = item.subjectId;
                        var title = item.title;
                        var year = item.releaseDate ? item.releaseDate.substring(0, 4) : null;
                        var cover = item.cover ? item.cover.url : null;
                        var score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                        
                        results.push({
                            name: title,
                            url: "subjectId=" + subjectId,
                            poster: cover,
                            description: year ? "Year: " + year : null,
                            score: score
                        });
                    }
                    
                    cb({ success: true, data: results });
                } catch (e) {
                    cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
                }
            });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }
    
    async function load(url, cb) {
        try {
            var deviceId = generateDeviceId();
            var brandModel = randomBrandModel();
            var brand = brandModel.brand;
            var model = brandModel.model;
            
            var subjectId = url;
            if (url.indexOf("subjectId=") !== -1) {
                var match = url.match(/subjectId=([^&]+)/);
                subjectId = match ? match[1] : url;
            }
            
            var finalUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + subjectId;
            
            var xClientToken = generateXClientToken();
            var xTrSignature = generateXTrSignature("GET", "application/json", "application/json", finalUrl);
            
            var headers = getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature);
            
            http_get(finalUrl, headers, function(res) {
                if (res.status !== 200) {
                    cb({ success: false, errorCode: "LOAD_ERROR", message: "Failed to load content" });
                    return;
                }
                
                try {
                    var data = JSON.parse(res.body);
                    var dataObj = data.data;
                    
                    var title = dataObj.title;
                    var releaseDate = dataObj.releaseDate;
                    var description = dataObj.description;
                    var genre = dataObj.genre;
                    var imdbRating = dataObj.imdbRating;
                    var imdbRatingValue = dataObj.imdbRatingValue;
                    var coverUrl = dataObj.cover ? dataObj.cover.url : null;
                    var backgroundUrl = dataObj.cover ? dataObj.cover.url : null;
                    var subjectType = dataObj.subjectType || 1;
                    
                    var year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : null;
                    var durationMinutes = parseDuration(dataObj.duration);
                    var type = subjectType === 2 ? "series" : "movie";
                    var tags = genre ? genre.split(",").map(function(g) { return g.trim(); }) : [];
                    
                    // Get actors
                    var actors = [];
                    var staffList = dataObj.staffList || [];
                    var seenActors = {};
                    for (var i = 0; i < staffList.length; i++) {
                        var staff = staffList[i];
                        if (staff.staffType === 1) {
                            var actorName = staff.name;
                            if (!seenActors[actorName]) {
                                seenActors[actorName] = true;
                                actors.push({
                                    name: actorName,
                                    role: staff.character,
                                    image: staff.avatarUrl
                                });
                            }
                        }
                    }
                    
                    // Fetch TMDB metadata
                    identifyID(title.substringBefore("(").substringBefore("["), year, imdbRating ? parseFloat(imdbRating) * 10 : null, function(tmdbResult) {
                        var tmdbId = tmdbResult[0];
                        var imdbId = tmdbResult[1];
                        
                        var logoUrl = null;
                        var meta = null;
                        
                        // Fetch logo and metadata
                        fetchTmdbLogoUrl(type, tmdbId, function(logo) {
                            logoUrl = logo;
                            
                            fetchMetaData(imdbId, type, function(metadata) {
                                meta = metadata;
                                
                                var poster = meta ? (meta.poster || coverUrl) : coverUrl;
                                var background = meta ? (meta.background || backgroundUrl) : backgroundUrl;
                                var plot = meta ? (meta.overview || description) : description;
                                var tmdbRating = meta ? meta.imdbRating : null;
                                
                                if (type === "series") {
                                    // Handle series episodes
                                    var allSubjectIds = [subjectId];
                                    
                                    // Get dubs
                                    if (dataObj.dubs) {
                                        for (var i = 0; i < dataObj.dubs.length; i++) {
                                            var sid = dataObj.dubs[i].subjectId;
                                            if (sid && allSubjectIds.indexOf(sid) === -1) {
                                                allSubjectIds.push(sid);
                                            }
                                        }
                                    }
                                    
                                    // Get episodes from all subject IDs
                                    var episodeMap = {}; // season -> array of episodes
                                    
                                    function processSeasons(index) {
                                        if (index >= allSubjectIds.length) {
                                            // Build episodes list
                                            var episodes = [];
                                            var metaVideos = meta ? (meta.videos || []) : [];
                                            
                                            var seasonKeys = Object.keys(episodeMap).map(function(k) { return parseInt(k); }).sort(function(a, b) { return a - b; });
                                            
                                            for (var s = 0; s < seasonKeys.length; s++) {
                                                var seasonNumber = seasonKeys[s];
                                                var epArray = episodeMap[seasonNumber];
                                                var epSet = {};
                                                for (var e = 0; e < epArray.length; e++) {
                                                    epSet[epArray[e]] = true;
                                                }
                                                
                                                var epNumbers = Object.keys(epSet).map(function(k) { return parseInt(k); }).sort(function(a, b) { return a - b; });
                                                
                                                for (var e = 0; e < epNumbers.length; e++) {
                                                    var episodeNumber = epNumbers[e];
                                                    var epMeta = null;
                                                    for (var v = 0; v < metaVideos.length; v++) {
                                                        if ((metaVideos[v].season || 1) === seasonNumber && (metaVideos[v].episode || 1) === episodeNumber) {
                                                            epMeta = metaVideos[v];
                                                            break;
                                                        }
                                                    }
                                                    
                                                    var epName = epMeta ? (epMeta.name || epMeta.title || "S" + seasonNumber + "E" + episodeNumber) : "S" + seasonNumber + "E" + episodeNumber;
                                                    var epDesc = epMeta ? (epMeta.overview || epMeta.description || "Season " + seasonNumber + " Episode " + episodeNumber) : "Season " + seasonNumber + " Episode " + episodeNumber;
                                                    var epThumb = epMeta ? (epMeta.thumbnail || coverUrl) : coverUrl;
                                                    var runtime = epMeta ? (parseInt(epMeta.runtime) || null) : null;
                                                    
                                                    episodes.push(new Episode({
                                                        name: epName,
                                                        url: subjectId + "|" + seasonNumber + "|" + episodeNumber,
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
                                                    url: subjectId + "|1|1",
                                                    season: 1,
                                                    episode: 1,
                                                    posterUrl: coverUrl
                                                }));
                                            }
                                            
                                            var result = new MultimediaItem({
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
                                                syncData: { tmdb: tmdbId ? tmdbId.toString() : null, imdb: imdbId }
                                            });
                                            
                                            cb({ success: true, data: result });
                                            return;
                                        }
                                        
                                        var sid = allSubjectIds[index];
                                        var seasonUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/season-info?subjectId=" + sid;
                                        var seasonSig = generateXTrSignature("GET", "application/json", "application/json", seasonUrl);
                                        var seasonHeaders = JSON.parse(JSON.stringify(headers));
                                        seasonHeaders["x-tr-signature"] = seasonSig;
                                        
                                        http_get(seasonUrl, seasonHeaders, function(seasonRes) {
                                            if (seasonRes.status === 200) {
                                                try {
                                                    var seasonData = JSON.parse(seasonRes.body);
                                                    var seasons = seasonData.data ? seasonData.data.seasons : [];
                                                    if (seasons) {
                                                        for (var i = 0; i < seasons.length; i++) {
                                                            var season = seasons[i];
                                                            var seasonNumber = season.se || 1;
                                                            var maxEp = season.maxEp || 1;
                                                            
                                                            if (!episodeMap[seasonNumber]) {
                                                                episodeMap[seasonNumber] = [];
                                                            }
                                                            for (var ep = 1; ep <= maxEp; ep++) {
                                                                episodeMap[seasonNumber].push(ep);
                                                            }
                                                        }
                                                    }
                                                } catch (e) {}
                                            }
                                            processSeasons(index + 1);
                                        });
                                    }
                                    
                                    processSeasons(0);
                                } else {
                                    // Handle movie
                                    var result = new MultimediaItem({
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
                                        syncData: { tmdb: tmdbId ? tmdbId.toString() : null, imdb: imdbId }
                                    });
                                    
                                    cb({ success: true, data: result });
                                }
                            });
                        });
                    });
                } catch (e) {
                    cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
                }
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }
    
    async function loadStreams(url, cb) {
        try {
            var deviceId = generateDeviceId();
            var brandModel = randomBrandModel();
            var brand = brandModel.brand;
            var model = brandModel.model;
            
            // Parse URL for subject ID, season, episode
            var parts = url.split("|");
            var originalSubjectId = parts[0];
            var season = parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
            var episode = parts.length > 2 ? parseInt(parts[2]) || 0 : 0;
            
            // Extract subject ID if URL format
            if (originalSubjectId.indexOf("subjectId=") !== -1) {
                var match = originalSubjectId.match(/subjectId=([^&]+)/);
                originalSubjectId = match ? match[1] : originalSubjectId;
            } else if (originalSubjectId.indexOf("/") !== -1) {
                originalSubjectId = originalSubjectId.substring(originalSubjectId.lastIndexOf("/") + 1);
            }
            
            // Get subject info to find dubs
            var subjectUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + originalSubjectId;
            var subjectXClientToken = generateXClientToken();
            var subjectXTrSignature = generateXTrSignature("GET", "application/json", "application/json", subjectUrl);
            var subjectHeaders = getOneroomHeaders(deviceId, brand, model, subjectXClientToken, subjectXTrSignature);
            
            http_get(subjectUrl, subjectHeaders, function(subjectRes) {
                if (subjectRes.status !== 200) {
                    cb({ success: false, errorCode: "STREAM_ERROR", message: "Failed to get subject info" });
                    return;
                }
                
                try {
                    var subjectData = JSON.parse(subjectRes.body);
                    var subjectDataObj = subjectData.data;
                    
                    // Get subject IDs with languages
                    var subjectIds = [];
                    var originalLanguageName = "Original";
                    
                    if (subjectDataObj && subjectDataObj.dubs) {
                        for (var i = 0; i < subjectDataObj.dubs.length; i++) {
                            var dub = subjectDataObj.dubs[i];
                            var dubSubjectId = dub.subjectId;
                            var lanName = dub.lanName;
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
                    var xUserHeader = subjectRes.headers ? subjectRes.headers["x-user"] : null;
                    var token = null;
                    if (xUserHeader) {
                        try {
                            var xUserJson = JSON.parse(xUserHeader);
                            token = xUserJson.token;
                        } catch (e) {}
                    }
                    
                    var results = [];
                    
                    // Process each subject ID
                    function processSubject(index) {
                        if (index >= subjectIds.length) {
                            if (results.length === 0) {
                                cb({ success: false, errorCode: "NO_STREAMS", message: "No streams found" });
                            } else {
                                cb({ success: true, data: results });
                            }
                            return;
                        }
                        
                        var subjectInfo = subjectIds[index];
                        var subjectId = subjectInfo.id;
                        var language = subjectInfo.language;
                        
                        var playUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + subjectId + "&se=" + season + "&ep=" + episode;
                        var xClientToken = generateXClientToken();
                        var xTrSignature = generateXTrSignature("GET", "application/json", "application/json", playUrl);
                        var playHeaders = getOneroomHeaders(deviceId, brand, model, xClientToken, xTrSignature, token);
                        
                        http_get(playUrl, playHeaders, function(playRes) {
                            if (playRes.status !== 200) {
                                processSubject(index + 1);
                                return;
                            }
                            
                            try {
                                var playData = JSON.parse(playRes.body);
                                var streams = playData.data ? playData.data.streams : [];
                                
                                if (streams && streams.length > 0) {
                                    for (var i = 0; i < streams.length; i++) {
                                        var stream = streams[i];
                                        var streamUrl = stream.url;
                                        if (!streamUrl) continue;
                                        
                                        var format = stream.format || "";
                                        var resolutions = stream.resolutions || "";
                                        var signCookie = stream.signCookie;
                                        var streamId = stream.id || (subjectId + "|" + season + "|" + episode);
                                        
                                        var quality = getHighestQuality(resolutions);
                                        var qualityStr = getQualityString(quality);
                                        
                                        var streamResult = new StreamResult({
                                            url: streamUrl,
                                            quality: qualityStr,
                                            source: language.replace("dub", "Audio"),
                                            headers: {
                                                "Referer": MAIN_URL
                                            }
                                        });
                                        
                                        if (signCookie) {
                                            streamResult.headers["Cookie"] = signCookie;
                                        }
                                        
                                        results.push(streamResult);
                                        
                                        // Get subtitles
                                        var subLink = MAIN_URL + "/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=" + subjectId + "&streamId=" + streamId;
                                        var subXClientToken = generateXClientToken();
                                        var subXTrSignature = generateXTrSignature("GET", "", "", subLink);
                                        var subHeaders = {
                                            "Authorization": token ? "Bearer " + token : "",
                                            "user-agent": playHeaders["user-agent"],
                                            "Accept": "",
                                            "x-client-info": getOneroomClientInfo(deviceId, brand, model),
                                            "X-Client-Status": "0",
                                            "Content-Type": "",
                                            "X-Client-Token": subXClientToken,
                                            "x-tr-signature": subXTrSignature
                                        };
                                        
                                        http_get(subLink, subHeaders, function(subRes) {
                                            if (subRes.status === 200) {
                                                try {
                                                    var subData = JSON.parse(subRes.body);
                                                    var captions = subData.data ? subData.data.extCaptions : [];
                                                    
                                                    if (captions) {
                                                        for (var c = 0; c < captions.length; c++) {
                                                            var caption = captions[c];
                                                            var captionUrl = caption.url;
                                                            var lang = caption.language || caption.lanName || caption.lan || "Unknown";
                                                            
                                                            if (captionUrl) {
                                                                if (!streamResult.subtitles) {
                                                                    streamResult.subtitles = [];
                                                                }
                                                                streamResult.subtitles.push({
                                                                    url: captionUrl,
                                                                    label: lang + " (" + language.replace("dub", "Audio") + ")",
                                                                    lang: lang
                                                                });
                                                            }
                                                        }
                                                    }
                                                } catch (e) {}
                                            }
                                        });
                                    }
                                } else {
                                    // Fallback: Get resource detectors if no streams
                                    var fallbackUrl = MAIN_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + subjectId;
                                    var fallbackXTrSignature = generateXTrSignature("GET", "application/json", "application/json", fallbackUrl);
                                    var fallbackHeaders = JSON.parse(JSON.stringify(playHeaders));
                                    fallbackHeaders["x-tr-signature"] = fallbackXTrSignature;
                                    
                                    http_get(fallbackUrl, fallbackHeaders, function(fallbackRes) {
                                        if (fallbackRes.status === 200) {
                                            try {
                                                var fallbackData = JSON.parse(fallbackRes.body);
                                                var detectors = fallbackData.data ? fallbackData.data.resourceDetectors : [];
                                                
                                                if (detectors) {
                                                    for (var d = 0; d < detectors.length; d++) {
                                                        var detector = detectors[d];
                                                        var resolutionList = detector.resolutionList || [];
                                                        for (var r = 0; r < resolutionList.length; r++) {
                                                            var video = resolutionList[r];
                                                            var link = video.resourceLink;
                                                            var quality = video.resolution;
                                                            var se = video.se;
                                                            var ep = video.ep;
                                                            
                                                            if (link) {
                                                                results.push(new StreamResult({
                                                                    url: link,
                                                                    quality: quality ? quality + "p" : "Auto",
                                                                    source: language.replace("dub", "Audio"),
                                                                    headers: { "Referer": MAIN_URL }
                                                                }));
                                                            }
                                                        }
                                                    }
                                                }
                                            } catch (e) {}
                                        }
                                        processSubject(index + 1);
                                    });
                                    return;
                                }
                            } catch (e) {
                                console.error("Error processing subject " + subjectId + ": " + e.message);
                            }
                            
                            processSubject(index + 1);
                        });
                    }
                    
                    processSubject(0);
                } catch (e) {
                    cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
                }
            });
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
