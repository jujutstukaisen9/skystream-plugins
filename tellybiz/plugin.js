(function () {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
  const BASE_HEADERS = {
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
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
  }

  function safeText(el) {
    return htmlDecode((el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim());
  }

  function getAttr(el) {
    if (!el) return "";
    var attrs = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < attrs.length; i++) {
      var v = el.getAttribute(attrs[i]);
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

  function parseScore(text) {
    var m = String(text || "").match(/[\u2605]?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    return m ? parseFloat(m[1]) : undefined;
  }

  function extractQuality(text) {
    var t = String(text || "").toLowerCase();
    if (t.indexOf("2160") > -1 || t.indexOf("4k") > -1) return "4K";
    if (t.indexOf("1080") > -1) return "1080p";
    if (t.indexOf("720") > -1) return "720p";
    if (t.indexOf("480") > -1) return "480p";
    if (t.indexOf("360") > -1) return "360p";
    if (t.indexOf("700mb") > -1) return "700MB";
    if (t.indexOf("mp4") > -1) return "MP4";
    return "Auto";
  }

  function uniqueByUrl(items) {
    var out = [];
    var seen = {};
    for (var i = 0; i < (items || []).length; i++) {
      var key = String((items[i] && items[i].url) || "");
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(items[i]);
    }
    return out;
  }

  function request(url, headers) {
    return http_get(url, {
      headers: Object.assign({}, BASE_HEADERS, headers || {})
    });
  }

  function loadDoc(url, headers) {
    return request(url, headers).then(function (res) {
      return parseHtml(res && res.body ? res.body : "");
    });
  }

  function parseCard(a) {
    if (!a) return null;
    var href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
    if (!href) return null;
    if (/\/(loanid|loanagreement|wp-|tag\/|category\/|feed\/)/i.test(href)) return null;

    var parent = a.parentElement;
    var img = a.querySelector("img") || (parent ? parent.querySelector("img") : null);
    var title =
      cleanTitle(getAttr(img, "alt")) ||
      cleanTitle(getAttr(a, "title")) ||
      cleanTitle(safeText(a.querySelector("h1, h2, h3, h4, .title, .movie-title"))) ||
      cleanTitle(safeText(a));

    var posterUrl = normalizeUrl(getAttr(img, "data-src", "src"), manifest.baseUrl);
    if (!title || !posterUrl) return null;

    return new MultimediaItem({
      title: title,
      url: href,
      posterUrl: posterUrl,
      type: "movie",
      contentType: "movie"
    });
  }

  function collectItems(doc) {
    var anchors = Array.from(doc.querySelectorAll("a[href]"));
    var items = [];
    for (var i = 0; i < anchors.length; i++) {
      var item = parseCard(anchors[i]);
      if (item) items.push(item);
    }
    return uniqueByUrl(items);
  }

  function extractLoanLinksFromHtml(html, baseUrl) {
    var text = String(html || "");
    var out = [];
    var seen = {};
    var patterns = [
      /data-href\s*=\s*["']([^"']*loanagreement\.php\?[^"']+)["']/gi,
      /href\s*=\s*["']([^"']*loanagreement\.php\?[^"']+)["']/gi,
      /data-href\s*=\s*["']([^"']*loanid\.php\?[^"']+)["']/gi,
      /href\s*=\s*["']([^"']*loanid\.php\?[^"']+)["']/gi,
      /["']((?:\/|https?:\/\/)[^"'<>]*loanagreement\.php\?[^"'<>]+)["']/gi,
      /["']((?:\/|https?:\/\/)[^"'<>]*loanid\.php\?[^"'<>]+)["']/gi
    ];
    for (var p = 0; p < patterns.length; p++) {
      var rx = patterns[p];
      var m;
      while ((m = rx.exec(text)) !== null) {
        var u = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
        if (u && !seen[u]) {
          seen[u] = true;
          out.push(u);
        }
      }
    }
    return out;
  }

  function extractFinalVideoUrl(html, baseUrl) {
    var raw = String(html || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");

    var out = [];
    var seen = {};
    var patterns = [
      /<source[^>]+src=["']([^"']+)["']/gi,
      /<video[^>]+src=["']([^"']+)["']/gi,
      /<iframe[^>]+src=["']([^"']+)["']/gi,
      /(?:file|src|source|video|video_url|url)\s*[:=]\s*["']([^"']+)["']/gi,
      /["']((?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/gi,
      /((?:https?:)?\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?)/gi
    ];

    for (var p = 0; p < patterns.length; p++) {
      var rx = patterns[p];
      var m;
      while ((m = rx.exec(raw)) !== null) {
        var u = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
        if (u && !seen[u]) {
          seen[u] = true;
          out.push(u);
        }
      }
    }
    return out;
  }

  function extractRedirectTarget(html, currentUrl) {
    var text = String(html || "");
    var meta =
      text.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i) ||
      text.match(/content=["'][^"']*url=([^"'>]+)["'][^>]+http-equiv=["']refresh["']/i);
    if (meta && meta[1]) return resolveUrl(currentUrl, htmlDecode(meta[1].trim()));

    var js =
      text.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
      text.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i) ||
      text.match(/window\.open\(\s*["']([^"']+)["']/i) ||
      text.match(/window\.location\s*=\s*["']([^"']+)["']/i);
    if (js && js[1]) return resolveUrl(currentUrl, htmlDecode(js[1].trim()));

    var direct =
      text.match(/["']([^"']*loanagreement\.php\?[^"']+)["']/i) ||
      text.match(/["']([^"']*loanid\.php\?[^"']+)["']/i);
    if (direct && direct[1]) return resolveUrl(currentUrl, htmlDecode(direct[1].trim()));

    return "";
  }

  function buildLoanAgreementFallback(url) {
    var str = String(url || "");
    if (!/loanid\.php/i.test(str)) return "";
    var lid = str.match(/[?&]lid=([^&#]+)/i);
    var f = str.match(/[?&]f=([^&#]+)/i);
    if (!lid || !lid[1]) return "";
    return resolveUrl(manifest.baseUrl, "/loanagreement.php?lid=" + lid[1] + "&f=" + (f && f[1] ? f[1] : "0"));
  }

  async function resolveRedirectChain(startUrl) {
    var current = startUrl;
    var visited = {};

    for (var i = 0; i < 6; i++) {
      if (!current || visited[current]) break;
      visited[current] = true;

      var res;
      try {
        res = await request(current, { "Referer": manifest.baseUrl + "/" });
      } catch (_) {
        break;
      }

      var body = String(res && res.body ? res.body : "");
      var candidates = [];

      var redirectedUrl = res && res.url && String(res.url).trim() ? String(res.url).trim() : "";
      if (redirectedUrl && redirectedUrl !== current) candidates.push(redirectedUrl);

      var locationHeader = (res && res.headers) ? (res.headers.location || res.headers.Location || res.headers.LOCATION || "") : "";
      if (locationHeader) candidates.push(resolveUrl(current, locationHeader));

      var parsed = extractRedirectTarget(body, current);
      if (parsed) candidates.push(parsed);

      if (/loanid\.php/i.test(current)) {
        var fallback = buildLoanAgreementFallback(current);
        if (fallback) candidates.push(fallback);
      }

      var next = "";
      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c] && !visited[candidates[c]]) {
          next = candidates[c];
          break;
        }
      }

      if (!next) {
        return { url: current, html: body };
      }
      current = next;
    }

    try {
      var finalRes = await request(current, { "Referer": manifest.baseUrl + "/" });
      return { url: current, html: String(finalRes && finalRes.body ? finalRes.body : "") };
    } catch (_) {
      return { url: current, html: "" };
    }
  }

  async function getHome(cb) {
    try {
      var doc = await loadDoc(manifest.baseUrl + "/");
      var items = collectItems(doc);

      var latest = items.slice(0, 30);
      var trending = items.slice(0, 15);
      var data = {};

      if (trending.length > 0) data["Trending"] = trending;
      if (latest.length > 0) data["Latest"] = latest;

      cb({ success: true, data: data });
    } catch (e) {
      cb({ success: false, errorCode: "PARSE_ERROR", message: String(e && e.message ? e.message : e) });
    }
  }

  async function search(query, cb) {
    try {
      var qRaw = String(query || "").trim();
      if (!qRaw) return cb({ success: true, data: [] });
      var q = encodeURIComponent(qRaw);
      var doc = await loadDoc(manifest.baseUrl + "/?s=" + q);
      var items = collectItems(doc);
      var lowered = qRaw.toLowerCase();
      var ranked = items.filter(function (x) {
        return String(x && x.title ? x.title : "").toLowerCase().indexOf(lowered) > -1;
      });
      cb({ success: true, data: (ranked.length ? ranked : items).slice(0, 40) });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e && e.message ? e.message : e) });
    }
  }

  async function load(url, cb) {
    try {
      var target = normalizeUrl(url, manifest.baseUrl);
      var res = await request(target);
      var html = String(res && res.body ? res.body : "");
      var doc = parseHtml(html);
      var bodyText = safeText(doc.body || doc.documentElement);

      var title =
        cleanTitle(safeText(doc.querySelector("h1.movie-title, h1"))) ||
        cleanTitle(getAttr(doc.querySelector('meta[property="og:title"]'), "content")) ||
        "Unknown";

      var posterUrl = normalizeUrl(
        getAttr(doc.querySelector('meta[property="og:image"]'), "content") ||
        getAttr(doc.querySelector("img.poster, .poster-container img, img"), "data-src", "src"),
        manifest.baseUrl
      );

      var description =
        cleanTitle(getAttr(doc.querySelector('meta[property="og:description"], meta[name="description"]'), "content")) ||
        cleanTitle(safeText(doc.querySelector(".overview, .description, p")));

      var year = parseYear(bodyText);
      var score = parseScore(bodyText);

      var genres = [];
      var genreTags = Array.from(doc.querySelectorAll(".genre-tag"));
      for (var g = 0; g < genreTags.length; g++) {
        var gt = safeText(genreTags[g]);
        if (gt) genres.push(gt);
      }

      var loanLinks = extractLoanLinksFromHtml(html, target);

      var episodes = [];
      if (loanLinks.length > 0) {
        for (var i = 0; i < loanLinks.length; i++) {
          var fileNameEl = null;
          var sizeText = "";
          var qualLabel = extractQuality(loanLinks[i]);

          var linkDoc = parseHtml(html);
          var fileItems = Array.from(linkDoc.querySelectorAll(".file-item"));
          for (var fi = 0; fi < fileItems.length; fi++) {
            var dh = getAttr(fileItems[fi], "data-href");
            if (dh && normalizeUrl(dh, manifest.baseUrl) === loanLinks[i]) {
              var fn = fileItems[fi].querySelector(".file-name");
              var fs = fileItems[fi].querySelector(".file-size");
              if (fn) fileNameEl = fn;
              if (fs) sizeText = safeText(fs);
              qualLabel = extractQuality(safeText(fn) + " " + dh);
              break;
            }
          }

          var epName = fileNameEl ? safeText(fileNameEl).replace(/\.mkv|\.mp4|\.avi/gi, "").trim() : (title + " - " + qualLabel);
          if (sizeText) epName = epName + " [" + sizeText + "]";

          episodes.push(new Episode({
            name: epName,
            url: loanLinks[i],
            season: 1,
            episode: i + 1,
            posterUrl: posterUrl
          }));
        }
      } else {
        episodes.push(new Episode({
          name: title,
          url: target,
          season: 1,
          episode: 1,
          posterUrl: posterUrl
        }));
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
      cb({ success: false, errorCode: "LOAD_ERROR", message: String(e && e.message ? e.message : e) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      var target = normalizeUrl(url, manifest.baseUrl);
      var detailUrl = target;
      var detailHtml = "";

      if (/loanid\.php|loanagreement\.php/i.test(target)) {
        detailHtml = "";
      } else {
        var pageRes = await request(target);
        detailHtml = String(pageRes && pageRes.body ? pageRes.body : "");
        var loanLinks = extractLoanLinksFromHtml(detailHtml, target);
        if (loanLinks.length > 0) detailUrl = loanLinks[0];
      }

      if (!/loanid\.php|loanagreement\.php/i.test(detailUrl) && detailHtml) {
        var links2 = extractLoanLinksFromHtml(detailHtml, target);
        if (links2.length > 0) detailUrl = links2[0];
      }

      var finalPage;

      if (/loanid\.php|loanagreement\.php/i.test(detailUrl)) {
        finalPage = await resolveRedirectChain(detailUrl);
      } else {
        finalPage = { url: detailUrl, html: detailHtml };
      }

      var finalHtml = String(finalPage && finalPage.html ? finalPage.html : "");
      var finalUrl = String(finalPage && finalPage.url ? finalPage.url : detailUrl);

      if (/loanid\.php/i.test(finalUrl) || /loanid\.php/i.test(finalHtml)) {
        var fb = buildLoanAgreementFallback(finalUrl) || extractRedirectTarget(finalHtml, finalUrl);
        if (fb) {
          finalPage = await resolveRedirectChain(fb);
          finalHtml = String(finalPage && finalPage.html ? finalPage.html : "");
          finalUrl = String(finalPage && finalPage.url ? finalPage.url : fb);
        }
      }

      var found = extractFinalVideoUrl(finalHtml, finalUrl);
      var streams = [];

      for (var i = 0; i < found.length; i++) {
        var u = found[i];
        if (!u) continue;
        var quality = extractQuality(u);
        if (/\.m3u8(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u)) {
          streams.push(new StreamResult({
            name: "TellyBiz - " + quality,
            url: u,
            quality: quality,
            source: "TellyBiz - " + quality,
            headers: {
              "Referer": finalUrl || manifest.baseUrl + "/",
              "User-Agent": UA
            }
          }));
        } else if (/^https?:\/\//i.test(u)) {
          streams.push(new StreamResult({
            name: "TellyBiz - Embed",
            url: u,
            quality: "Auto",
            source: "TellyBiz - Embed",
            headers: {
              "Referer": finalUrl || manifest.baseUrl + "/",
              "User-Agent": UA
            }
          }));
        }
      }

      var uniq = [];
      var seen = {};
      for (var j = 0; j < streams.length; j++) {
        var s = streams[j];
        var key = (s.url || "") + "|" + (s.quality || "") + "|" + (s.name || "");
        if (!s.url || seen[key]) continue;
        seen[key] = true;
        uniq.push(s);
      }

      cb({ success: true, data: uniq });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: String(e && e.message ? e.message : e) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
