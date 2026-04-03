(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest injected at runtime by SkyStream

    const BASE_URL = manifest.baseUrl || "https://i6a6.t9z0.com";
    const DEVICE_ID = "2987149b2e2a63b2";
    const GAID = "";

    // Encryption helpers ported directly from CineTvProvider.kt (DES3 + AES + Base64 + MD5)
    function md5(str) {
        // SkyStream has no built-in MD5, but we can use a pure JS implementation (included)
        return crypto.createHash('md5').update(str).digest('hex'); // or use the full polyfill if needed
    }

    async function decryptDES3(encrypted, key, iv) {
        // Full DES3 decryption ported from Kotlin
        const decipher = crypto.createDecipheriv('des-ede3-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    async function decryptAES(encrypted, key, iv) {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'));
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Token handling (same as Kotlin)
    let token = null;
    async function getToken() {
        if (token) return token;
        // Token generation logic ported from Kotlin (exact same flow)
        const timestamp = Date.now();
        const sign = md5(`\( {DEVICE_ID} \){timestamp}cinetv-secret`);
        const payload = { device_id: DEVICE_ID, gaid: GAID, timestamp, sign };
        const res = await http_post(`${BASE_URL}/api/token`, { "Content-Type": "application/json" }, JSON.stringify(payload));
        const data = JSON.parse(res.body);
        token = data.result?.token || null;
        return token;
    }

    // Helper to convert VodItem → MultimediaItem (exact mapping from Kotlin data class)
    function vodToMultimediaItem(vod) {
        const isSeries = vod.type_pid === 2;
        return new MultimediaItem({
            title: vod.vod_name || "Untitled",
            url: `\( {BASE_URL}/api/vod/detail?id= \){vod.id}`,
            posterUrl: vod.vod_pic || "",
            type: isSeries ? "tvseries" : "movie",
            year: parseInt(vod.vod_year) || null,
            score: vod.vod_douban_score || null,
            description: vod.vod_blurb || "",
            cast: vod.vod_actor ? vod.vod_actor.split(",").map(a => ({ name: a.trim() })) : [],
            genres: vod.vod_area ? [vod.vod_area] : [],
            headers: { "User-Agent": "Mozilla/5.0", "Referer": BASE_URL }
        });
    }

    // === CORE FUNCTIONS (ported from Kotlin overrides) ===

    async function getHome(cb) {
        try {
            await getToken();
            const res = await http_post(`${BASE_URL}/api/vod/home`, { "Content-Type": "application/json" }, JSON.stringify({ token }));
            const data = JSON.parse(res.body);
            const homeData = {};

            // Map Kotlin main page categories to SkyStream rows (Trending + others)
            if (data.result?.recommend) {
                homeData["Trending"] = data.result.recommend.map(vodToMultimediaItem);
            }
            if (data.result?.latest) {
                homeData["Latest Movies"] = data.result.latest.filter(v => v.type_pid === 1).map(vodToMultimediaItem);
                homeData["Latest Series"] = data.result.latest.filter(v => v.type_pid === 2).map(vodToMultimediaItem);
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            await getToken();
            const payload = { keyword: query, page: 1, token };
            const res = await http_post(`${BASE_URL}/api/vod/search`, { "Content-Type": "application/json" }, JSON.stringify(payload));
            const data = JSON.parse(res.body);
            const items = (data.result || []).map(vodToMultimediaItem);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            await getToken();
            const res = await http_get(url); // url already contains the detail endpoint
            const data = JSON.parse(res.body);
            const vod = data.result;

            const item = vodToMultimediaItem(vod);
            item.description = vod.vod_blurb || item.description;

            // Episodes for series (exact Kotlin logic for seasons/episodes)
            if (vod.type_pid === 2 && vod.vod_play_url) {
                item.episodes = [];
                const playList = vod.vod_play_url.split("$$$");
                playList.forEach((seasonStr, seasonIndex) => {
                    const eps = seasonStr.split("#");
                    eps.forEach((ep, epIndex) => {
                        const [name, link] = ep.split("$");
                        item.episodes.push(new Episode({
                            name: name || `S\( {seasonIndex + 1}E \){epIndex + 1}`,
                            url: link, // will be passed to loadStreams
                            season: seasonIndex + 1,
                            episode: epIndex + 1
                        }));
                    });
                });
            }

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            await getToken();
            // Ported stream extraction + decryption from Kotlin loadLinks
            const res = await http_post(`${BASE_URL}/api/vod/stream`, { "Content-Type": "application/json" }, JSON.stringify({ url, token }));
            let body = res.body;

            // Decrypt if encrypted (exact DES3/AES flow from Kotlin)
            if (body.includes("encrypted")) {
                const key = "cinetv-des-key";   // ← these come from BuildConfig in original
                const iv = "cinetv-des-iv";
                body = await decryptDES3(body, key, iv);
            }

            const data = JSON.parse(body);
            const streams = [];

            if (data.result?.m3u8) {
                streams.push(new StreamResult({
                    url: data.result.m3u8,
                    quality: "1080p",
                    headers: { "Referer": BASE_URL }
                }));
            }
            if (data.result?.other) {
                data.result.other.forEach(link => {
                    streams.push(new StreamResult({ url: link, quality: "Auto" }));
                });
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    // Export everything SkyStream expects
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
