(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest is injected at runtime by SkyStream

    const API_BASE = manifest.baseUrl || "https://screenscapeapi.dev";
    const HEADERS_BASE = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };

    function getApiKey() {
        // SkyStream SDK exposes getPreference() for plugin settings
        return getPreference ? getPreference("sk_1q7Geid8t5WyzPs50tdPrxsvAOSI7Geq") || "" : "";
    }

    async function apiGet(path, queryParams = {}) {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error("API_KEY_MISSING: Set your ScarperApi key in plugin settings (screenscapeapi.dev/dashboard/apis)");
        }

        let url = `\( {API_BASE} \){path}`;
        if (Object.keys(queryParams).length > 0) {
            const params = new URLSearchParams(queryParams);
            url += `?${params.toString()}`;
        }

        const headers = {
            ...HEADERS_BASE,
            "x-api-key": apiKey,
            "Content-Type": "application/json"
        };

        const res = await http_get(url, headers);
        if (res.status !== 200) {
            throw new Error(`API_ERROR: ${res.status} - ${res.body || 'No body'}`);
        }
        return JSON.parse(res.body || '{}');
    }

    function toMultimediaItem(item) {
        if (!item) return null;
        return new MultimediaItem({
            title: item.title || item.name || item.moviename || "Unknown Title",
            url: item.url || item.link || item.slug || item.id || "",   // used later in details/magiclinks
            posterUrl: item.poster || item.image || item.thumbnail || item.posterImage || "",
            type: (item.type || item.contentType || "").toLowerCase().includes("series") || item.seasons ? "series" : "movie",
            year: item.year || item.releaseYear || item.airedYear,
            score: item.rating || item.imdb || item.score || 0,
            description: item.description || item.storyline || item.plot || "",
            // cast, genres, etc. can be added once you inspect real response
        });
    }

    async function getHome(cb) {
        try {
            // Fetch latest from KMMovies + NetMirror for variety
            const [kmmRes, netRes] = await Promise.all([
                apiGet("/api/kmmovies"),           // latest movies
                apiGet("/api/netmirror")           // general homepage content
            ]);

            const kmmItems = (kmmRes.data || kmmRes.results || kmmRes.movies || []).map(toMultimediaItem).filter(Boolean).slice(0, 15);
            const netItems = (netRes.data || netRes.results || []).map(toMultimediaItem).filter(Boolean).slice(0, 15);

            const homeData = {
                "Trending": [...kmmItems.slice(0, 8), ...netItems.slice(0, 8)],   // Hero carousel
                "Latest Movies (KMMovies)": kmmItems,
                "Latest Releases (NetMirror)": netItems
            };

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            // Search across all providers
            const [kmmRes, animeRes, netRes] = await Promise.all([
                apiGet("/api/kmmovies/search", { q: query }),
                apiGet("/api/animesalt/search", { q: query }),
                apiGet("/api/netmirror/search", { q: query })
            ]);

            const allItems = [
                ...(kmmRes.data || kmmRes.results || []).map(toMultimediaItem),
                ...(animeRes.data || animeRes.results || []).map(toMultimediaItem),
                ...(netRes.data || netRes.results || []).map(toMultimediaItem)
            ].filter(Boolean);

            cb({ success: true, data: allItems });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            // url can be from any provider - we try all detail endpoints
            let details;
            try { details = await apiGet("/api/kmmovies/details", { url: url }); } catch (_) {}
            if (!details || !details.title) {
                try { details = await apiGet("/api/animesalt/details", { url: url }); } catch (_) {}
            }
            if (!details || !details.title) {
                try { details = await apiGet("/api/netmirror/getpost", { id: url }); } catch (_) {}
            }

            if (!details) throw new Error("No details found");

            const multimedia = toMultimediaItem(details);

            // Episodes for series/anime
            if (multimedia.type === "series" || multimedia.type === "anime") {
                const episodes = [];
                const epList = details.episodes || details.seasons || details.streams || [];
                epList.forEach((ep, idx) => {
                    episodes.push(new Episode({
                        name: ep.title || ep.name || `Episode ${idx + 1}`,
                        url: ep.url || ep.id || url,   // will be passed to loadStreams
                        season: ep.season || 1,
                        episode: ep.episode || (idx + 1),
                        description: ep.description || ""
                    }));
                });
                multimedia.episodes = episodes;
            } else {
                // Movie - single episode
                multimedia.episodes = [new Episode({
                    name: "Full Movie",
                    url: url,
                    season: 1,
                    episode: 1
                })];
            }

            cb({ success: true, data: multimedia });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            let streamData;
            // Try magiclinks first (KMMovies)
            try { streamData = await apiGet("/api/kmmovies/magiclinks", { url: url }); } catch (_) {}
            if (!streamData) {
                try { streamData = await apiGet("/api/animesalt/stream", { url: url }); } catch (_) {}
            }
            if (!streamData) {
                try { streamData = await apiGet("/api/netmirror/stream", { id: url }); } catch (_) {}
            }

            const streams = [];

            // Handle different possible response shapes
            if (Array.isArray(streamData)) {
                streamData.forEach(link => {
                    if (link.url) {
                        streams.push(new StreamResult({
                            url: link.url,
                            quality: link.quality || link.resolution || "720p",
                            source: "ScarperApi",
                            headers: { "Referer": "https://screenscape.me" }
                        }));
                    }
                });
            } else if (typeof streamData === 'object') {
                Object.keys(streamData).forEach(key => {
                    const value = streamData[key];
                    if (typeof value === 'string' && value.startsWith('http')) {
                        streams.push(new StreamResult({
                            url: value,
                            quality: key,
                            source: "ScarperApi",
                            headers: { "Referer": "https://screenscape.me" }
                        }));
                    }
                });
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    // Export the four required functions
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
