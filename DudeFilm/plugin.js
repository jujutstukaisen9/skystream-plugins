/**
 * DudeFilms SkyStream Plugin - Ported from CloudStream Kotlin
 * Features: Homepage, Search, Movies, TV Series, Multi-source extraction
 */
(function() {
    const MAIN_URL = manifest.baseUrl;
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

    // ==================== UTILITIES ====================
    const fixUrl = (u) => !u ? "" : u.startsWith("http") ? u : u.startsWith("//") ? "https:" + u : u.startsWith("/") ? MAIN_URL + u : MAIN_URL + "/" + u;
    
    const cleanTitle = (r) => {
        if (!r) return "";
        const m = /S(\d+)[Ee](\d+)(?:-(\d+))?/.exec(r);
        if (!m) return r.trim();
        const show = r.substring(0, r.indexOf(m[0])).trim();
        const eps = m[3] ? `Episodes ${m[2]}–${m[3]}` : `Episode ${m[2]}`;
        return `${show} Season ${m[1]} | ${eps}`;
    };

    const getQuality = (s) => {
        if (!s) return null;
        const u = s.normalize("NFKC").toLowerCase();
        const p = [[/\b(4k|uhd|2160p)\b/i, "4K"], [/\b(hdcam|camrip|cam)\b/i, "Cam"], [/\b(web[- ]?dl|webrip)\b/i, "WEB-DL"], [/\b(bluray|bdrip)\b/i, "BluRay"], [/\b1080p\b/i, "1080p"], [/\b720p\b/i, "720p"], [/\b(hdrip|hdtv)\b/i, "HD"]];
        for (const [r, q] of p) if (r.test(u)) return q;
        return null;
    };

    const isBlocked = (t) => t && ["zipfile", "torrent", "rar", "7z"].some(k => t.toLowerCase().includes(k));
    const getIndexQ = (s) => { const m = /(\d{3,4})[pP]/.exec(s || ""); return m ? m[1] + "p" : "Auto"; };
    const getBase = (u) => { try { const m = /^(https?:\/\/[^\/]+)/.exec(u); return m ? m[1] : ""; } catch (e) { return ""; } };
    
    const b64Decode = (s) => {
        try {
            const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let o = "", i = 0;
            s = s.replace(/[^A-Za-z0-9+/=]/g, "");
            while (i < s.length) {
                const e1 = c.indexOf(s.charAt(i++)), e2 = c.indexOf(s.charAt(i++)), e3 = c.indexOf(s.charAt(i++)), e4 = c.indexOf(s.charAt(i++));
                o += String.fromCharCode((e1 << 2) | (e2 >> 4));
                if (e3 !== 64) o += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
                if (e4 !== 64) o += String.fromCharCode(((e3 & 3) << 6) | e4);
            }
            return decodeURIComponent(escape(o));
        } catch (e) { return ""; }
    };

    // ==================== PARSING ====================
    const parseResults = (h) => {
        const r = [], items = h.split('<div class="simple-grid-grid-post');
        for (let i = 1; i < items.length; i++) {
            const it = items[i], lm = it.match(/href="([^"]+)"/), pm = it.match(/data-src="([^"]+)"/) || it.match(/src="([^"]+)"/), tm = it.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
            if (lm && tm) r.push(new MultimediaItem({ url: fixUrl(lm[1]), title: cleanTitle(tm[1].replace(/<[^>]+>/g, "").trim()), posterUrl: pm ? fixUrl(pm[1]) : "", type: lm[1].includes("/tv-series/") || lm[1].includes("/series/") ? "series" : "movie", quality: getQuality(tm[1]) }));
        }
        return r;
    };

    const parseEps = (h, sn) => {
        const eps = [], r = /<a[^>]+class="[^"]*maxbutton-ep[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = r.exec(h)) !== null) {
            const en = /(?:Episode|Ep|E)\s*(\d+)/i.exec(m[2])?.[1];
            if (en) eps.push({ url: fixUrl(m[1]), season: sn, episode: parseInt(en) });
        }
        return eps;
    };

    // ==================== EXTRACTORS ====================
    const extHubCloud = async (u, ref) => {
        const streams = [], q = getIndexQ(u);
        try {
            let ru = u;
            if (!u.includes("hubcloud.php")) {
                const r = await http_get(u, HEADERS);
                const dm = r.body.match(/id="download"[^>]*href="([^"]+)"/);
                if (dm) ru = fixUrl(dm[1]);
            }
            const r = await http_get(ru, HEADERS), h = r.body;
            const sz = h.match(/<i[^>]*id="size"[^>]*>([^<]*)<\/i>/)?.[1]?.trim() || "";
            const hd = h.match(/<div[^>]*class="card-header"[^>]*>([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
            const lx = hd ? `[${hd}]` : "";
            const br = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
            let m;
            while ((m = br.exec(h)) !== null) {
                const link = m[1], txt = m[2].replace(/<[^>]+>/g, "").trim().toLowerCase();
                if (isBlocked(txt)) continue;
                if (txt.includes("download file")) streams.push(new StreamResult({ url: link, source: `HubCloud ${lx}`, quality: q, headers: { "Referer": ru, "User-Agent": HEADERS["User-Agent"] } }));
                else if (txt.includes("buzzserver")) {
                    const br = await http_get(link + "/download", { "Referer": link, "User-Agent": HEADERS["User-Agent"] });
                    const dl = br.headers?.["hx-redirect"] || br.headers?.["HX-Redirect"];
                    if (dl) streams.push(new StreamResult({ url: dl, source: `BuzzServer ${lx}`, quality: q, headers: { "Referer": link, "User-Agent": HEADERS["User-Agent"] } }));
                } else if (txt.includes("pixeldra") || txt.includes("pixelserver")) {
                    const id = link.substring(link.lastIndexOf("/") + 1), base = getBase(link);
                    streams.push(new StreamResult({ url: link.includes("download") ? link : `${base}/api/file/${id}?download`, source: `PixelDrain ${lx}`, quality: q, headers: { "User-Agent": HEADERS["User-Agent"] } }));
                } else if (txt.includes("s3 server")) streams.push(new StreamResult({ url: link, source: `S3 Server ${lx}`, quality: q, headers: { "Referer": ru, "User-Agent": HEADERS["User-Agent"] } }));
                else if (txt.includes("mega server")) streams.push(new StreamResult({ url: link, source: `Mega Server ${lx}`, quality: q, headers: { "Referer": ru, "User-Agent": HEADERS["User-Agent"] } }));
                else if (txt.includes("fsl")) streams.push(new StreamResult({ url: link, source: `FSL Server ${lx}`, quality: q, headers: { "Referer": ru, "User-Agent": HEADERS["User-Agent"] } }));
            }
        } catch (e) {}
        return streams;
    };

    const extHubdrive = async (u) => {
        try {
            const r = await http_get(u, { ...HEADERS, timeout: 2000 });
            const hm = r.body.match(/class="btn btn-primary[^"]*"[^>]*href="([^"]+)"/);
            if (hm) return hm[1].includes("hubcloud") ? extHubCloud(hm[1], "HubDrive") : [new StreamResult({ url: hm[1], source: "HubDrive", headers: { "User-Agent": HEADERS["User-Agent"] } })];
        } catch (e) {}
        return [];
    };

    const extHubcdn = async (u) => {
        try {
            const r = await http_get(u, { ...HEADERS, "Referer": u }), em = r.body.match(/r=([A-Za-z0-9+/=]+)/);
            if (em) {
                const d = b64Decode(em[1]), m3 = d.substring(d.lastIndexOf("link=") + 5);
                return [new StreamResult({ url: m3, source: "HubCDN", headers: { "Referer": u, "User-Agent": HEADERS["User-Agent"] } })];
            }
        } catch (e) {}
        return [];
    };

    const resolve = async (u) => {
        if (!u) return [];
        if (u.includes("hubcloud") || u.includes("hub.") || u.includes("gamerxyt")) return extHubCloud(u, "");
        if (u.includes("hubdrive")) return extHubdrive(u);
        if (u.includes("hubcdn")) return extHubcdn(u);
        if (u.includes("pixeldrain")) { const id = u.match(/\/u\/([a-zA-Z0-9]+)/)?.[1]; return id ? [new StreamResult({ url: `https://pixeldrain.com/api/file/${id}?download`, source: "PixelDrain", headers: { "User-Agent": HEADERS["User-Agent"] } })] : []; }
        return [new StreamResult({ url: u, source: "Direct", headers: { "User-Agent": HEADERS["User-Agent"] } })];
    };

    // ==================== MAIN API ====================
    async function getHome(cb) {
        try {
            const cats = [{ n: "Homepage", p: "" }, { n: "Bollywood", p: "category/bollywood" }, { n: "Hollywood", p: "category/hollywood" }, { n: "Gujarati", p: "category/gujarati" }, { n: "South Indian", p: "category/southindian" }, { n: "Web Series", p: "category/webseries" }, { n: "Adult", p: "category/adult/" }];
            const home = {};
            for (const c of cats) {
                try {
                    const u = c.p ? `${MAIN_URL}/${c.p}` : MAIN_URL, r = await http_get(u, HEADERS);
                    if (r.status === 200) { const it = parseResults(r.body); if (it.length) home[c.n] = it.slice(0, 24); }
                } catch (e) {}
            }
            cb({ success: true, data: home });
        } catch (e) { cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message }); }
    }

    async function search(q, cb) {
        try {
            const r = await http_get(`${MAIN_URL}/?s=${encodeURIComponent(q)}`, HEADERS);
            cb({ success: true, data: r.status === 200 ? parseResults(r.body) : [] });
        } catch (e) { cb({ success: false, errorCode: "PARSE_ERROR", message: e.message }); }
    }

    async function load(u, cb) {
        try {
            const r = await http_get(u, HEADERS);
            if (r.status !== 200) return cb({ success: false, errorCode: "SITE_OFFLINE" });
            const h = r.body, tm = h.match(/<h1[^>]*class="post-title"[^>]*>([\s\S]*?)<\/h1>/), tt = tm ? tm[1].replace(/<[^>]+>/g, "").trim() : "Unknown";
            const pm = h.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/) || h.match(/<img[^>]*class="[^"]*poster[^"]*"[^>]*src="([^"]+)"/), ps = pm ? fixUrl(pm[1]) : "";
            const dm = h.match(/<div[^>]*id="summary"[^>]*>([\s\S]*?)<\/div>/), ds = dm ? dm[1].replace(/<[^>]+>/g, "").trim() : "";
            const ym = h.match(/\((\d{4})\)/) || h.match(/<small>(\d{4})<\/small>/), yr = ym ? parseInt(ym[1]) : null;
            const isTv = tt.toLowerCase().includes("series") || tt.toLowerCase().includes("season") || h.includes("<h4>"), type = isTv ? "series" : "movie";
            const im = h.match(/imdb\.com\/title\/(tt\d+)/)?.[1] || "";
            let meta = null;
            if (im) try { const mr = await http_get(`${CINEMETA_URL}/${type === "series" ? "series" : "movie"}/${im}.json`, HEADERS); if (mr.status === 200 && mr.body.startsWith("{")) meta = JSON.parse(mr.body); } catch (e) {}
            const eps = [];
            if (type === "series") {
                const h4r = /<h4[^>]*>([\s\S]*?)<\/h4>/g;
                let h4m;
                while ((h4m = h4r.exec(h)) !== null) {
                    const sm = /Season\s*(\d+)/i.exec(h4m[1].replace(/<[^>]+>/g, "")), sn = sm ? parseInt(sm[1]) : 0;
                    if (sn > 0) {
                        const h4i = h.indexOf(h4m[0]), ns = h.substring(h4i + h4m[0].length), n4 = ns.search(/<h4[^>]*>/), sh = n4 > 0 ? ns.substring(0, n4) : ns;
                        const br = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
                        let bm;
                        while ((bm = br.exec(sh)) !== null) {
                            if (isBlocked(bm[0])) continue;
                            try {
                                const er = await http_get(fixUrl(bm[1]), HEADERS);
                                if (er.status === 200) {
                                    const epR = /<a[^>]*class="[^"]*maxbutton-ep[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
                                    let em;
                                    while ((em = epR.exec(er.body)) !== null) {
                                        const en = /(?:Episode|Ep|E)\s*(\d+)/i.exec(em[2].replace(/<[^>]+>/g, "").trim())?.[1], eNum = en ? parseInt(en) : 0;
                                        if (eNum > 0) {
                                            const mEp = meta?.meta?.videos?.find(v => v.season === sn && v.episode === eNum);
                                            eps.push(new Episode({ name: mEp?.name || `S${sn.toString().padStart(2, '0')}E${eNum.toString().padStart(2, '0')}`, url: fixUrl(em[1]), season: sn, episode: eNum, posterUrl: mEp?.thumbnail || ps, description: mEp?.overview || "" }));
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                    }
                }
            } else {
                const links = [], br = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
                let bm;
                while ((bm = br.exec(h)) !== null) { if (!isBlocked(bm[0])) links.push(fixUrl(bm[1])); }
                eps.push(new Episode({ name: "Full Movie", url: JSON.stringify(links), season: 1, episode: 1, posterUrl: ps }));
            }
            cb({ success: true, data: new MultimediaItem({ title: meta?.meta?.name || cleanTitle(tt), url: u, posterUrl: meta?.meta?.poster || ps, bannerUrl: meta?.meta?.background || ps, description: meta?.meta?.description || ds, type, year: meta?.meta?.year ? parseInt(meta.meta.year) : yr, score: meta?.meta?.imdbRating ? parseFloat(meta.meta.imdbRating) : null, episodes: eps }) });
        } catch (e) { cb({ success: false, errorCode: "PARSE_ERROR", message: e.message }); }
    }

    async function loadStreams(u, cb) {
        try {
            let links = [];
            if (u.startsWith("[")) try { links = JSON.parse(u); } catch (e) { links = [u]; }
            else links = [u];
            const all = [];
            for (const l of links) { const s = await resolve(l); all.push(...s); }
            all.sort((a, b) => { const qa = (a.quality || "").includes("1080") ? 2 : (a.quality || "").includes("720") ? 1 : 0, qb = (b.quality || "").includes("1080") ? 2 : (b.quality || "").includes("720") ? 1 : 0; return qb - qa; });
            cb({ success: true, data: all });
        } catch (e) { cb({ success: false, errorCode: "PARSE_ERROR", message: e.message }); }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
