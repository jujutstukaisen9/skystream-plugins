(function() {
  const BASE_URL = () => (typeof manifest !== "undefined" && manifest.baseUrl) ? manifest.baseUrl : "https://cinemacity.cc";

  const TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
  const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
  const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
  const LOGO_BASE = "https://live.metahub.space/logo/medium";

  const DEFAULT_HEADERS = {
    "Cookie": base64Decode("ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=")
  };

  const MAIN_CATEGORIES = [
    { name: "Movies", path: "movies" },
    { name: "TV Series", path: "tv-series" },
    { name: "Anime", path: "xfsearch/genre/anime" },
    { name: "Asian", path: "xfsearch/genre/asian" },
    { name: "Animation", path: "xfsearch/genre/animation" },
    { name: "Documentary", path: "xfsearch/genre/documentary" }
  ];

  function base64Decode(str) {
    if (!str) return "";
    if (typeof atob === "function") return atob(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf8");
    return "";
  }

  function absUrl(url) {
    if (!url) return "";
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return BASE_URL() + url;
    return url;
  }

  function text(el) {
    return (el && el.textContent ? el.textContent : "").trim();
  }

  function attr(el, name) {
    return el && el.getAttribute ? (el.getAttribute(name) || "") : "";
  }

  function safeJsonParse(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function parseCredits(jsonText) {
    if (!jsonText) return [];
    const root = safeJsonParse(jsonText);
    const cast = root && Array.isArray(root.cast) ? root.cast : [];
    return cast.map(c => new Actor({
      name: c.name || c.original_name || "",
      role: c.character || "",
      image: c.profile_path ? TMDB_IMAGE_BASE + c.profile_path : ""
    })).filter(a => a.name);
  }

  function parseSubtitles(raw) {
    if (!raw || typeof raw !== "string") return [];
    const out = [];
    const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/\[(.+?)\](https?:\/\/[^\s]+)/i);
      if (match) {
        out.push({ language: match[1], subtitleUrl: match[2] });
      }
    }
    return out;
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

  function toSearchResult(el) {
    if (!el) return null;
    if (!el.querySelectorAll) {
      const a = el.querySelector ? el.querySelector("a") : null;
      if (!a) return null;
      const titleRaw = text(a) || attr(a, "title");
      const title = (titleRaw || "").split("(")[0].trim() || "Untitled";
      const href = absUrl(attr(a, "href"));
      const posterEl = el.querySelector && (el.querySelector("img") || el.querySelector("div.dar-short_bg a"));
      const poster = posterEl ? absUrl(attr(posterEl, "src") || attr(posterEl, "href")) : "";
      const type = href.includes("/tv-series/") ? "series" : "movie";
      return new MultimediaItem({ title, url: href, posterUrl: poster, type });
    }

    const anchors = Array.from(el.querySelectorAll("a"));
    const titleLink =
      el.querySelector("a.e-nowrap") ||
      anchors.find(a => (a.textContent || "").trim().length > 2) ||
      anchors[anchors.length - 1];
    if (!titleLink) return null;
    const titleRaw = text(titleLink) || attr(titleLink, "title");
    const title = (titleRaw || "").split("(")[0].trim() || "Untitled";
    const href = absUrl(attr(titleLink, "href"));

    let poster = "";
    const posterEl = el.querySelector("div.dar-short_bg img") || el.querySelector("img");
    if (posterEl) {
      poster = absUrl(attr(posterEl, "src") || attr(posterEl, "data-src") || attr(posterEl, "data-lazy"));
    }
    if (!poster) {
      const coverLink = el.querySelector("div.dar-short_bg a");
      if (coverLink) poster = absUrl(attr(coverLink, "href"));
    }

    const scoreTxt = text(el.querySelector("span.rating-color"));
    let qualityTxt = text(el.querySelector("div.dar-short_bg.e-cover > div span:nth-child(2) > a"));
    if (!qualityTxt) qualityTxt = text(el.querySelector("div.dar-short_bg.e-cover > div > span"));
    const quality = qualityTxt && qualityTxt.toUpperCase().includes("TS") ? "TS" : "HD";
    const type = href.includes("/tv-series/") ? "series" : "movie";
    const item = new MultimediaItem({ title, url: href, posterUrl: poster, type });
    if (scoreTxt) item.score = parseFloat(scoreTxt) || scoreTxt;
    if (quality) item.quality = quality;
    return item;
  }

  function extractImdbId(doc) {
    const nodes = doc.querySelectorAll ? Array.from(doc.querySelectorAll("div.ta-full_rating1 > div")) : [];
    for (const n of nodes) {
      const onclick = attr(n, "onclick");
      const match = onclick.match(/tt\d+/i);
      if (match) return match[0];
    }
    return "";
  }

  function parsePlayerJs(doc, rawHtml) {
    const scripts = doc.querySelectorAll ? Array.from(doc.querySelectorAll("script")) : [];
    for (const s of scripts) {
      const textContent = (s.textContent || s.innerHTML || s.data || "");
      if (!textContent.includes("atob(")) continue;
      const match = textContent.match(/atob\((['"])(.*?)\1\)/);
      if (!match) continue;
      const decoded = base64Decode(match[2]);
      const start = decoded.indexOf("new Playerjs(");
      if (start === -1) continue;
      const after = decoded.slice(start + "new Playerjs(".length);
      const end = after.lastIndexOf(");");
      const jsonText = (end === -1 ? after : after.slice(0, end)).trim();
      const player = safeJsonParse(jsonText);
      if (player) return player;
    }

    if (typeof rawHtml === "string") {
      const regex = /atob\("([^"]+)"\)/g;
      let m;
      while ((m = regex.exec(rawHtml)) !== null) {
        const decoded = base64Decode(m[1]);
        const start = decoded.indexOf("new Playerjs(");
        if (start === -1) continue;
        const after = decoded.slice(start + "new Playerjs(".length);
        const end = after.lastIndexOf(");");
        const jsonText = (end === -1 ? after : after.slice(0, end)).trim();
        const player = safeJsonParse(jsonText);
        if (player) return player;
      }
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

  function buildEpisodes(player, meta, type) {
    const fileArray = normalizeFileArray(player ? player.file : null);
    const episodeMetaMap = {};
    const videos = meta && Array.isArray(meta.videos) ? meta.videos : [];
    for (const v of videos) {
      if (v.season != null && v.episode != null) {
        episodeMetaMap[`${v.season}:${v.episode}`] = v;
      }
    }

    const episodes = [];
    let movieData = null;

    const isSeries = type === "series" && fileArray.some(f => f && f.folder);
    if (!isSeries) {
      const first = fileArray[0] || {};
      const streamUrl = typeof first.file === "string" ? first.file : "";
      const subtitleRaw = typeof (player && player.subtitle) === "string"
        ? player.subtitle
        : (typeof first.subtitle === "string" ? first.subtitle : "");
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
          name: (epMeta && epMeta.name) ? epMeta.name : `S${seasonNumber}E${episodeNumber}`,
          url: epData,
          season: seasonNumber,
          episode: episodeNumber,
          description: epMeta && epMeta.overview ? epMeta.overview : "",
          posterUrl: epMeta && epMeta.thumbnail ? epMeta.thumbnail : ""
        });
        episodes.push(ep);
      }
    }

    episodes.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    return { episodes, movieData };
  }

  async function getHome(cb) {
    try {
      const out = {};
      for (const cat of MAIN_CATEGORIES) {
        const url = `${BASE_URL()}/${cat.path}`;
        const res = await http_get(url, DEFAULT_HEADERS);
        const doc = await parseHtml(res.body);
        const cards = doc.querySelectorAll ? Array.from(doc.querySelectorAll("div.dar-short_item")) : [];
        const items = cards.map(toSearchResult).filter(Boolean);
        if (items.length) out[cat.name] = items;
      }
      cb({ success: true, data: out });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  async function search(query, cb) {
    try {
      const url = `${BASE_URL()}/index.php?do=search&subaction=search&search_start=1&full_search=0&story=${encodeURIComponent(query)}`;
      const res = await http_get(url, DEFAULT_HEADERS);
      const doc = await parseHtml(res.body);
      const cards = doc.querySelectorAll ? Array.from(doc.querySelectorAll("div.dar-short_item")) : [];
      const items = cards.map(toSearchResult).filter(Boolean);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
    }
  }

  async function load(url, cb) {
    try {
      const res = await http_get(url, DEFAULT_HEADERS);
      const doc = await parseHtml(res.body);

      const ogTitle = attr(doc.querySelector("meta[property='og:title']"), "content") || (res.body.match(/<title>([^<]+)<\/title>/i) || [])[1] || "";
      const title = (ogTitle || "").split("(")[0].trim() || "Unknown";
      const poster = attr(doc.querySelector("meta[property='og:image']"), "content") || (res.body.match(/property=['\"]og:image['\"]\\s+content=['\"]([^'\"]+)['\"]/i) || [])[1] || "";
      const bgposter = attr(doc.querySelector("div.dar-full_bg a"), "href");
      const trailer = attr(doc.querySelector("div.dar-full_bg.e-cover > div"), "data-vbg");
      const about = text(doc.querySelector("#about div.ta-full_text1"));

      let audioLangs = "";
      const lis = doc.querySelectorAll ? Array.from(doc.querySelectorAll("li")) : [];
      for (const li of lis) {
        const spans = li.querySelectorAll ? Array.from(li.querySelectorAll("span")) : [];
        const label = spans[0] ? text(spans[0]).toLowerCase() : "";
        if (label === "audio language") {
          const langLinks = spans[1] ? Array.from(spans[1].querySelectorAll("a")) : [];
          audioLangs = langLinks.map(a => text(a)).filter(Boolean).join(", ");
          break;
        }
      }

      const recommendations = [];
      const recs = doc.querySelectorAll ? Array.from(doc.querySelectorAll("div.ta-rel > div.ta-rel_item")) : [];
      for (const r of recs) {
        const a = r.querySelector ? r.querySelector("a") : null;
        const rTitle = text(a);
        const rHref = absUrl(attr(a, "href"));
        const rPoster = absUrl(attr(r.querySelector("div > a"), "href"));
        const rScoreTxt = text(r.querySelector("span.rating-color1"));
        if (!rTitle || !rHref) continue;
        const item = new MultimediaItem({ title: rTitle, url: rHref, posterUrl: rPoster, type: rHref.includes("/tv-series/") ? "series" : "movie" });
        if (rScoreTxt) item.score = parseFloat(rScoreTxt) || rScoreTxt;
        recommendations.push(item);
      }

      const yearMatch = ogTitle.match(/\((\d{4})\)/);
      const year = yearMatch ? parseInt(yearMatch[1]) : null;
      const type = url.includes("/movies/") ? "movie" : "series";
      const tmdbType = type === "series" ? "tv" : "movie";

      const imdbId = extractImdbId(doc);
      let tmdbId = null;
      if (imdbId) {
        try {
          const findUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
          const findRes = await http_get(findUrl, {});
          const findJson = safeJsonParse(findRes.body) || {};
          tmdbId = (findJson.movie_results && findJson.movie_results[0] && findJson.movie_results[0].id)
            || (findJson.tv_results && findJson.tv_results[0] && findJson.tv_results[0].id)
            || null;
        } catch {}
      }

      let cast = [];
      if (tmdbId) {
        try {
          const creditsUrl = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`;
          const creditsRes = await http_get(creditsUrl, {});
          cast = parseCredits(creditsRes.body);
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

      const player = parsePlayerJs(doc, res.body);
      const built = player ? buildEpisodes(player, meta, type) : { episodes: [], movieData: null };

      const item = new MultimediaItem({
        title: (meta && meta.name) ? meta.name : title,
        url,
        posterUrl: (meta && meta.poster) ? meta.poster : poster,
        bannerUrl: background,
        description,
        type,
        year: year || (meta && meta.year ? parseInt(meta.year) : undefined),
        tags: genres,
        episodes: built.episodes
      });

      if (imdbId) item.imdbId = imdbId;
      if (tmdbId) item.tmdbId = String(tmdbId);
      if (imdbId) item.logoUrl = `${LOGO_BASE}/${imdbId}/img`;
      if (meta && meta.imdbRating) item.score = parseFloat(meta.imdbRating);
      if (meta && meta.app_extras && meta.app_extras.certification) item.contentRating = meta.app_extras.certification;
      if (cast.length) item.cast = cast;
      if (recommendations.length) item.recommendations = recommendations;
      if (trailer) item.trailers = [new Trailer({ name: "Trailer", url: trailer })];

      if (type === "movie") {
        const epUrl = built.movieData || JSON.stringify({ streamUrl: "", subtitleTracks: [] });
        item.episodes = [new Episode({ name: "Full Movie", url: epUrl, season: 1, episode: 1, posterUrl: item.posterUrl })];
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
        ? payload.subtitleTracks.map(s => ({ language: s.language, url: s.subtitleUrl }))
        : [];

      const urls = [];
      if (Array.isArray(payload.streams)) urls.push(...payload.streams.filter(Boolean));
      if (!urls.length && payload.streamUrl) urls.push(payload.streamUrl);

      if (!urls.length) {
        cb({ success: false, errorCode: "NO_STREAMS", message: "No stream URLs available" });
        return;
      }

      const results = urls.map(u => new StreamResult({
        url: u,
        source: `CinemaCity ${extractQuality(u)}`,
        quality: extractQuality(u),
        headers: { Referer: BASE_URL() },
        subtitles
      }));

      cb({ success: true, data: results });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
    }
  }

  const loadStreams = loadLinks;

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
  globalThis.loadLinks = loadLinks;
})();
