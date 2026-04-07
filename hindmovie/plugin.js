(function() {
    const externalHeaders = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" };

    function cleanTitle(raw) {
        if (!raw) return "Unknown";
        return raw.replace(/\b(480p|720p|1080p|4K|HDRip|BluRay|WEBRip|WEB-DL|DVDRip|HEVC|x264|x265|AAC|DD5\.1|ESub)\b/gi, "").replace(/&#\d+;/g, "").replace(/\s{2,}/g, " ").trim();
    }

    function extractSpecs(name) {
        if (!name) return "";
        const tokens = [];
        const patterns = [/\b(10bit|8bit)\b/i, /\b(Dual Audio|Multi Audio)\b/i, /\b(Hindi|Tamil|Telugu)\b/i, /\b(English|ESubs)\b/i];
        for (const p of patterns) { const m = name.match(p); if (m) tokens.push(m[1]); }
        return tokens.join(" ");
    }

    async function getHome(cb) {
        try {
            const baseUrl = manifest.baseUrl;
            const sections = [
                { name: "Trending", url: "/" },
                { name: "Movies", url: "/category/movies/" },
                { name: "Web Series", url: "/category/web-series/" },
                { name: "Dual Audio", url: "/category/movies/dual-audio-movies/" }
            ];
            const results = {};
            for (const section of sections) {
                try {
                    const res = await http_get(baseUrl + section.url, externalHeaders);
                    const items = parseSearchResults(res.body, baseUrl);
                    if (items.length > 0) results[section.name] = items;
                } catch (e) { console.error(`Failed ${section.name}: ${e.message}`); }
            }
            cb({ success: true, data: results });
        } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: e.message }); }
    }

    function parseSearchResults(html, baseUrl) {
        const items = [];
        const matches = html?.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
        for (const h of matches) {
            const a = h.match(/<a[^>]+href="([^"]+)"[^>]*>/);
            const i = h.match(/<img[^>]+src="([^"]+)"/);
            let t = h.match(/<h[23][^>]*>([^<]+)<\/h[23]>/);
            if (!t) t = h.match(/aria-label="([^"]+)"/);
            if (a && t) {
                const url = a[1], poster = i ? i[1] : null, title = t[1].replace(/<[^>]*>/g, "").trim();
                if (url && url.startsWith(baseUrl) && !url.includes("category") && !url.includes("tag")) {
                    items.push(new MultimediaItem({ title: cleanTitle(title), url: url, posterUrl: poster, type: title.toLowerCase().includes("season") ? "series" : "movie" }));
                }
            }
        }
        return items.slice(0, 20);
    }

    async function search(query, cb) {
        try {
            const baseUrl = manifest.baseUrl;
            const res = await http_get(baseUrl + "/?s=" + encodeURIComponent(query), externalHeaders);
            cb({ success: true, data: parseSearchResults(res.body, baseUrl) });
        } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message }); }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, externalHeaders);
            const html = res.body;
            const titleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/);
            const title = titleMatch ? titleMatch[1].split("(")[0].trim() : "Unknown";
            const posterMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
            const descMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/);
            const yearMatch = title.match(/\((\d{4})\)/);
            const isSeries = title.toLowerCase().includes("season");
            let downloadLinks = [];
            const mbRe = /<a[^>]+class="[^"]*maxbutton[^"]*"[^>]+href="([^"]+)"/gi;
            let mb; while ((mb = mbRe.exec(html)) !== null) { if (mb[1]?.startsWith("http")) downloadLinks.push({ type: "maxbutton", url: mb[1] }); }
            cb({ success: true, data: new MultimediaItem({
                title: title, url: url, posterUrl: posterMatch?.[1], bannerUrl: posterMatch?.[1],
                type: isSeries ? "series" : "movie", description: descMatch?.[1], year: yearMatch ? parseInt(yearMatch[1]) : null,
                episodes: [new Episode({ name: "Watch Online", url: JSON.stringify(downloadLinks), season: 1, episode: 1 })]
            }) });
        } catch (e) { cb({ success: false, errorCode: "LOAD_ERROR", message: e.message }); }
    }

    async function loadStreams(url, cb) {
        try {
            let linkData = [];
            try {
                const parsed = JSON.parse(url);
                linkData = Array.isArray(parsed) ? parsed.map(i => typeof i === 'string' ? { type: "maxbutton", url: i } : i) : [{ type: "maxbutton", url: parsed?.url || url }];
            } catch { linkData = [{ type: "maxbutton", url }]; }
            const results = [], seen = new Set();
            for (const li of linkData) {
                const pageUrl = li?.url;
                if (!pageUrl?.startsWith("http")) continue;
                const pageRes = await http_get(pageUrl, externalHeaders);
                const entry = pageRes.body?.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                if (!entry) continue;
                const hshare = entry[1].match(/href="(https:\/\/hshare\.ink[^\"]+)"/);
                if (!hshare) continue;
                const hshareRes = await http_get(hshare[1], externalHeaders);
                const hhtml = hshareRes.body;
                const name = hhtml.match(/<p><strong>Name:\s*([^<]+)<\/strong><\/p>/i)?.[1]?.trim() || "";
                const size = hhtml.match(/<p><strong>Size:\s*([^<]+)<\/strong><\/p>/i)?.[1]?.trim() || "";
                const btns = hhtml.match(/href="(https?:\/\/[^"]+)"[^>]*class="[^"]*btn[^"]*"/gi) || [];
                for (const btn of btns) {
                    const btnUrl = btn.match(/href="(https?:\/\/[^"]+)"/)?.[1];
                    if (!btnUrl || seen.has(btnUrl)) continue;
                    seen.add(btnUrl);
                    let finalUrl = btnUrl, finalHeaders = { Referer: hshare[1], "User-Agent": externalHeaders["User-Agent"] };
                    try {
                        const r = await http_get(btnUrl, { ...externalHeaders, Referer: hshare[1] });
                        const v = r.body?.match(/href="(https:\/\/video-downloads\.googleusercontent\.com[^"]+)"/);
                        if (v) { finalUrl = v[1]; finalHeaders = { Referer: btnUrl, "User-Agent": externalHeaders["User-Agent"] }; }
                    } catch {}
                    const q = name.toUpperCase().includes("1080") ? 1080 : name.toUpperCase().includes("720") ? 720 : name.toUpperCase().includes("480") ? 480 : 0;
                    const specs = extractSpecs(name);
                    let label = "[HCloud]";
                    if (specs) label += " " + specs;
                    if (size) label += " [" + size + "]";
                    results.push(new StreamResult({ url: finalUrl, quality: q || "Auto", source: label.trim(), headers: finalHeaders }));
                }
            }
            results.sort((a, b) => (b.quality || 0) - (a.quality || 0));
            cb({ success: true, data: results });
        } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: e.message }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
