(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // manifest is injected at runtime

    const BASE_URL = manifest.baseUrl;
    const AES_KEY = '9111077271044458';
    const AES_IV = '9111077271044458';
    const WS_SECRET = '0f24a275-c93d-4c3e-9e77-4959a4c071d7';
    const P2P_SALT = 'Zox882LYjEn4Rqpa';
    const DEC_SECRET = "87251109"; // Pre-calculated secret from original source

    const deviceId = "2987149b2e2a63b2";
    let token = null;

    // --- Crypto and Request Helpers ---

    async function md5(str) {
        if (typeof md5 === 'function') { return md5(str); }
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('MD5', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function generateSign(curTime) {
        const signString = DEC_SECRET + deviceId + curTime;
        return (await md5(signString)).toUpperCase();
    }

    async function decryptApiResponse(encryptedBase64) {
        try {
            const decrypted = await crypto.decryptAES(encryptedBase64, AES_KEY, AES_IV);
            return JSON.parse(decrypted);
        } catch (e) {
            throw new Error("Could not decrypt API response: " + e.message);
        }
    }

    async function makeApiRequest(url, formBody, headers) {
        const res = await http_post(url, headers, formBody);
        if (res.status!== 200) {
            throw new Error(`API request failed with status ${res.status}`);
        }
        return await decryptApiResponse(res.body || "");
    }

    /**
     * Self-contained function to get the initial token.
     * It does NOT call getHeaders() to prevent a loop.
     */
    async function fetchDeviceToken() {
        const url = `${BASE_URL}/api/public/init`;
        const curTime = Date.now().toString();
        const headers = {
            "androidid": deviceId,
            "app_id": "cinetvin",
            "Content-Type": "application/x-www-form-urlencoded",
            "cur_time": curTime,
            "device_id": deviceId,
            "package_name": "com.cti.cinetvin",
            "sign": await generateSign(curTime),
            "sys_platform": "2",
            "token": "", // Token is empty for the init call
            "User-Agent": "okhttp/4.11.0",
            "version": "30000"
        };

        try {
            const data = await makeApiRequest(url, "is_install=1", headers);
            return data.result?.user_info?.token || null;
        } catch (e) {
            console.error("Failed to fetch device token: " + e.message);
            return null;
        }
    }

    /**
     * Constructs headers for general API calls.
     * Will fetch the token only if it's not already available.
     */
    async function getHeaders(curTime = null) {
        if (!token) {
            token = await fetchDeviceToken();
            if (!token) throw new Error("Could not retrieve session token.");
        }
        const timestamp = curTime || Date.now().toString();
        return {
            "androidid": deviceId,
            "app_id": "cinetvin",
            "Content-Type": "application/x-www-form-urlencoded",
            "cur_time": timestamp,
            "device_id": deviceId,
            "package_name": "com.cti.cinetvin",
            "sign": await generateSign(timestamp),
            "sys_platform": "2",
            "token": token,
            "User-Agent": "okhttp/4.11.0",
            "version": "30000"
        };
    }

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
            const headers = await getHeaders(); // Get headers once

            for (const [title, id] of Object.entries(homeSections)) {
                const url = id === "1"? `${BASE_URL}/api/search/recommend` : `${BASE_URL}/api/topic/vod_list`;
                const formBody = id === "1"? "pn=1" : `topic_id=${id}&pn=1`;
                const data = await makeApiRequest(url, formBody, headers);
                const items = (data.result?.vod_list || data.result || []).map(toMultimediaItem);
                if (items.length > 0) homeData[title] = items;
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
            const curTime = Date.now().toString();
            const p2pToken = (await md5(`${P2P_SALT}${deviceId}${vodId}${curTime}`)).toUpperCase();
            const formBody = `sign=${p2pToken}&vod_id=${vodId}&cur_time=${curTime}&audio_type=0`;
            const data = await makeApiRequest(`${BASE_URL}/api/vod/info_new`, formBody, await getHeaders(curTime));
            const vodInfo = data.result;

            if (!vodInfo) return cb({ success: false, message: "Failed to load details." });

            const episodes = typePid === '1'?
                [new Episode({ name: "Full Movie", url: `${vodId}|1`, season: 1, episode: 1 })] :
                (vodInfo.vod_collection || []).map(ep => new Episode({
                    name: `Episode ${ep.title}`,
                    url: `${vodId}|${ep.collection || 1}`,
                    season: 1,
                    episode: ep.collection,
                }));

            cb({
                success: true,
                data: new MultimediaItem({
                    title: vodInfo.vod_name, url, posterUrl: vodInfo.vod_pic,
                    type: typePid === '1'? 'movie' : 'series',
                    description: vodInfo.vod_blurb, year: parseInt(vodInfo.vod_year) || null,
                    score: vodInfo.vod_douban_score, genres: (vodInfo.vod_tag || "").split('/'),
                    cast: (vodInfo.vod_actor || "").split(',').map(name => new Actor({ name: name.trim() })),
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const [vodId, collection] = url.split('|');
            const curTime = Date.now().toString();
            const p2pToken = (await md5(`${P2P_SALT}${deviceId}${vodId}${curTime}`)).toUpperCase();
            const formBody = `sign=${p2pToken}&vod_id=${vodId}&cur_time=${curTime}&audio_type=0`;
            const data = await makeApiRequest(`${BASE_URL}/api/vod/info_new`, formBody, await getHeaders(curTime));

            const episodeInfo = (data.result?.vod_collection || []).find(e => e.collection == collection);
            if (!episodeInfo || (!episodeInfo.vod_url &&!episodeInfo.down_url)) {
                return cb({ success: false, message: "Stream source not found." });
            }

            let videoUrl = episodeInfo.vod_url || episodeInfo.down_url;
            const path = new URL(videoUrl).pathname;
            const expiryTime = Math.floor(Date.now() / 1000) + (5 * 60 * 60);
            const wsTime = expiryTime.toString(16);
            const signedSecret = await md5(WS_SECRET + path + wsTime);
            const signedUrl = `${videoUrl}?wsSecret=${signedSecret}&wsTime=${wsTime}`;

            cb({
                success: true,
                data: [new StreamResult({ url: signedUrl, quality: "Unknown", headers: { "Referer": BASE_URL } })]
            });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
