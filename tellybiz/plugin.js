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
        if (raw.startsWith("/")) return `\( {base || manifest.baseUrl} \){raw}`;
        return `\( {base || manifest.baseUrl}/ \){raw}`;
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

    function safeText(text) {
        return htmlDecode(String(text || "")).replace(/\s+/g, " ").trim();
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

    // ====================== HELPERS FOR TELLYBIZ ======================

    function parsePosterItem(card) {
        if (!card) return null;
        const a = card.querySelector("a[href]");
        if (!a) return null;
        const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
        if (!href || /\/(category|tag|page|author|contact)/i.test(href)) return null;

        const img = card.querySelector("img");
        const title = safeText(
            getAttr(a, "title") ||
            textOf(card.querySelector("h2, h3, .title, .name")) ||
            getAttr(img, "alt")
        );

        if (!title) return null;

        const posterUrl = normalizeUrl(getAttr(img, "data-src", "src", "data-lazy"), manifest.baseUrl);

        return new MultimediaItem({
            title,
            url: href,
            posterUrl,
            type: "movie", // tellybiz mostly movies / series mixed
            contentType: "movie"
        });
    }

    function collectHomeItems(doc) {
        const cards = Array.from(doc.querySelectorAll(".poster, .item, .movie-card, article, .grid-item, .thumb"));
        const out = [];
        for (const card of cards) {
            const item = parsePosterItem(card);
            if (item) out.push(item);
        }
        return out.filter((v, i, a) => a.findIndex(t => t.url === v.url) === i).slice(0, 30);
    }

    // ====================== REDIRECT BYPASS ======================

    async function bypassLoanRedirect(detailUrl) {
        let current = detailUrl;

        // Step 1: Load detail page and find loanid.php link
        const detailDoc = await loadDoc(current);
        let loanUrl = "";

        // Look for loanid.php anywhere
        const loanLink = detailDoc.querySelector('a[href*="loanid.php"]');
        if (loanLink) {
            loanUrl = normalizeUrl(getAttr(loanLink, "href"), manifest.baseUrl);
        } else {
            // fallback regex in page source
            const bodyText = String(detailDoc.body ? detailDoc.body.innerHTML : "");
            const loanMatch = bodyText.match(/https?:\/\/[^"'\s]+?loanid\.php\?lid=[^"'\s]+/i);
            if (loanMatch) loanUrl = loanMatch[0];
        }

        if (!loanUrl) return current; // no redirect found

        // Step 2: Hit loanid.php (follow any 30x or meta/JS redirect)
        let res = await request(loanUrl);
        let html = String(res.body || "");

        // Follow meta refresh
        const metaRefresh = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'](\d+);\s*url=([^"']+)["']/i);
        if (metaRefresh) {
            const next = normalizeUrl(metaRefresh[2], manifest.baseUrl);
            res = await request(next);
            html = String(res.body || "");
        }

        // Follow JS window.location or similar
        let jsRedirect = html.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                        html.match(/location\.href\s*=\s*["']([^"']+)["']/i);
        if (jsRedirect) {
            const next = normalizeUrl(jsRedirect[1], manifest.baseUrl);
            res = await request(next);
            html = String(res.body || "");
        }

        // Step 3: If we landed on loanagreement.php or similar, extract final video
        current = res.url || current; // final URL after redirects

        return { html, finalUrl: current };
    }

    function extractFinalVideoUrl(html, baseUrl) {
        const text = String(html || "");

        // m3u8
        const m3u8Match = text.match(/(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/i);
        if (m3u8Match) return { url: m3u8Match[1], type: "hls" };

        // direct mp4
        const mp4Match = text.match(/(https?:\/\/[^\s"']+\.mp4[^\s"']*)/i);
        if (mp4Match) return { url: mp4Match[1], type: "mp4" };

        // iframe
        const iframeMatch = text.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            return { url: normalizeUrl(iframeMatch[1], baseUrl), type: "iframe" };
        }

        // <source> tag
        const sourceMatch = text.match(/<source[^>]+src=["']([^"']+)["']/i);
        if (sourceMatch) {
            const src = normalizeUrl(sourceMatch[1], baseUrl);
            if (/\.m3u8/i.test(src)) return { url: src, type: "hls" };
            if (/\.mp4/i.test(src)) return { url: src, type: "mp4" };
        }

        // JS variables (common patterns)
        const jsVarMatch = text.match(/(?:file|src|url|player|video)\s*[:=]\s*["']([^"']+\.(m3u8|mp4))["']/i);
        if (jsVarMatch) {
            return { url: normalizeUrl(jsVarMatch[1], baseUrl), type: jsVarMatch[2] === "m3u8" ? "hls" : "mp4" };
        }

        return null;
    }

    // ====================== MAIN FUNCTIONS ======================

    async function getHome(cb) {
        try {
            const doc = await loadDoc(manifest.baseUrl);
            const items = collectHomeItems(doc);

            const data = {
                "Trending": items.slice(0, 20),
                "Latest": items.slice(10, 30)
            };

            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e) });
        }
    }

    async function search(query, cb) {
        try {
            const q = encodeURIComponent(String(query || "").trim());
            if (!q) return cb({ success: true, data: [] });

            const doc = await loadDoc(`\( {manifest.baseUrl}/?s= \){q}`);
            const items = collectHomeItems(doc);

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e) });
        }
    }

    async function load(url, cb) {
        try {
            const target = normalizeUrl(url, manifest.baseUrl);
            const doc = await loadDoc(target);

            const title = safeText(
                textOf(doc.querySelector("h1, .entry-title, .title")) ||
                getAttr(doc.querySelector('meta[property="og:title"]'), "content")
            ) || "Unknown Title";

            const posterUrl = normalizeUrl(
                getAttr(doc.querySelector('meta[property="og:image"], img'), "content", "src", "data-src"),
                manifest.baseUrl
            );

            const description = safeText(
                textOf(doc.querySelector(".description, .entry-content p, .summary")) ||
                getAttr(doc.querySelector('meta[property="og:description"]'), "content")
            );

            const item = new MultimediaItem({
                title,
                url: target,
                posterUrl,
                bannerUrl: posterUrl,
                description,
                type: "movie",
                contentType: "movie"
            });

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const detailUrl = normalizeUrl(url, manifest.baseUrl);

            // Bypass the 5-second loanid → loanagreement redirect chain
            const { html, finalUrl } = await bypassLoanRedirect(detailUrl);

            const videoInfo = extractFinalVideoUrl(html, finalUrl);

            const streams = [];

            if (videoInfo) {
                let streamName = "Tellybiz";
                if (videoInfo.type === "hls") streamName += " - HLS";
                else if (videoInfo.type === "mp4") streamName += " - MP4";
                else streamName += " - Embed";

                streams.push(new StreamResult({
                    name: streamName,
                    url: videoInfo.url,
                    quality: "Auto",
                    source: "Tellybiz",
                    headers: {
                        "User-Agent": UA,
                        "Referer": finalUrl
                    }
                }));
            }

            // Fallback: try direct iframe or source if nothing found
            if (streams.length === 0) {
                const doc = await loadDoc(detailUrl);
                const iframeSrc = getAttr(doc.querySelector("iframe"), "src");
                if (iframeSrc) {
                    streams.push(new StreamResult({
                        name: "Tellybiz - Embed",
                        url: normalizeUrl(iframeSrc, detailUrl),
                        quality: "Auto",
                        source: "Tellybiz - Embed",
                        headers: { "Referer": detailUrl }
                    }));
                }
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e) });
        }
    }

    // Expose to SkyStream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

})();
