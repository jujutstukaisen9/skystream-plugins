(function() {
  /**
   * @type {import('@skystream/sdk').Manifest}
   */
  // manifest is injected at runtime by SkyStream

  // ─────────────────────────────────────────────────────
  // CONFIGURATION & CONSTANTS
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

  // Device generation (randomized per session)
  const deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const brandModels = {
    "Samsung": ["SM-S918B", "SM-A528B", "SM-M336B"],
    "Xiaomi": ["2201117TI", "M2012K11AI", "Redmi Note 11"],
    "OnePlus": ["LE2111", "CPH2449", "IN2023"],
    "Google": ["Pixel 6", "Pixel 7", "Pixel 8"],
    "Realme": ["RMX3085", "RMX3360", "RMX3551"]
  };

  function randomBrandModel() {
    const brands = Object.keys(brandModels);
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const model = brandModels[brand][Math.floor(Math.random() * brandModels[brand].length)];
    return { brand, model };
  }

  // ─────────────────────────────────────────────────────
  // CRYPTOGRAPHIC HELPERS (ported from Kotlin)
  // ─────────────────────────────────────────────────────
  
  function md5(input) {
    // SkyStream provides crypto.md5 via global crypto helper
    // Fallback to Web Crypto API if needed
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();      const data = encoder.encode(input);
      return crypto.subtle.digest('MD5', data).then(buffer => {
        return Array.from(new Uint8Array(buffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');
      });
    }
    // Fallback: use SkyStream's built-in if available
    return globalThis.crypto?.md5?.(input) || input;
  }

  function reverseString(str) {
    return str.split('').reverse().join('');
  }

  function generateXClientToken(hardcodedTimestamp = null) {
    const timestamp = hardcodedTimestamp?.toString() || Date.now().toString();
    const reversed = reverseString(timestamp);
    // Note: md5 is async in Web Crypto, but SkyStream may provide sync version
    const hash = globalThis.crypto?.md5?.(reversed) || reversed; 
    return `${timestamp},${hash}`;
  }

  function buildCanonicalString(method, accept, contentType, url, body, timestamp) {
    const parsed = new URL(url, manifest.baseUrl);
    const path = parsed.pathname || "";
    
    // Sort query parameters
    const params = new URLSearchParams(parsed.search);
    const sortedQuery = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    const canonicalUrl = sortedQuery ? `${path}?${sortedQuery}` : path;
    
    const bodyBytes = body ? new TextEncoder().encode(body) : null;
    const bodyHash = bodyBytes 
      ? (globalThis.crypto?.md5?.(new TextDecoder().decode(bodyBytes.slice(0, 102400))) || "")
      : "";
    
    const bodyLength = bodyBytes?.length?.toString() || "";
    
    return `${method.toUpperCase()}\n${accept || ""}\n${contentType || ""}\n${bodyLength}\n${timestamp}\n${bodyHash}\n${canonicalUrl}`;
  }

  async function generateXTrSignature(method, accept, contentType, url, body = null, useAltKey = false, hardcodedTimestamp = null) {
    const timestamp = hardcodedTimestamp || Date.now();
    const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
    const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
        // SkyStream may provide crypto.hmac or we use Web Crypto
    let signature;
    if (globalThis.crypto?.hmac) {
      signature = await globalThis.crypto.hmac('MD5', secret, canonical);
    } else {
      // Fallback: simple hash (not cryptographically secure but works for API)
      signature = globalThis.crypto?.md5?.(canonical + secret) || canonical;
    }
    
    const signatureB64 = btoa(signature);
    return `${timestamp}|2|${signatureB64}`;
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
  // NETWORK HELPERS
  // ─────────────────────────────────────────────────────
  
  async function apiRequest(url, options = {}) {
    const { method = 'GET', body = null, headers = {}, useAltKey = false } = options;
    
    const timestamp = Date.now();
    const xClientToken = generateXClientToken(timestamp);
    const contentType = body ? "application/json; charset=utf-8" : "application/json";
    
    const xTrSignature = await generateXTrSignature(
      method, 
      "application/json", 
      contentType, 
      url,       body, 
      useAltKey,
      timestamp
    );

    const { brand, model } = randomBrandModel();
    
    const requestHeaders = {
      ...BASE_HEADERS,
      ...headers,
      "x-client-token": xClientToken,
      "x-tr-signature": xTrSignature,
      "x-client-info": getClientInfoHeaders(brand, model)
    };

    const response = await http_get(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

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
  // DATA PARSING HELPERS
  // ─────────────────────────────────────────────────────
  
  function parseSearchItem(item, baseUrl) {
    const title = item.title?.toString()?.split('[')[0]?.trim();
    const id = item.subjectId?.toString();
    const coverImg = item.cover?.url;
    const subjectType = item.subjectType ?? 1;
    
    if (!title || !id) return null;
    
    const type = subjectType === 2 ? "series" : "movie";
    
    return new MultimediaItem({
      title: title,
      url: id, // Store subjectId as URL for load()
      posterUrl: coverImg,      type: type,
      contentType: type,
      score: item.imdbRatingValue ? parseFloat(item.imdbRatingValue) * 10 : undefined
    });
  }

  function getHighestQuality(resolutionsStr) {
    if (!resolutionsStr) return null;
    const qualities = [
      ["2160", "2160p"], ["1440", "1440p"], ["1080", "1080p"],
      ["720", "720p"], ["480", "480p"], ["360", "360p"], ["240", "240p"]
    ];
    
    for (const [label, mapped] of qualities) {
      if (resolutionsStr.toLowerCase().includes(label)) {
        return mapped;
      }
    }
    return null;
  }

  // ─────────────────────────────────────────────────────
  // 🎯 CORE FUNCTION: getHome
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
        { name: "Series", data: "1|2", isRanking: false },
        { name: "Indian Movies", data: "1|1;country=India", isRanking: false },
        { name: "Indian Series", data: "1|2;country=India", isRanking: false }
      ];

      const homeData = {};

      for (const section of sections) {
        try {
          let items = [];
          
          if (section.isRanking) {
            // Ranking list endpoint
            const url = `${manifest.baseUrl}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${section.data}&page=1&perPage=15`;            const response = await apiRequest(url, { method: 'GET' });
            const dataItems = response.data?.items || response.data?.subjects || [];
            items = dataItems.map(item => parseSearchItem(item)).filter(Boolean);
          } else {
            // Subject list endpoint (with filters)
            const url = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/list`;
            
            const [pg, channelId] = section.data.split('|');
            const filters = section.data.split(';').slice(1).reduce((acc, f) => {
              const [k, v] = f.split('=');
              if (k && v) acc[k] = v;
              return acc;
            }, {});
            
            const body = {
              page: parseInt(pg) || 1,
              perPage: 15,
              channelId: channelId,
              classify: filters.classify || "All",
              country: filters.country || "All",
              year: filters.year || "All",
              genre: filters.genre || "All",
              sort: filters.sort || "ForYou"
            };
            
            const response = await apiRequest(url, { method: 'POST', body });
            const dataItems = response.data?.items || response.data?.subjects || [];
            items = dataItems.map(item => parseSearchItem(item)).filter(Boolean);
          }
          
          if (items.length > 0) {
            homeData[section.name] = items.slice(0, 24);
          }
        } catch (e) {
          console.error(`Section [${section.name}] failed:`, e.message);
          // Continue with other sections
        }
      }

      cb({ success: true, data: homeData });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // 🎯 CORE FUNCTION: search
  // ─────────────────────────────────────────────────────
  
  async function search(query, cb) {    try {
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
  // 🎯 CORE FUNCTION: load (Metadata)
  // ─────────────────────────────────────────────────────
  
  async function load(url, cb) {
    try {
      // url is the subjectId from search
      const subjectId = url.toString();
      const detailUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
      
      const response = await apiRequest(detailUrl, { method: 'GET' });
      const data = response.data;
      
      if (!data) throw new Error("No data returned from API");
      
      const title = data.title?.toString()?.split('[')[0]?.trim() || "Unknown";
      const description = data.description;
      const releaseDate = data.releaseDate;
      const duration = data.duration;
      const genre = data.genre;
      const coverUrl = data.cover?.url;
      const subjectType = data.subjectType ?? 1;
      
      const type = (subjectType === 2 || subjectType === 7) ? "series" : "movie";
      const year = releaseDate?.substring(0, 4) ? parseInt(releaseDate.substring(0, 4)) : undefined;
      
      // Parse actors/staff
      const actors = (data.staffList || [])        .filter(staff => staff.staffType === 1)
        .map(staff => ({
          name: staff.name,
          image: staff.avatarUrl,
          role: staff.character
        }));
      
      const tags = genre?.split(',').map(g => g.trim()).filter(Boolean) || [];
      
      // Parse episodes for series
      let episodes = [];
      
      if (type === "series") {
        // Collect all subjectIds (original + dubs)
        const allSubjectIds = [subjectId];
        (data.dubs || []).forEach(dub => {
          if (dub.subjectId && !allSubjectIds.includes(dub.subjectId)) {
            allSubjectIds.push(dub.subjectId);
          }
        });
        
        const episodeMap = new Map(); // season -> Set of episode numbers
        
        for (const sid of allSubjectIds) {
          try {
            const seasonUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/season-info?subjectId=${sid}`;
            const seasonRes = await apiRequest(seasonUrl, { method: 'GET' });
            const seasons = seasonRes.data?.seasons || [];
            
            for (const season of seasons) {
              const seasonNum = season.se ?? 1;
              const maxEp = season.maxEp ?? 1;
              
              if (!episodeMap.has(seasonNum)) {
                episodeMap.set(seasonNum, new Set());
              }
              const epSet = episodeMap.get(seasonNum);
              for (let ep = 1; ep <= maxEp; ep++) {
                epSet.add(ep);
              }
            }
          } catch (e) {
            console.warn(`Failed to load seasons for ${sid}:`, e.message);
          }
        }
        
        // Build Episode objects
        for (const [seasonNum, epSet] of episodeMap) {
          for (const epNum of Array.from(epSet).sort((a, b) => a - b)) {
            episodes.push(new Episode({              name: `S${seasonNum}E${epNum}`,
              url: `${subjectId}|${seasonNum}|${epNum}`, // Encode for loadStreams
              season: seasonNum,
              episode: epNum,
              posterUrl: coverUrl
            }));
          }
        }
        
        // Fallback if no episodes found
        if (episodes.length === 0) {
          episodes.push(new Episode({
            name: "Episode 1",
            url: `${subjectId}|1|1`,
            season: 1,
            episode: 1,
            posterUrl: coverUrl
          }));
        }
      }
      
      const item = new MultimediaItem({
        title: title,
        url: detailUrl,
        posterUrl: coverUrl,
        bannerUrl: coverUrl,
        type: type,
        contentType: type,
        description: description,
        year: year,
        tags: tags,
        cast: actors,
        episodes: episodes
      });
      
      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }

  // ─────────────────────────────────────────────────────
  // 🎯 CORE FUNCTION: loadStreams (WITH ENHANCED LABELING)
  // ─────────────────────────────────────────────────────
  
  async function loadStreams(url, cb) {
    try {
      // Parse the encoded URL from Episode: "subjectId|season|episode"
      const parts = url.toString().split('|');
      const subjectId = parts[0];      const season = parts.length > 1 ? parseInt(parts[1]) : 0;
      const episode = parts.length > 2 ? parseInt(parts[2]) : 0;
      
      // First, get the subject info to fetch available dubs/languages
      const subjectUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
      const subjectRes = await apiRequest(subjectUrl, { method: 'GET' });
      const subjectData = subjectRes.data;
      
      // Build list of subjectIds with their language names
      const subjectSources = [];
      let originalLanguage = "Original";
      
      // Add dubs first
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
      
      // Add original as first source (with proper language name)
      subjectSources.unshift({ subjectId: subjectId, language: originalLanguage });
      
      const allStreams = [];
      const seenUrls = new Set();
      
      // Process each language/source
      for (const { subjectId: srcId, language } of subjectSources) {
        try {
          const playUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/play-info?subjectId=${srcId}&se=${season}&ep=${episode}`;
          
          // Get auth token from previous response headers if available
          const token = subjectRes.headers?.['x-user'] 
            ? JSON.parse(subjectRes.headers['x-user'])?.token 
            : null;
          
          const { brand, model } = randomBrandModel();
          const headers = {
            "Authorization": token ? `Bearer ${token}` : undefined,
            "x-client-info": getClientInfoHeaders(brand, model, {
              "X-Play-Mode": "1",
              "X-Idle-Data": "1",
              "X-Family-Mode": "0",
              "X-Content-Mode": "0"
            })          };
          
          const playRes = await apiRequest(playUrl, { method: 'GET', headers });
          const playData = playRes.data;
          const streams = playData?.streams;
          
          if (streams && Array.isArray(streams)) {
            for (const stream of streams) {
              const streamUrl = stream.url;
              if (!streamUrl || seenUrls.has(streamUrl)) continue;
              seenUrls.add(streamUrl);
              
              const resolutions = stream.resolutions || "";
              const format = stream.format || "";
              const signCookie = stream.signCookie;
              const streamId = stream.id || `${srcId}|${season}|${episode}`;
              
              const quality = getHighestQuality(resolutions);
              
              // 🎯 ENHANCED STREAM LABELING (Your Key Request)
              // Format: "Provider (Telugu Audio) 1080p"
              const providerName = "MovieBox";
              const audioLabel = language && language.toLowerCase() !== "original" 
                ? ` (${language.replace(/dub$/i, ' Audio')})` 
                : "";
              const qualityLabel = quality ? ` ${quality}` : "";
              
              const streamLabel = `${providerName}${audioLabel}${qualityLabel}`.trim();
              
              // Determine link type
              let linkType = "video";
              if (streamUrl.startsWith("magnet:")) linkType = "magnet";
              else if (streamUrl.includes(".mpd")) linkType = "dash";
              else if (streamUrl.includes(".m3u8") || format === "HLS") linkType = "hls";
              
              const streamResult = new StreamResult({
                url: streamUrl,
                quality: quality || "Auto",
                source: streamLabel,  // ✅ This is what displays in the UI
                name: streamLabel,    // ✅ Also set name for compatibility
                headers: {
                  "Referer": manifest.baseUrl,
                  ...(signCookie ? { "Cookie": signCookie } : {})
                }
              });
              
              // Add subtitles if available
              try {
                const subUrl = `${manifest.baseUrl}/wefeed-mobile-bff/subject-api/get-stream-captions?subjectId=${srcId}&streamId=${streamId}`;
                const subRes = await apiRequest(subUrl, { method: 'GET', headers: { "Authorization": token ? `Bearer ${token}` : undefined } });                const captions = subRes.data?.extCaptions || [];
                
                if (captions.length > 0) {
                  streamResult.subtitles = captions.map(cap => ({
                    url: cap.url,
                    label: `${cap.lanName || cap.language || cap.lan || "Unknown"}${audioLabel}`,
                    lang: cap.lan || cap.language || "unk"
                  }));
                }
              } catch (subErr) {
                // Subtitles are optional, continue
              }
              
              allStreams.push(streamResult);
            }
          }
        } catch (srcErr) {
          console.warn(`Failed to load streams for ${subjectId} (${language}):`, srcErr.message);
          continue;
        }
      }
      
      // Sort streams: prefer higher quality, then by language preference
      const langPriority = ["Original", "English", "Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Bengali"];
      allStreams.sort((a, b) => {
        // Quality first (higher is better)
        const qA = parseInt(a.quality) || 0;
        const qB = parseInt(b.quality) || 0;
        if (qB !== qA) return qB - qA;
        
        // Then language preference
        const extractLang = (src) => {
          const match = src.match(/\(([^)]+)\)/);
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
