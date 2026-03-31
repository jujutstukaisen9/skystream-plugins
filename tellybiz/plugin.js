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
        const a = card.querySelector("a[href], .poster a, .movie-card a, article a, .thumb a");
        const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
        if (!href) return null;
        if (/\/(contact|about|privacy|dmca|login|register|search|category|tag|page\/|feed\/)/i.test(href)) return null;

        const img = card.querySelector("img");
        const title = cleanTitle(
            textOf(card.querySelector("h2, h3, .title, .name, .movie-title")) ||
            getAttr(a, "title") ||
            getAttr(img, "alt", "title") ||
            textOf(a)
        );
        if (!title || title.length < 2) return null;

        const posterUrl = normalizeUrl(getAttr(img, "data-src", "data-lazy-src", "src", "data-original"), manifest.baseUrl);
        const type = /series|season|episode|web-series/i.test(href + " " + title) ? "series" : "movie";

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
            ".swiper-slide", ".owl-item", ".movie-poster", ".card"
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
        return uniqueByUrl(found);
    }

    function extractLoanIdLink(doc) {
        const patterns = [
            'a[href*="loanid.php"]',
            'a[href*="loanagreement.php"]',
            'script, a, button',
            'meta[http-equiv="refresh"]',
            'a[href]'
        ];
        for (const sel of patterns) {
            const els = Array.from(doc.querySelectorAll(sel));
            for (const el of els) {
                let href = getAttr(el, "href", "content");
                if (href && /loanid\.php\?lid=/.test(href)) {
                    return resolveUrl(manifest.baseUrl, href);
                }
                // fallback regex in text
                const text = safeText(el.textContent || el.innerHTML || "");
                const m = text.match(/loanid\.php\?lid=([a-zA-Z0-9]+)/i);
                if (m) return `\( {manifest.baseUrl}/loanid.php?lid= \){m[1]}`;
            }
        }
        return "";
    }

    async function followRedirectChain(startUrl) {
        let current = startUrl;
        let attempts = 0;
        const maxAttempts = 8;

        while (attempts < maxAttempts) {
            attempts++;
            const res = await request(current, { "Referer": manifest.baseUrl });
            const body = safeText(res.body || "");
            const status = res.status || 200; // assume http_get provides status if available

            // 1. HTTP 30x redirect
            if (status >= 300 && status < 400 && res.headers && res.headers.location) {
                current = resolveUrl(current, res.headers.location);
                continue;
            }

            // 2. Meta refresh
            const metaRefresh = body.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);\s*url=([^"']+)["']/i);
            if (metaRefresh) {
                current = resolveUrl(current, metaRefresh[2]);
                continue;
            }

            // 3. JS redirect (window.location, setTimeout, etc.)
            const jsRedirect = body.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                              body.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
                              body.match(/setTimeout\(\s*function\(\)\s*\{\s*window\.location\s*=\s*["']([^"']+)["']/i);
            if (jsRedirect) {
                current = resolveUrl(current, jsRedirect[1] || jsRedirect[2] || jsRedirect[3]);
                continue;
            }

            // 4. If we reached loanagreement.php or contains video tags, stop
            if (/loanagreement\.php/i.test(current) || /<video|<source|player|iframe.*src|file|src=.*m3u8|mp4/i.test(body)) {
                return { url: current, body, final: true };
            }

            // fallback - try to construct loanagreement if loanid was hit
            if (/loanid\.php/i.test(current)) {
                const lidMatch = current.match(/lid=([a-zA-Z0-9]+)/i);
                if (lidMatch) {
                    current = `\( {manifest.baseUrl}/loanagreement.php?lid= \){lidMatch[1]}&f=0`;
                    continue;
                }
            }

            break; // no more redirects
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

        // m3u8 patterns
        const m3u8Patterns = [
            /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/gi,
            /["']((?:https?:)?\/\/[^"'\s]+?\.m3u8[^"'\s]*)["']/gi,
            /file\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi,
            /source\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi,
            /playlist\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/gi
        ];
        for (const p of m3u8Patterns) {
            let m;
            while ((m = p.exec(raw)) !== null) {
                const u = resolveUrl(baseUrl, m[1]);
                if (/\.m3u8(\?|$)/i.test(u)) candidates.push({ url: u, type: "hls" });
            }
        }

        // mp4 patterns
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

        // iframe / embed
        const iframeMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            candidates.push({ url: resolveUrl(baseUrl, iframeMatch[1]), type: "iframe" });
        }

        // <source> tag
        const sourceMatch = raw.match(/<source[^>]+src=["']([^"']+)["']/i);
        if (sourceMatch) {
            const u = resolveUrl(baseUrl, sourceMatch[1]);
            candidates.push({ url: u, type: /\.(m3u8|mp4)/i.test(u) ? (/\.m3u8/i.test(u) ? "hls" : "mp4") : "direct" });
        }

        // JS variables (common in such players)
        const jsVarMatch = raw.match(/(?:var|let|const)\s+(?:video|file|source|player|url)\s*=\s*["']([^"']+)["']/i);
        if (jsVarMatch) {
            const u = resolveUrl(baseUrl, jsVarMatch[1]);
            if (/\.(m3u8|mp4)/i.test(u)) candidates.push({ url: u, type: /\.m3u8/i.test(u) ? "hls" : "mp4" });
        }

        return candidates;
    }

    async function getHome(cb) {
        try {
            const data = {};
            const sections = [
                { name: "Trending", path: "/" },
                { name: "Latest Movies", path: "/" },
                { name: "Latest Web Series", path: "/" },
                { name: "Bollywood", path: "/bollywood" },
                { name: "Hollywood", path: "/hollywood" },
                { name: "South Indian", path: "/south" }
            ];

            for (const section of sections) {
                let items = [];
                try {
                    const target = section.path === "/" ? manifest.baseUrl : `\( {manifest.baseUrl} \){section.path}`;
                    const doc = await loadDoc(target);
                    items = collectItems(doc);
                } catch (_) {}

                if (items.length === 0 && section.path === "/") {
                    // fallback scrape full homepage for multiple grids if any
                    const doc = await loadDoc(manifest.baseUrl);
                    items = collectItems(doc);
                }

                items = uniqueByUrl(items).slice(0, 30);
                if (items.length > 0) data[section.name] = items;
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
            const ranked = items.filter(it => String(it.title || "").toLowerCase().includes(raw.toLowerCase()));

            cb({ success: true, data: ranked.length ? ranked.slice(0, 40) : items.slice(0, 40) });
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
                "Unknown Title"
            );

            const posterUrl = normalizeUrl(
                getAttr(doc.querySelector('meta[property="og:image"], img.poster, .poster img'), "content", "data-src", "src"),
                manifest.baseUrl
            );

            const description = cleanTitle(
                getAttr(doc.querySelector('meta[property="og:description"]'), "content") ||
                textOf(doc.querySelector(".description, .synopsis, .entry-content p, .story"))
            );

            const loanidLink = extractLoanIdLink(doc); // for later use in streams

            const contentType = /series|season|episode|web-series/i.test(target + " " + title) ? "series" : "movie";
            const year = parseYear(`${title} ${description} ${textOf(doc.body || doc.documentElement)}`);

            const episodes = contentType === "series" 
                ? Array.from(doc.querySelectorAll("a[href*='episode'], a[href*='season']")).map(a => {
                    const epHref = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
                    return new Episode({
                        name: cleanTitle(textOf(a)) || "Episode",
                        url: epHref,
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
                episodes: episodes.length ? uniqueByUrl(episodes) : undefined,
                // store loanid for streams if needed
                extra: { loanidLink }
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            let pageUrl = normalizeUrl(url, manifest.baseUrl);
            let detailDoc = await loadDoc(pageUrl);

            // 1. Extract loanid.php trigger (robust)
            let loanidUrl = extractLoanIdLink(detailDoc);
            if (!loanidUrl) {
                // fallback from extra if passed from load
                const extraLoan = detailDoc.querySelector('script[data-loanid]') ? null : null; // generic
                const bodyText = safeText(detailDoc.body.innerHTML || "");
                const fallbackMatch = bodyText.match(/loanid\.php\?lid=([a-z0-9]+)/i);
                if (fallbackMatch) loanidUrl = `\( {manifest.baseUrl}/loanid.php?lid= \){fallbackMatch[1]}`;
            }

            if (!loanidUrl) {
                return cb({ success: false, errorCode: "NO_LOANID", message: "Loanid link not found" });
            }

            // 2. Follow full redirect chain (handles 30x, meta, JS, 5s delay bypass)
            const redirectResult = await followRedirectChain(loanidUrl);

            if (!redirectResult.final) {
                return cb({ success: false, errorCode: "REDIRECT_FAILED" });
            }

            const finalHtml = redirectResult.body;
            const finalBase = redirectResult.url;

            // 3. Extract all possible stream types
            const videoCandidates = extractFinalVideoUrl(finalHtml, finalBase);

            const streams = [];
            for (const cand of videoCandidates) {
                const streamName = cand.type === "hls" ? "Tellybiz HLS" : 
                                  (cand.type === "mp4" ? "Tellybiz MP4" : "Tellybiz Player");
                const quality = cand.type === "hls" ? "Auto" : (cand.url.includes("1080") ? "1080p" : "720p");

                streams.push(new StreamResult({
                    name: streamName,
                    url: cand.url,
                    quality,
                    source: `Tellybiz - ${cand.type.toUpperCase()}`,
                    headers: {
                        "Referer": finalBase,
                        "User-Agent": UA,
                        "Origin": manifest.baseUrl
                    }
                }));
            }

            // fallback if no direct video - look for iframe player
            if (streams.length === 0) {
                const iframeSrc = finalHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeSrc) {
                    const iframeUrl = resolveUrl(finalBase, iframeSrc[1]);
                    streams.push(new StreamResult({
                        name: "Tellybiz iframe",
                        url: iframeUrl,
                        quality: "Auto",
                        source: "Tellybiz iframe",
                        headers: { "Referer": finalBase, "User-Agent": UA }
                    }));
                }
            }

            if (streams.length === 0) {
                // last resort - any .m3u8 / .mp4 in final page
                const extraM3u8 = finalHtml.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
                if (extraM3u8) {
                    streams.push(new StreamResult({
                        name: "Tellybiz Auto",
                        url: extraM3u8[1],
                        quality: "Auto",
                        source: "Tellybiz Auto",
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
