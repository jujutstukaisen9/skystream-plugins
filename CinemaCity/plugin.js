(function () {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": atob("ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=")
    };

    const getBaseUrl = () => {
        if (typeof manifest !== 'undefined' && manifest.baseUrl) return manifest.baseUrl;
        return "https://cinemacity.cc";
    };

    // Helper: Safely parse JSON strings
    function safeParse(data) {
        if (!data) return null;
        if (typeof data === 'object') return data;
        try { return JSON.parse(data); } catch (e) { return null; }
    }

    // Helper: Parse DLE items
    function parseDleItem(el) {
        const aTag = el.querySelector('a');
        if (!aTag) return null;

        const title = aTag.textContent.split('(')[0].trim() || "Unknown";
        const href = aTag.getAttribute('href');
        const posterEl = el.querySelector('div.dar-short_bg a, div.dar-short_bg img');
        const poster = posterEl ? (posterEl.getAttribute('href') || posterEl.getAttribute('src')) : "";
        
        const scoreEl = el.querySelector('span.rating-color');
        const score = scoreEl ? parseFloat(scoreEl.textContent.trim()) : null;

        const type = href.includes('/tv-series/') ? 'series' : 'movie';

        return new MultimediaItem({
            title: title,
            url: href,
            posterUrl: poster,
            type: type,
            score: score
        });
    }

    // 1. getHome: Dashboard
    async function getHome(cb) {
        try {
            const categories = [
                { path: "/movies/", name: "Movies" },
                { path: "/tv-series/", name: "TV Series" },
                { path: "/xfsearch/genre/anime/", name: "Anime" },
                { path: "/xfsearch/genre/asian/", name: "Asian" },
                { path: "/xfsearch/genre/animation/", name: "Animation" },
                { path: "/xfsearch/genre/documentary/", name: "Documentary" }
            ];

            const baseUrl = getBaseUrl();
            const results = await Promise.all(categories.map(async (cat) => {
                try {
                    const res = await http_get(`${baseUrl}${cat.path}`, HEADERS);
                    const doc = await parseHtml(res.body);
                    const items = Array.from(doc.querySelectorAll('div.dar-short_item')).map(parseDleItem).filter(Boolean);
                    if (items.length > 0) return { name: cat.name, items };
                } catch (e) {
                    console.error(`[CinemaCity] Failed to load category: ${cat.name}`);
                }
                return null;
            }));

            const finalData = {};
            results.filter(Boolean).forEach(c => { finalData[c.name] = c.items; });

            cb({ success: true, data: finalData });
        } catch (error) {
            cb({ success: false, message: error.message });
        }
    }

    // 2. search: DLE Search logic
    async function search(query, cb) {
        try {
            const baseUrl = getBaseUrl();
            const encodedQuery = encodeURIComponent(query);
            const searchUrl = `${baseUrl}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodedQuery}`;
            
            const res = await http_get(searchUrl, HEADERS);
            const doc = await parseHtml(res.body);
            
            const items = Array.from(doc.querySelectorAll('div.dar-short_item')).map(parseDleItem).filter(Boolean);
            cb({ success: true, data: items });
        } catch (error) {
            cb({ success: false, message: error.message });
        }
    }

    // 3. load: Metadata & PlayerJS execution
    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            const doc = await parseHtml(res.body);

            // Basic Metadata
            let title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || "";
            title = title.split('(')[0].trim();
            const poster = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || "";
            const plot = doc.querySelector('#about div.ta-full_text1')?.textContent?.trim() || "";
            const isSeries = url.includes('/tv-series/');

            // Advanced PlayerJS extraction (Parity with Kotlin PlayerJS parsing)
            const scriptTags = Array.from(doc.querySelectorAll('script'));
            const playerScript = scriptTags.find(s => s.textContent && s.textContent.includes('atob('));
            
            let fileArray = [];
            let streamsPayload = [];
            let episodesList = [];

            if (playerScript) {
                const text = playerScript.textContent;
                const b64match = text.match(/atob\("([^"]+)"\)/);
                if (b64match) {
                    const decoded = atob(b64match[1]);
                    const jsonMatch = decoded.match(/new Playerjs\((.*?)\);/);
                    if (jsonMatch) {
                        const pJson = safeParse(jsonMatch[1]);
                        let rawFile = pJson?.file;
                        
                        if (typeof rawFile === 'string') {
                            if (rawFile.startsWith('[') || rawFile.startsWith('{')) {
                                rawFile = safeParse(rawFile);
                                fileArray = Array.isArray(rawFile) ? rawFile : [rawFile];
                            } else {
                                fileArray = [{ file: rawFile }];
                            }
                        } else if (Array.isArray(rawFile)) {
                            fileArray = rawFile;
                        }
                    }
                }
            }

            if (isSeries) {
                // Parse seasons and episodes
                fileArray.forEach(seasonNode => {
                    const sMatch = seasonNode.title?.match(/Season\s*(\d+)/i);
                    const seasonNum = sMatch ? parseInt(sMatch[1]) : 1;

                    if (seasonNode.folder) {
                        seasonNode.folder.forEach(epNode => {
                            const eMatch = epNode.title?.match(/Episode\s*(\d+)/i);
                            const epNum = eMatch ? parseInt(eMatch[1]) : 1;
                            
                            let epStreams = [];
                            if (epNode.file) epStreams.push(epNode.file);
                            if (epNode.folder) {
                                epNode.folder.forEach(src => { if (src.file) epStreams.push(src.file); });
                            }

                            if (epStreams.length > 0) {
                                episodesList.push(new Episode({
                                    name: `Episode ${epNum}`,
                                    url: JSON.stringify({ streams: epStreams }),
                                    season: seasonNum,
                                    episode: epNum
                                }));
                            }
                        });
                    }
                });
            } else {
                // Movie
                if (fileArray[0] && fileArray[0].file) {
                    streamsPayload.push(fileArray[0].file);
                }
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: isSeries ? url : JSON.stringify({ streams: streamsPayload }),
                    posterUrl: poster,
                    description: plot,
                    type: isSeries ? 'series' : 'movie',
                    episodes: episodesList
                })
            });

        } catch (error) {
            cb({ success: false, message: error.message });
        }
    }

    // 4. loadStreams: Return extracted URLs
    async function loadStreams(payload, cb) {
        try {
            const data = safeParse(payload);
            if (!data || !data.streams) throw new Error("No streams found in payload");

            const streamResults = data.streams.map(url => {
                // Attempt to infer quality from url string (Parity with Utils.kt extractQuality)
                let quality = "Auto";
                if (url.includes('2160p')) quality = "4K";
                else if (url.includes('1440p')) quality = "1440p";
                else if (url.includes('1080p')) quality = "1080p";
                else if (url.includes('720p')) quality = "720p";
                else if (url.includes('480p')) quality = "480p";

                return new StreamResult({
                    url: url,
                    quality: quality
                });
            });

            cb({ success: true, data: streamResults });
        } catch (error) {
            cb({ success: false, message: error.message });
        }
    }

    // Bind to Global context
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
