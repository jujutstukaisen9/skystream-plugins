(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest is injected at runtime

    // --- Constants from the original source ---
    const BASE_URL = manifest.baseUrl;
    const AES_KEY = '9111077271044458';
    const AES_IV = '9111077271044458';
    const WS_SECRET = '0f24a275-c93d-4c3e-9e77-4959a4c071d7';
    const P2P_SALT = 'Zox882LYjEn4Rqpa';

    const deviceId = "2987149b2e2a63b2";
    let token = null;

    // --- Crypto and Request Helpers ---

    /**
     * A simple MD5 implementation if not provided by the environment.
     * The skystream environment might provide a native `md5()` function.
     */
    async function md5(str) {
        if (typeof md5 === 'function') {
            return md5(str);
        }
        // Basic fallback (requires a proper crypto library for production)
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('MD5', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Generates the API request signature.
     * NOTE: This requires a DES3-decrypted secret. Skystream's environment does not
     * explicitly provide DES3. This is a placeholder that returns a known value.
     * A real implementation would need a native helper or a JS crypto library.
     */
    async function generateSign(curTime) {
        const decryptedSecret = "87251109"; // This is the expected result of DES3-decrypting the secret key.
        const signString = decryptedSecret + deviceId + curTime;
        return (await md5(signString)).toUpperCase();
    }

    /**
     * Decrypts AES-encrypted API responses.
     */
    async function decryptApiResponse(encryptedBase64) {
        try {
            // Skystream's `crypto.decryptAES` is the ideal way to do this.
            // Assuming it handles base64 input and returns a string.
            const decrypted = await crypto.decryptAES(encryptedBase64, AES_KEY, AES_IV);
            return JSON.parse(decrypted);
        } catch (e) {
            console.error("AES Decryption Failed: " + e.message);
            throw new Error("Could not decrypt API response.");
        }
    }

    /**
     * Constructs the headers required for all API calls.
     */
    async function getHeaders(curTime = null) {
        const timestamp = curTime || Date.now().toString();

        if (!token) {
            token = await fetchDeviceToken(timestamp);
        }

        return {
            "androidid": deviceId,
            "app_id": "cinetvin",
            "app_language": "en",
            "channel_code": "cinetvin_3001",
            "Content-Type": "application/x-www-form-urlencoded",
            "cur_time": timestamp,
            "device_id": deviceId,
            "package_name": "com.cti.cinetvin",
            "sign": await generateSign(timestamp),
            "sys_platform": "2",
            "token": token || "",
            "User-Agent": "okhttp/4.11.0",
            "version": "30000"
        };
    }

    /**
     * Performs a standard API request.
     */
    async function makeApiRequest(url, formBody, headers) {
        const res = await http_post(url, headers, formBody);
        if (res.status!== 200) {
            throw new Error(`Request failed with status ${res.status}`);
        }
        const responseText = res.body || "";
        return await decryptApiResponse(responseText);
    }

    /**
     * Fetches the initial session token from the '/init' endpoint.
     */
    async function fetchDeviceToken(timestamp) {
        const url = `${BASE_URL}/api/public/init`;
        const headers = await getHeaders(timestamp);
        const formBody = "is_install=1";

        try {
            const data = await makeApiRequest(url, formBody, headers);
            return data.result?.user_info?.token || "";
        } catch (e) {
            console.error("Failed to fetch device token: " + e.message);
            return "";
        }
    }

    /**
     * Maps a `vod` object from the API to a Skystream `MultimediaItem`.
     */
    function toMultimediaItem(vod) {
        return new MultimediaItem({
            title: vod.vod_name,
            url: `${vod.id},${vod.type_pid}`,
            posterUrl: vod.vod_pic,
            type: vod.type_pid === 1? 'movie' : 'series',
            year: parseInt(vod.vod_year) || null
        });
    }

    // --- Core Plugin Functions ---

    async function getHome(cb) {
        try {
            const homeSections = {
                "Trending Now": "4008",
                "Most Popular": "4464",
                "Recommended": "1",
                "Top Series This Week": "4004"
            };

            const homeData = {};

            for (const [title, id] of Object.entries(homeSections)) {
                const url = id === "1"? `${BASE_URL}/api/search/recommend` : `${BASE_URL}/api/topic/vod_list`;
                const formBody = id === "1"? "pn=1" : `topic_id=${id}&pn=1`;
                const data = await makeApiRequest(url, formBody, await getHeaders());
                const items = (data.result?.vod_list || data.result || []).map(toMultimediaItem);
                if (items.length > 0) {
                    homeData[title] = items;
                }
            }
            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const url = `${BASE_URL}/api/search/result`;
            const formBody = `kw=${encodeURIComponent(query)}&pn=1`;
            const data = await makeApiRequest(url, formBody, await getHeaders());
            const items = (data.result || []).map(toMultimediaItem);
            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            const [vodId, typePid] = url.split(',');
            const apiUrl = `${BASE_URL}/api/vod/info_new`;
            const curTime = Date.now().toString();
            const p2pToken = (await md5(`${P2P_SALT}${deviceId}${vodId}${curTime}`)).toUpperCase();
            const formBody = `sign=${p2pToken}&vod_id=${vodId}&cur_time=${curTime}&audio_type=0`;

            const data = await makeApiRequest(apiUrl, formBody, await getHeaders(curTime));
            const vodInfo = data.result;

            if (!vodInfo) {
                return cb({ success: false, message: "Failed to load details." });
            }

            let episodes = [];
            if (typePid === '1') { // Movie
                 episodes.push(new Episode({ name: "Full Movie", url: `${vodId}|1`, season: 1, episode: 1 }));
            } else { // Series
                episodes = (vodInfo.vod_collection || []).map(ep => new Episode({
                    name: `Episode ${ep.title}`,
                    url: `${vodId}|${ep.collection || 1}`,
                    season: 1, // The API does not provide season info, assuming 1
                    episode: ep.collection,
                }));
            }

            const result = new MultimediaItem({
                title: vodInfo.vod_name,
                url: url,
                posterUrl: vodInfo.vod_pic,
                type: typePid === '1'? 'movie' : 'series',
                description: vodInfo.vod_blurb,
                year: parseInt(vodInfo.vod_year) || null,
                score: vodInfo.vod_douban_score,
                genres: (vodInfo.vod_tag || "").split('/'),
                cast: (vodInfo.vod_actor || "").split(',').map(name => new Actor({ name: name.trim() })),
                episodes: episodes,
            });

            cb({ success: true, data: result });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const [vodId, collection] = url.split('|');
            const apiUrl = `${BASE_URL}/api/vod/info_new`;
            const curTime = Date.now().toString();
            const p2pToken = (await md5(`${P2P_SALT}${deviceId}${vodId}${curTime}`)).toUpperCase();
            const formBody = `sign=${p2pToken}&vod_id=${vodId}&cur_time=${curTime}&audio_type=0`;

            const data = await makeApiRequest(apiUrl, formBody, await getHeaders(curTime));
            const vodInfo = data.result;

            const episodeInfo = (vodInfo.vod_collection || []).find(e => e.collection == collection);
            if (!episodeInfo || (!episodeInfo.vod_url &&!episodeInfo.down_url)) {
                return cb({ success: false, message: "Stream source not found." });
            }

            let videoUrl = episodeInfo.vod_url || episodeInfo.down_url;
            const path = new URL(videoUrl).pathname;
            const expiryTime = Math.floor(Date.now() / 1000) + (5 * 60 * 60);
            const wsTime = expiryTime.toString(16);
            const rawSecret = WS_SECRET + path + wsTime;
            const signedSecret = await md5(rawSecret);

            const signedUrl = `${videoUrl}?wsSecret=${signedSecret}&wsTime=${wsTime}`;

            const streams = [new StreamResult({
                url: signedUrl,
                quality: "Unknown",
                headers: { "Referer": BASE_URL }
            })];

            cb({ success: true, data: streams });

        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    // Export functions to the global scope for Skystream
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;

})();
