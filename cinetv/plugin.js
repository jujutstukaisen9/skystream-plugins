(function() {

  // ============================================================================
  // CINETV PROVIDER FOR SKYSTREAM
  // Ported from Kotlin Cloudstream extension by NivinCNC
  // ============================================================================

  // Configuration Constants
  const API_BASE = manifest.baseUrl;
  const DEVICE_ID = "2987149b2e2a63b2";
  const GAID = "";
  
  // Encryption Keys (from BuildConfig)
  const SECRET_KEY_ENCRYPTED = "U2FsdGVkX19BQgs3TTbiTUhsOCtySkZjR0NWMjIyMDIw";
  const DES_KEY = "Zox882LYjEn4Rqpa1a2b3c4d";
  const DES_IV = "12345678";
  const AES_KEY = "Zox882LYjEn4Rqpa";
  const AES_IV = "1234567890123456";
  const WS_SECRET = "MjAyMzA5MDhBQkNERUZHSA==";
  
  let deviceToken = null;

  // ============================================================================
  // CRYPTO UTILITIES
  // ============================================================================

  /**
   * MD5 Hash Function
   */
  function md5(string) {
    function rotateLeft(value, shift) {
      return (value << shift) | (value >>> (32 - shift));
    }
    function addUnsigned(x, y) {
      const lsw = (x & 0xFFFF) + (y & 0xFFFF);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    }
    function md5F(x, y, z) { return (x & y) | ((~x) & z); }
    function md5G(x, y, z) { return (x & z) | (y & (~z)); }
    function md5H(x, y, z) { return x ^ y ^ z; }
    function md5I(x, y, z) { return y ^ (x | (~z)); }
    function md5FF(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function md5GG(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function md5HH(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function md5II(a, b, c, d, x, s, ac) {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    function convertToWordArray(string) {
      let lWordCount;
      const lMessageLength = string.length;
      const lNumberOfWords_temp1 = lMessageLength + 8;
      const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64;
      const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16;
      const lWordArray = new Array(lNumberOfWords - 1);
      let lBytePosition = 0;
      let lByteCount = 0;
      while (lByteCount < lMessageLength) {
        lWordCount = (lByteCount - (lByteCount % 4)) / 4;
        lBytePosition = (lByteCount % 4) * 8;
        lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount) << lBytePosition));
        lByteCount++;
      }
      lWordCount = (lByteCount - (lByteCount % 4)) / 4;
      lBytePosition = (lByteCount % 4) * 8;
      lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition);
      lWordArray[lNumberOfWords - 2] = lMessageLength << 3;
      lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29;
      return lWordArray;
    }
    function wordToHex(value) {
      let wordToHexValue = "", wordToHexValue_temp = "", byte, count;
      for (count = 0; count <= 3; count++) {
        byte = (value >>> (count * 8)) & 255;
        wordToHexValue_temp = "0" + byte.toString(16);
        wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2);
      }
      return wordToHexValue;
    }
    
    const x = convertToWordArray(string);
    let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    
    for (let k = 0; k < x.length; k += 16) {
      const AA = a, BB = b, CC = c, DD = d;
      a = md5FF(a, b, c, d, x[k + 0], 7, 0xD76AA478);
      d = md5FF(d, a, b, c, x[k + 1], 12, 0xE8C7B756);
      c = md5FF(c, d, a, b, x[k + 2], 17, 0x242070DB);
      b = md5FF(b, c, d, a, x[k + 3], 22, 0xC1BDCEEE);
      a = md5FF(a, b, c, d, x[k + 4], 7, 0xF57C0FAF);
      d = md5FF(d, a, b, c, x[k + 5], 12, 0x4787C62A);
      c = md5FF(c, d, a, b, x[k + 6], 17, 0xA8304613);
      b = md5FF(b, c, d, a, x[k + 7], 22, 0xFD469501);
      a = md5FF(a, b, c, d, x[k + 8], 7, 0x698098D8);
      d = md5FF(d, a, b, c, x[k + 9], 12, 0x8B44F7AF);
      c = md5FF(c, d, a, b, x[k + 10], 17, 0xFFFF5BB1);
      b = md5FF(b, c, d, a, x[k + 11], 22, 0x895CD7BE);
      a = md5FF(a, b, c, d, x[k + 12], 7, 0x6B901122);
      d = md5FF(d, a, b, c, x[k + 13], 12, 0xFD987193);
      c = md5FF(c, d, a, b, x[k + 14], 17, 0xA679438E);
      b = md5FF(b, c, d, a, x[k + 15], 22, 0x49B40821);
      a = md5GG(a, b, c, d, x[k + 1], 5, 0xF61E2562);
      d = md5GG(d, a, b, c, x[k + 6], 9, 0xC040B340);
      c = md5GG(c, d, a, b, x[k + 11], 14, 0x265E5A51);
      b = md5GG(b, c, d, a, x[k + 0], 20, 0xE9B6C7AA);
      a = md5GG(a, b, c, d, x[k + 5], 5, 0xD62F105D);
      d = md5GG(d, a, b, c, x[k + 10], 9, 0x2441453);
      c = md5GG(c, d, a, b, x[k + 15], 14, 0xD8A1E681);
      b = md5GG(b, c, d, a, x[k + 4], 20, 0xE7D3FBC8);
      a = md5GG(a, b, c, d, x[k + 9], 5, 0x21E1CDE6);
      d = md5GG(d, a, b, c, x[k + 14], 9, 0xC33707D6);
      c = md5GG(c, d, a, b, x[k + 3], 14, 0xF4D50D87);
      b = md5GG(b, c, d, a, x[k + 8], 20, 0x455A14ED);
      a = md5GG(a, b, c, d, x[k + 13], 5, 0xA9E3E905);
      d = md5GG(d, a, b, c, x[k + 2], 9, 0xFCEFA3F8);
      c = md5GG(c, d, a, b, x[k + 7], 14, 0x676F02D9);
      b = md5GG(b, c, d, a, x[k + 12], 20, 0x8D2A4C8A);
      a = md5HH(a, b, c, d, x[k + 5], 4, 0xFFFA3942);
      d = md5HH(d, a, b, c, x[k + 8], 11, 0x8771F681);
      c = md5HH(c, d, a, b, x[k + 11], 16, 0x6D9D6122);
      b = md5HH(b, c, d, a, x[k + 14], 23, 0xFDE5380C);
      a = md5HH(a, b, c, d, x[k + 1], 4, 0xA4BEEA44);
      d = md5HH(d, a, b, c, x[k + 4], 11, 0x4BDECFA9);
      c = md5HH(c, d, a, b, x[k + 7], 16, 0xF6BB4B60);
      b = md5HH(b, c, d, a, x[k + 10], 23, 0xBEBFBC70);
      a = md5HH(a, b, c, d, x[k + 13], 4, 0x289B7EC6);
      d = md5HH(d, a, b, c, x[k + 0], 11, 0xEAA127FA);
      c = md5HH(c, d, a, b, x[k + 3], 16, 0xD4EF3085);
      b = md5HH(b, c, d, a, x[k + 6], 23, 0x4881D05);
      a = md5HH(a, b, c, d, x[k + 9], 4, 0xD9D4D039);
      d = md5HH(d, a, b, c, x[k + 12], 11, 0xE6DB99E5);
      c = md5HH(c, d, a, b, x[k + 15], 16, 0x1FA27CF8);
      b = md5HH(b, c, d, a, x[k + 2], 23, 0xC4AC5665);
      a = md5II(a, b, c, d, x[k + 0], 6, 0xF4292244);
      d = md5II(d, a, b, c, x[k + 7], 10, 0x432AFF97);
      c = md5II(c, d, a, b, x[k + 14], 15, 0xAB9423A7);
      b = md5II(b, c, d, a, x[k + 5], 21, 0xFC93A039);
      a = md5II(a, b, c, d, x[k + 12], 6, 0x655B59C3);
      d = md5II(d, a, b, c, x[k + 3], 10, 0x8F0CCC92);
      c = md5II(c, d, a, b, x[k + 10], 15, 0xFFEFF47D);
      b = md5II(b, c, d, a, x[k + 1], 21, 0x85845DD1);
      a = md5II(a, b, c, d, x[k + 8], 6, 0x6FA87E4F);
      d = md5II(d, a, b, c, x[k + 15], 10, 0xFE2CE6E0);
      c = md5II(c, d, a, b, x[k + 6], 15, 0xA3014314);
      b = md5II(b, c, d, a, x[k + 13], 21, 0x4E0811A1);
      a = md5II(a, b, c, d, x[k + 4], 6, 0xF7537E82);
      d = md5II(d, a, b, c, x[k + 11], 10, 0xBD3AF235);
      c = md5II(c, d, a, b, x[k + 2], 15, 0x2AD7D2BB);
      b = md5II(b, c, d, a, x[k + 9], 21, 0xEB86D391);
      a = addUnsigned(a, AA);
      b = addUnsigned(b, BB);
      c = addUnsigned(c, CC);
      d = addUnsigned(d, DD);
    }
    
    return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
  }

  /**
   * Generate signature for API requests
   */
  function generateSign(curTime) {
    const decryptedSecret = "YourDecryptedSecretHere"; 
    const signString = decryptedSecret + DEVICE_ID + curTime;
    return md5(signString).toUpperCase();
  }

  /**
   * Generate P2P token for video requests
   */
  function generateP2pToken(vodId, timestamp) {
    const salt = "Zox882LYjEn4Rqpa";
    const concatenated = salt + DEVICE_ID + vodId + timestamp;
    return md5(concatenated).toUpperCase();
  }

  /**
   * Sign video URL with wsSecret and wsTime
   */
  function signVideoUrl(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      const expirySeconds = 5 * 60 * 60;
      const wsTime = Math.floor(Date.now() / 1000 + expirySeconds).toString(16);
      
      const wsSecretDecoded = atob(WS_SECRET);
      
      const raw = wsSecretDecoded + path + wsTime;
      const wsSecret = md5(raw);
      
      return `${url}?wsSecret=${wsSecret}&wsTime=${wsTime}`;
    } catch (e) {
      console.error("URL signing error:", e);
      return url;
    }
  }

  /**
   * Simple AES decryption placeholder
   */
  function aesDecrypt(encryptedBase64) {
    try {
      const decoded = atob(encryptedBase64);
      
      if (decoded.charCodeAt(0) === 0x1f && decoded.charCodeAt(1) === 0x8b) {
        return decoded;
      }
      
      return decoded;
    } catch (e) {
      console.error("AES decryption error:", e);
      return encryptedBase64;
    }
  }

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  /**
   * Build headers for API requests
   */
  function buildHeaders(curTime) {
    const timestamp = curTime || Date.now().toString();
    
    return {
      "Accept-Encoding": "identity",
      "androidid": DEVICE_ID,
      "app_id": "cinetvin",
      "app_language": "en",
      "channel_code": "cinetvin_3001",
      "Connection": "Keep-Alive",
      "Content-Type": "application/x-www-form-urlencoded",
      "cur_time": timestamp,
      "device_id": DEVICE_ID,
      "en_al": "0",
      "gaid": GAID,
      "Host": "i6a6.t9z0.com",
      "is_display": "GMT+05:30",
      "is_language": "en",
      "is_vvv": "0",
      "log-header": "I am the log request header.",
      "mob_mfr": "google",
      "mobmodel": "Pixel 5",
      "package_name": "com.cti.cinetvin",
      "sign": generateSign(timestamp),
      "sys_platform": "2",
      "sysrelease": "13",
      "token": deviceToken || "",
      "User-Agent": "okhttp/4.11.0",
      "version": "30000"
    };
  }

  /**
   * Fetch device token
   */
  async function fetchDeviceToken() {
    if (deviceToken) return deviceToken;
    
    try {
      const curTime = Date.now().toString();
      const headers = buildHeaders(curTime);
      
      const formData = `invited_by=&is_install=1`;
      
      const res = await http_post(`${API_BASE}/api/public/init`, headers, formData);
      
      if (res.status === 200) {
        let jsonText = res.body.trim();
        
        if (jsonText && !jsonText.startsWith('{')) {
          jsonText = aesDecrypt(jsonText);
        }
        
        const data = JSON.parse(jsonText);
        deviceToken = data.result?.user_info?.token || "";
        return deviceToken;
      }
    } catch (e) {
      console.error("Token fetch error:", e);
    }
    
    return "";
  }

  /**
   * Search Recommend API
   */
  async function searchRecommend(pageNumber = 1) {
    try {
      await fetchDeviceToken();
      
      const curTime = Date.now().toString();
      const headers = buildHeaders(curTime);
      const formData = `pn=${pageNumber}`;
      
      const res = await http_post(`${API_BASE}/api/search/recommend`, headers, formData);
      
      if (res.status === 200) {
        let jsonText = aesDecrypt(res.body);
        const data = JSON.parse(jsonText);
        return data;
      }
    } catch (e) {
      console.error("Search recommend error:", e);
    }
    
    return null;
  }

  /**
   * Topic VOD List API
   */
  async function topicVodList(topicId, pageNumber = 1) {
    try {
      await fetchDeviceToken();
      
      const curTime = Date.now().toString();
      const headers = buildHeaders(curTime);
      const formData = `topic_id=${topicId}&pn=${pageNumber}`;
      
      const res = await http_post(`${API_BASE}/api/topic/vod_list`, headers, formData);
      
      if (res.status === 200) {
        let jsonText = aesDecrypt(res.body);
        const data = JSON.parse(jsonText);
        return data.result?.vod_list || [];
      }
    } catch (e) {
      console.error("Topic VOD error:", e);
    }
    
    return [];
  }

  /**
   * Search VOD API
   */
  async function searchVod(keyword, pageNumber = 1) {
    try {
      await fetchDeviceToken();
      
      const curTime = Date.now().toString();
      const headers = buildHeaders(curTime);
      const formData = `kw=${encodeURIComponent(keyword)}&pn=${pageNumber}`;
      
      const res = await http_post(`${API_BASE}/api/search/result`, headers, formData);
      
      if (res.status === 200) {
        let jsonText = aesDecrypt(res.body);
        const data = JSON.parse(jsonText);
        return data;
      }
    } catch (e) {
      console.error("Search VOD error:", e);
    }
    
    return null;
  }

  /**
   * Get VOD Info API
   */
  async function getVodInfo(vodId, audioType = 0) {
    try {
      await fetchDeviceToken();
      
      const curTime = Date.now().toString();
      const headers = buildHeaders(curTime);
      const p2pToken = generateP2pToken(vodId, curTime);
      
      const formData = `sign=${p2pToken}&vod_id=${vodId}&cur_time=${curTime}&audio_type=${audioType}`;
      
      const res = await http_post(`${API_BASE}/api/vod/info_new`, headers, formData);
      
      if (res.status === 200) {
        let jsonText = aesDecrypt(res.body);
        const data = JSON.parse(jsonText);
        return data;
      }
    } catch (e) {
      console.error("VOD info error:", e);
    }
    
    return null;
  }

  /**
   * Convert VOD item to MultimediaItem
   */
  function vodToMultimediaItem(vod, tvType) {
    const type = tvType || (vod.type_pid === 1 ? "movie" : "series");
    
    return new MultimediaItem({
      title: vod.vod_name || "Unknown",
      url: `${vod.id},${vod.type_pid}`,
      posterUrl: vod.vod_pic || "",
      type: type,
      year: vod.vod_year ? parseInt(vod.vod_year) : undefined,
      description: vod.vod_blurb || "",
      score: vod.vod_douban_score ? vod.vod_douban_score / 2 : undefined,
      tags: vod.vod_area ? [vod.vod_area] : undefined
    });
  }

  // ============================================================================
  // SKYSTREAM CORE FUNCTIONS
  // ============================================================================

  /**
   * getHome: Returns categories for the dashboard
   */
  async function getHome(cb) {
    try {
      const homeData = {};
      
      const categories = [
        { id: "recommend", name: "Recommended" },
        { id: 4008, name: "Trending Now" },
        { id: 4464, name: "Most Popular" },
        { id: 4009, name: "International Films" },
        { id: 4134, name: "This Month Picks" },
        { id: 4004, name: "Top Series" }
      ];
      
      for (const category of categories) {
        let vodItems = [];
        
        if (category.id === "recommend") {
          const data = await searchRecommend(1);
          vodItems = data?.result || [];
        } else {
          vodItems = await topicVodList(category.id, 1);
        }
        
        const items = vodItems.map(vod => vodToMultimediaItem(vod));
        
        if (items.length > 0) {
          homeData[category.name] = items;
        }
      }
      
      cb({ success: true, data: homeData });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  /**
   * search: Handles user queries
   */
  async function search(query, cb) {
    try {
      if (!query || query.trim() === "") {
        return cb({ success: true, data: [] });
      }
      
      const searchData = await searchVod(query, 1);
      const vodItems = searchData?.result || [];
      
      const items = vodItems.map(vod => vodToMultimediaItem(vod));
      
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
    }
  }

  /**
   * load: Fetches full details for a specific item
   */
  async function load(url, cb) {
    try {
      const parts = url.split(",");
      if (parts.length !== 2) {
        return cb({ success: false, errorCode: "INVALID_URL" });
      }
      
      const vodId = parts[0];
      const typePid = parseInt(parts[1]);
      
      const vodInfoResponse = await getVodInfo(vodId);
      
      if (!vodInfoResponse || !vodInfoResponse.result) {
        return cb({ success: false, errorCode: "NOT_FOUND" });
      }
      
      const vodInfo = vodInfoResponse.result;
      const name = vodInfo.vod_name || "Unknown";
      const posterUrl = vodInfo.vod_pic || "";
      const year = vodInfo.vod_year ? parseInt(vodInfo.vod_year) : undefined;
      const plot = vodInfo.vod_blurb || "";
      const score = vodInfo.vod_douban_score ? vodInfo.vod_douban_score / 2 : undefined;
      const tags = vodInfo.vod_tag ? vodInfo.vod_tag.split("/").map(t => t.trim()) : [];
      
      const actors = vodInfo.vod_actor 
        ? vodInfo.vod_actor.split(",").map(actorName => new Actor({ name: actorName.trim() }))
        : [];
      
      if (typePid === 1) {
        const movieData = vodInfo.vod_collection && vodInfo.vod_collection.length > 0
          ? `${vodId}|${vodInfo.vod_collection[0].collection || 1}`
          : `${vodId}|1`;
        
        const result = new MultimediaItem({
          title: name,
          url: url,
          posterUrl: posterUrl,
          type: "movie",
          year: year,
          description: plot,
          score: score,
          tags: tags,
          cast: actors,
          episodes: [
            new Episode({
              name: "Full Movie",
              url: movieData,
              season: 1,
              episode: 1,
              posterUrl: posterUrl
            })
          ]
        });
        
        cb({ success: true, data: result });
      } else {
        const episodes = (vodInfo.vod_collection || []).map((collection, index) => {
          return new Episode({
            name: collection.title || `Episode ${collection.collection || (index + 1)}`,
            url: `${vodId}|${collection.collection || (index + 1)}`,
            season: 1,
            episode: collection.collection || (index + 1),
            posterUrl: posterUrl,
            runtime: collection.vod_duration ? Math.floor(collection.vod_duration / 60) : undefined
          });
        });
        
        const result = new MultimediaItem({
          title: name,
          url: url,
          posterUrl: posterUrl,
          type: "series",
          year: year,
          description: plot,
          score: score,
          tags: tags,
          cast: actors,
          episodes: episodes
        });
        
        cb({ success: true, data: result });
      }
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }

  /**
   * loadStreams: Provides playable video links
   */
  async function loadStreams(url, cb) {
    try {
      const parts = url.split("|");
      if (parts.length !== 2) {
        return cb({ success: false, errorCode: "INVALID_URL" });
      }
      
      const vodId = parts[0];
      const collection = parseInt(parts[1]);
      
      const vodInfoResponse = await getVodInfo(vodId);
      
      if (!vodInfoResponse || !vodInfoResponse.result) {
        return cb({ success: false, errorCode: "NOT_FOUND" });
      }
      
      const vodInfo = vodInfoResponse.result;
      
      const episode = (vodInfo.vod_collection || []).find(ep => ep.collection === collection);
      
      if (!episode) {
        return cb({ success: false, errorCode: "EPISODE_NOT_FOUND" });
      }
      
      const videoUrl = episode.vod_url || episode.down_url;
      
      if (!videoUrl) {
        return cb({ success: false, errorCode: "NO_VIDEO_URL" });
      }
      
      const signedUrl = signVideoUrl(videoUrl);
      
      const streams = [
        new StreamResult({
          url: signedUrl,
          source: "CineTv Direct",
          quality: "HD",
          headers: {
            "Referer": API_BASE,
            "User-Agent": "okhttp/4.11.0"
          }
        })
      ];
      
      cb({ success: true, data: streams });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
    }
  }

  // ============================================================================
  // EXPORT FUNCTIONS
  // ============================================================================

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;

})();
