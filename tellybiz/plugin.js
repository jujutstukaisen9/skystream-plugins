(function() {
    /** 
     * @type {import('@skystream/sdk').Manifest} 
     */
    // manifest is injected at runtime

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
    const BASE_HEADERS = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": `${manifest.baseUrl}/`
    };

    function normalizeUrl(url, base) {
        if (!url) return "";
        const raw = String(url).trim();
        if (!raw) return "";
        if (raw.startsWith("//")) return `https:${raw}`;
        if (/^https?:\/\//i.test(raw)) return raw;
        if (raw.startsWith("/")) return `\( {base} \){raw}`;
        return `\( {base}/ \){raw}`;
    }

    function resolveUrl(base, next) {
        try {
            return new URL(String(next || ""), String(base || manifest.baseUrl)).toString();
        } catch (_) {
            return normalizeUrl(next, manifest.baseUrl);
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

    function parseYear(text) {
        const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
        return m ? parseInt(m[1], 10) : undefined;
    }

    function uniqueByUrl(items) {
        const out = [];
        const seen = new Set();
        for (const it of items || []) {
            if (!it?.url || seen.has(it.url)) continue;
            seen.add(it.url);
            out.push(it);
        }
        return out;
    }

    function cleanTitle(raw) {
        return htmlDecode(String(raw || ""))
            .replace(/\s+/g, " ")
            .trim();
    }

    async function request(url, headers = {}) {
        return http_get(url, {
            headers: Object.assign({}, BASE_HEADERS, headers)
        });
    }

    async function loadDoc(url, headers = {}) {
        const res = await request(url, headers);
        return parseHtml(res.body);
    }

    function parseListItem(card) {
        if (!card) return null;
        const a = card.querySelector("a[href]");
        const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
        if (!href) return null;

        const img = card.querySelector("img");
        const title = cleanTitle(
            textOf(card.querySelector("p b, p strong, .title, .name, .movie-title")) ||
            getAttr(a, "title") ||
            getAttr(img, "alt", "title") ||
            textOf(a)
        );
        if (!title || title.length < 3) return null;

        const posterUrl = normalizeUrl(getAttr(img, "src", "data-src", "data-lazy-src", "data-original"), manifest.baseUrl);
        const type = /series|season|episode/i.test(href + " " + title) ? "series" : "movie";

        return new MultimediaItem({
            title,
            url: href,
            posterUrl,
            type,
            contentType: type
        });
    }

    function collectItems(doc) {
        const selectors = [".boxed.film", ".film", "li", "article", ".post", ".entry"];
        let found = [];
        for (const sel of selectors) {
            const nodes = Array.from(doc.querySelectorAll(sel));
            for (const node of nodes) {
                const item = parseListItem(node);
                if (item) found.push(item);
            }
            if (found.length >= 40) break;
        }

        // Ultra fallback - any poster image
        if (found.length < 8) {
            const images = Array.from(doc.querySelectorAll("a[href] img"));
            for (const img of images) {
                const a = img.closest("a");
                if (!a) continue;
                const card = a.closest("div, li, article") || a;
                const item = parseListItem(card);
                if (item) found.push(item);
            }
        }
        return uniqueByUrl(found);
    }

    async function getHome(cb) {
        try {
            const data = {};
            const doc = await loadDoc(manifest.baseUrl);
            let items = collectItems(doc);

            if (items.length > 0) {
                data["Latest"] = items.slice(0, 40);
            }

            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: String(e?.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const raw = String(query || "").trim();
            if (!raw) return cb({ success: true, data: [] });

            const q = encodeURIComponent(raw);
            // Correct search endpoint for this site
            const searchUrl = `\( {manifest.baseUrl}/search_movies?s= \){q}`;
            const doc = await loadDoc(searchUrl);

            const items = collectItems(doc);
            cb({ success: true, data: uniqueByUrl(items).slice(0, 40) });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
        }
    }

    async function load(url, cb) {
        try {
            const target = normalizeUrl(url, manifest.baseUrl);
            const doc = await loadDoc(target);

            const title = cleanTitle(
                textOf(doc.querySelector("h1")) ||
                getAttr(doc.querySelector('meta[property="og:title"]'), "content") ||
                "Unknown"
            );

            const posterUrl = normalizeUrl(
                getAttr(doc.querySelector('meta[property="og:image"], img'), "content", "src", "data-src"),
                manifest.baseUrl
            );

            const description = cleanTitle(
                getAttr(doc.querySelector('meta[property="og:description"]'), "content") ||
                textOf(doc.querySelector("p, .description"))
            );

            const contentType = /series|season|episode/i.test(target + " " + title) ? "series" : "movie";
            const year = parseYear(`${title} ${description}`);

            const item = new MultimediaItem({
                title,
                url: target,
                posterUrl,
                bannerUrl: posterUrl,
                description,
                type: contentType,
                contentType,
                year,
                episodes: [new Episode({
                    name: title,
                    url: target,
                    season: 1,
                    episode: 1,
                    posterUrl
                })]
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const pageUrl = normalizeUrl(url, manifest.baseUrl);
            const doc = await loadDoc(pageUrl);
            const body = doc.body.innerHTML || "";

            const candidates = [];

            // Extract from JS locations array (as in your page source)
            const locationsMatch = body.match(/var locations\s*=\s*\[([^\]]+)\]/i);
            if (locationsMatch) {
                const urls = locationsMatch[1].match(/https?:\/\/[^\s,"']+/g) || [];
                urls.forEach(u => {
                    const clean = u.replace(/\\u002F/g, "/").replace(/\\u003A/g, ":");
                    if (clean.includes(".m3u8") || clean.includes("hls")) {
                        candidates.push({ url: clean, type: "hls" });
                    } else if (clean.includes(".mp4")) {
                        candidates.push({ url: clean, type: "mp4" });
                    } else {
                        candidates.push({ url: clean, type: "iframe" });
                    }
                });
            }

            // Direct iframe / links
            const iframes = Array.from(doc.querySelectorAll('iframe[src]'));
            iframes.forEach(f => {
                const src = getAttr(f, "src");
                if (src) candidates.push({ url: resolveUrl(pageUrl, src), type: "iframe" });
            });

            const streams = candidates.map(cand => {
                const name = cand.type === "hls" ? "5Movierulz HLS" : 
                            (cand.type === "mp4" ? "5Movierulz MP4" : "5Movierulz Player");
                return new StreamResult({
                    name,
                    url: cand.url,
                    quality: cand.type === "hls" ? "Auto" : "HD",
                    source: `5Movierulz - ${cand.type.toUpperCase()}`,
                    headers: {
                        "Referer": pageUrl,
                        "User-Agent": UA
                    }
                });
            });

            // Fallback if nothing found
            if (streams.length === 0) {
                const anyLink = body.match(/https?:\/\/[^\s"']+\.(m3u8|mp4)[^\s"']*/i);
                if (anyLink) {
                    streams.push(new StreamResult({
                        name: "5Movierulz Auto",
                        url: anyLink[0],
                        quality: "Auto",
                        source: "5Movierulz Auto",
                        headers: { "Referer": pageUrl, "User-Agent": UA }
                    }));
                }
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
