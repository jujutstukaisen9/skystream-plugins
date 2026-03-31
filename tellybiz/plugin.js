(function () {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
  const BASE_HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": `${manifest.baseUrl}/`
  };

  function normalizeUrl(url, base) {
    if (!url) return "";
    const raw = String(url).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return `https:${raw}`;
    if (/^https?:\/\//i.test(raw)) return raw;
    const root = String(base || manifest.baseUrl).replace(/\/+$/, "");
    if (raw.startsWith("/")) return `${root}${raw}`;
    return `${root}/${raw.replace(/^\/+/, "")}`;
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
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  }

  function safeText(el) {
    return htmlDecode((el?.textContent || "").replace(/\s+/g, " ").trim());
  }

  function getAttr(el, ...attrs) {
    if (!el) return "";
    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (val && String(val).trim()) return String(val).trim();
    }
    return "";
  }

  function cleanTitle(raw) {
    return htmlDecode(String(raw || "")).replace(/\s+/g, " ").trim();
  }

  function parseYear(text) {
    const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : undefined;
  }

  function parseScore(text) {
    const m = String(text || "").match(/★?\s*(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : undefined;
  }

  function extractQuality(text) {
    const t = String(text || "").toLowerCase();
    if (t.includes("1080")) return "1080p";
    if (t.includes("720")) return "720p";
    if (t.includes("480")) return "480p";
    if (t.includes("360")) return "360p";
    return "Auto";
  }

  function uniqueByUrl(items) {
    const out = [];
    const seen = new Set();
    for (const item of items || []) {
      const key = String(item?.url || "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  async function request(url, headers = {}) {
    return http_get(url, {
      headers: Object.assign({}, BASE_HEADERS, headers)
    });
  }

  async function loadDoc(url, headers = {}) {
    const res = await request(url, headers);
    return parseHtml(res?.body || "");
  }

  function parseMovieCard(card) {
    if (!card) return null;
    
    const a = card.querySelector("a[href]");
    if (!a) return null;
    
    const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
    if (!href) return null;

    const img = card.querySelector("img.movie-poster");
    const title = cleanTitle(getAttr(img, "alt") || safeText(card.querySelector(".movie-title")));
    const posterUrl = normalizeUrl(getAttr(img, "src"), manifest.baseUrl);
    const yearSpan = card.querySelector(".movie-year");
    const year = yearSpan ? parseYear(safeText(yearSpan)) : undefined;
    const ratingSpan = card.querySelector(".rating-badge");
    const score = ratingSpan ? parseScore(safeText(ratingSpan)) : undefined;

    if (!title || !posterUrl) return null;

    return {
      title,
      url: href,
      posterUrl,
      year,
      score
    };
  }

  function collectMovies(doc) {
    const cards = Array.from(doc.querySelectorAll(".movie-card"));
    const items = [];
    
    for (const card of cards) {
      const movie = parseMovieCard(card);
      if (movie) {
        items.push(new MultimediaItem({
          title: movie.title,
          url: movie.url,
          posterUrl: movie.posterUrl,
          type: "movie",
          contentType: "movie"
        }));
      }
    }
    
    return uniqueByUrl(items);
  }

  function extractLoanLinks(html, baseUrl) {
    const text = String(html || "");
    const out = [];
    const patterns = [
      /href=["']([^"']*loanid\.php\?[^"']+)["']/gi,
      /href=["']([^"']*loanagreement\.php\?[^"']+)["']/gi,
      /data-href=["']([^"']*loanagreement\.php\?[^"']+)["']/gi
    ];
    
    for (const rx of patterns) {
      let m;
      while ((m = rx.exec(text)) !== null) {
        const u = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
        if (u) out.push(u);
      }
    }
    
    return Array.from(new Set(out));
  }

  function extractVideoUrl(html, baseUrl) {
    const raw = String(html || "").replace(/\\\//g, "/").replace(/&amp;/g, "&");
    const out = [];
    
    const patterns = [
      /<source[^>]+src=["']([^"']+)["']/gi,
      /<video[^>]+src=["']([^"']+)["']/gi,
      /src=["']([^"']+\.(?:mp4|m3u8))["']/gi,
      /["'](https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*)["']/gi
    ];
    
    for (const rx of patterns) {
      let m;
      while ((m = rx.exec(raw)) !== null) {
        const url = resolveUrl(baseUrl || manifest.baseUrl, m[1]);
        if (url) out.push(url);
      }
    }
    
    return Array.from(new Set(out));
  }

  function extractRedirectTarget(html, currentUrl) {
    const text = String(html || "");
    
    const meta = text.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i);
    if (meta && meta[1]) return resolveUrl(currentUrl, htmlDecode(meta[1].trim()));

    const js = 
      text.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
      text.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i);
    if (js && js[1]) return resolveUrl(currentUrl, htmlDecode(js[1].trim()));

    return "";
  }

  async function resolveRedirectChain(startUrl) {
    let current = startUrl;
    const visited = new Set();

    for (let i = 0; i < 5; i += 1) {
      if (!current || visited.has(current)) break;
      visited.add(current);

      let res;
      try {
        res = await request(current, { Referer: `${manifest.baseUrl}/` });
      } catch (_) {
        break;
      }

      const body = String(res?.body || "");
      const candidates = [];

      if (res?.url && String(res.url).trim() && res.url !== current) {
        candidates.push(String(res.url).trim());
      }

      const redirect = extractRedirectTarget(body, current);
      if (redirect) candidates.push(redirect);

      const videos = extractVideoUrl(body, current);
      if (videos.length > 0) {
        return { url: current, html: body, videos };
      }

      const next = candidates.find((u) => u && !visited.has(u));
      if (!next) {
        return { url: current, html: body, videos: [] };
      }
      current = next;
    }

    try {
      const res = await request(current, { Referer: `${manifest.baseUrl}/` });
      const videos = extractVideoUrl(String(res?.body || ""), current);
      return { url: current, html: String(res?.body || ""), videos };
    } catch (_) {
      return { url: current, html: "", videos: [] };
    }
  }

  async function getHome(cb) {
    try {
      const doc = await loadDoc(`${manifest.baseUrl}/`);
      const items = collectMovies(doc);
      const data = {};

      if (items.length > 0) {
        data["Latest Updates"] = items.slice(0, 30);
        data["Trending"] = items.slice(0, 12);
      }

      cb({ success: true, data });
    } catch (e) {
      cb({ success: false, errorCode: "PARSE_ERROR", message: String(e?.message || e) });
    }
  }

  async function search(query, cb) {
    try {
      const qRaw = String(query || "").trim();
      if (!qRaw) return cb({ success: true, data: [] });
      
      const q = encodeURIComponent(qRaw);
      const doc = await loadDoc(`${manifest.baseUrl}/?q=${q}`);
      const items = collectMovies(doc);
      
      const lowered = qRaw.toLowerCase();
      const ranked = items.filter((x) => 
        String(x?.title || "").toLowerCase().includes(lowered)
      );
      
      cb({ success: true, data: (ranked.length ? ranked : items).slice(0, 40) });
    } catch (e) {
      cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e?.message || e) });
    }
  }

  async function load(url, cb) {
    try {
      const target = normalizeUrl(url, manifest.baseUrl);
      const doc = await loadDoc(target);
      const bodyText = safeText(doc.body || doc.documentElement);

      const title =
        cleanTitle(safeText(doc.querySelector("h1.movie-title, h1"))) ||
        cleanTitle(getAttr(doc.querySelector('meta[property="og:title"]'), "content")) ||
        "Unknown";

      const posterUrl = normalizeUrl(
        getAttr(doc.querySelector('meta[property="og:image"], img.poster, .poster-container img, img'), "content", "data-src", "src"),
        manifest.baseUrl
      );

      const description =
        cleanTitle(getAttr(doc.querySelector('meta[property="og:description"]'), "content")) ||
        cleanTitle(safeText(doc.querySelector(".overview, .description, p")));

      const year = parseYear(bodyText);
      const score = parseScore(bodyText);

      const loanLinks = extractLoanLinks(String((doc.documentElement || doc.body)?.innerHTML || ""), target);
      const playUrl = loanLinks[0] || target;

      const item = new MultimediaItem({
        title,
        url: playUrl,
        posterUrl,
        bannerUrl: posterUrl,
        description,
        year,
        score,
        type: "movie",
        contentType: "movie",
        episodes: [
          new Episode({
            name: title,
            url: playUrl,
            season: 1,
            episode: 1,
            posterUrl
          })
        ]
      });

      cb({ success: true, data: item });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: String(e?.message || e) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const target = normalizeUrl(url, manifest.baseUrl);
      let detailUrl = target;

      if (!/loanid\.php|loanagreement\.php/i.test(target)) {
        const pageRes = await request(target);
        const detailHtml = String(pageRes?.body || "");
        const loanLinks = extractLoanLinks(detailHtml, target);
        if (loanLinks.length > 0) detailUrl = loanLinks[0];
      }

      const result = await resolveRedirectChain(detailUrl);
      const finalUrl = result.url || detailUrl;
      const finalHtml = result.html || "";
      let videos = result.videos || [];

      if (videos.length === 0) {
        videos = extractVideoUrl(finalHtml, finalUrl);
      }

      const streams = [];
      for (const u of videos) {
        if (!u) continue;
        const quality = extractQuality(u);
        streams.push(new StreamResult({
          name: `TellyBiz - ${quality}`,
          url: u,
          quality,
          source: `TellyBiz - ${quality}`,
          headers: {
            "Referer": finalUrl || `${manifest.baseUrl}/`,
            "User-Agent": UA
          }
        }));
      }

      const uniq = [];
      const seen = new Set();
      for (const s of streams) {
        const key = `${s.url}|${s.quality}`;
        if (!s?.url || seen.has(key)) continue;
        seen.add(key);
        uniq.push(s);
      }

      cb({ success: true, data: uniq });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: String(e?.message || e) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
