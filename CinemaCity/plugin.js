(function() {
  /**
   * CinemaCity SkyStream Plugin
   * Migrated from CloudStream Kotlin provider
   * 
   * Features:
   * - Movies, TV Series, Anime, Asian, Animation, Documentary
   * - TMDB metadata integration (cast, credits, ratings)
   * - Cinemeta metadata enrichment
   * - Multi-quality streams with subtitle support
   * - Recommendations
   */

  // === Configuration ===
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";
  
  // Decoded cookie from Kotlin base64: ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=
  const AUTH_COOKIE = "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;";
  
  const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";
  const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
  const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w500";
  const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
  const METAHUB_LOGO = "https://live.metahub.space/logo/medium";

  const BASE_HEADERS = {
    "User-Agent": UA,
    "Cookie": AUTH_COOKIE,
    "Referer": `${manifest.baseUrl}/`
  };

  // === Helper Functions ===

  function safeBase64Decode(str) {
    try {
      if (!str) return "";
      let s = String(str).trim();
      s = s.replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4 !== 0) s += "=";
      return atob(s);
    } catch (_) {
      return "";
    }
  }

  function htmlDecode(text) {
    if (!text) return "";
    return String(text)
      .replace(/&amp;/g, "&")      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  }

  function textOf(el) {
    return htmlDecode((el?.textContent || "").replace(/\s+/g, " ").trim());
  }

  function getAttr(el, ...attrs) {
    if (!el) return "";
    for (const attr of attrs) {
      const v = el.getAttribute(attr);
      if (v && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function normalizeUrl(url, base) {
    if (!url) return "";
    const raw = String(url).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return `${base}${raw}`;
    return `${base}/${raw}`;
  }

  function fixUrl(url) {
    return normalizeUrl(url, manifest.baseUrl);
  }

  function extractYear(text) {
    const m = String(text || "").match(/\((\d{4})\)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function extractQuality(url) {
    const t = String(url || "").toLowerCase();
    if (t.includes("2160p") || t.includes("4k")) return "2160p";
    if (t.includes("1440p")) return "1440p";
    if (t.includes("1080p")) return "1080p";
    if (t.includes("720p")) return "720p";
    if (t.includes("480p")) return "480p";
    if (t.includes("360p")) return "360p";
    return "Auto";
  }
  function parseScore(text) {
    const num = parseFloat(String(text || "").replace(/[^\d.]/g, ""));
    return isNaN(num) ? null : num;
  }

  function uniqueByUrl(items) {
    const out = [];
    const seen = new Set();
    for (const it of items || []) {
      if (!it?.url || seen.has(it.url)) continue;
      seen.add(it.url);
      out.push(it);
    }
    return out;
  }

  // === Network Functions ===

  async function request(url, headers = {}) {
    return http_get(url, {
      headers: Object.assign({}, BASE_HEADERS, headers)
    });
  }

  async function loadDoc(url, headers = {}) {
    const res = await request(url, headers);
    return parseHtml(res.body);
  }

  async function fetchJson(url, headers = {}) {
    const res = await http_get(url, {
      headers: Object.assign({ "Accept": "application/json" }, headers)
    });
    try {
      return JSON.parse(res.body);
    } catch (_) {
      return null;
    }
  }

  // === TMDB/Cinemeta Integration ===

  async function getTMDBCast(tmdbId, mediaType) {
    try {
      const endpoint = mediaType === "tv" ? "tv" : "movie";
      const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
      const data = await fetchJson(url);
      
      if (!data?.cast) return [];
            return data.cast.slice(0, 15).map(c => new Actor({
        name: c.name || c.original_name || "",
        image: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null,
        role: c.character || ""
      }));
    } catch (_) {
      return [];
    }
  }

  async function getTMDBIdFromIMDB(imdbId) {
    try {
      const url = `${TMDB_BASE_URL}/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
      const data = await fetchJson(url);
      
      if (data?.movie_results?.[0]?.id) {
        return { tmdbId: data.movie_results[0].id, type: "movie" };
      }
      if (data?.tv_results?.[0]?.id) {
        return { tmdbId: data.tv_results[0].id, type: "tv" };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async function getCinemetaData(type, imdbId) {
    try {
      const url = `${CINEMETA_URL}/${type}/${imdbId}.json`;
      const data = await fetchJson(url);
      return data?.meta || null;
    } catch (_) {
      return null;
    }
  }

  // === Parsing Functions ===

  function parseSearchItem(el) {
    if (!el) return null;

    const anchor = el.querySelector("div.dar-short_bg a");
    const href = fixUrl(getAttr(anchor, "href"));
    if (!href) return null;

    const titleEl = Array.from(el.children).find(c => c.tagName === "A");
    const titleRaw = textOf(titleEl);
    const title = titleRaw.split("(")[0].trim();
    if (!title) return null;
    const posterUrl = fixUrl(getAttr(el.querySelector("div.dar-short_bg a"), "href"));
    
    const scoreText = textOf(el.querySelector("span.rating-color"));
    const score = parseScore(scoreText);

    const qualityEl = el.querySelector("div.dar-short_bg.e-cover > div span:nth-child(2) > a");
    const qualityText = textOf(qualityEl) || textOf(el.querySelector("div.dar-short_bg.e-cover > div > span"));
    const quality = qualityText.toLowerCase().includes("ts") ? "TS" : "HD";

    const isSeries = href.includes("/tv-series/");
    const type = isSeries ? "series" : "movie";

    return new MultimediaItem({
      title,
      url: href,
      posterUrl,
      type,
      contentType: type,
      rating: score
    });
  }

  function parseSubtitles(raw) {
    const tracks = [];
    if (!raw) return tracks;

    // Format: (English)[url],(Hindi)[url]
    const regex = /\(([^)]+?)\)\[([^\]]+)\]/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      tracks.push({
        language: match[1].trim(),
        url: match[2].trim()
      });
    }
    return tracks;
  }

  function parsePlayerJSFile(rawFile) {
    try {
      if (typeof rawFile === "string") {
        const trimmed = rawFile.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          return JSON.parse(trimmed);
        }
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
          return [JSON.parse(trimmed)];
        }
        if (trimmed) {          return [{ file: trimmed }];
        }
        return [];
      }
      if (Array.isArray(rawFile)) {
        return rawFile;
      }
      return [];
    } catch (_) {
      return [];
    }
  }

  // === Core Functions ===

  async function getHome(cb) {
    try {
      const sections = [
        { name: "Movies", path: "movies" },
        { name: "TV Series", path: "tv-series" },
        { name: "Anime", path: "xfsearch/genre/anime" },
        { name: "Asian", path: "xfsearch/genre/asian" },
        { name: "Animation", path: "xfsearch/genre/animation" },
        { name: "Documentary", path: "xfsearch/genre/documentary" }
      ];

      const data = {};

      for (const sec of sections) {
        try {
          const url = `${manifest.baseUrl}/${sec.path}`;
          const doc = await loadDoc(url);
          
          const items = Array.from(doc.querySelectorAll("div.dar-short_item"))
            .map(parseSearchItem)
            .filter(Boolean);

          if (items.length > 0) {
            data[sec.name] = uniqueByUrl(items).slice(0, 30);
          }
        } catch (e) {
          console.error(`Error loading section ${sec.name}:`, e);
        }
      }

      cb({ success: true, data });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: String(e?.message || e) });
    }
  }
  async function search(query, cb) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `${manifest.baseUrl}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodedQuery}`;
      
      const doc = await loadDoc(url);
      
      const items = Array.from(doc.querySelectorAll("div.dar-short_item"))
        .map(parseSearchItem)
        .filter(Boolean);

      cb({ success: true, data: uniqueByUrl(items) });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
    }
  }

  async function load(url, cb) {
    try {
      const target = fixUrl(url);
      const doc = await loadDoc(target);

      // Basic metadata
      const ogTitle = getAttr(doc.querySelector("meta[property='og:title']"), "content");
      const title = ogTitle.split("(")[0].trim();
      const year = extractYear(ogTitle);
      
      const poster = getAttr(doc.querySelector("meta[property='og:image']"), "content");
      const bgPoster = getAttr(doc.querySelector("div.dar-full_bg a"), "href");
      
      const trailer = getAttr(doc.querySelector("div.dar-full_bg.e-cover > div"), "data-vbg");

      // Description
      const description = textOf(doc.querySelector("#about div.ta-full_text1"));

      // Audio languages
      const audioLangEl = Array.from(doc.querySelectorAll("li")).find(li => {
        const span = li.querySelector("span");
        return span?.textContent?.toLowerCase().includes("audio language");
      });
      const audioLanguages = audioLangEl 
        ? Array.from(audioLangEl.querySelectorAll("span:eq(1) a"))
            .map(a => textOf(a))
            .filter(t => t)
            .join(", ")
        : null;

      // Recommendations
      const recommendations = Array.from(doc.querySelectorAll("div.ta-rel > div.ta-rel_item"))        .map(el => {
          const a = el.querySelector("a");
          const title = textOf(a).split("(")[0].trim();
          const href = fixUrl(getAttr(el.querySelector("> div > a"), "href"));
          const score = parseScore(textOf(el.querySelector("span.rating-color1")));
          const posterUrl = getAttr(el.querySelector("div > a"), "href");
          
          if (!href || !title) return null;
          
          return new MultimediaItem({
            title,
            url: href,
            posterUrl: fixUrl(posterUrl),
            type: "movie",
            contentType: "movie",
            rating: score
          });
        })
        .filter(Boolean);

      // IMDB ID extraction
      const imdbId = Array.from(doc.querySelectorAll("div.ta-full_rating1 > div"))
        .map(div => getAttr(div, "onclick"))
        .map(onclick => {
          const m = String(onclick).match(/tt\d+/);
          return m ? m[0] : null;
        })
        .find(id => id);

      const isSeries = target.includes("/tv-series/");
      const contentType = isSeries ? "series" : "movie";

      // Enhanced metadata from TMDB/Cinemeta
      let tmdbId = null;
      let tmdbType = null;
      let cast = [];
      let cinemetaData = null;
      let logoUrl = null;
      let genres = [];
      let enhancedDesc = description;
      let rating = null;
      let certification = null;

      if (imdbId) {
        // Get TMDB ID
        const tmdbResult = await getTMDBIdFromIMDB(imdbId);
        if (tmdbResult) {
          tmdbId = tmdbResult.tmdbId;
          tmdbType = tmdbResult.type;
                    // Get cast
          cast = await getTMDBCast(tmdbId, tmdbType);
          
          // Logo
          logoUrl = `${METAHUB_LOGO}/${imdbId}/img`;
        }

        // Get Cinemeta data
        const cinemetaType = isSeries ? "series" : "movie";
        cinemetaData = await getCinemetaData(cinemetaType, imdbId);
        
        if (cinemetaData) {
          enhancedDesc = cinemetaData.description || enhancedDesc;
          genres = cinemetaData.genres || [];
          rating = cinemetaData.imdbRating ? parseFloat(cinemetaData.imdbRating) : null;
          certification = cinemetaData.appExtras?.certification;
        }
      }

      // Build description with audio languages
      const finalDescription = buildString([
        enhancedDesc,
        audioLanguages ? `Audio: ${audioLanguages}` : null
      ]);

      function buildString(parts) {
        return parts.filter(p => p).join(" - ");
      }

      // === Stream Extraction ===
      
      const playerScript = Array.from(doc.querySelectorAll("script"))
        .find(s => s.textContent.includes("atob"));
      
      if (!playerScript) {
        // Fallback: return item without streams
        const item = new MultimediaItem({
          title: cinemetaData?.name || title,
          url: target,
          posterUrl: fixUrl(poster),
          bannerUrl: fixUrl(cinemetaData?.background || bgPoster || poster),
          description: finalDescription,
          type: contentType,
          contentType,
          year: year || (cinemetaData?.year ? parseInt(cinemetaData.year) : null),
          rating: rating,
          tags: genres,
          actors: cast,
          contentRating: certification,
          recommendations: recommendations.length > 0 ? recommendations : undefined,          episodes: [new Episode({
            name: title,
            url: JSON.stringify({ url: target, streamUrl: null, subtitles: [] }),
            season: 1,
            episode: 1,
            posterUrl: fixUrl(poster)
          })]
        });
        
        if (imdbId) item.imdbId = imdbId;
        if (tmdbId) item.tmdbId = String(tmdbId);
        if (logoUrl) item.logoUrl = logoUrl;
        if (trailer) item.trailerUrl = trailer;
        
        cb({ success: true, data: item });
        return;
      }

      // Decode PlayerJS
      const scriptText = playerScript.textContent;
      const atobMatch = scriptText.match(/atob\("([^"]+)"\)/);
      
      if (!atobMatch) {
        throw new Error("PlayerJS base64 data not found");
      }

      const decodedPlayer = safeBase64Decode(atobMatch[1]);
      
      // Extract PlayerJS JSON
      const playerJsonMatch = decodedPlayer.match(/new Playerjs\(([\s\S]*?)\);/);
      if (!playerJsonMatch) {
        throw new Error("PlayerJS JSON not found");
      }

      let playerJson;
      try {
        playerJson = JSON.parse(playerJsonMatch[1]);
      } catch (e) {
        throw new Error("Failed to parse PlayerJS JSON: " + e.message);
      }

      // Parse file structure
      const rawFile = playerJson.file;
      const fileArray = parsePlayerJSFile(rawFile);

      if (!fileArray || fileArray.length === 0) {
        throw new Error("No stream files found in PlayerJS");
      }

      // Episode metadata map from Cinemeta      const epMetaMap = {};
      if (cinemetaData?.videos) {
        for (const vid of cinemetaData.videos) {
          if (vid.season != null && vid.episode != null) {
            epMetaMap[`${vid.season}:${vid.episode}`] = vid;
          }
        }
      }

      // Parse streams
      if (isSeries) {
        const episodes = [];
        const seasonRegex = /Season\s*(\d+)/i;
        const episodeRegex = /Episode\s*(\d+)/i;

        for (const seasonJson of fileArray) {
          const seasonMatch = seasonRegex.exec(seasonJson.title || "");
          const seasonNumber = seasonMatch ? parseInt(seasonMatch[1], 10) : null;
          
          if (seasonNumber == null) continue;

          const episodesArray = seasonJson.folder || [];
          
          for (const epJson of episodesArray) {
            const epMatch = episodeRegex.exec(epJson.title || "");
            const episodeNumber = epMatch ? parseInt(epMatch[1], 10) : null;
            
            if (episodeNumber == null) continue;

            const streamUrls = [];
            
            if (epJson.file) {
              streamUrls.push(epJson.file);
            }
            
            if (Array.isArray(epJson.folder)) {
              for (const source of epJson.folder) {
                if (source.file) {
                  streamUrls.push(source.file);
                }
              }
            }

            if (streamUrls.length === 0) continue;

            const metaKey = `${seasonNumber}:${episodeNumber}`;
            const epMeta = epMetaMap[metaKey];

            const subtitles = parseSubtitles(epJson.subtitle);
            const epData = {
              streams: streamUrls,
              subtitles: subtitles
            };

            episodes.push(new Episode({
              name: epMeta?.name || `S${seasonNumber}E${episodeNumber}`,
              url: JSON.stringify(epData),
              season: seasonNumber,
              episode: episodeNumber,
              posterUrl: fixUrl(epMeta?.thumbnail || poster),
              description: epMeta?.overview
            }));
          }
        }

        // Sort episodes
        episodes.sort((a, b) => {
          if (a.season !== b.season) return a.season - b.season;
          return a.episode - b.episode;
        });

        const item = new MultimediaItem({
          title: cinemetaData?.name || title,
          url: target,
          posterUrl: fixUrl(poster),
          bannerUrl: fixUrl(cinemetaData?.background || bgPoster || poster),
          description: finalDescription,
          type: contentType,
          contentType,
          year: year || (cinemetaData?.year ? parseInt(cinemetaData.year) : null),
          rating: rating,
          tags: genres,
          actors: cast,
          contentRating: certification,
          recommendations: recommendations.length > 0 ? recommendations : undefined,
          episodes: episodes
        });

        if (imdbId) item.imdbId = imdbId;
        if (tmdbId) item.tmdbId = String(tmdbId);
        if (logoUrl) item.logoUrl = logoUrl;
        if (trailer) item.trailerUrl = trailer;

        cb({ success: true,  item });

      } else {
        // Movie
        const firstItem = fileArray[0];
        const streamUrls = [];        
        if (firstItem.file) {
          streamUrls.push(firstItem.file);
        }
        
        if (Array.isArray(firstItem.folder)) {
          for (const source of firstItem.folder) {
            if (source.file) {
              streamUrls.push(source.file);
            }
          }
        }

        const subtitles = [];
        
        // Check for subtitles in playerJson or firstItem
        const subRaw = playerJson.subtitle || firstItem.subtitle;
        if (subRaw) {
          subtitles.push(...parseSubtitles(subRaw));
        }

        const movieData = {
          streams: streamUrls,
          subtitles: subtitles
        };

        const item = new MultimediaItem({
          title: cinemetaData?.name || title,
          url: target,
          posterUrl: fixUrl(poster),
          bannerUrl: fixUrl(cinemetaData?.background || bgPoster || poster),
          description: finalDescription,
          type: contentType,
          contentType,
          year: year || (cinemetaData?.year ? parseInt(cinemetaData.year) : null),
          rating: rating,
          tags: genres,
          actors: cast,
          contentRating: certification,
          recommendations: recommendations.length > 0 ? recommendations : undefined,
          episodes: [new Episode({
            name: title,
            url: JSON.stringify(movieData),
            season: 1,
            episode: 1,
            posterUrl: fixUrl(poster)
          })]
        });

        if (imdbId) item.imdbId = imdbId;        if (tmdbId) item.tmdbId = String(tmdbId);
        if (logoUrl) item.logoUrl = logoUrl;
        if (trailer) item.trailerUrl = trailer;

        cb({ success: true, data: item });
      }

    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      let epData;
      
      try {
        epData = JSON.parse(url);
      } catch (_) {
        cb({ success: false, errorCode: "STREAM_ERROR", message: "Invalid episode data" });
        return;
      }

      const streams = [];
      const streamUrls = epData.streams || (epData.streamUrl ? [epData.streamUrl] : []);

      for (const streamUrl of streamUrls) {
        if (!streamUrl) continue;

        const quality = extractQuality(streamUrl);
        
        streams.push(new StreamResult({
          url: streamUrl,
          quality: quality,
          source: `CinemaCity - ${quality}`,
          headers: {
            "Referer": manifest.baseUrl,
            "User-Agent": UA
          }
        }));
      }

      // Add subtitle streams if available
      if (epData.subtitles && Array.isArray(epData.subtitles)) {
        for (const sub of epData.subtitles) {
          // Subtitles are handled by the app via StreamResult metadata
          // SkyStream may handle subtitles differently - add as stream metadata
          if (sub.url && sub.language) {
            // Subtitle handling depends on SkyStream SDK capabilities
            // For now, include in stream headers or as separate track          }
        }
      }

      // Deduplicate
      const uniqueStreams = [];
      const seen = new Set();
      for (const s of streams) {
        const key = `${s.url}|${s.quality}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueStreams.push(s);
      }

      cb({ success: true,  uniqueStreams });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) });
    }
  }

  // === Export Functions ===
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
