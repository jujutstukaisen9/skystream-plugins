(function() {
    const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    const BASE_HEADERS = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": `${manifest.baseUrl}/`
    };

    const EXCLUDE_PATHS = [
        "/genre", "/country", "/negara", "/tahun", "/year", "/page/",
        "/privacy", "/dmca", "/faq", "/request", "/wp-",
        "/author", "/category", "/tag", "/feed", "javascript:", "/?s="
    ];

    function normalizeUrl(url, base) {
        if (!url) return "";
        const raw = String(url).trim();
        if (!raw) return "";
        if (raw.startsWith("//")) return `https:${raw}`;
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith("/")) return `${base}${raw}`;
        return `${base}/${raw}`;
    }

    function hostnameOf(url) {
        try {
            return new URL(String(url || "")).hostname.toLowerCase();
        } catch (_) {
            return "";
        }
    }

    function htmlDecode(text) {
        if (!text) return "";
        return String(text)
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    }

    function safeAtob(str) {
        if (!str) return "";
        try {
            let s = String(str).trim().replace(/-/g, "+").replace(/_/g, "/");
            while (s.length % 4 !== 0) s += "=";
            return atob(s);
        } catch (_) {
            try { return atob(str); } catch (__) { return ""; }
        }
    }

    function textOf(el) {
        return htmlDecode((el?.textContent || "").replace(/\s+/g, " ").trim());
    }

    function getAttr(el, ...attrs) {
        if (!el) return "";
        for (const attr of attrs) {
            const v = el.getAttribute(attr);
            if (v && String(v).trim()) return String(v).trim();
        }
        return "";
    }

    function pathOf(url) {
        try {
            return new URL(url).pathname.toLowerCase();
        } catch (_) {
            return String(url || "").toLowerCase();
        }
    }

    function isContentPath(url) {
        const path = pathOf(url);
        if (!path || path === "/") return false;
        if (path === "/search" || path.startsWith("/search")) return false;
        return !EXCLUDE_PATHS.some((p) => path.includes(p));
    }

    function cleanTitle(raw) {
        let t = htmlDecode(String(raw || "")).replace(/\s+/g, " ").trim();
        t = t.replace(/^(nonton|streaming|watch|download)\s+(movie|series|film|donghua|anime)\s+/i, "");
        t = t.replace(/^(nonton|streaming|watch|download)\s+/i, "");
        t = t.replace(/\s+\d{4}\s*$/, "").trim();
        return t.trim();
    }

    function extractQuality(text) {
        const t = String(text || "").toLowerCase();
        if (t.includes("2160") || t.includes("4k") || t.includes("ultra")) return "4K";
        if (t.includes("1080") || t.includes("full")) return "1080p";
        if (t.includes("1440") || t.includes("quad")) return "1440p";
        if (t.includes("720") || t.includes("hd")) return "720p";
        if (t.includes("480") || t.includes("sd")) return "480p";
        if (t.includes("360") || t.includes("low")) return "360p";
        if (t.includes("cam") || t.includes("hdcam")) return "CAM";
        return "Auto";
    }

    function uniqueByUrl(items) {
        const out = [];
        const seen = new Set();
        for (const it of items) {
            if (!it || !it.url || seen.has(it.url)) continue;
            seen.add(it.url);
            out.push(it);
        }
        return out;
    }

    async function request(url, headers = {}) {
        return http_get(url, { headers: Object.assign({}, BASE_HEADERS, headers) });
    }

    async function loadDoc(url, headers = {}) {
        const res = await request(url, headers);
        return await parseHtml(res.body);
    }

    function parseItemFromElement(el) {
        if (!el) return null;
        
        let anchor = el.querySelector("a[href]");
        let href = normalizeUrl(getAttr(anchor, "href"), manifest.baseUrl);
        
        if (!href) {
            anchor = el.closest("a");
            href = normalizeUrl(getAttr(anchor, "href"), manifest.baseUrl);
        }
        
        if (!href || !href.includes("/") || href.includes("javascript")) return null;
        
        const img = el.querySelector("img");
        let title = getAttr(anchor, "title") || textOf(el.querySelector("h3, .title, .name, .entry-title")) || getAttr(img, "alt");
        
        if (!title) {
            const titleEl = el.querySelector(".title, .name, h3, a[title]");
            title = textOf(titleEl);
        }
        
        title = cleanTitle(title);
        if (!title || title === "Unknown" || title.length < 2) return null;

        let posterUrl = "";
        if (img) {
            posterUrl = normalizeUrl(getAttr(img, "src", "data-src", "data-lazy-src"), manifest.baseUrl);
        }
        
        if (!posterUrl) {
            const posterEl = el.querySelector(".poster, .img, .thumbnail img");
            posterUrl = normalizeUrl(getAttr(posterEl, "src", "data-src", "data-lazy-src"), manifest.baseUrl);
        }

        let type = "movie";
        if (href.includes("/tvshows") || href.includes("/season") || href.includes("/episode")) {
            type = "series";
        }

        const typeEl = el.querySelector(".type, .typez, .status, span");
        const typeText = textOf(typeEl);
        if (typeText.toLowerCase().includes("tv") || typeText.toLowerCase().includes("series")) {
            type = "series";
        }

        return new MultimediaItem({
            title,
            url: href,
            posterUrl,
            type,
            contentType: type
        });
    }

    async function fetchSection(path, maxPages = 1, page = 1) {
        const all = [];
        for (let p = page; p <= maxPages; p += 1) {
            try {
                let url;
                if (p <= 1 && page <= 1) {
                    url = `${manifest.baseUrl}/${path}`;
                } else {
                    url = `${manifest.baseUrl}/${path}page/${p}/`;
                }
                const doc = await loadDoc(url);
                
                let items = [];
                
                const articles = doc.querySelectorAll("article, .post, .item, .movie, .series, .result-item");
                for (const article of articles) {
                    const item = parseItemFromElement(article);
                    if (item) items.push(item);
                }
                
                if (items.length === 0) {
                    const listItems = doc.querySelectorAll(".listupd article, div.bsx, #archive-content > article, div.items > article, ul.items-list li");
                    for (const li of listItems) {
                        const item = parseItemFromElement(li);
                        if (item) items.push(item);
                    }
                }

                if (items.length === 0 && p > 1) break;
                all.push(...items);
                if (all.length >= 36) break;
            } catch (e) {
                if (p === 1) return [];
                break;
            }
        }
        return uniqueByUrl(all);
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "" },
                { name: "Bollywood Movies", path: "genre/bollywood-movies/" },
                { name: "Hollywood Movies", path: "genre/hollywood/" },
                { name: "South Indian Movies", path: "genre/south-indian/" },
                { name: "Punjabi Movies", path: "genre/punjabi/" },
                { name: "Amazon Prime", path: "genre/amazon-prime/" },
                { name: "Disney Hotstar", path: "genre/disney-hotstar/" },
                { name: "Netflix", path: "genre/netflix/" },
                { name: "KDrama", path: "genre/k-drama/" },
                { name: "Anime Series", path: "genre/anime-hindi/" },
                { name: "Anime Movies", path: "genre/anime-movies/" }
            ];

            const data = {};
            for (const sec of sections) {
                try {
                    const items = await fetchSection(sec.path, 1, 1);
                    if (items && items.length > 0) {
                        data[sec.name] = items.slice(0, 24);
                    }
                } catch (e) {}
            }

            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e?.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const encoded = encodeURIComponent(query.trim());
            const url = `${manifest.baseUrl}/?s=${encoded}`;

            const doc = await loadDoc(url);
            let items = [];

            const resultItems = doc.querySelectorAll(".result-item, article, .post, .item");
            for (const item of resultItems) {
                const parsed = parseItemFromElement(item);
                if (parsed) items.push(parsed);
            }

            if (items.length === 0) {
                const altDoc = await loadDoc(`${manifest.baseUrl}/search/${encoded}/`);
                const altItems = altDoc.querySelectorAll(".result-item, article, .post, .item");
                for (const item of altItems) {
                    const parsed = parseItemFromElement(item);
                    if (parsed) items.push(parsed);
                }
            }

            cb({ success: true, data: uniqueByUrl(items) });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            const doc = await loadDoc(url);

            const title = textOf(doc.querySelector("h1, .title, .entry-title")) || "Unknown";
            const cleanTitle = title.replace(/\s*\d{4}\s*$/, "").trim();

            const posterEl = doc.querySelector(".poster img, .ime img, img.poster, meta[property='og:image']");
            const posterUrl = normalizeUrl(getAttr(posterEl, "src", "content"), manifest.baseUrl);

            const bgEl = doc.querySelector(".g-item a, .backdrop a, .banner a");
            const bgposter = normalizeUrl(getAttr(bgEl, "href"), manifest.baseUrl);

            const descEl = doc.querySelector(".description, .synopsis, #info, .entry-content p, .wp-content p");
            const description = textOf(descEl);

            const yearEl = doc.querySelector(".date, .year, time, [itemprop='datePublished']");
            const yearStr = textOf(yearEl);
            const year = yearStr ? parseInt(yearStr.match(/\d{4}/)?.[0] || yearStr.split(",").pop()?.trim()) : null;

            const ratingEl = doc.querySelector(".rating, .score, [itemprop='ratingValue'], .dt_rating_vgs");
            const rating = textOf(ratingEl);

            const durationEl = doc.querySelector(".runtime, .duration, time[datetime]");
            const durationStr = textOf(durationEl);
            const duration = durationStr ? parseInt(durationStr.match(/\d+/)?.[0]) : null;

            const tagsEl = doc.querySelectorAll(".genres, .generos, .tags, [itemprop='genre']");
            const tags = Array.from(tagsEl).map(t => textOf(t)).filter(Boolean);

            const isSeries = url.includes("tvshows") || url.includes("/season") || doc.querySelector("#seasons, .episodios, .eplister");

            let episodes = [];
            if (isSeries) {
                const epItems = doc.querySelectorAll("#seasons ul.episodios li, .eplister li, .episodes li, .episode-item");
                let epIndex = 0;
                for (const it of epItems) {
                    const epUrl = getAttr(it.querySelector("a"), "href");
                    const epName = textOf(it.querySelector("a, .title, .name"));
                    epIndex++;
                    
                    episodes.push(new Episode({
                        name: epName || `Episode ${epIndex}`,
                        url: normalizeUrl(epUrl, manifest.baseUrl),
                        season: 1,
                        episode: epIndex,
                        posterUrl
                    }));
                }
            }

            const recommendations = [];
            const recItems = doc.querySelectorAll(".related article, #dtw_content_related-2 article, .recommendations article");
            for (const rec of recItems) {
                const item = parseItemFromElement(rec);
                if (item) recommendations.push(item);
            }

            const item = new MultimediaItem({
                title: cleanTitle,
                url,
                posterUrl,
                description,
                type: isSeries ? "series" : "movie",
                contentType: isSeries ? "series" : "movie",
                year,
                score: rating ? parseFloat(rating) : null,
                duration,
                tags,
                backgroundPosterUrl: bgposter || posterUrl,
                episodes,
                recommendations
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
        }
    }

    async function ajaxPost(action, post, nume, typeVal, referUrl) {
        const params = new URLSearchParams();
        params.append("action", action);
        params.append("post", post);
        params.append("nume", nume);
        params.append("type", typeVal);
        
        const res = await http_post(`${manifest.baseUrl}/wp-admin/admin-ajax.php`, {
            headers: {
                "User-Agent": UA,
                "Content-Type": "application/x-www-form-urlencoded",
                "Referer": referUrl,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: params.toString()
        });
        return res.body;
    }

    function unpackJs(packed) {
        try {
            const match = packed.match(/}\s*\(\s*(['"].+?['"])\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"].+?['"])\.split\(['"]\|['"]\)/);
            if (!match) return packed;

            let p = match[1];
            let a = parseInt(match[2], 10);
            let c = parseInt(match[3], 10);
            let k = match[4].slice(1, -1).split("|");

            if (p.startsWith("'") || p.startsWith("\"")) p = p.slice(1, -1);

            const e = (c) => {
                return (c < a ? "" : e(parseInt(c / a, 10))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            };

            const dict = {};
            while (c--) {
                dict[e(c)] = k[c] || e(c);
            }

            return p.replace(/\b\w+\b/g, (w) => dict[w] || w);
        } catch (_) {
            return packed;
        }
    }

    async function resolveStreamWish(url, label = "StreamWish") {
        try {
            const res = await request(url);
            const html = res.body || "";
            
            const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\([\s\S]*?\)\)/);
            if (evalMatch) {
                try {
                    const unpacked = unpackJs(evalMatch[0]);
                    const m3u8 = unpacked.match(/file:\s*["']([^"']*?m3u8[^"']*?)["']/)?.[1];
                    if (m3u8) {
                        return [new StreamResult({
                            url: m3u8,
                            quality: "Auto",
                            source: label,
                            headers: { "Referer": url, "User-Agent": UA }
                        })];
                    }
                } catch (_) {}
            }
            
            const m3u8 = html.match(/["'](https?:\/\/[^"']*?\.m3u8[^"']*?)["']/)?.[1];
            if (m3u8) {
                return [new StreamResult({
                    url: m3u8,
                    quality: "Auto",
                    source: label,
                    headers: { "Referer": url, "User-Agent": UA }
                })];
            }
        } catch (_) {}
        return [];
    }

    async function resolveGDMirror(url, label = "GDMirror") {
        try {
            const res = await request(url);
            const html = res.body || "";

            const sidsMatch = html.match(/sids\s*=\s*["']([^"']+)["']/);
            const hostMatch = html.match(/player_base\s*=\s*["']([^"']+)["']/);
            
            let host = hostMatch ? new URL(hostMatch[1]).origin : new URL(url).origin;
            let sids = [];

            if (sidsMatch) {
                sids = sidsMatch[1].split(",");
            } else {
                const embedMatch = url.match(/\/embed\/([a-zA-Z0-9]+)/);
                if (embedMatch) {
                    sids = [embedMatch[1]];
                } else {
                    sids = [url.substringAfterLast("/")];
                }
            }

            const streams = [];
            for (const sid of sids) {
                try {
                    const embedRes = await http_post(`${host}/embedhelper.php`, {
                        headers: {
                            "Referer": host,
                            "X-Requested-With": "XMLHttpRequest",
                            "User-Agent": UA,
                            "Content-Type": "application/x-www-form-urlencoded"
                        },
                        body: `sid=${sid}`
                    });
                    const embedJson = JSON.parse(embedRes.body || "{}");
                    const siteUrls = embedJson?.siteUrls || {};
                    const mresult = embedJson?.mresult;

                    if (mresult && typeof mresult === "object") {
                        for (const [key, path] of Object.entries(mresult)) {
                            const siteUrl = siteUrls[key] || "";
                            if (siteUrl && path) {
                                const fullUrl = `${siteUrl.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
                                const subStreams = await resolvePlayerLink(fullUrl, key, host);
                                streams.push(...subStreams);
                            }
                        }
                    }
                } catch (_) {}
            }

            return streams;
        } catch (_) {
            return [];
        }
    }

    async function loadStreams(url, cb) {
        try {
            const doc = await loadDoc(url);
            const rawStreams = [];
            const seenUrls = new Set();

            const options = Array.from(doc.querySelectorAll("#playeroptionsul li, .player, select option, .server"));
            for (const opt of options) {
                const postId = getAttr(opt, "data-post");
                const nume = getAttr(opt, "data-nume");
                const typeVal = getAttr(opt, "data-type");
                const val = getAttr(opt, "value");

                if (postId && nume && !nume.includes("trailer")) {
                    try {
                        const embedHtml = await ajaxPost("doo_player_ajax", postId, nume, typeVal || "movie", url);
                        const srcMatch = embedHtml.match(/SRC=["'](https?:[^"']+)["']/i) || embedHtml.match(/embed_url["\s:]+["']([^"']+)["']/);
                        let link = srcMatch ? srcMatch[1] : val;
                        
                        if (link && !seenUrls.has(link)) {
                            seenUrls.add(link);
                            const streams = await resolvePlayerLink(link, textOf(opt) || "Server", url);
                            rawStreams.push(...streams);
                        }
                    } catch (_) {}
                } else if (val && val.length > 5 && !seenUrls.has(val)) {
                    seenUrls.add(val);
                    try {
                        const streams = await resolvePlayerLink(val, textOf(opt) || "Server", url);
                        rawStreams.push(...streams);
                    } catch (_) {}
                }
            }

            const links = doc.querySelectorAll("a[href*='gdmirror'], a[href*='streamwish'], a[href*='vidhide'], a[href*='vidstack'], a[href*='gofile']");
            for (const link of links) {
                const href = getAttr(link, "href");
                if (href && !seenUrls.has(href)) {
                    seenUrls.add(href);
                    try {
                        const streams = await resolvePlayerLink(href, textOf(link) || "Server", url);
                        rawStreams.push(...streams);
                    } catch (_) {}
                }
            }

            const iframes = Array.from(doc.querySelectorAll("iframe[src]"));
            for (const ifr of iframes) {
                const src = getAttr(ifr, "src");
                if (src && !seenUrls.has(src) && !src.includes("about:blank")) {
                    seenUrls.add(src);
                    try {
                        const streams = await resolvePlayerLink(src, "Embed", url);
                        rawStreams.push(...streams);
                    } catch (_) {}
                }
            }

            const scripts = Array.from(doc.querySelectorAll("script")).map(s => s.textContent).join("\n");
            const scriptRegex = /(?:file|src|source|video_url|play_url|hls)\s*[:=]\s*["']([^"']+?\.(?:m3u8|mp4)[^"']*?)["']/gi;
            let match;
            while ((match = scriptRegex.exec(scripts)) !== null) {
                const u = normalizeUrl(match[1].replace(/\\/g, ""), manifest.baseUrl);
                if (u && !seenUrls.has(u)) {
                    seenUrls.add(u);
                    rawStreams.push(new StreamResult({
                        url: u,
                        quality: "Auto",
                        source: "Script",
                        headers: { "Referer": url, "User-Agent": UA }
                    }));
                }
            }

            if (rawStreams.length === 0) {
                const pageHtml = doc.body?.innerHTML || "";
                const gdmirrorMatch = pageHtml.match(/href=["']([^"']*gdmirror[^"']*)["']/i);
                const directLinks = pageHtml.match(/https?:\/\/[^"'\s]*\.(m3u8|mp4)[^"'\s]*/gi);
                
                if (gdmirrorMatch) {
                    const streams = await resolvePlayerLink(gdmirrorMatch[1], "GDMirror", url);
                    rawStreams.push(...streams);
                }
                
                if (directLinks) {
                    for (const link of directLinks) {
                        if (!seenUrls.has(link)) {
                            seenUrls.add(link);
                            rawStreams.push(new StreamResult({
                                url: link,
                                quality: extractQuality(link),
                                source: "Direct",
                                headers: { "Referer": url, "User-Agent": UA }
                            }));
                        }
                    }
                }
            }

            cb({ success: true, data: rawStreams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) });
        }
    }

    async function resolvePlayerLink(playerLink, label, referer = "") {
        let link = playerLink || "";
        if (!link || link.includes("about:blank")) return [];

        if (!link.startsWith("http") && !link.startsWith("//") && link.length > 10) {
            try {
                const decoded = safeAtob(link);
                if (decoded.includes("<iframe")) {
                    const m = decoded.match(/src=["'](.*?)["']/);
                    if (m) link = m[1];
                } else if (decoded.startsWith("http") || decoded.startsWith("//")) {
                    link = decoded;
                }
            } catch (_) {}
        }

        link = normalizeUrl(link, manifest.baseUrl);
        if (!link.startsWith("http")) return [];

        const host = hostnameOf(link);

        if (host.includes("streamwish") || host.includes("asnwish") || host.includes("cdnwish") || host.includes("strwish")) {
            return await resolveStreamWish(link, label || "StreamWish");
        }
        if (host.includes("gdmirror") || host.includes("techinmind") || host.includes("iqsmartgames")) {
            return await resolveGDMirror(link, label || "GDMirror");
        }
        if (host.includes("vidhide") || host.includes("vidhidepro") || host.includes("dhcplay")) {
            return await resolveStreamWish(link, label || "VidHide");
        }
        if (host.includes("vidstack") || host.includes("vidplay") || host.includes("streamhub")) {
            return await resolveStreamWish(link, label || "VidStack");
        }

        return [new StreamResult({
            url: link,
            quality: "Auto",
            source: label || "Player",
            headers: { "Referer": referer || manifest.baseUrl + "/", "User-Agent": UA }
        })];
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
