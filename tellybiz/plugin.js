// skystream-plugins/tellybiz/plugin.js
(function () {
  /**
   * @type {import('@skystream/sdk').Manifest}
   */
  // manifest is injected at runtime

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
    const m = String(text || "").match(/★?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
    return m ? parseFloat(m[1]) : undefined;
  }

  function extractQuality(text) {
    const t = String(text || "").toLowerCase();
    if (t.includes("2160") || t.includes("4k")) return "4K";
    if (t.includes("1080")) return "1080p";
    if (t.includes("720")) return "720p";
    if (t.includes("480")) return "480p";
    if (t.includes("360")) return "360p";
    if (t.includes("700mb")) return "700MB";
    if (t.includes("mp4")) return "MP4";
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

  function parseCard(a) {
    if (!a) return null;
    const href = normalizeUrl(getAttr(a, "href"), manifest.baseUrl);
    if (!href) return null;
    if (/\/(loanid|loanagreement|wp-|tag\/|category\/|feed\/)/i.test(href)) return null;

    const img = a.querySelector("img") || a.parentElement?.querySelector?.("img");
    const title =
      cleanTitle(getAttr(img, "alt")) ||
      cleanTitle(getAttr(a, "title")) ||
      cleanTitle(safeText(a.querySelector("h1, h2, h3, h4, .title, .movie-title"))) ||
      cleanTitle(safeText(a));

    const posterUrl = normalizeUrl(getAttr(img, "data-src", "src"), manifest.baseUrl);
    if (!title || !posterUrl) return null;

    return new MultimediaItem({
      title,
      url: href,
      posterUrl,
      type: "movie",
      contentType: "movie"
    });
  }

  function collectItems(doc) {
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    const items = [];
    for (const a of anchors) {
      const item = parseCard(a);
      if (item) items.push(item);
    }
    return uniqueByUrl(items);
  }

  function extractLoanLinksFromHtml(html, baseUrl) {
    const text = String(html || "");
    const out = [];
    const patterns = [
      /data-href\s*=\s*["']([^"']*loanagreement\.php\?[^"']+)["']/gi,
      /href\s*=\s*["']([^"']*loanagreement\.php\?[^"']+)["']/gi,
      /data-href\s*=\s*["']([^"']*loanid\.php\?[^"']+)["']/gi,
      /href\s*=\s*["']([^"']*loanid\.php\?[^"']+)["']/gi,
      /["']((?:\/|https?:\/\/)[^"'<>]*loanagreement\.php\?[^"'<>]+)["']/gi,
      /["']((?:\/|https?:\/\/)[^"'<>]*loanid\.php\?[^"'<>]+)["']/gi
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

  function extractFinalVideoUrl(html, baseUrl) {
    const raw = String(html || "")
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&");

    const out = [];
    const patterns = [
      /<source[^>]+src=["']([^"']+)["']/gi,
      /<video[^>]+src=["']([^"']+)["']/gi,
      /<iframe[^>]+src=["']([^"']+)["']/gi,
      /(?:file|src|source|video|video_url|url)\s*[:=]\s*["']([^"']+)["']/gi,
      /["']((?:https?:)?\/\/[^"'\s<>]+\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/gi,
      /((?:https?:)?\/\/[^\s"'<>]+\.(?:m3u8|mp4)(?:\?[^\s"'<>]*)?)/gi
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
    const meta =
      text.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i) ||
      text.match(/content=["'][^"']*url=([^"'>]+)["'][^>]+http-equiv=["']refresh["']/i);
    if (meta && meta[1]) return resolveUrl(currentUrl, htmlDecode(meta[1].trim()));

    const js =
      text.match(/location\.href\s*=\s*["']([^"']+)["']/i) ||
      text.match(/location\.replace\(\s*["']([^"']+)["']\s*\)/i) ||
      text.match(/window\.open\(\s*["']([^"']+)["']/i) ||
      text.match(/window\.location\s*=\s*["']([^"']+)["']/i);
    if (js && js[1]) return resolveUrl(currentUrl, htmlDecode(js[1].trim()));

    const direct =
      text.match(/["']([^"']*loanagreement\.php\?[^"']+)["']/i) ||
      text.match(/["']([^"']*loanid\.php\?[^"']+)["']/i);
    if (direct && direct[1]) return resolveUrl(currentUrl, htmlDecode(direct[1].trim()));

    return "";
  }

  function buildLoanAgreementFallback(url) {
    const str = String(url || "");
    if (!/loanid\.php/i.test(str)) return "";
    const lid = str.match(/[?&]lid=([^&#]+)/i);
    const f = str.match(/[?&]f=([^&#]+)/i);
    if (!lid || !lid[1]) return "";
    return resolveUrl(manifest.baseUrl, `/loanagreement.php?lid=${lid[1]}&f=${f && f[1] ? f[1] : "0"}`);
  }

  async function resolveRedirectChain(startUrl) {
    let current = startUrl;
    const visited = new Set();

    for (let i = 0; i < 6; i += 1) {
      if (!current || visited.has(current)) break;
      visited.add(current);

      let res;
      try {
        res = await request(current, { Referer: `${manifest.baseUrl}/` });
      } catch (_) {
        break;
      }

      const body = String(res?.body || "");
      const redirectedUrl =
        res?.url && String(res.url).trim() ? String(res.url).trim() : "";

      const candidates = [];
      if (redirectedUrl && redirectedUrl !== current) candidates.push(redirectedUrl);

      const locationHeader =
        res?.headers?.location ||
        res?.headers?.Location ||
        res?.headers?.LOCATION ||
        "";
      if (locationHeader) candidates.push(resolveUrl(current, locationHeader));

      const parsed = extractRedirectTarget(body, current);
      if (parsed) candidates.push(parsed);

      if (/loanid\.php/i.test(current)) {
        const fallback = buildLoanAgreementFallback(current);
        if (fallback) candidates.push(fallback);
      }

      const next = candidates.find((u) => u && !visited.has(u));
      if (!next) {
        return { url: current, html: body };
      }
      current = next;
    }

    try {
      const res = await request(current, { Referer: `${manifest.baseUrl}/` });
      return { url: current, html: String(res?.body || "") };
    } catch (_) {
      return { url: current, html: "" };
    }
  }

  async function getHome(cb) {
    try {
      const doc = await loadDoc(`${manifest.baseUrl}/`);
      const items = collectItems(doc);

      const latest = items.slice(0, 30);
      const trending = items.slice(0, 15);
      const data = {};

      if (trending.length > 0) data["Trending"] = trending;
      if (latest.length > 0) data["Latest"] = latest;

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
      const doc = await loadDoc(`${manifest.baseUrl}/?s=${q}`);
      const items = collectItems(doc);
      const lowered = qRaw.toLowerCase();
      const ranked = items.filter((x) => String(x?.title || "").toLowerCase().includes(lowered));
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

      const loanLinks = extractLoanLinksFromHtml(String((doc.documentElement || doc.body)?.innerHTML || ""), target);
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
      let detailHtml = "";

      if (/loanid\.php|loanagreement\.php/i.test(target)) {
        detailHtml = "";
      } else {
        const pageRes = await request(target);
        detailHtml = String(pageRes?.body || "");
        const loanLinks = extractLoanLinksFromHtml(detailHtml, target);
        if (loanLinks.length > 0) detailUrl = loanLinks[0];
      }

      if (!/loanid\.php|loanagreement\.php/i.test(detailUrl) && detailHtml) {
        const links = extractLoanLinksFromHtml(detailHtml, target);
        if (links.length > 0) detailUrl = links[0];
      }

      let finalPage = { url: detailUrl, html: "" };

      if (/loanid\.php|loanagreement\.php/i.test(detailUrl)) {
        finalPage = await resolveRedirectChain(detailUrl);
      } else {
        finalPage = { url: detailUrl, html: detailHtml };
      }

      let finalHtml = String(finalPage?.html || "");
      let finalUrl = String(finalPage?.url || detailUrl);

      if (/loanid\.php/i.test(finalUrl) || /loanid\.php/i.test(finalHtml)) {
        const fallback = buildLoanAgreementFallback(finalUrl) || extractRedirectTarget(finalHtml, finalUrl);
        if (fallback) {
          finalPage = await resolveRedirectChain(fallback);
          finalHtml = String(finalPage?.html || "");
          finalUrl = String(finalPage?.url || fallback);
        }
      }

      const found = extractFinalVideoUrl(finalHtml, finalUrl);
      const streams = [];

      for (const u of found) {
        if (!u) continue;
        const quality = extractQuality(u);
        if (/\.m3u8(\?|$)/i.test(u) || /\.mp4(\?|$)/i.test(u)) {
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
        } else if (/^https?:\/\//i.test(u)) {
          streams.push(new StreamResult({
            name: "TellyBiz - Embed",
            url: u,
            quality: "Auto",
            source: "TellyBiz - Embed",
            headers: {
              "Referer": finalUrl || `${manifest.baseUrl}/`,
              "User-Agent": UA
            }
          }));
        }
      }

      const uniq = [];
      const seen = new Set();
      for (const s of streams) {
        const key = `${s.url}|${s.quality}|${s.name}`;
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
