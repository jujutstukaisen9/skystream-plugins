/**
 * MovieBox for SkyStream
 * Ported from CloudStream MovieBoxProvider
 * Base API: https://api3.aoneroom.com
 */

(function() {
    var BASE_URL = manifest.baseUrl || "https://api3.aoneroom.com";
    
    // Secret keys from original Kotlin code
    var SECRET_DEFAULT = atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
    var SECRET_ALT = atob("WHZuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==");
    
    // Device generation
    function randomDevice() {
        var chars = "0123456789abcdef";
        var id = "";
        for (var i = 0; i < 32; i++) {
            id += chars.charAt(Math.floor(Math.random() * 16));
        }
        return id;
    }
    
    function randomBrand() {
        var brands = ["Samsung", "Xiaomi", "OnePlus", "Google", "Realme"];
        var models = {
            "Samsung": ["SM-S918B", "SM-A528B"],
            "Xiaomi": ["2201117TI", "M2012K11AI"],
            "OnePlus": ["LE2111", "CPH2449"],
            "Google": ["Pixel 7", "Pixel 8"],
            "Realme": ["RMX3085", "RMX3360"]
        };
        var brand = brands[Math.floor(Math.random() * brands.length)];
        var model = models[brand][Math.floor(Math.random() * models[brand].length)];
        return { brand: brand, model: model };
    }
    
    // MD5 implementation
    function md5cycle(x, k) {
        var a = x[0], b = x[1], c = x[2], d = x[3];
        
        a = ff(a, b, c, d, k[0], 7, -680876936);
        d = ff(d, a, b, c, k[1], 12, -389564586);
        c = ff(c, d, a, b, k[2], 17, 606105819);
        b = ff(b, c, d, a, k[3], 22, -1044525330);
        a = ff(a, b, c, d, k[4], 7, -176418897);
        d = ff(d, a, b, c, k[5], 12, 1200080426);
        c = ff(c, d, a, b, k[6], 17, -1473231341);
        b = ff(b, c, d, a, k[7], 22, -45705983);
        a = ff(a, b, c, d, k[8], 7, 1770035416);
        d = ff(d, a, b, c, k[9], 12, -1958414417);
        c = ff(c, d, a, b, k[10], 17, -42063);
        b = ff(b, c, d, a, k[11], 22, -1990404162);
        a = ff(a, b, c, d, k[12], 7, 1804603682);
        d = ff(d, a, b, c, k[13], 12, -40341101);
        c = ff(c, d, a, b, k[14], 17, -1502002290);
        b = ff(b, c, d, a, k[15], 22, 1236535329);
        
        a = gg(a, b, c, d, k[1], 5, -165796510);
        d = gg(d, a, b, c, k[6], 9, -1069501632);
        c = gg(c, d, a, b, k[11], 14, 643717713);
        b = gg(b, c, d, a, k[0], 20, -373897302);
        a = gg(a, b, c, d, k[5], 5, -701558691);
        d = gg(d, a, b, c, k[10], 9, 38016083);
        c = gg(c, d, a, b, k[15], 14, -660478335);
        b = gg(b, c, d, a, k[4], 20, -405537848);
        a = gg(a, b, c, d, k[9], 5, 568446438);
        d = gg(d, a, b, c, k[14], 9, -1019803690);
        c = gg(c, d, a, b, k[3], 14, -187363961);
        b = gg(b, c, d, a, k[8], 20, 1163531501);
        a = gg(a, b, c, d, k[13], 5, -1444681467);
        d = gg(d, a, b, c, k[2], 9, -51403784);
        c = gg(c, d, a, b, k[7], 14, 1735328473);
        b = gg(b, c, d, a, k[12], 20, -1926607734);
        
        a = hh(a, b, c, d, k[5], 4, -378558);
        d = hh(d, a, b, c, k[8], 11, -2022574463);
        c = hh(c, d, a, b, k[11], 16, 1839030562);
        b = hh(b, c, d, a, k[14], 23, -35309556);
        a = hh(a, b, c, d, k[1], 4, -1530992060);
        d = hh(d, a, b, c, k[4], 11, 1272893353);
        c = hh(c, d, a, b, k[7], 16, -155497632);
        b = hh(b, c, d, a, k[10], 23, -1094730640);
        a = hh(a, b, c, d, k[13], 4, 681279174);
        d = hh(d, a, b, c, k[0], 11, -358537222);
        c = hh(c, d, a, b, k[3], 16, -722521979);
        b = hh(b, c, d, a, k[6], 23, 76029189);
        a = hh(a, b, c, d, k[9], 4, -640364487);
        d = hh(d, a, b, c, k[12], 11, -421815835);
        c = hh(c, d, a, b, k[15], 16, 530742520);
        b = hh(b, c, d, a, k[2], 23, -995338651);
        
        a = ii(a, b, c, d, k[0], 6, -198630844);
        d = ii(d, a, b, c, k[7], 10, 1126891415);
        c = ii(c, d, a, b, k[14], 15, -1416354905);
        b = ii(b, c, d, a, k[5], 21, -57434055);
        a = ii(a, b, c, d, k[12], 6, 1700485571);
        d = ii(d, a, b, c, k[3], 10, -1894986606);
        c = ii(c, d, a, b, k[10], 15, -1051523);
        b = ii(b, c, d, a, k[1], 21, -2054922799);
        a = ii(a, b, c, d, k[8], 6, 1873313359);
        d = ii(d, a, b, c, k[15], 10, -30611744);
        c = ii(c, d, a, b, k[6], 15, -1560198380);
        b = ii(b, c, d, a, k[13], 21, 1309151649);
        a = ii(a, b, c, d, k[4], 6, -145523070);
        d = ii(d, a, b, c, k[11], 10, -1120210379);
        c = ii(c, d, a, b, k[2], 15, 718787259);
        b = ii(b, c, d, a, k[9], 21, -343485551);
        
        x[0] = add32(a, x[0]);
        x[1] = add32(b, x[1]);
        x[2] = add32(c, x[2]);
        x[3] = add32(d, x[3]);
    }
    
    function cmn(q, a, b, x, s, t) {
        a = add32(add32(a, q), add32(x, t));
        return add32((a << s) | (a >>> (32 - s)), b);
    }
    
    function ff(a, b, c, d, x, s, t) {
        return cmn((b & c) | ((~b) & d), a, b, x, s, t);
    }
    
    function gg(a, b, c, d, x, s, t) {
        return cmn((b & d) | (c & (~d)), a, b, x, s, t);
    }
    
    function hh(a, b, c, d, x, s, t) {
        return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    
    function ii(a, b, c, d, x, s, t) {
        return cmn(c ^ (b | (~d)), a, b, x, s, t);
    }
    
    function md51(s) {
        var n = s.length;
        var state = [1732584193, -271733879, -1732584194, 271733878];
        var i;
        for (i = 64; i <= s.length; i += 64) {
            md5cycle(state, md5blk(s.substring(i - 64, i)));
        }
        s = s.substring(i - 64);
        var tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        for (i = 0; i < s.length; i++)
            tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
        tail[i >> 2] |= 0x80 << ((i % 4) << 3);
        if (i > 55) {
            md5cycle(state, tail);
            for (i = 0; i < 16; i++) tail[i] = 0;
        }
        tail[14] = n * 8;
        md5cycle(state, tail);
        return state;
    }
    
    function md5blk(s) {
        var md5blks = [];
        for (var i = 0; i < 64; i += 4) {
            md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
        }
        return md5blks;
    }
    
    function rhex(n) {
        var s = "", j;
        for (j = 0; j < 4; j++)
            s += ((n >> (j * 8 + 4)) & 0x0F).toString(16) + ((n >> (j * 8)) & 0x0F).toString(16);
        return s;
    }
    
    function hex(x) {
        for (var i = 0; i < x.length; i++)
            x[i] = rhex(x[i]);
        return x.join("");
    }
    
    function md5(s) {
        return hex(md51(s));
    }
    
    function add32(a, b) {
        return (a + b) & 0xFFFFFFFF;
    }
    
    // String reverse
    function reverse(s) {
        var r = "";
        for (var i = s.length - 1; i >= 0; i--) r += s.charAt(i);
        return r;
    }
    
    // Generate tokens
    function genClientToken() {
        var ts = Date.now().toString();
        var rev = reverse(ts);
        return ts + "," + md5(rev);
    }
    
    function parseUrl(url) {
        var pathStart = url.indexOf("/", 8);
        var path = url.substring(pathStart);
        var qIdx = path.indexOf("?");
        if (qIdx > 0) {
            var basePath = path.substring(0, qIdx);
            var query = path.substring(qIdx + 1);
            var params = query.split("&").sort();
            return basePath + "?" + params.join("&");
        }
        return path;
    }
    
    function genSignature(method, url, body, ts) {
        if (!ts) ts = Date.now().toString();
        var path = parseUrl(url);
        var bodyHash = body ? md5(body) : "";
        var bodyLen = body ? body.length.toString() : "";
        var canon = method.toUpperCase() + "\napplication/json\napplication/json\n" + bodyLen + "\n" + ts + "\n" + bodyHash + "\n" + path;
        var sig = md5(canon + SECRET_DEFAULT);
        return ts + "|2|" + btoa(sig);
    }
    
    function getHeaders(deviceId, brand, model) {
        var token = genClientToken();
        var clientInfo = JSON.stringify({
            package_name: "com.community.mbox.in",
            version_name: "3.0.03.0529.03",
            version_code: 50020042,
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
        
        return {
            "user-agent": "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)",
            "accept": "application/json",
            "content-type": "application/json",
            "x-client-token": token,
            "x-client-info": clientInfo,
            "x-client-status": "0",
            "x-play-mode": "2"
        };
    }
    
    // API request
    function apiGet(url, headers, cb) {
        var sig = genSignature("GET", url, null);
        headers["x-tr-signature"] = sig;
        
        http_get(url, headers).then(function(res) {
            if (res.status === 200) {
                try {
                    var data = JSON.parse(res.body);
                    cb(true, data);
                } catch (e) {
                    cb(false, null);
                }
            } else {
                cb(false, null);
            }
        }).catch(function() {
            cb(false, null);
        });
    }
    
    // --- HOME ---
    async function getHome(cb) {
        try {
            var pages = [
                { name: "Trending", id: "4516404531735022304", hasNextPage: true },
                { name: "Bollywood", id: "414907768299210008", hasNextPage: true },
                { name: "South Indian", id: "3859721901924910512", hasNextPage: true },
                { name: "Hollywood", id: "8019599703232971616", hasNextPage: true },
                { name: "Anime", id: "8434602210994128512", hasNextPage: true },
                { name: "Top Series", id: "4741626294545400336", hasNextPage: true },
                { name: "Movies", id: "1|1", hasNextPage: true },
                { name: "Series", id: "1|2", hasNextPage: true },
                { name: "Hindi Dubbed", id: "1|1;classify=Hindi dub", hasNextPage: true },
                { name: "Tamil Dubbed", id: "1|1;classify=Tamil dub", hasNextPage: true }
            ];
            
            cb({ success: true, data: pages });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERR", message: e.message });
        }
    }
    
    // --- HOME NEXT ---
    async function getHomeNext(pageId, page, cb) {
        var deviceId = randomDevice();
        var brandInfo = randomBrand();
        var headers = getHeaders(deviceId, brandInfo.brand, brandInfo.model);
        
        var url;
        if (pageId.indexOf("|") > 0) {
            var parts = pageId.split(";");
            var main = parts[0].split("|");
            var type = main[1] || "1";
            var extra = "";
            if (parts.length > 1) extra = "&" + parts[1];
            url = BASE_URL + "/wefeed-mobile-bff/home/v2/list?page=" + page + "&pageSize=20&type=" + type + extra;
        } else {
            url = BASE_URL + "/wefeed-mobile-bff/home/v2/list?page=" + page + "&pageSize=20&subjectId=" + pageId;
        }
        
        apiGet(url, headers, function(ok, data) {
            if (!ok || !data || !data.data) {
                cb({ success: false, errorCode: "FETCH_ERR", message: "Failed" });
                return;
            }
            
            var items = data.data.list || [];
            var results = [];
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var title = item.title || "";
                var sid = item.subjectId || "";
                var year = item.releaseDate ? item.releaseDate.substring(0, 4) : "";
                var poster = item.cover && item.cover.url ? item.cover.url : "";
                var score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                
                results.push({
                    name: title,
                    url: "subjectId=" + sid,
                    poster: poster,
                    description: year ? "Year: " + year : null,
                    score: score
                });
            }
            
            cb({ success: true, data: results });
        });
    }
    
    // --- SEARCH ---
    async function search(query, cb) {
        var deviceId = randomDevice();
        var brandInfo = randomBrand();
        var headers = getHeaders(deviceId, brandInfo.brand, brandInfo.model);
        
        var url = BASE_URL + "/wefeed-mobile-bff/search/v2/search?key=" + encodeURIComponent(query);
        
        apiGet(url, headers, function(ok, data) {
            if (!ok || !data || !data.data) {
                cb({ success: false, errorCode: "SEARCH_ERR", message: "Failed" });
                return;
            }
            
            var items = data.data.list || [];
            var results = [];
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var title = item.title || "";
                var sid = item.subjectId || "";
                var year = item.releaseDate ? item.releaseDate.substring(0, 4) : "";
                var poster = item.cover && item.cover.url ? item.cover.url : "";
                var score = item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : null;
                
                results.push({
                    name: title,
                    url: "subjectId=" + sid,
                    poster: poster,
                    description: year ? "Year: " + year : null,
                    score: score
                });
            }
            
            cb({ success: true, data: results });
        });
    }
    
    // --- LOAD ---
    async function load(url, cb) {
        var deviceId = randomDevice();
        var brandInfo = randomBrand();
        var headers = getHeaders(deviceId, brandInfo.brand, brandInfo.model);
        headers["user-agent"] = "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + brandInfo.brand + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)";
        
        var sid = url;
        if (url.indexOf("subjectId=") === 0) {
            sid = url.substring(10);
        }
        
        var apiUrl = BASE_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + sid;
        
        apiGet(apiUrl, headers, function(ok, data) {
            if (!ok || !data || !data.data) {
                cb({ success: false, errorCode: "LOAD_ERR", message: "Failed" });
                return;
            }
            
            var d = data.data;
            var title = d.title || "";
            var desc = d.description || "";
            var year = d.releaseDate ? parseInt(d.releaseDate.substring(0, 4)) : null;
            var poster = d.cover && d.cover.url ? d.cover.url : "";
            var type = d.subjectType === 2 ? "series" : "movie";
            var score = d.imdbRating ? parseFloat(d.imdbRating) * 10 : null;
            var genres = d.genre ? d.genre.split(",") : [];
            
            var actors = [];
            if (d.staffList) {
                for (var i = 0; i < d.staffList.length; i++) {
                    var s = d.staffList[i];
                    if (s.staffType === 1) {
                        actors.push({
                            name: s.name || "",
                            role: s.character || "",
                            image: s.avatarUrl || ""
                        });
                    }
                }
            }
            
            if (type === "series") {
                // Get seasons
                var seasonUrl = BASE_URL + "/wefeed-mobile-bff/subject-api/season-info?subjectId=" + sid;
                apiGet(seasonUrl, headers, function(ok2, data2) {
                    var episodes = [];
                    
                    if (ok2 && data2 && data2.data && data2.data.seasons) {
                        var seasons = data2.data.seasons;
                        for (var si = 0; si < seasons.length; si++) {
                            var s = seasons[si];
                            var seasonNum = s.se || 1;
                            var maxEp = s.maxEp || 1;
                            
                            for (var ep = 1; ep <= maxEp; ep++) {
                                episodes.push(new Episode({
                                    name: "Episode " + ep,
                                    url: sid + "|" + seasonNum + "|" + ep,
                                    season: seasonNum,
                                    episode: ep,
                                    posterUrl: poster,
                                    description: "Season " + seasonNum + " Episode " + ep
                                }));
                            }
                        }
                    }
                    
                    if (episodes.length === 0) {
                        episodes.push(new Episode({
                            name: "Episode 1",
                            url: sid + "|1|1",
                            season: 1,
                            episode: 1,
                            posterUrl: poster
                        }));
                    }
                    
                    var result = new MultimediaItem({
                        title: title,
                        url: apiUrl,
                        posterUrl: poster,
                        bannerUrl: poster,
                        description: desc,
                        type: "series",
                        year: year,
                        score: score,
                        genres: genres,
                        cast: actors,
                        episodes: episodes,
                        syncData: {}
                    });
                    
                    cb({ success: true, data: result });
                });
            } else {
                var result = new MultimediaItem({
                    title: title,
                    url: apiUrl,
                    posterUrl: poster,
                    bannerUrl: poster,
                    description: desc,
                    type: "movie",
                    year: year,
                    score: score,
                    genres: genres,
                    cast: actors,
                    syncData: {}
                });
                
                cb({ success: true, data: result });
            }
        });
    }
    
    // --- LOAD STREAMS ---
    async function loadStreams(url, cb) {
        var deviceId = randomDevice();
        var brandInfo = randomBrand();
        var headers = getHeaders(deviceId, brandInfo.brand, brandInfo.model);
        headers["user-agent"] = "com.community.oneroom/50020088 (Linux; U; Android 13; en_US; " + brandInfo.brand + "; Build/TQ3A.230901.001; Cronet/145.0.7582.0)";
        
        var parts = url.split("|");
        var sid = parts[0];
        var season = parts.length > 1 ? parts[1] : "0";
        var episode = parts.length > 2 ? parts[2] : "0";
        
        if (sid.indexOf("subjectId=") === 0) {
            sid = sid.substring(10);
        }
        
        var playUrl = BASE_URL + "/wefeed-mobile-bff/subject-api/play-info?subjectId=" + sid + "&se=" + season + "&ep=" + episode;
        
        apiGet(playUrl, headers, function(ok, data) {
            if (!ok || !data || !data.data) {
                cb({ success: false, errorCode: "STREAM_ERR", message: "No streams" });
                return;
            }
            
            var streams = data.data.streams || [];
            var results = [];
            
            for (var i = 0; i < streams.length; i++) {
                var s = streams[i];
                var streamUrl = s.url;
                if (!streamUrl) continue;
                
                var res = s.resolutions || "";
                var quality = "Auto";
                if (res.indexOf("1080") >= 0) quality = "1080p";
                else if (res.indexOf("720") >= 0) quality = "720p";
                else if (res.indexOf("480") >= 0) quality = "480p";
                else if (res.indexOf("2160") >= 0 || res.indexOf("4K") >= 0) quality = "4K";
                
                var streamResult = new StreamResult({
                    url: streamUrl,
                    quality: quality,
                    source: "MovieBox",
                    headers: { "Referer": BASE_URL }
                });
                
                if (s.signCookie) {
                    streamResult.headers["Cookie"] = s.signCookie;
                }
                
                results.push(streamResult);
            }
            
            // Fallback to resource detectors
            if (results.length === 0) {
                var getUrl = BASE_URL + "/wefeed-mobile-bff/subject-api/get?subjectId=" + sid;
                apiGet(getUrl, headers, function(ok2, data2) {
                    if (ok2 && data2 && data2.data && data2.data.resourceDetectors) {
                        var detectors = data2.data.resourceDetectors;
                        for (var j = 0; j < detectors.length; j++) {
                            var det = detectors[j];
                            if (det.resolutionList) {
                                for (var k = 0; k < det.resolutionList.length; k++) {
                                    var resItem = det.resolutionList[k];
                                    if (resItem.resourceLink) {
                                        results.push(new StreamResult({
                                            url: resItem.resourceLink,
                                            quality: resItem.resolution ? resItem.resolution + "p" : "Auto",
                                            source: "MovieBox",
                                            headers: { "Referer": BASE_URL }
                                        }));
                                    }
                                }
                            }
                        }
                    }
                    
                    if (results.length > 0) {
                        cb({ success: true, data: results });
                    } else {
                        cb({ success: false, errorCode: "NO_STREAMS", message: "No streams found" });
                    }
                });
            } else {
                cb({ success: true, data: results });
            }
        });
    }
    
    // Export
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
    
})();