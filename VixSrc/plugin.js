(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const API_KEY = "68e094699525b18a70bab2f86b1fa706";
    const TMDB_API = "https://api.themoviedb.org/3";
    const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
    const TMDB_IMG_ORIG = "https://image.tmdb.org/t/p/original";
    const LANG = "en-US";
    const REFERER = "https://www.themoviedb.org/";
    
    const VIXSRC_BASE = "https://vixsrc.to";

    const PROVIDERS = {
        netflix: 8,
        amazon: 119,
        aha: 532
    };

    function img(path) {
        if (!path) return "";
        if (path.indexOf("http") === 0) return path;
        return TMDB_IMG + path;
    }

    function origImg(path) {
        if (!path) return "";
        if (path.indexOf("http") === 0) return path;
        return TMDB_IMG_ORIG + path;
    }

    function buildUrl(path, params) {
        var url = TMDB_API + path + "?api_key=" + API_KEY + "&language=" + LANG;
        if (params) {
            for (var key in params) {
                if (params.hasOwnProperty(key) && params[key] !== undefined && params[key] !== null) {
                    url = url + "&" + key + "=" + encodeURIComponent(params[key]);
                }
            }
        }
        return url;
    }

    async function api(path, params) {
        var url = buildUrl(path, params);
        var res = await http_get(url, {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": REFERER
        });
        var body = res.body || "";
        if (!body) {
            throw new Error("Empty response");
        }
        if (res.status === 401) {
            throw new Error("Unauthorized");
        }
        if (body.indexOf("<") === 0) {
            throw new Error("Invalid response");
        }
        return JSON.parse(body);
    }

    async function fetchPages(path, params, pages) {
        var all = [];
        for (var p = 1; p <= pages; p++) {
            try {
                var pageParams = { page: p };
                for (var key in params) {
                    if (params.hasOwnProperty(key)) pageParams[key] = params[key];
                }
                var data = await api(path, pageParams);
                if (data.results && data.results.length > 0) {
                    all = all.concat(data.results);
                } else if (p > 1) {
                    break;
                }
            } catch (e) {
                if (p === 1) throw e;
                break;
            }
        }
        return all;
    }

    function uniqueById(arr) {
        var seen = {};
        return arr.filter(function(item) {
            if (!seen[item.id]) {
                seen[item.id] = true;
                return true;
            }
            return false;
        });
    }

    function makeItem(item, type) {
        var t = type === "tv" ? "series" : "movie";
        var dateStr = item.release_date || item.first_air_date || "";
        var year = dateStr ? parseInt(dateStr.split("-")[0]) : undefined;
        var title = item.title || item.name || item.original_title || item.original_name || "Unknown";
        return new MultimediaItem({
            title: title,
            url: JSON.stringify({ id: item.id, type: type }),
            posterUrl: img(item.poster_path),
            bannerUrl: origImg(item.backdrop_path),
            year: year,
            score: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : undefined,
            description: item.overview || "",
            type: t,
            contentType: t
        });
    }

    async function getHome(cb) {
        try {
            var sections = {};
            var results = await Promise.allSettled([
                fetchPages("/discover/movie", {
                    with_watch_providers: PROVIDERS.netflix,
                    watch_region: "IN",
                    with_original_language: "te",
                    sort_by: "release_date.desc"
                }, 2),
                fetchPages("/discover/movie", {
                    with_watch_providers: PROVIDERS.amazon,
                    watch_region: "IN",
                    with_original_language: "te",
                    sort_by: "release_date.desc"
                }, 2),
                fetchPages("/discover/movie", {
                    with_watch_providers: PROVIDERS.aha,
                    watch_region: "IN",
                    with_original_language: "te",
                    sort_by: "release_date.desc"
                }, 2),
                fetchPages("/discover/movie", {
                    with_watch_providers: PROVIDERS.netflix,
                    watch_region: "IN",
                    with_original_language: "te",
                    sort_by: "popularity.desc"
                }, 2),
                fetchPages("/discover/movie", {
                    with_watch_providers: PROVIDERS.amazon,
                    watch_region: "IN",
                    with_original_language: "te",
                    sort_by: "popularity.desc"
                }, 2),
                fetchPages("/trending/all/week", {}, 2)
            ]);

            var netflixLatest = results[0].status === "fulfilled" ? results[0].value : [];
            var amazonLatest = results[1].status === "fulfilled" ? results[1].value : [];
            var ahaLatest = results[2].status === "fulfilled" ? results[2].value : [];
            var combinedLatest = uniqueById(netflixLatest.concat(amazonLatest).concat(ahaLatest));
            combinedLatest.sort(function(a, b) {
                var dateA = a.release_date ? new Date(a.release_date) : new Date(0);
                var dateB = b.release_date ? new Date(b.release_date) : new Date(0);
                return dateB - dateA;
            });

            if (combinedLatest.length > 0) {
                sections["Latest OTT Releases"] = combinedLatest.slice(0, 30).map(function(i) { return makeItem(i, "movie"); });
            }

            var netflixPop = results[3].status === "fulfilled" ? results[3].value : [];
            var amazonPop = results[4].status === "fulfilled" ? results[4].value : [];
            var combinedPop = uniqueById(netflixPop.concat(amazonPop));
            combinedPop.sort(function(a, b) { return (b.popularity || 0) - (a.popularity || 0); });

            if (combinedPop.length > 0) {
                sections["Popular"] = combinedPop.slice(0, 30).map(function(i) { return makeItem(i, "movie"); });
            }

            if (results[0].status === "fulfilled" && results[0].value.length > 0) {
                sections["Netflix"] = results[0].value.slice(0, 30).map(function(i) { return makeItem(i, "movie"); });
            }

            if (results[1].status === "fulfilled" && results[1].value.length > 0) {
                sections["Amazon Prime"] = results[1].value.slice(0, 30).map(function(i) { return makeItem(i, "movie"); });
            }

            if (results[2].status === "fulfilled" && results[2].value.length > 0) {
                sections["Aha"] = results[2].value.slice(0, 30).map(function(i) { return makeItem(i, "movie"); });
            }

            if (results[5].status === "fulfilled" && results[5].value.length > 0) {
                sections["Trending"] = results[5].value.filter(function(i) { return i.media_type === "movie" || i.media_type === "tv"; }).slice(0, 20).map(function(i) { return makeItem(i, i.media_type); });
            }

            if (Object.keys(sections).length === 0) {
                cb({ success: false, errorCode: "NO_DATA", message: "No content found" });
                return;
            }

            cb({ success: true, data: sections });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            var q = String(query || "").trim();
            if (!q) {
                cb({ success: true, data: [] });
                return;
            }

            var data = await api("/search/multi", { query: q });
            var results = (data.results || [])
                .filter(function(i) { return i.media_type === "movie" || i.media_type === "tv"; })
                .slice(0, 30)
                .map(function(i) { return makeItem(i, i.media_type); });

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            var parsed = JSON.parse(url);
            var id = parsed.id;
            var type = parsed.type;
            var eps = [];
            var detail = await api(type === "movie" ? "/movie/" + id : "/tv/" + id, {});

            if (type === "tv") {
                var seasons = detail.seasons || [];
                for (var s = 0; s < seasons.length; s++) {
                    var season = seasons[s];
                    if (season.season_number === 0) continue;
                    try {
                        var sDetail = await api("/tv/" + id + "/season/" + season.season_number, {});
                        var episodes = sDetail.episodes || [];
                        for (var e = 0; e < episodes.length; e++) {
                            var ep = episodes[e];
                            eps.push(new Episode({
                                name: ep.name || "Episode " + ep.episode_number,
                                url: JSON.stringify({ id: id, type: "tv", season: season.season_number, episode: ep.episode_number }),
                                season: season.season_number,
                                episode: ep.episode_number,
                                posterUrl: img(ep.still_path),
                                description: ep.overview || "",
                                score: ep.vote_average || undefined
                            }));
                        }
                    } catch (_) {}
                }
                if (eps.length === 0) {
                    eps.push(new Episode({ name: detail.name || "Watch", url: url, season: 1, episode: 1 }));
                }
            } else {
                eps.push(new Episode({ name: "Full Movie", url: url, season: 1, episode: 1 }));
            }

            var dateStr = detail.release_date || detail.first_air_date || "";
            var year = dateStr ? parseInt(dateStr.split("-")[0]) : undefined;
            var title = detail.title || detail.name || detail.original_title || detail.original_name || "Unknown";
            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: img(detail.poster_path),
                    bannerUrl: origImg(detail.backdrop_path),
                    description: detail.overview || "",
                    year: year,
                    score: detail.vote_average ? parseFloat(detail.vote_average.toFixed(1)) : undefined,
                    duration: type === "movie" ? detail.runtime || undefined : undefined,
                    type: type === "movie" ? "movie" : "series",
                    contentType: type === "movie" ? "movie" : "series",
                    episodes: eps
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            var data = JSON.parse(url);
            var id = data.id;
            var type = data.type;
            var season = data.season;
            var episode = data.episode;
            var results = [];
            
            var vixsrcUrl;
            if (type === "movie") {
                vixsrcUrl = VIXSRC_BASE + "/movie/" + id;
            } else if (season && episode) {
                vixsrcUrl = VIXSRC_BASE + "/tv/" + id + "/" + season + "/" + episode;
            }
            
            if (vixsrcUrl) {
                try {
                    var res = await http_get(vixsrcUrl, {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Referer": VIXSRC_BASE + "/"
                    });
                    var html = res.body || "";
                    
                    if (html.includes("window.masterPlaylist")) {
                        var urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
                        var tokenMatch = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
                        var expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);
                        
                        if (!tokenMatch) tokenMatch = html.match(/params.*['"]token['"]:\s*['"]([^'"]+)['"]/);
                        if (!expiresMatch) expiresMatch = html.match(/params.*['"]expires['"]:\s*['"]([^'"]+)['"]/);
                        
                        if (urlMatch && tokenMatch && expiresMatch) {
                            var baseUrl = urlMatch[1];
                            var token = tokenMatch[1];
                            var expires = expiresMatch[1];
                            
                            var masterUrl;
                            if (baseUrl.includes("?b=1")) {
                                masterUrl = baseUrl + "&token=" + token + "&expires=" + expires + "&h=1&lang=en";
                            } else {
                                masterUrl = baseUrl + "?token=" + token + "&expires=" + expires + "&h=1&lang=en";
                            }
                            
                            try {
                                var m3u8Res = await http_get(masterUrl, {
                                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                                    "Referer": VIXSRC_BASE + "/",
                                    "Accept": "*/*"
                                });
                                var m3u8Content = m3u8Res.body || "";
                                
                                if (m3u8Content.includes("#EXTM3U")) {
                                    var subUrl = "";
                                    var lines = m3u8Content.split("\n");
                                    var bandwidth = "";
                                    var streamUrl = "";
                                    
                                    // Extract subtitle URL first
                                    for (var sl = 0; sl < lines.length; sl++) {
                                        var subLine = lines[sl].trim();
                                        if (subLine.includes("TYPE=SUBTITLES") && subLine.includes("NAME=")) {
                                            var uriMatch = subLine.match(/URI="([^"]+)"/);
                                            if (uriMatch) {
                                                subUrl = uriMatch[1];
                                            }
                                        }
                                    }
                                    
                                    var subtitles = [];
                                    if (subUrl) {
                                        try {
                                            var subM3u8Res = await http_get(subUrl, {
                                                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                                                "Referer": VIXSRC_BASE + "/",
                                                "Accept": "*/*"
                                            });
                                            var subM3u8Content = subM3u8Res.body || "";
                                            
                                            if (subM3u8Content.includes("#EXTM3U")) {
                                                var subLines = subM3u8Content.split("\n");
                                                for (var s = 0; s < subLines.length; s++) {
                                                    var sLine = subLines[s].trim();
                                                    if (sLine.startsWith("https://") && sLine.includes(".vtt")) {
                                                        subtitles.push({
                                                            url: sLine,
                                                            label: "English",
                                                            lang: "en"
                                                        });
                                                        break;
                                                    }
                                                }
                                            }
                                        } catch (subErr) {
                                            console.log("Subtitle fetch error: " + subErr.message);
                                        }
                                    }
                                    
                                    // Extract quality streams
                                    for (var i = 0; i < lines.length; i++) {
                                        var line = lines[i].trim();
                                        
                                        if (line.includes("BANDWIDTH=")) {
                                            var bwMatch = line.match(/BANDWIDTH=(\d+)/);
                                            bandwidth = bwMatch ? bwMatch[1] : "";
                                        } else if (line.startsWith("https://")) {
                                            streamUrl = line;
                                            
                                            var quality = "Auto";
                                            var sourceLabel = "Vixsrc";
                                            
                                            if (bandwidth === "4500000") {
                                                quality = "1080p";
                                                sourceLabel = "Vixsrc 1080p";
                                            } else if (bandwidth === "1800000") {
                                                quality = "720p";
                                                sourceLabel = "Vixsrc 720p";
                                            } else if (bandwidth === "720000") {
                                                quality = "480p";
                                                sourceLabel = "Vixsrc 480p";
                                            }
                                            
                                            if (streamUrl && quality !== "Auto") {
                                                results.push({
                                                    url: streamUrl,
                                                    quality: quality,
                                                    source: sourceLabel,
                                                    subtitles: subtitles.length > 0 ? subtitles : undefined,
                                                    headers: {
                                                        "Referer": VIXSRC_BASE + "/",
                                                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
                                                    }
                                                });
                                            }
                                            streamUrl = "";
                                            bandwidth = "";
                                        }
                                    }
                                }
                            } catch (m3u8Err) {
                                console.log("Failed to fetch m3u8: " + m3u8Err.message);
                            }
                            
                            if (results.length === 0) {
                                results.push({
                                    url: masterUrl,
                                    quality: "Auto",
                                    source: "Vixsrc Auto",
                                    headers: {
                                        "Referer": VIXSRC_BASE + "/",
                                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
                                    }
                                });
                            }
                        }
                    }
                    
                    if (results.length === 0) {
                        var m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
                        if (m3u8Match) {
                            results.push(new StreamResult({
                                url: m3u8Match[1],
                                quality: "Auto",
                                headers: {
                                    "Referer": VIXSRC_BASE + "/",
                                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
                                }
                            }));
                        }
                    }
                } catch (e) {
                    console.log("Vixsrc fetch error: " + e.message);
                }
            }
            
            if (results.length === 0) {
                try {
                    var providers = await api(type === "movie" ? "/movie/" + id + "/watch/providers" : "/tv/" + id + "/watch/providers", {});
                    var region = (providers.results && providers.results.IN) ? providers.results.IN : (providers.results && providers.results.US) ? providers.results.US : null;
                    if (region) {
                        var flat = region.flat_rate || [];
                        for (var i = 0; i < flat.length; i++) {
                            var prov = flat[i];
                            results.push(new StreamResult({
                                name: "Watch on " + prov.provider_name,
                                url: prov.link || REFERER + type + "/" + id + "/watch",
                                quality: "Auto",
                                source: prov.provider_name,
                                headers: { "Referer": REFERER }
                            }));
                        }
                    }
                } catch (_) {}
            }

            if (results.length === 0) {
                results.push(new StreamResult({
                    name: "View on TMDB",
                    url: REFERER + type + "/" + id,
                    quality: "Auto",
                    source: "TMDB",
                    headers: { "Referer": REFERER }
                }));
            }

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
