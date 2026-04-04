(function () {
  // manifest injected at runtime
  const BASE_URL = () =>
    typeof manifest !== "undefined" && manifest.baseUrl
      ? manifest.baseUrl
      : "https://cinemacity.cc";

  const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
  const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
  const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
  const LOGO_BASE = "https://live.metahub.space/logo/medium";

  const DEFAULT_HEADERS = {
    Cookie:
      "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;",
    "User-Agent": "Mozilla/5.0",
  };

  // ---------- small utils ----------
  function safeJsonParse(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function base64Decode(str) {
    if (!str) return "";
    if (typeof atob === "function") return atob(str);
    if (typeof Buffer !== "undefined")
      return Buffer.from(str, "base64").toString("utf8");
    return "";
  }

  function absUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return BASE_URL() + url;
    return url;
  }

  async function fetchHtml(url) {
    const res = await http_get(url, DEFAULT_HEADERS);
    return res && (res.body || res.data || "");
  }

  function extractQuality(url) {
    const u = (url || "").toLowerCase();
    if (u.includes("2160")) return "2160p";
    if (u.includes("1440")) return "1440p";
    if (u.includes("1080")) return "1080p";
    if (u.includes("720")) return "720p";
    if (u.includes("480")) return "480p";
    if (u.includes("360")) return "360p";
    if (u.includes("240")) return "240p";
    return "Auto";
  }

  // ---------- parsing helpers ----------
  function parseHomeCards(html) {
    const items = [];
    const cardRe = /<div class="dar-short_item[^"]*">([\s\S]*?)<\/div>\s*<\/div>?/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null) {
      const block = m[1];
      const href = (block.match(/<a[^>]+href=["']([^"']+)["']/i) || [])[1] || "";
      const titleRaw = (block.match(/<a[^>]*>([^<]+)<\/a>/i) || [])[1] || "";
      const title = titleRaw.split("(")[0].trim() || "Untitled";
      const poster =
        (block.match(/<img[^>]+src=["']([^"']+)["']/i) ||
          block.match(/dar-short_bg[^>]+href=["']([^"']+)["']/i) ||
          [])[1] || "";
      const scoreTxt = (block.match(/rating-color[^>]*>([^<]+)</i) || [])[1];
      const qualityTxt =
        (block.match(
          /dar-short_bg[^>]*>\s*<div[^>]*>\s*<span[^>]*>\s*<a[^>]*>([^<]+)</i
        ) ||
          block.match(/dar-short_bg[^>]*>\s*<div[^>]*>\s*<span[^>]*>([^<]+)</i) ||
          [])[1];
      const quality = qualityTxt && qualityTxt.toUpperCase().includes("TS") ? "TS" : "HD";
      const type = href.includes("/tv-series/") ? "series" : "movie";
      const item = new MultimediaItem({
        title,
        url: absUrl(href),
        posterUrl: absUrl(poster),
        type,
      });
      if (scoreTxt) item.score = parseFloat(scoreTxt) || scoreTxt;
      if (quality) item.quality = quality;
      items.push(item);
    }
    return items;
  }

  function parseAudioLang(html) {
    const liRe =
      /<li[^>]*>\s*<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/li>/gi;
    let m;
    while ((m = liRe.exec(html)) !== null) {
      const label = m[1].trim().toLowerCase();
      if (label === "audio language") {
        const langs = [];
        const aRe = /<a[^>]*>([^<]+)<\/a>/gi;
        let a;
        while ((a = aRe.exec(m[2])) !== null) langs.push(a[1].trim());
        if (langs.length) return langs.join(", ");
      }
    }
    return "";
  }

  function parseRecommendations(html) {
    const recs = [];
    const recRe =
      /<div class="ta-rel_item"[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>[\s\S]*?div[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?rating-color1[^>]*>([^<]*)/gi;
    let m;
    while ((m = recRe.exec(html)) !== null) {
      const href = absUrl(m[1]);
      const title = (m[2] || "").split("(")[0].trim();
      const poster = absUrl(m[3]);
      const score = m[4];
      const type = href.includes("/tv-series/") ? "series" : "movie";
      const item = new MultimediaItem({ title, url: href, posterUrl: poster, type });
      if (score) item.score = parseFloat(score) || score;
      recs.push(item);
    }
    return recs;
  }

  function parsePlayerJs(html) {
    const atobRe = /atob\("([^"\\]+)"\)/g;
    let m;
    while ((m = atobRe.exec(html)) !== null) {
      const decoded = base64Decode(m[1]);
      const start = decoded.indexOf("new Playerjs(");
      if (start === -1) continue;
      const after = decoded.slice(start + "new Playerjs(".length);
      const end = after.lastIndexOf(");");
      const jsonText = (end === -1 ? after : after.slice(0, end)).trim();
      const player = safeJsonParse(jsonText);
      if (player) return player;
    }
    return null;
  }

  function normalizeFileArray(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object") return [raw];
    if (typeof raw === "string") {
      const v = raw.trim();
      if (!v) return [];
      if ((v.startsWith("[") && v.endsWith("]")) || (v.startsWith("{") && v.endsWith("}"))) {
        const parsed = safeJsonParse(v);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") return [parsed];
      }
      return [{ file: v }];
    }
    return [];
  }

  function parseSubtitles(raw) {
    if (!raw || typeof raw !== "string") return [];
    const out = [];
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/\[(.+?)\](https?:\/\/[^\s]+)/i);
      if (match) out.push({ language: match[1], subtitleUrl: match[2] });
    }
    return out;
  }

  function parseEpisodesFromPlayer(player, meta, type) {
    const fileArray = normalizeFileArray(player ? player.file : null);
    const episodeMetaMap = {};
    const videos = meta && Array.isArray(meta.videos) ? meta.videos : [];
    for (const v of videos) {
      if (v.season != null && v.episode != null) episodeMetaMap[`${v.season}:${v.episode}`] = v;
    }

    const episodes = [];
    let movieData = null;
    const isSeries = type === "series" && fileArray.some((f) => f && f.folder);

    if (!isSeries) {
      const first = fileArray[0] || {};
      const streamUrl = typeof first.file === "string" ? first.file : "";
      const subtitleRaw =
        typeof (player && player.subtitle) === "string"
          ? player.subtitle
          : typeof first.subtitle === "string"
          ? first.subtitle
          : "";
      movieData = JSON.stringify({ streamUrl, subtitleTracks: parseSubtitles(subtitleRaw) });
      return { episodes, movieData };
    }

    for (const seasonJson of fileArray) {
      const seasonTitle = seasonJson && seasonJson.title ? String(seasonJson.title) : "";
      const seasonMatch = seasonTitle.match(/Season\s*(\d+)/i);
      const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : null;
      const seasonFolder = seasonJson && Array.isArray(seasonJson.folder) ? seasonJson.folder : [];
      if (!seasonNumber || !seasonFolder.length) continue;

      for (const epJson of seasonFolder) {
        const epTitle = epJson && epJson.title ? String(epJson.title) : "";
        const epMatch = epTitle.match(/Episode\s*(\d+)/i);
        const episodeNumber = epMatch ? parseInt(epMatch[1]) : null;
        if (!episodeNumber) continue;

        const streams = [];
        if (typeof epJson.file === "string" && epJson.file.trim()) streams.push(epJson.file.trim());
        if (Array.isArray(epJson.folder)) {
          for (const f of epJson.folder) {
            if (f && typeof f.file === "string" && f.file.trim()) streams.push(f.file.trim());
          }
        }
        if (!streams.length) continue;

        const metaKey = `${seasonNumber}:${episodeNumber}`;
        const epMeta = episodeMetaMap[metaKey];
        const subtitleTracks = parseSubtitles(typeof epJson.subtitle === "string" ? epJson.subtitle : "");
        const epData = JSON.stringify({ streams, subtitleTracks });

        const ep = new Episode({
          name: epMeta && epMeta.name ? epMeta.name : `S${seasonNumber}E${episodeNumber}`,
          url: epData,
          season: seasonNumber,
          episode: episodeNumber,
          description: epMeta && epMeta.overview ? epMeta.overview : "",
          posterUrl: epMeta && epMeta.thumbnail ? epMeta.thumbnail : "",
        });
        episodes.push(ep);
      }
    }

    episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    return { episodes, movieData };
  }

  // ---------- core ----------
  async function getHome(cb) {
    try {
      const categories = [
        { name: "Movies", path: "movies" },
        { name: "TV Series", path: "tv-series" },
        { name: "Anime", path: "xfsearch/genre/anime" },
        { name: "Asian", path: "xfsearch/genre/asian" },
        { name: "Animation", path: "xfsearch/genre/animation" },
        { name: "Documentary", path: "xfsearch/genre/documentary" },
      ];

      const out = {};
      for (const cat of categories) {
        const html = await fetchHtml(`${BASE_URL()}/${cat.path}`);
        const items = parseHomeCards(html);
        if (items.length) out[cat.name] = items;
      }
      cb({ success: true, data: out });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  async function search(query, cb) {
    try {
      const url = `${BASE_URL()}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodeURIComponent(
        query
      )}`;
    const html = await fetchHtml(url);
      const items = parseHomeCards(html);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
    }
  }

  async function load(url, cb) {
    try {
      let html = await fetchHtml(url);

      const ogTitle =
        (html.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i) ||
          html.match(/<title>([^<]+)<\/title>/i) ||
          [])[1] || "";
      const title = (ogTitle || "").split("(")[0].trim() || "Unknown";
      const poster =
        (html.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i) || [])[1] || "";
      const bgposter = (html.match(/dar-full_bg[^>]*href=["']([^"']+)/i) || [])[1] || "";
      const trailer = (html.match(/data-vbg=["']([^"']+)/i) || [])[1] || "";
      const about =
        (html.match(
          /id=["']about["'][\s\S]*?<div[^>]*class=["']ta-full_text1["'][^>]*>([\s\S]*?)<\/div>/i
        ) || [])[1] || "";

      const audioLangs = parseAudioLang(html);
      const recommendations = parseRecommendations(html);

      const yearMatch = ogTitle.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      const type = url.includes("/movies/") ? "movie" : "series";
      const tmdbType = type === "series" ? "tv" : "movie";

      const imdbId = (html.match(/tt\d+/i) || [])[0] || "";
      let tmdbId = null;
      if (imdbId) {
        try {
          const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
          const findRes = await http_get(findUrl, {});
          const findJson = safeJsonParse(findRes.body) || {};
          tmdbId =
            (findJson.movie_results && findJson.movie_results[0] && findJson.movie_results[0].id) ||
            (findJson.tv_results && findJson.tv_results[0] && findJson.tv_results[0].id) ||
            null;
        } catch {}
      }

      let cast = [];
      if (tmdbId) {
        try {
          const creditsUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
          const creditsRes = await http_get(creditsUrl, {});
          cast = (safeJsonParse(creditsRes.body)?.cast || []).map(
            (c) =>
              new Actor({
                name: c.name || c.original_name || "",
                role: c.character || "",
                image: c.profile_path ? TMDB_IMAGE_BASE + c.profile_path : "",
              })
          );
        } catch {}
      }

      let meta = null;
      if (imdbId) {
        try {
          const metaUrl = `${CINEMETA_URL}/${type === "series" ? "series" : "movie"}/${imdbId}.json`;
          const metaRes = await http_get(metaUrl, {});
          if (metaRes.body && metaRes.body.trim().startsWith("{")) {
            const parsed = safeJsonParse(metaRes.body);
            meta = parsed ? parsed.meta : null;
          }
        } catch {}
      }

      let description = meta && meta.description ? meta.description : about;
      if (audioLangs) description = description ? `${description} - Audio: ${audioLangs}` : `Audio: ${audioLangs}`;

      const background = (meta && meta.background) || bgposter || poster;
      const genres = meta && meta.genres ? meta.genres : [];

      let player = parsePlayerJs(html); // no login retry to avoid undefined helpers
      const built = player
        ? parseEpisodesFromPlayer(player, meta, type)
        : { episodes: [], movieData: null };

      const item = new MultimediaItem({
        title: (meta && meta.name) ? meta.name : title,
        url,
        posterUrl: (meta && meta.poster) ? meta.poster : poster,
        bannerUrl: background,
        description,
        type,
        year: year || (meta && meta.year ? parseInt(meta.year) : undefined),
        tags: genres,
        episodes: built.episodes,
      });

      if (imdbId) item.imdbId = imdbId;
      if (tmdbId) item.tmdbId = String(tmdbId);
      if (imdbId) item.logoUrl = `${LOGO_BASE}/${imdbId}/img`;
      if (meta && meta.imdbRating) item.score = parseFloat(meta.imdbRating);
      if (meta && meta.app_extras && meta.app_extras.certification)
        item.contentRating = meta.app_extras.certification;
      if (cast.length) item.cast = cast;
      if (recommendations.length) item.recommendations = recommendations;
      if (trailer) item.trailers = [new Trailer({ name: "Trailer", url: trailer })];

      if (type === "movie") {
        const epUrl = built.movieData || JSON.stringify({ streamUrl: "", subtitleTracks: [] });
        item.episodes = [
          new Episode({
            name: "Full Movie",
            url: epUrl,
            season: 1,
            episode: 1,
            posterUrl: item.posterUrl,
          }),
        ];
      }

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }

  async function loadLinks(data, cb) {
    try {
      const payload = safeJsonParse(data) || {};
      const subtitles = Array.isArray(payload.subtitleTracks)
        ? payload.subtitleTracks.map((s) => ({ language: s.language, url: s.subtitleUrl }))
        : [];

      const urls = [];
      if (Array.isArray(payload.streams)) urls.push(...payload.streams.filter(Boolean));
      if (!urls.length && payload.streamUrl) urls.push(payload.streamUrl);

      if (!urls.length)
        return cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs available" });

      const results = urls.map(
        (u) =>
          new StreamResult({
            url: u,
            source: `CinemaCity ${extractQuality(u)}`,
            quality: extractQuality(u),
            headers: { Referer: BASE_URL() },
            subtitles,
          })
      );

      cb({ success: true, data: results });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
    }
  }

  const loadStreams = loadLinks;

  // Exports expected by runtime
  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
  globalThis.loadLinks = loadLinks;
})();
