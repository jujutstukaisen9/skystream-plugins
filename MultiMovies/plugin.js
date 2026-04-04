(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest is injected at runtime

    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    const BASE_HEADERS = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Referer": `${manifest.baseUrl}/`
    };

    // --- Helpers ---
    function fixUrl(url) {
        if (!url) return null;
        if (url.startsWith("http")) return url;
        if (url.startsWith("//")) return "https:" + url;
        return manifest.baseUrl + (url.startsWith("/") ? "" : "/") + url;
    }

    function textOf(el) {
        return (el?.textContent || "").trim();
    }

    function getAttr(el, ...attrs) {
        if (!el) return "";
        for (const attr of attrs) {
            const v = el.getAttribute(attr);
            if (v && v.trim()) return v.trim();
        }
        return "";
    }

    function getImage(el) {
        if (!el) return null;
        return getAttr(el, "data-src", "src") || null;
    }

    function toSearchResult(el) {
        const titleAnchor = el.querySelector("div.data > h3 > a");
        if (!titleAnchor) return null;
        
        const title = textOf(titleAnchor);
        const href = fixUrl(getAttr(titleAnchor, "href"));
        const posterImg = el.querySelector("div.poster > img");
        const posterUrl = fixUrl(getImage(posterImg));
        
        const qualityText = textOf(el.querySelector("div.poster > div.mepo > span"));
        
        let type = "movie";
        if (href && (href.includes("tvshows") || href.includes("series"))) {
            type = "series";
        }

        return new MultimediaItem({
            title: title,
            url: href,
            posterUrl: posterUrl,
            type: type,
            headers: BASE_HEADERS
        });
    }

    // --- Core Functions ---

    async function getHome(cb) {
        try {
            const categories = {
                "Trending": "trending/",
                "Bollywood Movies": "genre/bollywood-movies/",
                "Hollywood Movies": "genre/hollywood/",
                "South Indian Movies": "genre/south-indian/",
                "Punjabi Movies": "genre/punjabi/",
                "Amazon Prime": "genre/amazon-prime/",
                "Disney Hotstar": "genre/disney-hotstar/",
                "Jio OTT": "genre/jio-ott/",
                "Netflix": "genre/netflix/",
                "Sony Live": "genre/sony-liv/",
                "KDrama": "genre/k-drama/",
                "Zee5": "genre/zee-5/",
                "Anime Series": "genre/anime-hindi/",
                "Anime Movies": "genre/anime-movies/",
                "Cartoon Network": "genre/cartoon-network/",
                "Disney Channel": "genre/disney-channel/",
                "Hungama": "genre/hungama/"
            };

            const homeData = {};
            // Fetch first few for the dashboard
            const topCategories = Object.entries(categories).slice(0, 6);
            
            for (const [name, path] of topCategories) {
                const url = `${manifest.baseUrl}/${path}`;
                const res = await http_get(url, { headers: BASE_HEADERS });
                const doc = parseHtml(res.body);
                
                let selector = "div.items > article";
                if (path.includes("/movies") || path.includes("trending")) {
                    selector = "#archive-content > article, div.items > article";
                }
                
                const items = Array.from(doc.querySelectorAll(selector)).map(toSearchResult).filter(i => i);
                if (items.length > 0) homeData[name] = items;
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const url = `${manifest.baseUrl}/?s=${encodeURIComponent(query)}`;
            const res = await http_get(url, { headers: BASE_HEADERS });
            const doc = parseHtml(res.body);
            
            const items = Array.from(doc.querySelectorAll("div.result-item")).map(el => {
                const titleAnchor = el.querySelector("article > div.details > div.title > a");
                if (!titleAnchor) return null;
                
                const title = textOf(titleAnchor);
                const href = fixUrl(getAttr(titleAnchor, "href"));
                const posterImg = el.querySelector("article > div.image > div.thumbnail > a > img");
                const posterUrl = fixUrl(getAttr(posterImg, "src"));
                
                const typeText = textOf(el.querySelector("article > div.image > div.thumbnail > a > span"));
                let type = "movie";
                if (typeText.toLowerCase().includes("tv") || typeText.toLowerCase().includes("show")) {
                    type = "series";
                }

                return new MultimediaItem({
                    title: title,
                    url: href,
                    posterUrl: posterUrl,
                    type: type,
                    headers: BASE_HEADERS
                });
            }).filter(i => i);

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const res = await http_get(url, { headers: BASE_HEADERS });
            const doc = parseHtml(res.body);

            const titleElement = doc.querySelector("div.sheader > div.data > h1");
            if (!titleElement) return cb({ success: false, message: "Details not found" });
            
            const rawTitle = textOf(titleElement);
            const title = rawTitle.replace(/\(\d{4}\).*/, "").trim();
            
            const poster = fixUrl(getAttr(doc.querySelector("div.poster img"), "src"));
            const bgPoster = fixUrl(getAttr(doc.querySelector("div.g-item a"), "href")) || poster;
            const description = textOf(doc.querySelector("#info div.wp-content p"));
            const tags = Array.from(doc.querySelectorAll("div.sgeneros > a")).map(textOf);
            
            const yearText = textOf(doc.querySelector("span.date"));
            const yearMatch = yearText.match(/,?\s*(\d{4})$/);
            const year = yearMatch ? parseInt(yearMatch[1]) : null;

            const rating = textOf(doc.querySelector("span.dt_rating_vgs"));
            const durationText = textOf(doc.querySelector("span.runtime"));
            const duration = parseInt(durationText.replace(" Min.", "").trim()) || undefined;

            const actors = Array.from(doc.querySelectorAll("div.person")).map(el => {
                return new ActorData({
                    actor: new Actor({
                        name: textOf(el.querySelector("div.data > div.name > a")),
                        image: getAttr(el.querySelector("div.img > a > img"), "src")
                    }),
                    role: textOf(el.querySelector("div.data > div.caracter"))
                });
            });

            const recommendations = Array.from(doc.querySelectorAll("#dtw_content_related-2 article")).map(toSearchResult).filter(i => i);

            // Trailer logic
            let trailerUrl = null;
            const trailerOption = doc.querySelector("#player-option-trailer");
            if (trailerOption) {
                const postId = getAttr(trailerOption, "data-post");
                const trailerRes = await http_post(`${manifest.baseUrl}/wp-admin/admin-ajax.php`, {
                    headers: { ...BASE_HEADERS, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
                    body: `action=doo_player_ajax&post=${postId}&nume=trailer&type=movie`
                });
                try {
                    const data = JSON.parse(trailerRes.body);
                    if (data.embed_url) {
                        const match = data.embed_url.match(/src="([^"]+)"/i);
                        trailerUrl = match ? match[1] : data.embed_url;
                    }
                } catch(e) {}
            } else {
                const iframe = doc.querySelector("iframe.rptss");
                if (iframe) trailerUrl = getAttr(iframe, "src");
            }

            const type = url.includes("tvshows") ? "series" : "movie";
            const episodes = [];

            if (type === "series") {
                const seasons = doc.querySelectorAll("#seasons ul.episodios");
                seasons.forEach((seasonEl, sIdx) => {
                    const eps = seasonEl.querySelectorAll("li");
                    eps.forEach((epEl, eIdx) => {
                        const anchor = epEl.querySelector("div.episodiotitle > a");
                        if (anchor) {
                            episodes.push(new Episode({
                                name: textOf(anchor),
                                url: fixUrl(getAttr(anchor, "href")),
                                season: sIdx + 1,
                                episode: eIdx + 1,
                                posterUrl: fixUrl(getImage(epEl.querySelector("div.imagen > img")))
                            }));
                        }
                    });
                });
            } else {
                episodes.push(new Episode({
                    name: title,
                    url: url,
                    season: 1,
                    episode: 1,
                    posterUrl: poster
                }));
            }

            const result = new MultimediaItem({
                title: title,
                url: url,
                posterUrl: poster,
                bannerUrl: bgPoster,
                type: type,
                description: description,
                year: year,
                score: rating ? parseFloat(rating) : undefined,
                duration: duration,
                genres: tags,
                actors: actors,
                recommendations: recommendations,
                trailers: trailerUrl ? [new Trailer({ url: trailerUrl })] : [],
                episodes: episodes,
                headers: BASE_HEADERS
            });

            cb({ success: true, data: result });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const res = await http_get(url, { headers: BASE_HEADERS });
            const doc = parseHtml(res.body);
            const options = Array.from(doc.querySelectorAll("ul#playeroptionsul li")).filter(li => !getAttr(li, "data-nume").includes("trailer"));
            
            const streams = [];
            for (const opt of options) {
                const id = getAttr(opt, "data-post");
                const nume = getAttr(opt, "data-nume");
                const type = getAttr(opt, "data-type");
                const serverName = textOf(opt.querySelector("span.title")) || "Server " + nume;

                const ajaxRes = await http_post(`${manifest.baseUrl}/wp-admin/admin-ajax.php`, {
                    headers: { ...BASE_HEADERS, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
                    body: `action=doo_player_ajax&post=${id}&nume=${nume}&type=${type}`
                });

                try {
                    const data = JSON.parse(ajaxRes.body);
                    if (data.embed_url) {
                        const srcMatch = data.embed_url.match(/src="([^"]+)"/i);
                        let embedLink = srcMatch ? srcMatch[1] : data.embed_url;
                        embedLink = embedLink.replace(/\\/g, "").trim();

                        if (embedLink.includes("youtube")) continue;

                        streams.push(new StreamResult({
                            url: embedLink,
                            source: `MultiMovies - ${serverName}`,
                            headers: { "Referer": manifest.baseUrl + "/" }
                        }));
                    }
                } catch(e) {}
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    // Export to SkyStream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
