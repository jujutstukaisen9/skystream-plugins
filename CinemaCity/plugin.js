/**
 * CinemaCity SkyStream Plugin
 * Migrated from Kotlin (CloudStream)
 */
(function() {
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;" // Migrated from Kotlin
    };

    /** 
     * Helper: Parse HTML items into MultimediaItems
     * Mapping from Kotlin: div.dar-short_item
     */
    function parseItems(html) {
        const results = [];
        // Extracting blocks with Regex (SkyStream standard for speed)
        const blockRegex = /<div class="dar-short_item">([\s\S]*?)<\/div><\/div>/g;
        let match;
        while ((match = blockRegex.exec(html)) !== null) {
            const inner = match[1];
            const titleMatch = inner.match(/<a[^>]*>(.*?)<\/a>/);
            const urlMatch = inner.match(/href="(.*?)"/);
            const posterMatch = inner.match(/<div class="dar-short_bg e-cover" style="background-image: url\((.*?)\)/);

            if (titleMatch && urlMatch) {
                results.push(new MultimediaItem({
                    title: titleMatch[1].split('(')[0].trim(),
                    url: urlMatch[1],
                    posterUrl: posterMatch ? posterMatch[1] : "",
                    type: urlMatch[1].includes("/tv-series/") ? "series" : "movie"
                }));
            }
        }
        return results;
    }

    // 1. getHome: Categories Dashboard
    async function getHome(cb) {
        try {
            const response = await fetch(`${manifest.baseUrl}`, { headers: HEADERS });
            const html = await response.text();
            
            // Porting Kotlin categories
            const data = {
                "Latest Movies": parseItems(html), // Using home page items as trending/latest
                "TV Series": [] // In a real scenario, fetch manifest.baseUrl + "/tv-series"
            };
            
            cb({ success: true, data });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    // 2. search: Handle queries
    async function search(query, cb) {
        try {
            const encoded = encodeURIComponent(query);
            const searchUrl = `${manifest.baseUrl}/index.php?do=search&subaction=search&story=${encoded}`;
            const response = await fetch(searchUrl, { headers: HEADERS });
            const html = await response.text();
            cb({ success: true, data: parseItems(html) });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    // 3. load: Fetch Details & Episodes
    async function load(url, cb) {
        try {
            const response = await fetch(url, { headers: HEADERS });
            const html = await response.text();

            const title = (html.match(/<meta property="og:title" content="(.*?)"/) || [])[1]?.split('(')[0].trim();
            const poster = (html.match(/<meta property="og:image" content="(.*?)"/) || [])[1];
            const description = (html.match(/<div class="ta-full_text1">(.*?)<\/div>/s) || [])[1]?.replace(/<[^>]*>/g, '');
            const isSeries = url.includes("/tv-series/");

            const item = new MultimediaItem({
                title,
                url,
                posterUrl: poster,
                description,
                type: isSeries ? "series" : "movie"
            });

            // PORTING: PlayerJS Logic from Cinemacity.kt
            const atobScriptMatch = html.match(/atob\("(.*?)"\)/);
            if (atobScriptMatch) {
                const decoded = atob(atobScriptMatch[1]);
                const fileMatch = decoded.match(/file:(.*?),/);
                
                if (fileMatch) {
                    const fileData = fileMatch[1].trim();
                    // Handle PlayerJS Folder Structure (JSON-in-JS)
                    if (isSeries && fileData.startsWith('[')) {
                        const seasons = JSON.parse(fileData);
                        const episodes = [];
                        seasons.forEach((s, sIdx) => {
                            s.folder.forEach((ep, eIdx) => {
                                episodes.push(new Episode({
                                    name: ep.title || `Episode ${eIdx + 1}`,
                                    url: JSON.stringify({ file: ep.file, subtitle: ep.subtitle || "" }),
                                    season: sIdx + 1,
                                    episode: eIdx + 1
                                }));
                            });
                        });
                        item.episodes = episodes;
                    } else {
                        // Movie case: store file data in URL for loadStreams
                        item.url = JSON.stringify({ file: fileData.replace(/['"]/g, ''), subtitle: "" });
                    }
                }
            }

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    // 4. loadStreams: Extract Final Playable Link
    async function loadStreams(dataStr, cb) {
        try {
            const data = JSON.parse(dataStr);
            const streams = [];
            
            // SkyStream supports HLS (m3u8) and MP4 natively
            // Logic ported from Kotlin 'loadLinks'
            if (data.file) {
                const streamUrl = data.file;
                streams.push(new StreamResult({
                    url: streamUrl,
                    quality: streamUrl.includes("1080") ? "1080p" : "720p",
                    headers: { "Referer": manifest.baseUrl }
                }));
            }
            
            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, error: e.message });
        }
    }

    // Global Exports
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
