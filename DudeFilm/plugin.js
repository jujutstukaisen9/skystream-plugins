(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest injected at runtime

    const DEFAULT_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };

    const BASE = () => manifest.baseUrl || "https://dudefilms.llc";

    // === Ported from Utils.kt ===
    function cleanTitle(raw) {
        if (!raw) return "Untitled";
        const regex = /S(\d+)[Ee](\d+)(?:-(\d+))?/;
        const match = raw.match(regex);
        if (!match) return raw.trim();
        const season = match[1];
        const epStart = match[2];
        const epEnd = match[3] || epStart;
        const showName = raw.split(match[0])[0].trim();
        return `${showName} Season ${season} | Episodes \( {epStart}– \){epEnd}`;
    }

    // === Ported from Extractors.kt (HubCloud, Hubdrive, Hubcdnn, etc.) ===
    async function hubCloudExtract(url, cb) {
        try {
            const res = await http_get(url, DEFAULT_HEADERS);
            const doc = await parseHtml(res.body);
            const results = [];

            doc.querySelectorAll('a.btn').forEach(el => {
                const link = el.getAttribute('href');
                const text = (el.textContent || '').toLowerCase();
                const header = doc.querySelector('div.card-header')?.textContent || '';
                const size = doc.querySelector('i#size')?.textContent || '';
                const labelExtras = `${header} ${size}`.trim();

                if (text.includes('fsl server')) {
                    results.push(new StreamResult({
                        url: link,
                        source: "HubCloud [FSL]",
                        quality: "1080p",
                        headers: { "Referer": url }
                    }));
                } else if (text.includes('download file')) {
                    results.push(new StreamResult({
                        url: link,
                        source: "HubCloud [Direct]",
                        headers: { "Referer": url }
                    }));
                } else if (text.includes('buzzserver')) {
                    // Simulate redirect extraction
                    results.push(new StreamResult({
                        url: link + "/download",
                        source: "HubCloud [Buzz]",
                        headers: { "Referer": url }
                    }));
                } else if (text.includes('pixeldrain') || text.includes('pixel')) {
                    const fileId = link.split('/').pop();
                    results.push(new StreamResult({
                        url: `https://pixeldrain.dev/api/file/${fileId}?download`,
                        source: "HubCloud [Pixeldrain]",
                        headers: { "Referer": url }
                    }));
                } else if (link) {
                    results.push(new StreamResult({
                        url: link,
                        source: "HubCloud [Other]",
                        headers: { "Referer": url }
                    }));
                }
            });
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "EXTRACTOR_FAIL" });
        }
    }

    async function hubDriveExtract(url, cb) {
        try {
            const res = await http_get(url, DEFAULT_HEADERS);
            const doc = await parseHtml(res.body);
            const href = doc.querySelector('.btn.btn-primary.btn-user.btn-success1.m-1')?.getAttribute('href');
            if (href && href.includes('hubcloud')) {
                return hubCloudExtract(href, cb);
            } else if (href) {
                // Direct or other
                cb({ success: true, data: [new StreamResult({ url: href, source: "HubDrive" })] });
            }
        } catch (e) {
            cb({ success: false, errorCode: "EXTRACTOR_FAIL" });
        }
    }

    // === Core SkyStream Functions ===
    function toMultimediaItem(el) {
        const titleEl = el.querySelector('h3');
        const title = cleanTitle(titleEl?.textContent || 'Untitled');
        const link = el.querySelector('h3 a')?.getAttribute('href');
        const img = el.querySelector('img');
        const poster = img?.getAttribute('data-src') || img?.getAttribute('src') || '';

        const isSeries = /series|season|webseries/i.test(title + (link || ''));
        return new MultimediaItem({
            title: title,
            url: link ? (link.startsWith('http') ? link : BASE() + link) : '',
            posterUrl: poster.startsWith('http') ? poster : BASE() + poster,
            type: isSeries ? "series" : "movie"
        });
    }

    async function getHome(cb) {
        try {
            const sections = [
                { name: "Trending", path: "/" },
                { name: "Bollywood", path: "/category/bollywood" },
                { name: "Hollywood", path: "/category/hollywood" },
                { name: "Gujarati", path: "/category/gujarati" },
                { name: "South Indian", path: "/category/southindian" },
                { name: "Web Series", path: "/category/webseries" }
            ];

            const homeData = {};
            for (const sec of sections) {
                const res = await http_get(BASE() + sec.path, DEFAULT_HEADERS);
                const doc = await parseHtml(res.body);
                const items = Array.from(doc.querySelectorAll('div.simple-grid-grid-post'))
                    .map(toMultimediaItem)
                    .filter(Boolean)
                    .slice(0, 18);
                if (items.length) homeData[sec.name] = items;
            }
            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR" });
        }
    }

    async function search(query, cb) {
        try {
            const url = `\( {BASE()}/page/1/?s= \){encodeURIComponent(query)}`;
            const res = await http_get(url, DEFAULT_HEADERS);
            const doc = await parseHtml(res.body);
            const items = Array.from(doc.querySelectorAll('div.simple-grid-grid-post'))
                .map(toMultimediaItem)
                .filter(Boolean);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: true, data: [] });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, DEFAULT_HEADERS);
            const doc = await parseHtml(res.body);

            const title = doc.querySelector('#movie_title > a')?.textContent?.trim() || 'Untitled';
            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
            const description = doc.querySelector('#summary')?.textContent?.trim() || '';
            const typeraw = doc.querySelector('h1.post-title a')?.textContent || '';
            const yearMatch = doc.querySelector('#movie_title > a > small')?.textContent?.match(/\d{4}/);
            const year = yearMatch ? parseInt(yearMatch[0]) : null;

            const isSeries = /series|season|webseries/i.test(typeraw + title);
            const type = isSeries ? "series" : "movie";

            const episodes = [];
            if (isSeries) {
                // Ported series button scanning pattern from similar sites
                const content = doc.querySelector('.entry-content') || doc.body;
                const buttons = content.querySelectorAll('a[href*="download"], a.maxbutton, button');
                let season = 1;
                buttons.forEach((btn, idx) => {
                    const txt = btn.textContent || '';
                    const sMatch = txt.match(/Season\s*(\d+)/i);
                    if (sMatch) season = parseInt(sMatch[1]);
                    const href = btn.getAttribute('href');
                    if (href) {
                        episodes.push(new Episode({
                            name: txt || `Episode ${idx + 1}`,
                            url: href.startsWith('http') ? href : BASE() + href,
                            season: season,
                            episode: idx + 1
                        }));
                    }
                });
            } else {
                episodes.push(new Episode({
                    name: "Full Movie",
                    url: url,
                    season: 1,
                    episode: 1
                }));
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    description: description,
                    type: type,
                    year: year,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR" });
        }
    }

    async function loadStreams(url, cb) {
        // Route to correct extractor based on URL pattern
        if (url.includes('hubdrive')) {
            return hubDriveExtract(url, cb);
        }
        if (url.includes('hubcloud') || url.includes('hubcdn')) {
            return hubCloudExtract(url, cb);
        }
        // Fallback: direct link or generic
        try {
            const res = await http_get(url, DEFAULT_HEADERS);
            if (res.body.includes('m3u8') || res.status === 200) {
                cb({
                    success: true,
                    data: [new StreamResult({
                        url: url,
                        source: "Direct",
                        headers: DEFAULT_HEADERS
                    })]
                });
            } else {
                cb({ success: true, data: [] });
            }
        } catch (e) {
            cb({ success: true, data: [] });
        }
    }

    // Export
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
