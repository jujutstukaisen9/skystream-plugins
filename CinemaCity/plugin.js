(function () {
  /**
   * @type {import('@skystream/sdk').Manifest}
   */
  // manifest is injected at runtime by SkyStream

  // ----------------------------------------------------------------
  // Constants
  // ----------------------------------------------------------------
  var TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";
  var CINEMETA_URL    = "https://v3-cinemeta.strem.io/meta";
  var TMDB_API_KEY    = "1865f43a0549ca50d341dd9ab8b29f49";

  // Decoded from original Kotlin base64:
  // ZGxlX3VzZXJfaWQ9MzI3Mjk7IGRsZV9wYXNzd29yZD04OTQxNzFjNmE4ZGFiMThlZTU5NGQ1YzY1MjAwOWEzNTs=
  // -> dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;
  var SITE_COOKIE = "dle_user_id=32729; dle_password=894171c6a8dab18ee594d5c652009a35;";

  var HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Cookie": SITE_COOKIE
  };

  // ----------------------------------------------------------------
  // Utility helpers
  // ----------------------------------------------------------------
  function fixUrl(u) {
    if (!u) return "";
    u = String(u).trim();
    if (u.startsWith("//"))    return "https:" + u;
    if (u.startsWith("/"))     return manifest.baseUrl.replace(/\/$/, "") + u;
    if (!u.startsWith("http")) return manifest.baseUrl.replace(/\/$/, "") + "/" + u;
    return u;
  }

  function decodeHtml(h) {
    if (!h) return "";
    return String(h)
      .replace(/&amp;/g,  "&")
      .replace(/&lt;/g,   "<")
      .replace(/&gt;/g,   ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#(\d+);/g, function(_, d) { return String.fromCharCode(parseInt(d, 10)); });
  }

  function textOf(el) {
    if (!el) return "";
    return decodeHtml((el.textContent || "").replace(/\s+/g, " ").trim());
  }

  function getAttr(el) {
    if (!el || !el.getAttribute) return "";
    var attrs = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < attrs.length; i++) {
      var v = el.getAttribute(attrs[i]);
      if (v && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function safeAtob(str) {
    if (!str) return "";
    try {
      var s = String(str).trim().replace(/-/g, "+").replace(/_/g, "/");
      while (s.length % 4 !== 0) s += "=";
      return atob(s);
    } catch (_) {
      try { return atob(str); } catch (__) { return ""; }
    }
  }

  function getQualityLabel(url) {
    var u = String(url || "").toLowerCase();
    if (u.indexOf("2160p") !== -1 || u.indexOf("4k") !== -1) return "4K";
    if (u.indexOf("1440p") !== -1) return "1440p";
    if (u.indexOf("1080p") !== -1) return "1080p";
    if (u.indexOf("720p")  !== -1) return "720p";
    if (u.indexOf("480p")  !== -1) return "480p";
    if (u.indexOf("360p")  !== -1) return "360p";
    return "Auto";
  }

  // ----------------------------------------------------------------
  // TMDB ID lookup via IMDb ID
  // ----------------------------------------------------------------
  async function tmdbIdFromImdb(imdbId, mediaType) {
    try {
      var res = await http_get(
        "https://api.themoviedb.org/3/find/" + imdbId +
        "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id"
      );
      var data = JSON.parse(res.body);
      var movieRes = data.movie_results;
      var tvRes    = data.tv_results;
      if (mediaType === "tv") {
        return (tvRes    && tvRes[0]    ? tvRes[0].id    : null) ||
               (movieRes && movieRes[0] ? movieRes[0].id : null) || null;
      }
      return (movieRes && movieRes[0] ? movieRes[0].id : null) ||
             (tvRes    && tvRes[0]    ? tvRes[0].id    : null) || null;
    } catch (_) {
      return null;
    }
  }

  // ----------------------------------------------------------------
  // Parse TMDB credits JSON into Actor[]
  // ----------------------------------------------------------------
  function parseCredits(jsonText) {
    if (!jsonText) return [];
    try {
      var data = JSON.parse(jsonText);
      var cast = data.cast || [];
      return cast.slice(0, 20).map(function(c) {
        return new Actor({
          name:  c.name || c.original_name || "",
          role:  c.character || "",
          image: c.profile_path ? TMDB_IMAGE_BASE + c.profile_path : undefined
        });
      });
    } catch (_) { return []; }
  }

  // ----------------------------------------------------------------
  // Subtitle string parser
  // Format: "[English]https://url,[Spanish]https://url2"
  // ----------------------------------------------------------------
  function parseSubtitles(raw) {
    if (!raw) return [];
    var tracks  = [];
    var entries = String(raw).split(",");
    for (var i = 0; i < entries.length; i++) {
      var m = /\[(.+?)\](https?:\/\/.+)/.exec(entries[i].trim());
      if (m) tracks.push({ language: m[1], subtitleUrl: m[2] });
    }
    return tracks;
  }

  // ----------------------------------------------------------------
  // PlayerJS decoder
  //
  // Mirrors Kotlin logic exactly:
  //   1. doc.select("script:containsData(atob)").getOrNull(1)
  //      → collect all <script> blocks containing "atob(", take index 1
  //   2. base64Decode(script.substringAfter('atob("').substringBefore('")'))
  //   3. Parse JSON: content between "new Playerjs(" and last ");"
  // ----------------------------------------------------------------
  function decodePlayerJs(html) {
    var scriptRe    = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    var atobScripts = [];
    var m;
    while ((m = scriptRe.exec(html)) !== null) {
      if (m[1].indexOf("atob(") !== -1) atobScripts.push(m[1]);
    }

    // Kotlin getOrNull(1) = 0-indexed index 1 = second script with atob
    var playerScript = atobScripts[1];
    if (!playerScript) return null;

    // Extract base64 between atob(" and ")
    var b64m = /atob\(["']([^"']+)["']\)/.exec(playerScript);
    if (!b64m) return null;

    var decoded;
    try { decoded = safeAtob(b64m[1]); } catch (_) { return null; }

    // Extract JSON: between "new Playerjs(" and last ");"
    var marker    = "new Playerjs(";
    var jsonStart = decoded.indexOf(marker);
    if (jsonStart === -1) return null;
    jsonStart += marker.length;

    var jsonEnd = decoded.lastIndexOf(");");
    if (jsonEnd <= jsonStart) return null;

    try {
      return JSON.parse(decoded.substring(jsonStart, jsonEnd));
    } catch (_) { return null; }
  }

  // ----------------------------------------------------------------
  // Parse a div.dar-short_item element into a MultimediaItem
  // Mirrors Kotlin Element.toSearchResult()
  // ----------------------------------------------------------------
  function parseSearchItem(el) {
    if (!el) return null;

    // First <a> in element -> title (text before "(") and href
    var anchor = el.querySelector("a");
    if (!anchor) return null;

    var rawTitle = textOf(anchor).split("(")[0].trim();
    if (!rawTitle) return null;

    var href = fixUrl(getAttr(anchor, "href"));
    if (!href) return null;

    // div.dar-short_bg a -> poster URL (stored as link href in this WordPress theme)
    var bgEl      = el.querySelector("div.dar-short_bg a");
    var posterUrl = bgEl ? fixUrl(getAttr(bgEl, "href")) : "";

    var type = href.toLowerCase().indexOf("/tv-series/") !== -1 ? "series" : "movie";

    return new MultimediaItem({ title: rawTitle, url: href, posterUrl: posterUrl, type: type });
  }

  // ----------------------------------------------------------------
  // getHome
  // Mirrors Kotlin mainPageOf() sections + adds "Trending" hero carousel
  // ----------------------------------------------------------------
  async function getHome(cb) {
    try {
      var sections = [
        { name: "Trending",    path: ""                           },
        { name: "Movies",      path: "movies"                     },
        { name: "TV Series",   path: "tv-series"                  },
        { name: "Anime",       path: "xfsearch/genre/anime"       },
        { name: "Asian",       path: "xfsearch/genre/asian"       },
        { name: "Animation",   path: "xfsearch/genre/animation"   },
        { name: "Documentary", path: "xfsearch/genre/documentary" }
      ];

      var homeData = {};

      for (var i = 0; i < sections.length; i++) {
        var sec = sections[i];
        try {
          var url = sec.path
            ? manifest.baseUrl + "/" + sec.path
            : manifest.baseUrl;
          var res = await http_get(url, HEADERS);
          var doc = await parseHtml(res.body);
          var rawItems = Array.from(doc.querySelectorAll("div.dar-short_item"));
          var items    = rawItems.map(parseSearchItem).filter(Boolean).slice(0, 24);
          if (items.length > 0) homeData[sec.name] = items;
        } catch (e) {
          console.error("[CinemaCity] Section [" + sec.name + "] failed: " +
            String(e && e.message ? e.message : e));
        }
      }

      cb({ success: true, data: homeData });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR",
           message: String(e && e.message ? e.message : e) });
    }
  }

  // ----------------------------------------------------------------
  // search
  // Mirrors Kotlin search() -> /index.php?do=search&subaction=search&...
  // ----------------------------------------------------------------
  async function search(query, cb) {
    try {
      var encoded = encodeURIComponent(String(query || "").trim());
      var url = manifest.baseUrl +
        "/index.php?do=search&subaction=search&search_start=1&full_search=0&story=" + encoded;
      var res = await http_get(url, HEADERS);
      var doc = await parseHtml(res.body);
      var items = Array.from(doc.querySelectorAll("div.dar-short_item"))
        .map(parseSearchItem)
        .filter(Boolean);
      cb({ success: true, data: items });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR",
           message: String(e && e.message ? e.message : e) });
    }
  }

  // ----------------------------------------------------------------
  // load
  // Full feature-parity with Kotlin load():
  //   - og:title / og:image / year
  //   - Audio language from <li> metadata block
  //   - Description from #about div.ta-full_text1
  //   - Recommendations from div.ta-rel
  //   - IMDb ID from div.ta-full_rating1 > div[onclick]
  //   - TMDB ID lookup + credits
  //   - Cinemeta metadata enrichment
  //   - PlayerJS base64 decode + JSON parse
  //   - TV Series: season/episode folder traversal + Cinemeta ep metadata
  //   - Movie: single streamUrl
  //   - Subtitle track parsing [Lang]URL format
  // ----------------------------------------------------------------
  async function load(url, cb) {
    try {
      var res  = await http_get(url, HEADERS);
      var html = res.body;
      var doc  = await parseHtml(html);

      // --- Basic metadata ---
      var ogTitleEl = doc.querySelector("meta[property='og:title']");
      var ogTitle   = getAttr(ogTitleEl, "content") || "";
      var title     = ogTitle.split("(")[0].trim() || "Unknown";
      var yearM     = /\((\d{4})\)/.exec(ogTitle);
      var year      = yearM ? parseInt(yearM[1]) : null;

      var ogImageEl = doc.querySelector("meta[property='og:image']");
      var poster    = getAttr(ogImageEl, "content") || "";

      var bgLinkEl  = doc.querySelector("div.dar-full_bg a");
      var bgposter  = bgLinkEl ? fixUrl(getAttr(bgLinkEl, "href")) : poster;

      var trailerEl = doc.querySelector("div.dar-full_bg.e-cover > div");
      var trailer   = trailerEl ? getAttr(trailerEl, "data-vbg") : "";

      // --- Audio languages ---
      var audioLanguages = null;
      var liEls = Array.from(doc.querySelectorAll("li"));
      for (var li = 0; li < liEls.length; li++) {
        var spans = liEls[li].querySelectorAll("span");
        if (spans.length >= 1 && textOf(spans[0]).toLowerCase() === "audio language") {
          if (spans.length >= 2) {
            var langAnchors = Array.from(spans[1].querySelectorAll("a"));
            var langs = langAnchors.map(textOf).filter(Boolean);
            if (langs.length) audioLanguages = langs.join(", ");
          }
          break;
        }
      }

      // --- Description ---
      var descEl       = doc.querySelector("#about div.ta-full_text1");
      var descriptions = descEl ? textOf(descEl) : "";

      // --- Recommendations ---
      var recEls = Array.from(doc.querySelectorAll("div.ta-rel > div.ta-rel_item"));
      var recommendations = recEls.map(function(el) {
        var a       = el.querySelector("a");
        var rTitle  = a ? textOf(a).split("(")[0].trim() : "";
        var rHref   = a ? fixUrl(getAttr(a, "href")) : "";
        var rPEl    = el.querySelector("div > a");
        var rPoster = rPEl ? fixUrl(getAttr(rPEl, "href")) : "";
        if (!rTitle || !rHref) return null;
        return new MultimediaItem({ title: rTitle, url: rHref, posterUrl: rPoster, type: "movie" });
      }).filter(Boolean);

      // --- Content type: movie vs series ---
      var tvtype   = url.toLowerCase().indexOf("/movies/") !== -1 ? "movie" : "series";
      var tmdbmeta = tvtype === "series" ? "tv" : "movie";

      // --- IMDb ID from rating div onclick attributes ---
      var imdbId = null;
      var ratingDivs = Array.from(doc.querySelectorAll("div.ta-full_rating1 > div"));
      for (var rd = 0; rd < ratingDivs.length; rd++) {
        var onclick = getAttr(ratingDivs[rd], "onclick");
        var idm = /tt\d+/.exec(onclick);
        if (idm) { imdbId = idm[0]; break; }
      }

      // --- TMDB ID ---
      var tmdbId = null;
      if (imdbId) tmdbId = await tmdbIdFromImdb(imdbId, tmdbmeta);

      // --- Logo from metahub ---
      var logoUrl = imdbId
        ? "https://live.metahub.space/logo/medium/" + imdbId + "/img"
        : null;

      // --- TMDB credits ---
      var castList = [];
      if (tmdbId) {
        try {
          var credRes = await http_get(
            "https://api.themoviedb.org/3/" + tmdbmeta + "/" + tmdbId +
            "/credits?api_key=" + TMDB_API_KEY + "&language=en-US"
          );
          castList = parseCredits(credRes.body);
        } catch (_) {}
      }

      // --- Cinemeta metadata ---
      var meta = null;
      if (imdbId) {
        try {
          var cineType = tvtype === "series" ? "series" : "movie";
          var cineRes  = await http_get(
            CINEMETA_URL + "/" + cineType + "/" + imdbId + ".json"
          );
          if (cineRes.body && cineRes.body.trim().charAt(0) === "{") {
            var parsed = JSON.parse(cineRes.body);
            meta = (parsed && parsed.meta) ? parsed.meta : null;
          }
        } catch (_) {}
      }

      var description   = (meta && meta.description)  || descriptions;
      var background    = (meta && meta.background)    || bgposter;
      var genres        = (meta && meta.genres)        || [];
      var score         = (meta && meta.imdbRating)    ? parseFloat(meta.imdbRating) : null;
      var contentRating = (meta && meta.appExtras && meta.appExtras.certification) || null;
      var finalTitle    = (meta && meta.name)          || title;
      var finalYear     = year || (meta && meta.year ? parseInt(meta.year) : null);
      var finalPlot     = audioLanguages
        ? description + " - Audio: " + audioLanguages
        : description;

      // Build episode meta map from Cinemeta videos
      var epMetaMap = {};
      if (meta && meta.videos) {
        for (var vi = 0; vi < meta.videos.length; vi++) {
          var v = meta.videos[vi];
          if (v.season != null && v.episode != null) {
            epMetaMap[v.season + ":" + v.episode] = v;
          }
        }
      }

      // Trailers
      var trailers = trailer ? [new Trailer({ url: trailer })] : undefined;

      // ---- PlayerJS decode ----
      var playerJson = decodePlayerJs(html);
      if (!playerJson) {
        return cb({
          success: false,
          errorCode: "PLAYER_NOT_FOUND",
          message: "PlayerJS block not found on this page (may require login or is torrent-only)"
        });
      }

      // Normalise file array
      var fileArray = [];
      var rawFile   = playerJson.file;
      if (Array.isArray(rawFile)) {
        fileArray = rawFile;
      } else if (typeof rawFile === "string") {
        var fv = rawFile.trim();
        if (fv.charAt(0) === "[") {
          try { fileArray = JSON.parse(fv); } catch (_) { fileArray = []; }
        } else if (fv.charAt(0) === "{") {
          try { fileArray = [JSON.parse(fv)]; } catch (_) { fileArray = []; }
        } else if (fv) {
          fileArray = [{ file: fv }];
        }
      } else if (rawFile && typeof rawFile === "object") {
        fileArray = [rawFile];
      }

      var SEASON_RE  = /Season\s*(\d+)/i;
      var EPISODE_RE = /Episode\s*(\d+)/i;

      // ---- TV Series branch ----
      if (tvtype === "series") {
        var episodeList = [];

        for (var si = 0; si < fileArray.length; si++) {
          var seasonObj = fileArray[si];
          var sm = SEASON_RE.exec(seasonObj.title || "");
          if (!sm) continue;
          var seasonNumber = parseInt(sm[1]);
          var epFolder = Array.isArray(seasonObj.folder) ? seasonObj.folder : [];

          for (var ei = 0; ei < epFolder.length; ei++) {
            var epObj = epFolder[ei];
            var em = EPISODE_RE.exec(epObj.title || "");
            if (!em) continue;
            var episodeNumber = parseInt(em[1]);

            // Collect stream URLs: direct file + nested folder sources
            var streamUrls = [];
            if (epObj.file) streamUrls.push(epObj.file);
            if (Array.isArray(epObj.folder)) {
              for (var fi = 0; fi < epObj.folder.length; fi++) {
                if (epObj.folder[fi] && epObj.folder[fi].file) {
                  streamUrls.push(epObj.folder[fi].file);
                }
              }
            }
            if (!streamUrls.length) continue;

            var metaKey = seasonNumber + ":" + episodeNumber;
            var epMeta  = epMetaMap[metaKey] || null;
            var epSubs  = parseSubtitles(epObj.subtitle || "");

            episodeList.push(new Episode({
              name: epMeta
                ? (epMeta.name || ("S" + seasonNumber + "E" + episodeNumber))
                : ("S" + seasonNumber + "E" + episodeNumber),
              url:         JSON.stringify({ streams: streamUrls, subtitleTracks: epSubs }),
              season:      seasonNumber,
              episode:     episodeNumber,
              description: epMeta ? (epMeta.overview  || null) : null,
              posterUrl:   epMeta ? (epMeta.thumbnail || null) : null,
              airDate:     epMeta ? (epMeta.released  || null) : null
            }));
          }
        }

        return cb({
          success: true,
          data: new MultimediaItem({
            title:         finalTitle,
            url:           url,
            posterUrl:     poster,
            bannerUrl:     background,
            logoUrl:       logoUrl,
            type:          "series",
            description:   finalPlot,
            year:          finalYear,
            score:         score,
            contentRating: contentRating,
            cast:          castList,
            tags:          genres,
            episodes:      episodeList,
            recommendations: recommendations,
            trailers:      trailers
          })
        });
      }

      // ---- Movie branch ----
      var firstObj   = fileArray[0] || null;
      var hasFolder  = firstObj && Array.isArray(firstObj.folder);
      var movieStreamUrl = (!hasFolder && firstObj && firstObj.file) ? firstObj.file : null;

      if (!movieStreamUrl) {
        return cb({
          success: false,
          errorCode: "STREAM_NOT_FOUND",
          message: "No direct stream URL found in PlayerJS for this movie"
        });
      }

      // Movie subtitles
      var rawSub    = playerJson.subtitle || (firstObj && firstObj.subtitle) || "";
      var movieSubs = parseSubtitles(rawSub);

      return cb({
        success: true,
        data: new MultimediaItem({
          title:         finalTitle,
          url:           url,
          posterUrl:     poster,
          bannerUrl:     background,
          logoUrl:       logoUrl,
          type:          "movie",
          description:   finalPlot,
          year:          finalYear,
          score:         score,
          contentRating: contentRating,
          cast:          castList,
          tags:          genres,
          recommendations: recommendations,
          trailers:      trailers,
          episodes: [
            new Episode({
              name:      finalTitle,
              url:       JSON.stringify({ streamUrl: movieStreamUrl, subtitleTracks: movieSubs }),
              season:    1,
              episode:   1,
              posterUrl: poster
            })
          ]
        })
      });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR",
           message: String(e && e.message ? e.message : e) });
    }
  }

  // ----------------------------------------------------------------
  // loadStreams
  // Parses the JSON payload created by load() and returns StreamResult[].
  //
  // Handles both payload shapes:
  //   { streams: [...], subtitleTracks: [...] }   <- TV Series episode
  //   { streamUrl: "...", subtitleTracks: [...] }  <- Movie
  //
  // Mirrors Kotlin loadLinks() — infers quality from URL path tokens
  // ----------------------------------------------------------------
  async function loadStreams(data, cb) {
    try {
      var obj = JSON.parse(String(data || "{}"));

      // Collect stream URLs
      var streamUrls = [];
      if (Array.isArray(obj.streams)) {
        for (var i = 0; i < obj.streams.length; i++) {
          var su = obj.streams[i];
          if (su && String(su).trim()) streamUrls.push(String(su).trim());
        }
      } else if (obj.streamUrl && String(obj.streamUrl).trim()) {
        streamUrls.push(String(obj.streamUrl).trim());
      }

      if (!streamUrls.length) {
        return cb({ success: true, data: [] });
      }

      // Build subtitle list for StreamResult
      var subtitleTracks = Array.isArray(obj.subtitleTracks) ? obj.subtitleTracks : [];
      var subtitles = subtitleTracks
        .filter(function(s) { return s && s.subtitleUrl; })
        .map(function(s) {
          return {
            url:   s.subtitleUrl,
            label: s.language || "Unknown",
            lang:  s.language || "unknown"
          };
        });

      // One StreamResult per URL
      var results = streamUrls.map(function(streamUrl) {
        var quality = getQualityLabel(streamUrl);
        return new StreamResult({
          url:      streamUrl,
          quality:  quality,
          source:   "CinemaCity" + (quality !== "Auto" ? " " + quality : ""),
          headers: {
            "Referer":    manifest.baseUrl + "/",
            "User-Agent": HEADERS["User-Agent"]
          },
          subtitles: subtitles.length ? subtitles : undefined
        });
      });

      cb({ success: true, data: results });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR",
           message: String(e && e.message ? e.message : e) });
    }
  }

  // ----------------------------------------------------------------
  // Export to SkyStream runtime
  // ----------------------------------------------------------------
  globalThis.getHome     = getHome;
  globalThis.search      = search;
  globalThis.load        = load;
  globalThis.loadStreams  = loadStreams;
})();
