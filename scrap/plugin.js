(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest injected by SkyStream

    const API_BASE = manifest.baseUrl || "https://screenscapeapi.dev/api";
    const API_KEY = "sk_1q7Geid8t5WyzPs50tdPrxsvAOSI7Geq";   // hardcoded exactly as you wanted

    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "x-api-key": API_KEY,
        "Content-Type": "application/json"
    };

    async function apiGet(path, queryParams = {}) {
        let url = API_BASE + path;
        if (Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams(queryParams);
            url += `?${params.toString()}`;
        }

        const res = await http_get(url, HEADERS);
        if (res.status !== 200) {
            throw new Error(`API_ERROR ${res.status} - ${res.body || 'empty'}`);
        }
        return JSON.parse(res.body || '{}');
    }

    function toMultimediaItem(item) {
        if (!item) return null;
        return new MultimediaItem({
            title: item.title || item.name || item.moviename || "Unknown",
            url: item.url || item.link || item.slug || item.id || "",
            posterUrl: item.poster || item.image || item.thumbnail || item.posterImage || "",
            type: (item.type || item.contentType || "").toLowerCase().includes("series") || item.seasons || item.episodes ? "series" : "movie",
            year: item.year || item.releaseYear,
            score: item.rating || item.imdb || 0,
            description: item.description || item.plot || "",
        });
    }

    async function getHome(cb) {
        try {
            const [kmmRes, netRes] = await Promise.all([
                apiGet("/kmmovies"),
                apiGet("/netmirror")
            ]);

            const kmmItems = (kmmRes.data || kmmRes.results || kmmRes.movies || []).map(toMultimediaItem).filter(Boolean).slice(0, 15);
            const netItems = (netRes.data || netRes.results || netRes.latest || []).map(toMultimediaItem).filter(Boolean).slice(0, 15);

            cb({
                success: true,
                data: {
                    "Trending": [...kmmItems.slice(0, 8), ...netItems.slice(0, 8)],
                    "Latest Movies (KMMovies)": kmmItems,
                    "Latest Releases (NetMirror)": netItems
                }
            });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const [kmmRes, animeRes, netRes] = await Promise.all([
                apiGet("/kmmovies/search", { q: query }),
                apiGet("/animesalt/search", { q: query }),
                apiGet("/netmirror/search", { q: query })
            ]);

            const allItems = [
                ...(kmmRes.data || kmmRes.results || []).map(toMultimediaItem),
                ...(animeRes.data || animeRes.results || []).map(toMultimediaItem),
                ...(netRes.data || netRes.results || netRes.posts || []).map(toMultimediaItem)
            ].filter(Boolean);

            cb({ success: true, data: allItems });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            let details;
            try { details = await apiGet("/kmmovies/details", { url: url }); } catch (_) {}
            if (!details?.title) try { details = await apiGet("/animesalt/details", { url: url }); } catch (_) {}
            if (!details?.title) try { details = await apiGet("/netmirror/getpost", { id: url }); } catch (_) {}

            if (!details) throw new Error("No details found");

            const multimedia = toMultimediaItem(details);

            if (multimedia.type === "series") {
                const episodes = [];
                const epList = details.episodes || details.seasons || details.streams || [];
                epList.forEach((ep, idx) => {
                    episodes.push(new Episode({
                        name: ep.title || ep.name || `Episode ${idx + 1}`,
                        url: ep.url || ep.id || url,
                        season: ep.season || 1,
                        episode: ep.episode || (idx + 1)
                    }));
                });
                multimedia.episodes = episodes;
            } else {
                multimedia.episodes = [new Episode({ name: "Full Movie", url: url, season: 1, episode: 1 })];
            }

            cb({ success: true, data: multimedia });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            let streamData;
            try { streamData = await apiGet("/kmmovies/magiclinks", { url: url }); } catch (_) {}
            if (!streamData) try { streamData = await apiGet("/animesalt/stream", { url: url }); } catch (_) {}
            if (!streamData) try { streamData = await apiGet("/netmirror/stream", { id: url }); } catch (_) {}

            const streams = [];

            if (Array.isArray(streamData)) {
                streamData.forEach(link => {
                    if (link.url) streams.push(new StreamResult({ url: link.url, quality: link.quality || "720p", source: "ScarperApi", headers: { "Referer": "https://screenscape.me" } }));
                });
            } else if (streamData?.links) {
                streamData.links.forEach(link => {
                    if (link.url) streams.push(new StreamResult({ url: link.url, quality: link.quality || "720p", source: "ScarperApi", headers: { "Referer": "https://screenscape.me" } }));
                });
            } else if (typeof streamData === "object") {
                Object.keys(streamData).forEach(key => {
                    const val = streamData[key];
                    if (typeof val === "string" && val.startsWith("http")) {
                        streams.push(new StreamResult({ url: val, quality: key, source: "ScarperApi", headers: { "Referer": "https://screenscape.me" } }));
                    }
                });
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
