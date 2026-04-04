(function() {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

    const BASE_HEADERS = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": `${manifest.baseUrl}/`
    };

    const EXCLUDE_PATHS = [
        "/genre", "/country", "/negara", "/tahun", "/year", "/page/",
        "/privacy", "/dmca", "/faq", "/request", "/wp-",
        "/author", "/category", "/tag", "/feed", "javascript:"
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

    function resolveUrl(base, next) {
        try {
            return new URL(String(next || ""), String(base || manifest.baseUrl)).toString();
        } catch (_) {
            return normalizeUrl(next, manifest.baseUrl);
        }
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
        return !EXCLUDE_PATHS.some((p) => path.includes(p));
    }

    function cleanTitle(raw) {
        let t = htmlDecode(String(raw || "")).replace(/\s+/g, " ").trim();
        t = t.replace(/^(nonton|streaming)\s+(movie|series|film|donghua|anime)\s+/i, "");
        t = t.replace(/^(nonton|streaming)\s+/i, "");
        return t.trim();
    }

    function fixImageQuality(url) {
        if (!url) return "";
        return url.replace(/-(\d+)x(\d+)\.(jpe?g|png|webp)$/i, ".$3");
    }

    function extractQuality(text) {
        const t = String(text || "").toLowerCase();
        if (t.includes("2160") || t.includes("4k") || t.includes("ultra")) return "4K";
        if (t.includes("1080") || t.includes("full")) return "1080p";
        if (t.includes("1440") || t.includes("quad")) return "1440p";
        if (t.includes("720") || t.includes("hd")) return "720p";
        if (t.includes("480") || t.includes("sd")) return "480p";
        if (t.includes("360") || t.includes("low")) return "360p";
        if (t.includes("240") || t.includes("lowest")) return "240p";
        if (t.includes("144") || t.includes("mobile")) return "144p";
        if (t.includes("cam")) return "CAM";
        return "Auto";
    }

    function normalizeSearchQuery(query) {
        let q = String(query || "").trim();
        try { q = decodeURIComponent(q); } catch (_) {}
        q = q.replace(/\+/g, " ");
        q = q.replace(/^["']|["']$/g, "");
        return q.trim();
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
        
        const anchor = el.querySelector(".bsx a, a[title], a[href*='episode'], a[href*='season'], div.data > h3 > a");
        const href = normalizeUrl(getAttr(anchor, "href"), manifest.baseUrl);
        if (!href) return null;
        if (!isContentPath(href)) return null;

        const img = el.querySelector("img");
        const title = cleanTitle(getAttr(anchor, "title") || textOf(el.querySelector(".tt")) || getAttr(img, "alt") || textOf(el.querySelector("h3")));
        if (!title || title === "Unknown") return null;

        const posterUrl = fixImageQuality(normalizeUrl(getAttr(img, "src", "data-src"), manifest.baseUrl));

        let type = "series";
        const typeText = textOf(el.querySelector(".typez, .type, .status, .mepo"));
        if (typeText.toLowerCase().includes("movie") || href.includes("/movie/")) type = "movie";

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
                
                let items = Array.from(doc.querySelectorAll("div.listupd article, div.bsx, article, #archive-content > article, div.items > article"))
                    .map(parseItemFromElement)
                    .filter(Boolean);

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
                { name: "Trending", path: "trending/" },
                { name: "Bollywood Movies", path: "genre/bollywood-movies/" },
                { name: "Hollywood Movies", path: "genre/hollywood/" },
                { name: "South Indian Movies", path: "genre/south-indian/" },
                { name: "Punjabi Movies", path: "genre/punjabi/" },
                { name: "Amazon Prime", path: "genre/amazon-prime/" },
                { name: "Disney Hotstar", path: "genre/disney-hotstar/" },
                { name: "Jio OTT", path: "genre/jio-ott/" },
                { name: "Netflix", path: "genre/netflix/" },
                { name: "Sony Liv", path: "genre/sony-liv/" },
                { name: "KDrama", path: "genre/k-drama/" },
                { name: "Zee5", path: "genre/zee-5/" },
                { name: "Anime Series", path: "genre/anime-hindi/" },
                { name: "Anime Movies", path: "genre/anime-movies/" },
                { name: "Cartoon Network", path: "genre/cartoon-network/" },
                { name: "Disney Channel", path: "genre/disney-channel/" },
                { name: "Hungama", path: "genre/hungama/" }
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
            const normalizedQuery = normalizeSearchQuery(query);
            const encoded = encodeURIComponent(normalizedQuery);
            const url = `${manifest.baseUrl}/?s=${encoded}`;

            const doc = await loadDoc(url);
            let items = Array.from(doc.querySelectorAll("div.result-item, div.listupd article, div.bsx, article"))
                .map(parseItemFromElement)
                .filter(Boolean);

            if (items.length === 0) {
                const altDoc = await loadDoc(`${manifest.baseUrl}/page/1/?s=${encoded}`);
                items = Array.from(altDoc.querySelectorAll("div.result-item, div.listupd article, div.bsx"))
                    .map(parseItemFromElement)
                    .filter(Boolean);
            }

            cb({ success: true, data: uniqueByUrl(items) });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            const doc = await loadDoc(url);

            const titleL = textOf(doc.querySelector("div.sheader > div.data > h1, h1.entry-title, h1"));
            const titleRegex = /(^.*\)\d*)/;
            const titleMatch = titleRegex.exec(titleL);
            const title = titleMatch ? titleMatch[1] : titleL;

            const posterUrl = fixImageQuality(normalizeUrl(
                getAttr(doc.querySelector("div.poster img, .ime img, meta[property='og:image']"), "src", "content"),
                manifest.baseUrl
            ));

            const bgposter = fixImageQuality(normalizeUrl(
                getAttr(doc.querySelector("div.g-item a"), "href"),
                manifest.baseUrl
            ));

            const description = textOf(doc.querySelector("#info div.wp-content p, div.entry-content p, .desc"));
            const tags = Array.from(doc.querySelectorAll("div.sgeneros > a, .generos a")).map(a => textOf(a));
            const yearStr = textOf(doc.querySelector("span.date"));
            const year = yearStr ? parseInt(yearStr.split(",").pop()?.trim()) : null;
            const rating = textOf(doc.querySelector("span.dt_rating_vgs, .rating"));
            const durationStr = textOf(doc.querySelector("span.runtime"));
            const duration = durationStr ? parseInt(durationStr.replace(/\s*Min\.\s*/i, "").trim()) : null;

            const actors = Array.from(doc.querySelectorAll("div.person")).map(person => {
                const name = textOf(person.querySelector("div.data > div.name > a"));
                const image = getAttr(person.querySelector("div.img > a > img"), "src");
                const role = textOf(person.querySelector("div.data > div.caracter"));
                return new Actor({ name, image, role });
            });

            const recommendations = Array.from(doc.querySelectorAll("#dtw_content_related-2 article, .related article")).map(parseItemFromElement).filter(Boolean);

            const isSeries = url.includes("tvshows") || doc.querySelector("#seasons ul.episodios");
            const type = isSeries ? "series" : "movie";

            let episodes = [];
            if (isSeries) {
                const seasonElements = doc.querySelectorAll("#seasons ul.episodios, .eplister li");
                let epIndex = 0;
                for (const seasonEl of seasonElements) {
                    const epItems = seasonEl.querySelectorAll("li");
                    for (const it of epItems) {
                        const epUrl = getAttr(it.querySelector("div.episodiotitle > a"), "href");
                        const epName = textOf(it.querySelector("div.episodiotitle > a"));
                        const epPoster = getAttr(it.querySelector("div.imagen > img"), "src", "data-src");
                        epIndex++;
                        
                        const seasonMatch = it.outerHTML.match(/season[\s-]*(\d+)/i) || [null, "1"];
                        const epMatch = it.outerHTML.match(/episode[\s-]*(\d+)/i) || [null, String(epIndex)];
                        
                        episodes.push(new Episode({
                            name: epName || `Episode ${epIndex}`,
                            url: normalizeUrl(epUrl, manifest.baseUrl),
                            season: parseInt(seasonMatch[1]) || 1,
                            episode: parseInt(epMatch[1]) || epIndex,
                            posterUrl: fixImageQuality(normalizeUrl(epPoster, manifest.baseUrl))
                        }));
                    }
                }
            }

            const item = new MultimediaItem({
                title,
                url,
                posterUrl,
                description,
                type: isSeries ? "series" : "movie",
                contentType: type,
                year,
                score: rating ? parseFloat(rating) : null,
                duration,
                tags,
                actors,
                recommendations,
                backgroundPosterUrl: bgposter || posterUrl,
                episodes
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

    async function resolveVidHide(url, label = "VidHide") {
        return resolveStreamWish(url, label);
    }

    async function resolveVidStack(url, label = "VidStack") {
        return resolveStreamWish(url, label);
    }

    async function resolveGofile(url, label = "Gofile") {
        try {
            const idMatch = url.match(/\/(?:\?c=|d\/)([\da-zA-Z-]+)/);
            if (!idMatch) return [];
            const id = idMatch[1];

            const tokenRes = await http_post("https://api.gofile.io/accounts", {
                headers: { "User-Agent": UA }
            });
            const tokenData = JSON.parse(tokenRes.body || "{}");
            const token = tokenData?.data?.token;
            if (!token) return [];

            const currentTimeSeconds = Math.floor(Date.now() / 1000);
            const interval = String(Math.floor(currentTimeSeconds / 14400));
            const secret = "gf2026x";
            const message = [UA, "en-GB", token, interval, secret].join("::");
            
            const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashedToken = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

            const headers = {
                "User-Agent": UA,
                "Authorization": `Bearer ${token}`,
                "X-BL": "en-GB",
                "X-Website-Token": hashedToken,
                "Referer": "https://gofile.io/"
            };

            const contentsRes = await request(`https://api.gofile.io/contents/${id}?pageSize=1000`, headers);
            const contentsData = JSON.parse(contentsRes.body || "{}");
            const children = contentsData?.data?.children || {};

            const results = [];
            for (const file of Object.values(children)) {
                if (file.type !== "file" || !file.link) continue;
                const size = file.size || 0;
                const sizeStr = size < 1024 * 1024 * 1024 
                    ? `${(size / (1024 * 1024)).toFixed(2)} MB`
                    : `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                
                const quality = extractQuality(file.name);
                results.push(new StreamResult({
                    url: file.link,
                    quality,
                    source: `[Gofile] ${file.name} [${sizeStr}]`,
                    headers: { "Cookie": `accountToken=${token}` }
                }));
            }
            return results;
        } catch (_) {
            return [];
        }
    }

    async function resolveStreamcasthub(url, label = "StreamCastHub") {
        try {
            const id = url.substringAfter("/#");
            if (!id) return [];
            const m3u8 = `https://ss1.rackcloudservice.cyou/ic/${id}/master.txt`;
            return [new StreamResult({
                url: m3u8,
                quality: "Auto",
                source: label,
                headers: { "Referer": url, "User-Agent": UA }
            })];
        } catch (_) {
            return [];
        }
    }

    async function loadStreams(url, cb) {
        try {
            const doc = await loadDoc(url);
            const rawStreams = [];
            const seenUrls = new Set();

            const options = Array.from(doc.querySelectorAll("#playeroptionsul li, .mobius option, .mirror option, select option"));
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

        if (host.includes("streamwish.com") || host.includes("streamwish") || host.includes("asnwish.com") || host.includes("cdnwish.com") || host.includes("strwish.com")) {
            return await resolveStreamWish(link, label || "StreamWish");
        }
        if (host.includes("vidhide") || host.includes("vidhidepro") || host.includes("dhcplay")) {
            return await resolveVidHide(link, label || "VidHide");
        }
        if (host.includes("vidstack") || host.includes("vidplay") || host.includes("streamhub")) {
            return await resolveVidStack(link, label || "VidStack");
        }
        if (host.includes("gofile.io")) {
            return await resolveGofile(link, label || "Gofile");
        }
        if (host.includes("streamcasthub")) {
            return await resolveStreamcasthub(link, label || "StreamCastHub");
        }
        if (host.includes("gdmirrorbot") || host.includes("techinmind") || host.includes("iqsmartgames")) {
            return await resolveGDMirror(link, label || "GDMirror");
        }

        return [new StreamResult({
            url: link,
            quality: "Auto",
            source: label || "Player",
            headers: { "Referer": referer || manifest.baseUrl + "/", "User-Agent": UA }
        })];
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

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
