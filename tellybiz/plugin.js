(function () {
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
  var BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": manifest.baseUrl + "/"
  };

  function normalizeUrl(url, base) {
    if (!url) return "";
    var raw = String(url).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    var root = String(base || manifest.baseUrl).replace(/\/+$/, "");
    if (raw.startsWith("/")) return root + raw;
    return root + "/" + raw.replace(/^\/+/, "");
  }

  function resolveUrl(base, next) {
    try {
      return new URL(String(next || ""), String(base || manifest.baseUrl)).toString();
    } catch (_) {
      return normalizeUrl(next, manifest.baseUrl);
    }
  }

  function htmlDecode(text) {
    if (!text) return "";
    return String(text)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#(\d+);/g, function (_, n) {
        return String.fromCharCode(parseInt(n, 10));
      });
  }

  function safeText(el) {
    if (!el) return "";
    return htmlDecode((el.textContent || "").replace(/\s+/g, " ").trim());
  }

  function getAttr(el) {
    if (!el) return "";
    for (var i = 1; i < arguments.length; i++) {
      var v = el.getAttribute(arguments[i]);
      if (v && String(v).trim()) return String(v).trim();
    }
    return "";
  }

  function cleanTitle(raw) {
    return htmlDecode(String(raw || "")).replace(/\s+/g, " ").trim();
  }

  function parseYear(text) {
    var m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : undefined;
  }

  function extractQuality(text) {
    var t = String(text || "").toLowerCase();
    if (t.indexOf("2160") > -1 || t.indexOf("4k") > -1) return "4K";
    if (t.indexOf("1080") > -1) return "1080p";
    if (t.indexOf("720") > -1) return "720p";
    if (t.indexOf("480") > -1) return "480p";
    if (t.indexOf("360") > -1) return "360p";
    if (t.indexOf("700mb") > -1 || t.indexOf("700 mb") > -1) return "700MB";
    return "Auto";
  }

  function request(url, headers) {
    return http_get(url, {
      headers: Object.assign({}, BASE_HEADERS, headers || {})
    });
  }

  function parseMovieCards(doc) {
    var cards = Array.from(doc.querySelectorAll("a.movie-card"));
    var items = [];
    var seen = {};

    for (var i = 0; i < cards.length; i++) {
      var a = cards[i];
      var href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
      if (!href || seen[href]) continue;

      var img = a.querySelector("img.movie-poster") || a.querySelector("img");
      var titleEl = a.querySelector("h3.movie-title") || a.querySelector(".movie-title") || a.querySelector("h3");
      var yearEl = a.querySelector(".movie-year");
      var ratingEl = a.querySelector(".rating-badge");

      var title = cleanTitle(safeText(titleEl));
      if (!title) title = cleanTitle(getAttr(img, "alt"));
      if (!title) continue;

      var posterUrl = getAttr(img, "src", "data-src") || "";
      var year = parseYear(safeText(yearEl));

      seen[href] = true;
      items.push(new MultimediaItem({
        title: title,
        url: href,
        posterUrl: posterUrl,
        type: "movie",
        contentType: "movie"
      }));
    }
    return items;
  }

  function extractRedirectFromHtml(html, currentUrl) {
    var text = String(html || "");
    var m;

    m = text.match(/<meta[^>]+http-equiv\s*=\s*["']refresh["'][^>]+content\s*=\s*["']\d+;\s*url=([^"'>]+)["']/i);
    if (!m) m = text.match(/content\s*=\s*["']\d+;\s*url=([^"'>]+)["'][^>]+http-equiv\s*=\s*["']refresh["']/i);
    if (m && m[1]) return resolveUrl(currentUrl, htmlDecode(m[1].trim()));

    m = text.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
    if (m && m[1]) return resolveUrl(currentUrl, htmlDecode(m[1].trim()));

    m = text.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i);
    if (m && m[1]) return resolveUrl(currentUrl, htmlDecode(m[1].trim()));

    return "";
  }

  function extractVideoUrls(html, baseUrl) {
    var raw = String(html || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");

    var out = [];
    var seen = {};
    var patterns = [
      /<source[^>]+src\s*=\s*["']([^"']+)["']/gi,
      /<video[^>]+src\s*=\s*["']([^"']+)["']/gi,
      /(?:file|src|source|video_url|downloadUrl|fileUrl|streamUrl)\s*[:=]\s*["']([^"']+)["']/gi,
      /["']((?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4|mkv)(?:\?[^"'\s<>]*)?)["']/gi,
      /((?:https?:)\/\/[^\s"'<>]+\.(?:m3u8|mp4|mkv)(?:\?[^\s"'<>]*)?)/gi,
      /href\s*=\s*["']((?:https?:)?\/\/[^"']+\.(?:m3u8|mp4|mkv)[^"']*)["']/gi,
      /window\.open\(\s*["'](https?:\/\/[^"']+)["']/gi
    ];

    for (var p = 0; p < patterns.length; p++) {
      var rx = patterns[p];
      var m;
      while ((m = rx.exec(raw)) !== null) {
        var u = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
        if (u && !seen[u] && !/\.js(\?|$)/i.test(u) && !/\.css(\?|$)/i.test(u)) {
          seen[u] = true;
          out.push(u);
        }
      }
    }
    return out;
  }

  function extractIframeSrc(html, baseUrl) {
    var out = [];
    var seen = {};
    var rx = /<iframe[^>]+src\s*=\s*["']([^"']+)["']/gi;
    var m;
    while ((m = rx.exec(String(html || ""))) !== null) {
      var u = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
      if (u && !seen[u] && !/ads|banner|google|facebook|cloudflare|wpadmngr/i.test(u)) {
        seen[u] = true;
        out.push(u);
      }
    }
    return out;
  }

  async function fetchDetailPage(url) {
    var res;
    try {
      res = await request(url);
    } catch (_) {
      return { url: url, html: "" };
    }
    var html = String(res && res.body ? res.body : "");

    if (/class\s*=\s*["']movie-title["']/i.test(html) || /class\s*=\s*["']movie-header["']/i.test(html)) {
      return { url: url, html: html };
    }

    var redirect = extractRedirectFromHtml(html, url);
    if (redirect && redirect !== url) {
      try {
        var res2 = await request(redirect);
        return { url: redirect, html: String(res2 && res2.body ? res2.body : "") };
      } catch (_) {
        return { url: url, html: html };
      }
    }

    return { url: url, html: html };
  }

  async function resolveRedirectChain(startUrl) {
    var current = startUrl;
    var visited = {};
    var lastBody = "";

    for (var i = 0; i < 8; i++) {
      if (!current || visited[current]) break;
      visited[current] = true;

      var res;
      try {
        res = await request(current, { "Referer": manifest.baseUrl + "/" });
      } catch (_) {
        break;
      }

      var body = String(res && res.body ? res.body : "");
      lastBody = body;

      var videos = extractVideoUrls(body, current);
      if (videos.length > 0) {
        return { url: current, html: body, videos: videos };
      }

      var candidates = [];

      var redirectedUrl = res && res.url ? String(res.url).trim() : "";
      if (redirectedUrl && redirectedUrl !== current && !visited[redirectedUrl]) {
        candidates.push(redirectedUrl);
      }

      if (res && res.headers) {
        var loc = res.headers.location || res.headers.Location || res.headers.LOCATION || "";
        if (loc) candidates.push(resolveUrl(current, loc));
      }

      var metaRedirect = extractRedirectFromHtml(body, current);
      if (metaRedirect) candidates.push(metaRedirect);

      var directLink = body.match(/href\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|mkv|m3u8)[^"']*)["']/i);
      if (directLink && directLink[1]) candidates.push(directLink[1]);

      var next = "";
      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c] && !visited[candidates[c]]) {
          next = candidates[c];
          break;
        }
      }

      if (!next) {
        return { url: current, html: body, videos: [] };
      }
      current = next;
    }

    try {
      var finalRes = await request(current, { "Referer": manifest.baseUrl + "/" });
      var finalBody = String(finalRes && finalRes.body ? finalRes.body : "");
      return { url: current, html: finalBody, videos: extractVideoUrls(finalBody, current) };
    } catch (_) {
      return { url: current, html: lastBody, videos: [] };
    }
  }

  async function getHome(cb) {
    try {
      var res = await request(manifest.baseUrl + "/");
      var html = String(res && res.body ? res.body : "");
      var doc = parseHtml(html);
      var items = parseMovieCards(doc);

      var data = {};
      if (items.length > 0) {
        data["Latest Updates"] = items.slice(0, 30);
        if (items.length > 6) {
          data["Trending"] = items.slice(0, 6);
        }
      }

      cb({ success: true, data: data });
    } catch (e) {
      cb({
        success: false,
        errorCode: "PARSE_ERROR",
        message: String(e && e.message ? e.message : e)
      });
    }
  }

  async function search(query, cb) {
    try {
      var qRaw = String(query || "").trim();
      if (!qRaw) return cb({ success: true, data: [] });
      var q = encodeURIComponent(qRaw);
      var res = await request(manifest.baseUrl + "/?q=" + q);
      var html = String(res && res.body ? res.body : "");
      var doc = parseHtml(html);
      var items = parseMovieCards(doc);

      cb({ success: true, data: items.slice(0, 40) });
    } catch (e) {
      cb({
        success: false,
        errorCode: "SEARCH_ERROR",
        message: String(e && e.message ? e.message : e)
      });
    }
  }

  async function load(url, cb) {
    try {
      var target = normalizeUrl(url, manifest.baseUrl);
      var page = await fetchDetailPage(target);
      var html = page.html;
      var doc = parseHtml(html);

      var title =
        cleanTitle(safeText(doc.querySelector("h1.movie-title"))) ||
        cleanTitle(safeText(doc.querySelector("h1"))) ||
        "Unknown";

      var posterImg =
        doc.querySelector("img.poster") ||
        doc.querySelector(".poster-container img") ||
        doc.querySelector("img.movie-poster") ||
        doc.querySelector(".movie-header img");
      var posterUrl = getAttr(posterImg, "src", "data-src") || "";

      var descEl = doc.querySelector("p.overview") || doc.querySelector(".overview");
      var description = cleanTitle(safeText(descEl));
      if (!description) {
        description = cleanTitle(
          getAttr(doc.querySelector('meta[name="description"]'), "content")
        );
      }

      var bodyText = safeText(doc.querySelector(".movie-meta")) || safeText(doc.body || doc.documentElement);
      var year = parseYear(safeText(doc.querySelector(".movie-year")) || bodyText);

      var scoreMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
      var score = scoreMatch ? parseFloat(scoreMatch[1]) : undefined;

      var fileItems = Array.from(doc.querySelectorAll("a.file-item[data-href], .file-item[data-href]"));
      var episodes = [];

      for (var i = 0; i < fileItems.length; i++) {
        var fi = fileItems[i];
        var dataHref = getAttr(fi, "data-href");
        if (!dataHref) continue;

        var epUrl = normalizeUrl(dataHref, manifest.baseUrl);
        var fileName = cleanTitle(safeText(fi.querySelector(".file-name")));
        var fileSize = cleanTitle(safeText(fi.querySelector(".file-size")));
        var quality = extractQuality(fileName || dataHref);

        var epName = fileName.replace(/\.(mkv|mp4|avi|mov|ts)/gi, "").trim();
        if (fileSize) epName = epName + " [" + fileSize + "]";
        if (!epName) epName = title + " - " + quality;

        episodes.push(
          new Episode({
            name: epName,
            url: epUrl,
            season: 1,
            episode: i + 1,
            posterUrl: posterUrl
          })
        );
      }

      if (episodes.length === 0) {
        episodes.push(
          new Episode({
            name: title,
            url: target,
            season: 1,
            episode: 1,
            posterUrl: posterUrl
          })
        );
      }

      var item = new MultimediaItem({
        title: title,
        url: target,
        posterUrl: posterUrl,
        bannerUrl: posterUrl,
        description: description,
        year: year,
        score: score,
        type: "movie",
        contentType: "movie",
        episodes: episodes
      });

      cb({ success: true, data: item });
    } catch (e) {
      cb({
        success: false,
        errorCode: "LOAD_ERROR",
        message: String(e && e.message ? e.message : e)
      });
    }
  }

  async function loadStreams(url, cb) {
    try {
      var target = normalizeUrl(url, manifest.baseUrl);
      var streams = [];

      if (/loanagreement\.php/i.test(target)) {
        var result = await resolveRedirectChain(target);

        for (var i = 0; i < result.videos.length; i++) {
          var u = result.videos[i];
          var quality = extractQuality(u + " " + target);
          streams.push(
            new StreamResult({
              name: "TellyBiz - " + quality,
              url: u,
              quality: quality,
              source: "TellyBiz",
              headers: {
                "Referer": result.url || manifest.baseUrl + "/",
                "User-Agent": UA
              }
            })
          );
        }

        if (streams.length === 0) {
          var iframes = extractIframeSrc(result.html, result.url);
          for (var f = 0; f < iframes.length; f++) {
            try {
              var ifrRes = await request(iframes[f], { "Referer": result.url });
              var ifrBody = String(ifrRes && ifrRes.body ? ifrRes.body : "");
              var ifrVideos = extractVideoUrls(ifrBody, iframes[f]);
              for (var v = 0; v < ifrVideos.length; v++) {
                var q2 = extractQuality(ifrVideos[v]);
                streams.push(
                  new StreamResult({
                    name: "TellyBiz - " + q2,
                    url: ifrVideos[v],
                    quality: q2,
                    source: "TellyBiz",
                    headers: {
                      "Referer": iframes[f],
                      "User-Agent": UA
                    }
                  })
                );
              }
            } catch (_) {}
          }
        }

        if (streams.length === 0 && /\.(mp4|mkv|m3u8)(\?|$)/i.test(result.url)) {
          var q3 = extractQuality(result.url + " " + target);
          streams.push(
            new StreamResult({
              name: "TellyBiz - " + q3,
              url: result.url,
              quality: q3,
              source: "TellyBiz",
              headers: {
                "Referer": manifest.baseUrl + "/",
                "User-Agent": UA
              }
            })
          );
        }
      } else {
        var page = await fetchDetailPage(target);
        var doc = parseHtml(page.html);
        var fileItems = Array.from(
          doc.querySelectorAll("a.file-item[data-href], .file-item[data-href]")
        );

        for (var j = 0; j < fileItems.length; j++) {
          var dataHref = getAttr(fileItems[j], "data-href");
          if (!dataHref) continue;
          var loanUrl = normalizeUrl(dataHref, manifest.baseUrl);

          try {
            var result2 = await resolveRedirectChain(loanUrl);
            for (var k = 0; k < result2.videos.length; k++) {
              var q4 = extractQuality(result2.videos[k] + " " + dataHref);
              streams.push(
                new StreamResult({
                  name: "TellyBiz - " + q4,
                  url: result2.videos[k],
                  quality: q4,
                  source: "TellyBiz",
                  headers: {
                    "Referer": result2.url || manifest.baseUrl + "/",
                    "User-Agent": UA
                  }
                })
              );
            }

            if (
              result2.videos.length === 0 &&
              /\.(mp4|mkv|m3u8)(\?|$)/i.test(result2.url)
            ) {
              var q5 = extractQuality(result2.url + " " + dataHref);
              streams.push(
                new StreamResult({
                  name: "TellyBiz - " + q5,
                  url: result2.url,
                  quality: q5,
                  source: "TellyBiz",
                  headers: {
                    "Referer": manifest.baseUrl + "/",
                    "User-Agent": UA
                  }
                })
              );
            }
          } catch (_) {}
        }
      }

      var uniq = [];
      var seen = {};
      for (var s = 0; s < streams.length; s++) {
        var key = streams[s].url || "";
        if (!key || seen[key]) continue;
        seen[key] = true;
        uniq.push(streams[s]);
      }

      cb({ success: true, data: uniq });
    } catch (e) {
      cb({
        success: false,
        errorCode: "STREAM_ERROR",
        message: String(e && e.message ? e.message : e)
      });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
