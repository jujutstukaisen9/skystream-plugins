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

    function safeText(text) {
        return String(text || "").trim().replace(/[\u200B-\u200D\uFEFF]/g, "");
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

        const a = card.querySelector("a[href]") || card.querySelector("a");
        const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
        if (!href) return null;
        if (/\/(contact|about|privacy|dmca|login|register|search|category|tag|page\/|feed\/|loanid)/i.test(href)) return null;

        const img = card.querySelector("img");
        const title = cleanTitle(
            textOf(card.querySelector("h1, h2, h3, .title, .name, .movie-title, .card-title, .post-title, .entry-title")) ||
            getAttr(a, "title") ||
            getAttr(img, "alt", "title") ||
            textOf(a)
        );
        if (!title || title.length < 2) return null;

        const posterUrl = normalizeUrl(getAttr(img, "data-src", "data-lazy-src", "src", "data-original", "data-lazy"), manifest.baseUrl);
        const type = /series|season|episode|web-series|tv/i.test(href + " " + title) ? "series" : "movie";

        return new MultimediaItem({
            title,
            url: href,
            posterUrl,
            type,
            contentType: type
        });
    }

    function collectItems(doc) {
        const selectors = [
            ".poster", ".movie-card", ".item", "article", ".thumb", ".grid-item", ".list-item",
            ".swiper-slide", ".owl-item", ".movie-poster", ".card", ".post", ".entry", ".content-item",
            "div[class*='poster']", "div[class*='movie']", "div[class*='card']"
        ];
        let found = [];
        for (const sel of selectors) {
            const nodes = Array.from(doc.querySelectorAll(sel));
            for (const node of nodes) {
                const item = parseListItem(node);
                if (item) found.push(item);
            }
            if (found.length >= 40) break;
        }

        // LAST RESORT - any image inside an anchor (works on almost every piracy site)
        if (found.length < 10) {
            const allImages = Array.from(doc.querySelectorAll("a[href] img"));
            for (const img of allImages) {
                const a = img.closest("a");
                if (!a) continue;
                const card = a.closest("div, article, li") || a;
                const item = parseListItem(card);
                if (item) found.push(item);
            }
        }

        return uniqueByUrl(found);
    }

    function extractLoanIdLink(doc) {
        const bodyText = safeText(doc.body?.innerHTML || doc.documentElement?.innerHTML || "");
        const match = bodyText.match(/loanid\.php\?lid=([a-zA-Z0-9]+)/i);
        if (match) return `\( {manifest.baseUrl}/loanid.php?lid= \){match[1]}`;

        const links = Array.from(doc.querySelectorAll('a[href*="loanid.php"], a[href*="loanagreement.php"]'));
        for (const link of links) {
            const href = getAttr(link, "href");
            if (href) return resolveUrl(manifest.baseUrl, href);
        }
        return "";
    }

    async function followRedirectChain(startUrl) {
        let current = startUrl;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            attempts++;
            const res = await request(current);
            const body = safeText(res.body || "");

            if (res.headers && res.headers.location) {
                current = resolveUrl(current, res.headers.location);
                continue;
            }

            const meta = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);\s*url=([^"']+)["']/i);
            if (meta) {
                current = resolveUrl(current, meta[2]);
                continue;
            }

            const jsLoc = body.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                          body.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
                          body.match(/setTimeout.*location\s*=\s*["']([^"']+)["']/i);
            if (jsLoc) {
                current = resolveUrl(current, jsLoc[1]);
                continue;
            }

            if (/loanagreement\.php/i.test(current) || /<video|<source|player|iframe.*src|file|src=.*m3u8|mp4/i.test(body)) {
                return { url: current, body, final: true };
            }

            if (/loanid\.php/i.test(current)) {
                const lidMatch = current.match(/lid=([a-zA-Z0-9]+)/i);
                if (lidMatch) {
                    current = `\( {manifest.baseUrl}/loanagreement.php?lid= \){lidMatch[1]}&f=0`;
                    continue;
                }
            }
            break;
        }
        return { url: current, body: safeText((await request(current)).body || ""), final: true };
    }

    function extractFinalVideoUrl(html, baseUrl) {
        const raw = String(html || "")
            .replace(/\\u002F/g, "/")
            .replace(/\\u003A/g, ":")
            .replace(/\\+\//g, "/")
            .replace(/&amp;/g, "&");

        const candidates = [];

        const m3u8Patterns = [
            /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi,
            /["']((?:https?:)?\/\/[^"'\s]+?\.m3u8[^"'\s]*)["']/gi,
            /file\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi
        ];
        for (const p of m3u8Patterns) {
            let m;
            while ((m = p.exec(raw)) !== null) {
                const u = resolveUrl(baseUrl, m[1]);
                if (/\.m3u8(\?|$)/i.test(u)) candidates.push({ url: u, type: "hls" });
            }
        }

        const mp4Patterns = [
            /(https?:\/\/[^\s"']+\.mp4[^\s"']*)/gi,
            /["']((?:https?:)?\/\/[^"'\s]+?\.mp4[^"'\s]*)["']/gi,
            /source\s*[:=]\s*["']([^"']+\.mp4[^"']*)["']/gi
        ];
        for (const p of mp4Patterns) {
            let m;
            while ((m = p.exec(raw)) !== null) {
                const u = resolveUrl(baseUrl, m[1]);
                if (/\.mp4(\?|$)/i.test(u)) candidates.push({ url: u, type: "mp4" });
            }
        }

        const iframeMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) candidates.push({ url: resolveUrl(baseUrl, iframeMatch[1]), type: "iframe" });

        const sourceMatch = raw.match(/<source[^>]+src=["']([^"']+)["']/i);
        if (sourceMatch) {
            const u = resolveUrl(baseUrl, sourceMatch[1]);
            candidates.push({ url: u, type: /\.(m3u8|mp4)/i.test(u) ? (/\.m3u8/i.test(u) ? "hls" : "mp4") : "direct" });
        }

        return candidates;
    }

    async function getHome(cb) {
        try {
            const data = {};
            const doc = await loadDoc(manifest.baseUrl);
            let items = collectItems(doc);

            if (items.length === 0) {
                // FINAL RAW FALLBACK - works on any site that has posters
                const rawAnchors = Array.from(doc.querySelectorAll("a[href] img")).map(img => {
                    const a = img.closest("a");
                    if (!a) return null;
                    const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
                    const title = cleanTitle(getAttr(img, "alt") || textOf(a) || getAttr(a, "title"));
                    const poster = normalizeUrl(getAttr(img, "src", "data-src", "data-lazy-src"), manifest.baseUrl);
                    if (title && href && poster) {
                        return new MultimediaItem({
                            title,
                            url: href,
                            posterUrl: poster,
                            type: "movie",
                            contentType: "movie"
                        });
                    }
                    return null;
                }).filter(Boolean);
                items = uniqueByUrl(rawAnchors);
            }

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
            const doc = await loadDoc(`\( {manifest.baseUrl}/?s= \){q}`);
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
                textOf(doc.querySelector("h1, .title, .movie-title")) ||
                getAttr(doc.querySelector('meta[property="og:title"]'), "content") ||
                "Unknown"
            );

            const posterUrl = normalizeUrl(
                getAttr(doc.querySelector('meta[property="og:image"], img'), "content", "data-src", "src"),
                manifest.baseUrl
            );

            const description = cleanTitle(
                getAttr(doc.querySelector('meta[property="og:description"]'), "content") ||
                textOf(doc.querySelector(".description, .synopsis, p"))
            );

            const contentType = /series|season|episode/i.test(target + " " + title) ? "series" : "movie";
            const year = parseYear(`${title} ${description}`);

            const episodes = contentType === "series" 
                ? Array.from(doc.querySelectorAll("a[href]")).map(a => {
                    const epUrl = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
                    if (!/episode|season/i.test(epUrl)) return null;
                    return new Episode({
                        name: cleanTitle(textOf(a)) || "Episode",
                        url: epUrl,
                        season: 1,
                        episode: 1,
                        posterUrl
                    });
                }).filter(Boolean)
                : [new Episode({ name: title, url: target, season: 1, episode: 1, posterUrl })];

            const item = new MultimediaItem({
                title,
                url: target,
                posterUrl,
                bannerUrl: posterUrl,
                description,
                type: contentType,
                contentType,
                year,
                episodes: uniqueByUrl(episodes)
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            let pageUrl = normalizeUrl(url, manifest.baseUrl);
            let doc = await loadDoc(pageUrl);

            let loanidUrl = extractLoanIdLink(doc);
            if (!loanidUrl) {
                const bodyText = safeText(doc.body?.innerHTML || "");
                const fallback = bodyText.match(/loanid\.php\?lid=([a-zA-Z0-9]+)/i);
                if (fallback) loanidUrl = `\( {manifest.baseUrl}/loanid.php?lid= \){fallback[1]}`;
            }

            if (!loanidUrl) return cb({ success: false, errorCode: "NO_LOANID", message: "Could not find loanid link" });

            const redirectResult = await followRedirectChain(loanidUrl);

            const finalHtml = redirectResult.body;
            const finalBase = redirectResult.url;

            const candidates = extractFinalVideoUrl(finalHtml, finalBase);

            const streams = candidates.map(cand => {
                const name = cand.type === "hls" ? "Tellybiz HLS" : (cand.type === "mp4" ? "Tellybiz MP4" : "Tellybiz Player");
                return new StreamResult({
                    name,
                    url: cand.url,
                    quality: cand.type === "hls" ? "Auto" : "HD",
                    source: `Tellybiz - ${cand.type.toUpperCase()}`,
                    headers: {
                        "Referer": finalBase,
                        "User-Agent": UA
                    }
                });
            });

            if (streams.length === 0) {
                const iframe = finalHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframe) {
                    streams.push(new StreamResult({
                        name: "Tellybiz iframe",
                        url: resolveUrl(finalBase, iframe[1]),
                        quality: "Auto",
                        source: "Tellybiz iframe",
                        headers: { "Referer": finalBase, "User-Agent": UA }
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
