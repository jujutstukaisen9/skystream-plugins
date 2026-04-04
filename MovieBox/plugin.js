(function() {
  /**
   * @type {import('@skystream/sdk').Manifest}
   */
  // manifest is injected at runtime by SkyStream

  // ─────────────────────────────────────────────────────
  // CONFIGURATION
  // ─────────────────────────────────────────────────────
  const UA = "com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)";
  
  const BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Connection": "keep-alive"
  };

  // Secret keys (base64 decoded from Kotlin source)
  const SECRET_KEY_DEFAULT = atob("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==");
  const SECRET_KEY_ALT = atob("WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==");

  // Device ID (randomized per session)
  const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const brandModels = {
    "Samsung": ["SM-S918B", "SM-A528B"],
    "Xiaomi": ["2201117TI", "M2012K11AI"],
    "OnePlus": ["LE2111", "CPH2449"]
  };

  function randomBrandModel() {
    const brands = Object.keys(brandModels);
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const model = brandModels[brand][Math.floor(Math.random() * brandModels[brand].length)];
    return { brand, model };
  }

  // ─────────────────────────────────────────────────────
  // 🔐 PURE-JS MD5 + HMAC-MD5 (No external deps)
  // ─────────────────────────────────────────────────────
  
  // MD5 implementation (compact, ~1.2KB minified)
  function md5(input) {
    function rotateLeft(x, n) { return (x << n) | (x >>> (32 - n)); }
    function addUnsigned(x, y) { return (x + y) >>> 0; }
    
    const k = [
      0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,      0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
      0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
      0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
      0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
      0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
      0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
      0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
      0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
      0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
      0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
      0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
      0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
      0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
      0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
      0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
    ];
    
    let msg = new TextEncoder().encode(input);
    const ml = msg.length * 8;
    msg = new Uint8Array([...msg, 0x80, ...new Uint8Array((55 - ((msg.length + 1) % 64)) % 64)]);
    
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, ml & 0xFFFFFFFF, true);
    view.setUint32(4, Math.floor(ml / 0x100000000), true);
    msg = new Uint8Array([...msg, ...new Uint8Array(buffer)]);
    
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
    
    for (let i = 0; i < msg.length; i += 64) {
      const M = [];
      for (let j = 0; j < 16; j++) M[j] = msg[i + j*4] | (msg[i + j*4 + 1] << 8) | (msg[i + j*4 + 2] << 16) | (msg[i + j*4 + 3] << 24);
      
      let [A, B, C, D] = [a, b, c, d];
      
      for (let j = 0; j < 64; j++) {
        let [F, g] = [0, 0];
        if (j < 16) { F = (B & C) | (~B & D); g = j; }
        else if (j < 32) { F = (D & B) | (~D & C); g = (5*j + 1) % 16; }
        else if (j < 48) { F = B ^ C ^ D; g = (3*j + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7*j) % 16; }
        
        const temp = addUnsigned(addUnsigned(addUnsigned(addUnsigned(A, F), k[j]), M[g]), rotateLeft(addUnsigned(B, F), [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21][Math.floor(j/16)*4 + j%4]));
        [A, B, C, D] = [D, temp, B, C];
      }
      
      a = addUnsigned(a, A); b = addUnsigned(b, B); c = addUnsigned(c, C); d = addUnsigned(d, D);
    }
    
    return [a, b, c, d].map(x => x.toString(16).padStart(8, '0')).join('');  }

  // HMAC-MD5 implementation
  function hmacMD5(key, message) {
    const blocksize = 64;
    let k = new TextEncoder().encode(key);
    
    if (k.length > blocksize) {
      k = new Uint8Array(md5(key).match(/.{2}/g).map(b => parseInt(b, 16)));
    }
    
    const oKeyPad = new Uint8Array(blocksize);
    const iKeyPad = new Uint8Array(blocksize);
    
    for (let i = 0; i < blocksize; i++) {
      oKeyPad[i] = 0x5c ^ (k[i] || 0);
      iKeyPad[i] = 0x36 ^ (k[i] || 0);
    }
    
    return md5(new TextDecoder().decode(oKeyPad) + md5(new TextDecoder().decode(iKeyPad) + message));
  }

  // ─────────────────────────────────────────────────────
  // SIGNATURE GENERATION (ported from Kotlin)
  // ─────────────────────────────────────────────────────
  
  function reverseString(str) {
    return str.split('').reverse().join('');
  }

  function generateXClientToken(timestamp) {
    const ts = timestamp.toString();
    const reversed = reverseString(ts);
    const hash = md5(reversed);
    return `${ts},${hash}`;
  }

  function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
    const parsed = new URL(url, manifest.baseUrl);
    const path = parsed.pathname || "";
    
    // Sort query parameters alphabetically
    const params = new URLSearchParams(parsed.search);
    const sortedQuery = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    const canonicalUrl = sortedQuery ? `${path}?${sortedQuery}` : path;
        // Body hash (first 100KB only, per Kotlin impl)
    const bodyBytes = body ? new TextEncoder().encode(body) : null;
    const bodyHash = bodyBytes 
      ? md5(new TextDecoder().decode(bodyBytes.slice(0, 102400)))
      : "";
    
    const bodyLength = bodyBytes?.length?.toString() || "";
    
    return `${method.toUpperCase()}\n${accept || ""}\n${contentType || ""}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
  }

  function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, timestamp = null) {
    const ts = timestamp || Date.now();
    const canonical = buildCanonicalString(method, accept, contentType, url, body, ts);
    const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
    
    const signature = hmacMD5(secret, canonical);
    const signatureB64 = btoa(signature);
    return `${ts}|2|${signatureB64}`;
  }

  function getClientInfoHeaders(brand, model, extra = {}) {
    return JSON.stringify({
      package_name: "com.community.mbox.in",
      version_name: "3.0.03.0529.03",
      version_code: 50020042,
      os: "android",
      os_version: "16",
      device_id: deviceId,
      install_store: "ps",
      gaid: "d7578036d13336cc",
      brand: brand,
      model: model,
      system_language: "en",
      net: "NETWORK_WIFI",
      region: "IN",
      timezone: "Asia/Calcutta",
      sp_code: "",
      ...extra
    });
  }

  // ─────────────────────────────────────────────────────
  // 🌐 NETWORK HELPERS (SkyStream API compliant)
  // ─────────────────────────────────────────────────────
  
  async function apiRequest(url, options = {}) {
    const { method = 'GET', body = null, headers = {}, useAltKey = false } = options;
    
    const timestamp = Date.now();    const xClientToken = generateXClientToken(timestamp);
    const contentType = body ? "application/json; charset=utf-8" : "application/json";
    
    const xTrSignature = generateXTrSignature(
      method, "application/json", contentType, url, body, useAltKey, timestamp
    );

    const { brand, model } = randomBrandModel();
    
    // SkyStream http_get/http_post signature: (url, headers, body?)
    const requestHeaders = {
      ...BASE_HEADERS,
      ...headers,
      "x-client-token": xClientToken,
      "x-tr-signature": xTrSignature,
      "x-client-info": getClientInfoHeaders(brand, model)
    };

    let response;
    if (method.toUpperCase() === 'POST') {
      response = await http_post(url, requestHeaders, body ? JSON.stringify(body) : "");
    } else {
      response = await http_get(url, requestHeaders);
    }

    if (response.status !== 200) {
      throw new Error(`API Error ${response.status}: ${response.body?.substring(0, 200)}`);
    }

    try {
      return JSON.parse(response.body);
    } catch (e) {
      throw new Error(`JSON Parse Error: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────
  // 📦 DATA PARSING
  // ─────────────────────────────────────────────────────
  
  function parseSearchItem(item) {
    const title = item.title?.toString()?.split('[')[0]?.trim();
    const id = item.subjectId?.toString();
    const coverImg = item.cover?.url;
    const subjectType = item.subjectType ?? 1;
    
    if (!title || !id) return null;
    
    const type = subjectType === 2 ? "series" : "movie";
        return new MultimediaItem({
      title: title,
      url: id,
      posterUrl: coverImg,
      type: type,
      contentType: type,
      score: item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : undefined
    });
  }

  function getHighestQuality(resolutionsStr) {
    if (!resolutionsStr) return "Auto";
    const qualities = [
      ["2160", "2160p"], ["1440", "1440p"], ["1080", "1080p"],
      ["720", "720p"], ["480", "480p"], ["360", "360p"]
    ];
    for (const [label, mapped] of qualities) {
      if (resolutionsStr.toLowerCase().includes(label)) return mapped;
    }
    return "Auto";
  }

  // ─────────────────────────────────────────────────────
  // 🏠 getHome
  // ─────────────────────────────────────────────────────
  
  async function getHome(cb) {
    try {
      const sections = [
        { name: "Trending", data: "4516404531735022304", isRanking: true },
        { name: "Trending in Cinema", data: "5692654647815587592", isRanking: true },
        { name: "Bollywood", data: "414907768299210008", isRanking: true },
        { name: "South Indian", data: "3859721901924910512", isRanking: true },
        { name: "Hollywood", data: "8019599703232971616", isRanking: true },
        { name: "Top Series This Week", data: "4741626294545400336", isRanking: true },
        { name: "Anime", data: "8434602210994128512", isRanking: true },
        { name: "Movies", data: "1|1", isRanking: false },
        { name: "Series", data: "1|2", isRanking: false }
      ];

      const homeData = {};

      for (const section of sections) {
        try {
          let items = [];
          
          if (section.isRanking) {
            const url = `${manifest.baseUrl}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${section.data}&page=1&perPage=15`;
            const response = await apiRequest(url, { method: 'GET' });
            const dataItems = response.data?.items || response.data?.subjects || [];            items = dataItems.map(parseSearchItem).filter(Boolean);
          } else {
            const url = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/list`;
            const [pg, channelId] = section.data.split('|');
            const body = {
              page: parseInt(pg) || 1,
              perPage: 15,
              channelId: channelId,
              classify: "All", country: "All", year: "All", genre: "All", sort: "ForYou"
            };
            const response = await apiRequest(url, { method: 'POST', body });
            const dataItems = response.data?.items || [];
            items = dataItems.map(parseSearchItem).filter(Boolean);
          }
          
          if (items.length > 0) {
            homeData[section.name] = items.slice(0, 24);
          }
        } catch (e) {
          console.error(`Section [${section.name}] failed:`, e.message);
        }
      }

      cb({ success: true, data: homeData });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // 🔍 search
  // ─────────────────────────────────────────────────────
  
  async function search(query, cb) {
    try {
      const url = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/search/v2`;
      const body = { page: 1, perPage: 20, keyword: query };
      
      const response = await apiRequest(url, { method: 'POST', body });
      const results = response.data?.results || [];
      
      const searchList = [];
      for (const result of results) {
        const subjects = result.subjects || [];
        for (const subject of subjects) {
          const item = parseSearchItem(subject);
          if (item) searchList.push(item);
        }
      }
            cb({ success: true, data: searchList });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // 📄 load (Metadata)
  // ─────────────────────────────────────────────────────
  
  async function load(url, cb) {
    try {
      const subjectId = url.toString();
      const detailUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
      
      const response = await apiRequest(detailUrl, { method: 'GET' });
      const data = response.data;
      
      if (!data) throw new Error("No data returned from API");
      
      const title = data.title?.toString()?.split('[')[0]?.trim() || "Unknown";
      const description = data.description;
      const releaseDate = data.releaseDate;
      const coverUrl = data.cover?.url;
      const subjectType = data.subjectType ?? 1;
      
      const type = (subjectType === 2 || subjectType === 7) ? "series" : "movie";
      const year = releaseDate?.substring(0, 4) ? parseInt(releaseDate.substring(0, 4)) : undefined;
      
      const actors = (data.staffList || [])
        .filter(staff => staff.staffType === 1)
        .map(staff => ({ name: staff.name, image: staff.avatarUrl, role: staff.character }));
      
      const tags = data.genre?.split(',').map(g => g.trim()).filter(Boolean) || [];
      
      let episodes = [];
      
      if (type === "series") {
        const allSubjectIds = [subjectId];
        (data.dubs || []).forEach(dub => {
          if (dub.subjectId && !allSubjectIds.includes(dub.subjectId)) {
            allSubjectIds.push(dub.subjectId);
          }
        });
        
        const episodeMap = new Map();
        
        for (const sid of allSubjectIds) {
          try {
            const seasonUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/season-info?subjectId=${sid}`;            const seasonRes = await apiRequest(seasonUrl, { method: 'GET' });
            const seasons = seasonRes.data?.seasons || [];
            
            for (const season of seasons) {
              const seasonNum = season.se ?? 1;
              const maxEp = season.maxEp ?? 1;
              if (!episodeMap.has(seasonNum)) episodeMap.set(seasonNum, new Set());
              const epSet = episodeMap.get(seasonNum);
              for (let ep = 1; ep <= maxEp; ep++) epSet.add(ep);
            }
          } catch (e) {
            console.warn(`Failed seasons for ${sid}:`, e.message);
          }
        }
        
        for (const [seasonNum, epSet] of episodeMap) {
          for (const epNum of Array.from(epSet).sort((a, b) => a - b)) {
            episodes.push(new Episode({
              name: `S${seasonNum}E${epNum}`,
              url: `${subjectId}|${seasonNum}|${epNum}`,
              season: seasonNum,
              episode: epNum,
              posterUrl: coverUrl
            }));
          }
        }
        
        if (episodes.length === 0) {
          episodes.push(new Episode({
            name: "Episode 1", url: `${subjectId}|1|1`, season: 1, episode: 1, posterUrl: coverUrl
          }));
        }
      }
      
      const item = new MultimediaItem({
        title, url: detailUrl, posterUrl: coverUrl, bannerUrl: coverUrl,
        type, contentType: type, description, year, tags, cast: actors, episodes
      });
      
      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // 🎬 loadStreams (WITH ENHANCED LABELING ✅)
  // ─────────────────────────────────────────────────────
  
  async function loadStreams(url, cb) {    try {
      const parts = url.toString().split('|');
      const subjectId = parts[0];
      const season = parts.length > 1 ? parseInt(parts[1]) : 0;
      const episode = parts.length > 2 ? parseInt(parts[2]) : 0;
      
      // Get subject info for dubs/languages
      const subjectUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
      const subjectRes = await apiRequest(subjectUrl, { method: 'GET' });
      const subjectData = subjectRes.data;
      
      // Build source list with languages
      const subjectSources = [];
      let originalLanguage = "Original";
      
      if (subjectData.dubs && Array.isArray(subjectData.dubs)) {
        for (const dub of subjectData.dubs) {
          const dubId = dub.subjectId;
          const lanName = dub.lanName || "Unknown";
          if (dubId === subjectId) {
            originalLanguage = lanName;
          } else if (dubId) {
            subjectSources.push({ subjectId: dubId, language: lanName });
          }
        }
      }
      subjectSources.unshift({ subjectId: subjectId, language: originalLanguage });
      
      const allStreams = [];
      const seenUrls = new Set();
      
      for (const { subjectId: srcId, language } of subjectSources) {
        try {
          const playUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/play-info?subjectId=${srcId}&se=${season}&ep=${episode}`;
          
          const token = subjectRes.headers?.['x-user'] 
            ? JSON.parse(subjectRes.headers['x-user'])?.token 
            : null;
          
          const { brand, model } = randomBrandModel();
          const headers = {
            "Authorization": token ? `Bearer ${token}` : undefined,
            "x-client-info": getClientInfoHeaders(brand, model, {
              "X-Play-Mode": "1", "X-Idle-Data": "1", "X-Family-Mode": "0", "X-Content-Mode": "0"
            })
          };
          
          const playRes = await apiRequest(playUrl, { method: 'GET', headers });
          const playData = playRes.data;
          const streams = playData?.streams;          
          if (streams && Array.isArray(streams)) {
            for (const stream of streams) {
              const streamUrl = stream.url;
              if (!streamUrl || seenUrls.has(streamUrl)) continue;
              seenUrls.add(streamUrl);
              
              const resolutions = stream.resolutions || "";
              const quality = getHighestQuality(resolutions);
              const signCookie = stream.signCookie;
              
              // 🎯 ENHANCED STREAM LABELING (Your Request)
              const providerName = "MovieBox";
              const audioLabel = language && language.toLowerCase() !== "original" 
                ? ` (${language.replace(/dub$/i, ' Audio')})` 
                : "";
              const qualityLabel = quality !== "Auto" ? ` ${quality}` : "";
              
              const streamLabel = `${providerName}${audioLabel}${qualityLabel}`.trim();
              
              // Determine link type for headers
              let referer = manifest.baseUrl;
              if (streamUrl.includes("m3u8")) referer = streamUrl.split('/').slice(0, 3).join('/');
              
              const streamResult = new StreamResult({
                url: streamUrl,
                quality: quality,
                source: streamLabel,  // ✅ This displays in UI as combined label
                headers: {
                  "Referer": referer,
                  "User-Agent": UA,
                  ...(signCookie ? { "Cookie": signCookie } : {})
                }
              });
              
              // Add subtitles if available
              try {
                const streamId = stream.id || `${srcId}|${season}|${episode}`;
                const subUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${srcId}&streamId=${streamId}`;
                const subRes = await apiRequest(subUrl, { 
                  method: 'GET', 
                  headers: { "Authorization": token ? `Bearer ${token}` : undefined } 
                });
                const captions = subRes.data?.extCaptions || [];
                
                if (captions.length > 0) {
                  streamResult.subtitles = captions.map(cap => ({
                    url: cap.url,
                    label: `${cap.lanName || cap.language || cap.lan || "Unknown"}${audioLabel}`,
                    lang: cap.lan || cap.language || "unk"                  }));
                }
              } catch (subErr) {
                // Subtitles optional
              }
              
              allStreams.push(streamResult);
            }
          }
        } catch (srcErr) {
          console.warn(`Failed streams for ${subjectId} (${language}):`, srcErr.message);
          continue;
        }
      }
      
      // Sort: higher quality first, then language preference
      const langPriority = ["Original", "English", "Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Bengali"];
      allStreams.sort((a, b) => {
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        if (qB !== qA) return qB - qA;
        const extractLang = (src) => {
          const match = src?.match(/\(([^)]+)\)/);
          return match ? match[1].replace(' Audio', '') : "Original";
        };
        const idxA = langPriority.indexOf(extractLang(a.source));
        const idxB = langPriority.indexOf(extractLang(b.source));
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
      });
      
      cb({ success: true, data: allStreams });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // EXPORT TO SKYSTREAM RUNTIME
  // ─────────────────────────────────────────────────────
  
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
  
})();
