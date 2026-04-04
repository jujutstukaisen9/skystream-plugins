/**
 * DudeFilms SkyStream Plugin
 * Ported from CloudStream Kotlin Provider
 */
(function() {
    const MAIN_URL = manifest.baseUrl;
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    async function _fetch(url) {
        const res = await http_get(url, HEADERS);
        return res.body || "";
    }

    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return MAIN_URL + url;
        return MAIN_URL + "/" + url;
    }

    function cleanTitle(raw) {
        if (!raw) return "";
        const m = raw.match(/S(\d+)[Ee](\d+)(?:-(\d+))?/);
        if (!m) return raw.trim();
        const show = raw.substring(0, raw.indexOf(m[0])).trim();
        const eps = m[3] ? `Episodes ${m[2]}–${m[3]}` : `Episode ${m[2]}`;
        return `${show} Season ${m[1]} | ${eps}`;
    }

    function getQuality(str) {
        if (!str) return null;
        const s = str.toLowerCase();
        if (s.includes("2160p") || s.includes("4k") || s.includes("uhd")) return "4K";
        if (s.includes("1080p")) return "1080p";
        if (s.includes("720p")) return "720p";
        if (s.includes("480p")) return "480p";
        if (s.includes("cam") || s.includes("hdcam")) return "CAM";
        if (s.includes("web-dl") || s.includes("webdl")) return "WEB-DL";
        if (s.includes("bluray") || s.includes("bdrip")) return "BluRay";
        return null;
    }

    function isBlocked(text) {
        if (!text) return false;
        const t = text.toLowerCase();
        return t.includes("zip") || t.includes("torrent") || t.includes("rar");
    }

    function base64Decode(str) {
        try {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let o = "", i = 0;
            str = str.replace(/[^A-Za-z0-9+/=]/g, "");
            while (i < str.length) {
                const e1 = chars.indexOf(str.charAt(i++));
                const e2 = chars.indexOf(str.charAt(i++));
                const e3 = chars.indexOf(str.charAt(i++));
                const e4 = chars.indexOf(str.charAt(i++));
                o += String.fromCharCode((e1 << 2) | (e2 >> 4));
                if (e3 !== 64) o += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
                if (e4 !== 64) o += String.fromCharCode(((e3 & 3) << 6) | e4);
            }
            return decodeURIComponent(escape(o));
        } catch (e) { return ""; }
    }

    // Parse search results from HTML
    function _parseResults(html) {
        const results = [];
        const items = html.split('<div class="simple-grid-grid-post');
        
        for (let i = 1; i < items.length; i++) {
            const item = items[i];
            
            // Get link
            const lm = item.match(/href="([^"]+)"/);
            if (!lm) continue;
            const href = fixUrl(lm[1]);
            
            // Get poster - try multiple patterns
            let poster = "";
            const pm = item.match(/data-src=["']([^"']+)["']/) || 
                      item.match(/src=["']([^"']+)["']/) ||
                      item.match(/data-lazy-src=["']([^"']+)["']/);
            if (pm) poster = fixUrl(pm[1]);
            
            // Get title
            const tm = item.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
            if (!tm) continue;
            const titleText = tm[1].replace(/<[^>]+>/g, "").trim();
            const title = cleanTitle(titleText);
            
            // Determine type
            const isSeries = href.includes("/tv-series/") || 
                            href.includes("/series/") ||
                            /season-\d+/i.test(href);
            
            results.push(new MultimediaItem({
                url: href,
                title: title,
                posterUrl: poster,
                type: isSeries ? "series" : "movie"
            }));
        }
        
        return results;
    }

    // Extract streams from HubCloud
    async function extractHubCloud(url) {
        const streams = [];
        
        try {
            // Get real URL
            let realUrl = url;
            if (!url.includes("hubcloud.php")) {
                const html = await _fetch(url);
                const dm = html.match(/id="download"[^>]*href="([^"]+)"/);
                if (dm) realUrl = fixUrl(dm[1]);
            }
            
            // Get hubcloud page
            const html = await _fetch(realUrl);
            
            // Get quality from header
            const hm = html.match(/<div[^>]*class="card-header"[^>]*>([\s\S]*?)<\/div>/);
            const quality = hm ? getQuality(hm[1]) : "Auto";
            
            // Get size
            const sm = html.match(/<i[^>]*id="size"[^>]*>([^<]*)<\/i>/);
            const size = sm ? sm[1].trim() : "";
            
            // Parse buttons
            const btnRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
            let m;
            
            while ((m = btnRegex.exec(html)) !== null) {
                const link = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
                
                if (isBlocked(text)) continue;
                
                const label = size ? `[${size}]` : "";
                
                if (text.includes("download file")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `HubCloud ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("fsl server") && !text.includes("fslv2")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `FSL Server ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("fslv2")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `FSLv2 ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("buzzserver")) {
                    try {
                        const res = await http_get(link + "/download", {
                            "Referer": link,
                            "User-Agent": HEADERS["User-Agent"]
                        });
                        const dl = res.headers?.["hx-redirect"] || res.headers?.["HX-Redirect"];
                        if (dl) {
                            streams.push(new StreamResult({
                                url: dl,
                                source: `BuzzServer ${label}`,
                                quality: quality,
                                headers: { "Referer": link, "User-Agent": HEADERS["User-Agent"] }
                            }));
                        }
                    } catch (e) {}
                }
                else if (text.includes("pixel")) {
                    const id = link.substring(link.lastIndexOf("/") + 1);
                    const base = link.match(/^(https?:\/\/[^\/]+)/)?.[1] || "";
                    streams.push(new StreamResult({
                        url: link.includes("download") ? link : `${base}/api/file/${id}?download`,
                        source: `PixelDrain ${label}`,
                        quality: quality,
                        headers: { "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("s3 server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `S3 Server ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("mega server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `Mega Server ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                else if (text.includes("pdl server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `PDL Server ${label}`,
                        quality: quality,
                        headers: { "Referer": realUrl, "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
            }
        } catch (e) {}
        
        return streams;
    }

    // Extract from Hubdrive
    async function extractHubdrive(url) {
        try {
            const html = await _fetch(url);
            const hm = html.match(/class="btn btn-primary[^"]*"[^>]*href="([^"]+)"/);
            if (hm) {
                if (hm[1].includes("hubcloud")) {
                    return await extractHubCloud(hm[1]);
                }
                return [new StreamResult({
                    url: hm[1],
                    source: "HubDrive",
                    headers: { "User-Agent": HEADERS["User-Agent"] }
                })];
            }
        } catch (e) {}
        return [];
    }

    // Extract from Hubcdn
    async function extractHubcdn(url) {
        try {
            const res = await http_get(url, { ...HEADERS, "Referer": url });
            const em = res.body.match(/r=([A-Za-z0-9+/=]+)/);
            if (em) {
                const decoded = base64Decode(em[1]);
                const m3u8 = decoded.substring(decoded.lastIndexOf("link=") + 5);
                return [new StreamResult({
                    url: m3u8,
                    source: "HubCDN",
                    headers: { "Referer": url, "User-Agent": HEADERS["User-Agent"] }
                })];
            }
        } catch (e) {}
        return [];
    }

    // Extract from PixelDrain
    async function extractPixelDrain(url) {
        const id = url.match(/\/u\/([a-zA-Z0-9-]+)/)?.[1];
        if (id) {
            return [new StreamResult({
                url: `https://pixeldrain.com/api/file/${id}?download`,
                source: "PixelDrain",
                headers: { "User-Agent": HEADERS["User-Agent"] }
            })];
        }
        return [];
    }

    // Main stream resolver
    async function resolveStream(url) {
        if (!url) return [];
        
        const u = url.toLowerCase();
        
        if (u.includes("hubcloud") || u.includes("hub.") || u.includes("gamerxyt")) {
            return await extractHubCloud(url);
        }
        if (u.includes("hubdrive")) {
            return await extractHubdrive(url);
        }
        if (u.includes("hubcdn")) {
            return await extractHubcdn(url);
        }
        if (u.includes("pixeldrain")) {
            return await extractPixelDrain(url);
        }
        
        return [new StreamResult({
            url: url,
            source: "Direct",
            headers: { "User-Agent": HEADERS["User-Agent"] }
        })];
    }

    // Get home categories
    async function getHome(cb) {
        try {
            const cats = [
                { t: "Homepage", u: "" },
                { t: "Bollywood", u: "category/bollywood" },
                { t: "Hollywood", u: "category/hollywood" },
                { t: "Gujarati", u: "category/gujarati" },
                { t: "South Indian", u: "category/southindian" },
                { t: "Web Series", u: "category/webseries" }
            ];
            
            const home = {};
            
            for (const c of cats) {
                try {
                    const url = c.u ? `${MAIN_URL}/${c.u}` : MAIN_URL;
                    const html = await _fetch(url);
                    const items = _parseResults(html);
                    if (items.length) home[c.t] = items;
                } catch (e) {}
            }
            
            cb({ success: true, data: home });
        } catch (e) {
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }

    // Search
    async function search(query, cb) {
        try {
            const url = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
            const html = await _fetch(url);
            cb({ success: true, data: _parseResults(html) });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // Load details
    async function load(url, cb) {
        try {
            const html = await _fetch(url);
            
            // Get title
            const tm = html.match(/<h1[^>]*class="post-title"[^>]*>([\s\S]*?)<\/h1>/);
            let title = "Unknown";
            if (tm) {
                title = tm[1].replace(/<[^>]+>/g, "").trim();
            }
            
            // Get poster - try multiple patterns
            let poster = "";
            
            // Pattern 1: og:image meta tag (handle both single and double quotes)
            const pm = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
            if (pm) poster = pm[1];
            
            // Pattern 2: og:image with different attribute order
            if (!poster) {
                const pm2 = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
                if (pm2) poster = pm2[1];
            }
            
            // Pattern 3: featured image
            if (!poster) {
                const fm = html.match(/<img[^>]*class=["'][^"]*featured[^"]*["'][^>]*src=["']([^"']+)["']/i);
                if (fm) poster = fixUrl(fm[1]);
            }
            
            // Pattern 4: poster class
            if (!poster) {
                const pcm = html.match(/<img[^>]*class=["'][^"]*poster[^"]*["'][^>]*src=["']([^"']+)["']/i);
                if (pcm) poster = fixUrl(pcm[1]);
            }
            
            // Pattern 5: data-src lazy loading
            if (!poster) {
                const dm = html.match(/<img[^>]*data-src=["']([^"']+)["']/i);
                if (dm) poster = fixUrl(dm[1]);
            }
            
            // Pattern 6: entry-content img
            if (!poster) {
                const em = html.match(/<div[^>]*class=["'][^"]*entry-content[^"]*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
                if (em) poster = fixUrl(em[1]);
            }
            
            // Pattern 7: any image with wp-content (WordPress uploads)
            if (!poster) {
                const wm = html.match(/src=["'](https?:\/\/[^"']*wp-content[^"']*\.(?:jpg|jpeg|png|webp))["']/i);
                if (wm) poster = wm[1];
            }
            
            // Get description
            let desc = "";
            const dm = html.match(/<div[^>]*id="summary"[^>]*>([\s\S]*?)<\/div>/);
            if (dm) desc = dm[1].replace(/<[^>]+>/g, "").trim();
            
            // Get year
            let year = 0;
            const ym = html.match(/\((\d{4})\)/);
            if (ym) year = parseInt(ym[1]);
            
            // Determine type
            const isSeries = title.toLowerCase().includes("series") ||
                            title.toLowerCase().includes("season") ||
                            html.includes("<h4>");
            
            // Get IMDb ID
            let imdbId = "";
            const im = html.match(/imdb\.com\/title\/(tt\d+)/i);
            if (im) imdbId = im[1];
            
            // Fetch Cinemeta
            let meta = null;
            if (imdbId) {
                try {
                    const type = isSeries ? "series" : "movie";
                    const res = await http_get(`${CINEMETA_URL}/${type}/${imdbId}.json`, HEADERS);
                    if (res.status === 200 && res.body.startsWith("{")) {
                        meta = JSON.parse(res.body).meta;
                    }
                } catch (e) {}
            }
            
            const episodes = [];
            
            if (isSeries) {
                // Parse seasons
                const h4Regex = /<h4[^>]*>([\s\S]*?)<\/h4>/g;
                let h4m;
                
                while ((h4m = h4Regex.exec(html)) !== null) {
                    const h4Text = h4m[1].replace(/<[^>]+>/g, "");
                    const sm = h4Text.match(/Season\s*(\d+)/i);
                    const seasonNum = sm ? parseInt(sm[1]) : 0;
                    
                    if (seasonNum > 0) {
                        const h4Idx = html.indexOf(h4m[0]);
                        const after = html.substring(h4Idx + h4m[0].length);
                        const nextH4 = after.search(/<h4[^>]*>/);
                        const section = nextH4 > 0 ? after.substring(0, nextH4) : after;
                        
                        // Find season buttons
                        const btnRegex = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>/g;
                        let bm;
                        
                        while ((bm = btnRegex.exec(section)) !== null) {
                            const btnUrl = fixUrl(bm[1]);
                            
                            try {
                                const epHtml = await _fetch(btnUrl);
                                const epRegex = /<a[^>]*class="[^"]*maxbutton-ep[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
                                let em;
                                
                                while ((em = epRegex.exec(epHtml)) !== null) {
                                    const epUrl = fixUrl(em[1]);
                                    const epText = em[2].replace(/<[^>]+>/g, "").trim();
                                    const enm = epText.match(/(?:Episode|Ep|E)\s*(\d+)/i);
                                    const epNum = enm ? parseInt(enm[1]) : 0;
                                    
                                    if (epNum > 0) {
                                        let metaEp = null;
                                        if (meta?.videos) {
                                            metaEp = meta.videos.find(v => v.season === seasonNum && v.episode === epNum);
                                        }
                                        
                                        episodes.push(new Episode({
                                            name: metaEp?.name || `S${seasonNum.toString().padStart(2,'0')}E${epNum.toString().padStart(2,'0')}`,
                                            url: epUrl,
                                            season: seasonNum,
                                            episode: epNum,
                                            posterUrl: metaEp?.thumbnail || poster,
                                            description: metaEp?.overview || ""
                                        }));
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } else {
                // Movie - collect links
                const links = [];
                const btnRegex = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>/g;
                let bm;
                
                while ((bm = btnRegex.exec(html)) !== null) {
                    if (isBlocked(bm[0])) continue;
                    
                    const btnUrl = fixUrl(bm[1]);
                    
                    try {
                        const linkHtml = await _fetch(btnUrl);
                        const linkPatterns = [
                            /href="(https?:\/\/[^"]*hubcloud[^"]*)"/gi,
                            /href="(https?:\/\/[^"]*hubdrive[^"]*)"/gi,
                            /href="(https?:\/\/[^"]*pixeldrain[^"]*)"/gi
                        ];
                        
                        for (const pattern of linkPatterns) {
                            let lm;
                            while ((lm = pattern.exec(linkHtml)) !== null) {
                                links.push(lm[1]);
                            }
                        }
                    } catch (e) {}
                }
                
                episodes.push(new Episode({
                    name: "Full Movie",
                    url: JSON.stringify(links),
                    season: 1,
                    episode: 1,
                    posterUrl: poster
                }));
            }
            
            const item = new MultimediaItem({
                title: meta?.name || cleanTitle(title),
                url: url,
                posterUrl: meta?.poster || poster,
                bannerUrl: meta?.background || poster,
                description: meta?.description || desc,
                type: isSeries ? "series" : "movie",
                year: meta?.year ? parseInt(meta.year.toString().split("-")[0]) : year,
                score: meta?.imdbRating ? parseFloat(meta.imdbRating) : 0,
                episodes: episodes
            });
            
            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // Load streams
    async function loadStreams(url, cb) {
        try {
            let links = [];
            
            if (url.startsWith("[")) {
                try { links = JSON.parse(url); } catch (e) { links = [url]; }
            } else {
                links = [url];
            }
            
            const all = [];
            
            for (const link of links) {
                const streams = await resolveStream(link);
                all.push(...streams);
            }
            
            // Sort by quality
            all.sort((a, b) => {
                const getQ = (q) => {
                    const m = (q || "").toString().match(/(\d{3,4})/);
                    return m ? parseInt(m[1]) : 0;
                };
                return getQ(b.quality) - getQ(a.quality);
            });
            
            cb({ success: true, data: all });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
