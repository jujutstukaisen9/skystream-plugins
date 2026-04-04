(function () {
  const BASE_URL = () => (typeof manifest !== "undefined" && manifest.baseUrl) 
    ? manifest.baseUrl 
    : "https://dudefilms.llc";

  const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
  const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";

  const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  function cleanTitle(raw) {
    if (!raw) return "";
    const regex = /S(\d+)[Ee](\d+)(?:-(\d+))?/;
    const match = regex.exec(raw) || null;
    if (!match) return raw.trim();
    const season = parseInt(match[1]);
    const epStart = parseInt(match[2]);
    const epEnd = match[3] ? parseInt(match[3]) : null;
    const showName = raw.substring(0, raw.indexOf(match[0])).trim();
    const episodes = epEnd !== null ? `Episodes ${epStart}–${epEnd}` : `Episode ${epStart}`;
    return `${showName} Season ${season} | ${episodes}`;
  }

  function isBlockedButton(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return ["zipfile", "torrent", "rar", "7z"].some(blocked => lower.includes(blocked));
  }

  function getSearchQuality(check) {
    if (!check) return null;
    const s = check.toLowerCase();
    const patterns = [
      { regex: /\b(4k|ds4k|uhd|2160p)\b/i, quality: "4K" },
      { regex: /\b(hdts|hdcam|hdtc)\b/i, quality: "HDCam" },
      { regex: /\b(camrip|cam[- ]?rip)\b/i, quality: "CamRip" },
      { regex: /\b(web[- ]?dl|webrip|webdl)\b/i, quality: "WebRip" },
      { regex: /\b(bluray|bdrip|blu[- ]?ray)\b/i, quality: "BluRay" },
      { regex: /\b(1080p|fullhd)\b/i, quality: "1080p" },
      { regex: /\b(720p)\b/i, quality: "720p" }
    ];
    for (const { regex, quality } of patterns) {
      if (regex.test(s)) return quality;
    }
    return null;
  }

  function safeJsonParse(str) {
    if (!str) return null;
    if (typeof str === 'object') return str;
    try { return JSON.parse(str); } catch { return null; }
  }

  function absUrl(url, base) {
    if (!url) return "";
    const baseUrl = base || BASE_URL();
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return baseUrl + url;
    return url;
  }

  function extractQuality(str) {
    if (!str) return "Auto";
    const s = str.toLowerCase();
    if (s.includes("2160") || s.includes("4k")) return "4K";
    if (s.includes("1440")) return "1440p";
    if (s.includes("1080")) return "1080p";
    if (s.includes("720")) return "720p";
    if (s.includes("480")) return "480p";
    return "Auto";
  }

  function base64Decode(str) {
    if (!str) return "";
    try { return atob(str); } catch { return ""; }
  }

  let cachedDomains = null;

  async function getBaseUrl() {
    if (cachedDomains && cachedDomains.dudefilms) return cachedDomains.dudefilms;
    try {
      const res = await http_get(DOMAINS_URL, DEFAULT_HEADERS);
      const data = safeJsonParse(res.body);
      if (data && data.dudefilms) {
        cachedDomains = data;
        return data.dudefilms;
      }
    } catch (e) { console.error("Failed to fetch domains:", e); }
    return BASE_URL();
  }

  async function fetchAndParse(url, headers) {
    const res = await http_get(url, headers || DEFAULT_HEADERS);
    if (!res || !res.body) throw new Error("Failed to fetch: " + url);
    return parseHtml(res.body);
  }

  function extractMetaInfo(doc) {
    const getText = (selector) => doc.querySelector(selector)?.textContent?.trim() || "";
    const getAttr = (selector, attr) => doc.querySelector(selector)?.getAttribute(attr) || "";
    return {
      title: getText("#movie_title > a"),
      poster: getAttr("meta[property=og:image]", "content"),
      plot: getText(".kno-rdesc .kno-rdesc"),
      description: getText("#summary"),
      yearRaw: getText("#movie_title > a > small"),
      typeRaw: getText("h1.post-title a"),
      imdbUrl: getAttr("div span a[href*='imdb.com']", "href")
    };
  }

  async function extractHubCloud(url, referer, streams) {
    try {
      const res = await http_get(url, DEFAULT_HEADERS);
      const doc = await parseHtml(res.body);
      let href = doc.querySelector("#download")?.getAttribute("href") || "";
      if (href && !href.startsWith("http")) {
        const uri = new URL(url);
        href = `${uri.protocol}://${uri.host}/${href.replace(/^\//, "")}`;
      }
      if (!href) return;
      const doc2 = await http_get(href, DEFAULT_HEADERS);
      const docFinal = await parseHtml(doc2.body);
      const header = docFinal.querySelector("div.card-header")?.textContent || "";
      const quality = extractQuality(header);
      for (const btn of docFinal.querySelectorAll("a.btn")) {
        const link = btn.getAttribute("href") || "";
        const text = btn.textContent.toLowerCase();
        if (!link || isBlockedButton(text)) continue;
        if (text.includes("fsl server") || text.includes("fslv2")) {
          streams.push(new StreamResult({ url: link, source: `${referer} [FSL Server]`, quality, headers: DEFAULT_HEADERS }));
        } else if (text.includes("download file")) {
          streams.push(new StreamResult({ url: link, source: `${referer} ${quality}`, quality, headers: DEFAULT_HEADERS }));
        } else if (text.includes("buzzserver")) {
          try {
            const resp = await http_get(link.endsWith("/") ? link + "download" : link + "/download", { ...DEFAULT_HEADERS, Referer: link });
            const redirect = resp.headers?.["hx-redirect"] || resp.headers?.["HX-Redirect"];
            if (redirect) streams.push(new StreamResult({ url: redirect, source: `${referer} [BuzzServer]`, quality, headers: DEFAULT_HEADERS }));
          } catch (e) {}
        } else if (text.includes("pixeldra") || text.includes("pixelserver") || text.includes("pixeldrain")) {
          const base = new URL(link).origin;
          const id = link.split("/").pop();
          streams.push(new StreamResult({ url: link.includes("download") ? link : `${base}/api/file/${id}?download`, source: `${referer} Pixeldrain`, quality, headers: DEFAULT_HEADERS }));
        }
      }
    } catch (e) { console.error("HubCloud error:", e); }
  }

  async function extractGDFlix(url, streams) {
    try {
      const res = await http_get(url, DEFAULT_HEADERS);
      const refreshMatch = res.body.match(/http-equiv=refresh[^>]+content=["']?\d+;?\s*url=([^"' ]+)/i);
      let newUrl = refreshMatch ? refreshMatch[1] : url;
      const doc = await parseHtml(newUrl);
      const fileName = doc.querySelector("ul > li.list-group-item:contains(Name)")?.textContent?.split("Name : ")[1] || "";
      const quality = extractQuality(fileName);
      for (const anchor of doc.querySelectorAll("div.text-center a")) {
        const text = anchor.textContent;
        const href = anchor.getAttribute("href") || "";
        if (!href) continue;
        if (text.includes("DIRECT DL") || text.includes("FSL V2") || text.includes("CLOUD")) {
          streams.push(new StreamResult({ url: href, source: `GDFlix [Direct] ${quality}`, quality, headers: DEFAULT_HEADERS }));
        } else if (text.includes("PixelDrain") || text.includes("Pixel")) {
          streams.push(new StreamResult({ url: href, source: `GDFlix [Pixeldrain]`, quality, headers: DEFAULT_HEADERS }));
        }
      }
      try {
        const cfRes = await http_get(newUrl.replace("file", "wfile") + "?type=1", DEFAULT_HEADERS);
        const cfLink = await parseHtml(cfRes.body).querySelector("a.btn-success")?.getAttribute("href");
        if (cfLink) streams.push(new StreamResult({ url: cfLink, source: `GDFlix [CF]`, quality, headers: DEFAULT_HEADERS }));
      } catch (e) {}
    } catch (e) { console.error("GDFlix error:", e); }
  }

  async function extractHubcdn(url, streams) {
    try {
      const res = await http_get(url, DEFAULT_HEADERS);
      const doc = await parseHtml(res.body);
      const scriptText = doc.querySelector("script")?.textContent || "";
      const reurlMatch = scriptText.match(/reurl\s*=\s*"([^"]+)"/);
      if (reurlMatch) {
        const encoded = reurlMatch[1].split("?r=")[1];
        if (encoded) {
          const decoded = base64Decode(encoded);
          const m3u8 = decoded.split("link=").pop();
          if (m3u8) streams.push(new StreamResult({ url: m3u8, source: "HubCDN", headers: { ...DEFAULT_HEADERS, Referer: url } }));
        }
      }
    } catch (e) { console.error("HubCDN error:", e); }
  }

  async function extractPixelDrain(url, streams) {
    const id = url.match(/\/u\/([a-zA-Z0-9]+)/)?.[1];
    if (id) streams.push(new StreamResult({ url: `https://pixeldrain.com/api/file/${id}?download`, source: "PixelDrain", quality: extractQuality(url), headers: DEFAULT_HEADERS }));
  }

  async function resolveExtractor(url, referer, streams) {
    if (!url) return;
    const lower = url.toLowerCase();
    if (lower.includes("hubcloud") || lower.includes("hub.") || lower.includes("fsl")) {
      await extractHubCloud(url, referer || "HubCloud", streams);
    } else if (lower.includes("gdflix") || lower.includes("gdlink")) {
      await extractGDFlix(url, streams);
    } else if (lower.includes("hubcdn") || lower.includes("hubcdnn")) {
      await extractHubcdn(url, streams);
    } else if (lower.includes("pixeldrain")) {
      await extractPixelDrain(url, streams);
    } else {
      streams.push(new StreamResult({ url, source: "Direct", quality: extractQuality(url), headers: DEFAULT_HEADERS }));
    }
  }

  async function getHome(cb) {
    try {
      const base = await getBaseUrl();
      const sections = [
        { name: "Trending", path: "" },
        { name: "Bollywood", path: "category/bollywood" },
        { name: "Hollywood", path: "category/hollywood" },
        { name: "Gujarati", path: "category/gujarati" },
        { name: "South Indian", path: "category/southindian" },
        { name: "Web Series", path: "category/webseries" },
        { name: "Adult", path: "category/adult/" }
      ];
      const homeData = {};
      for (const section of sections) {
        try {
          const doc = await fetchAndParse(`${base}/${section.path}`);
          const items = [];
          for (const card of await doc.querySelectorAll("div.simple-grid-grid-post")) {
            const titleEl = card.querySelector("h3");
            const linkEl = card.querySelector("h3 a");
            const imgEl = card.querySelector("img");
            if (!titleEl || !linkEl) continue;
            const title = cleanTitle(titleEl.textContent);
            const href = absUrl(linkEl.getAttribute("href"), base);
            const poster = imgEl ? absUrl(imgEl.getAttribute("data-src") || imgEl.getAttribute("src") || "", base) : "";
            if (!href) continue;
            const isSeries = href.includes("/series/") || title.toLowerCase().includes("season");
            items.push(new MultimediaItem({ title, url: href, posterUrl: poster, type: isSeries ? "series" : "movie", quality: getSearchQuality(title) }));
          }
          if (items.length > 0) homeData[section.name] = items;
        } catch (e) { console.error(`Error: ${section.name}`, e); }
      }
      cb({ success: true, data: homeData });
    } catch (e) { cb({ success: false, errorCode: "HOME_ERROR", message: e.message }); }
  }

  async function search(query, cb) {
    try {
      const base = await getBaseUrl();
      const doc = await fetchAndParse(`${base}/page/1/?s=${encodeURIComponent(query)}`);
      const items = [];
      for (const card of await doc.querySelectorAll("div.simple-grid-grid-post")) {
        const titleEl = card.querySelector("h3");
        const linkEl = card.querySelector("h3 a");
        const imgEl = card.querySelector("img");
        if (!titleEl || !linkEl) continue;
        const title = cleanTitle(titleEl.textContent);
        const href = absUrl(linkEl.getAttribute("href"), base);
        const poster = imgEl ? absUrl(imgEl.getAttribute("data-src") || imgEl.getAttribute("src") || "", base) : "";
        if (!href) continue;
        const isSeries = href.includes("/series/") || title.toLowerCase().includes("season");
        items.push(new MultimediaItem({ title, url: href, posterUrl: poster, type: isSeries ? "series" : "movie", quality: getSearchQuality(title) }));
      }
      cb({ success: true, data: items });
    } catch (e) { cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message }); }
  }

  async function load(url, cb) {
    try {
      const doc = await fetchAndParse(url);
      const info = extractMetaInfo(doc);
      const title = info.title || "Unknown";
      const isSeries = info.typeRaw.toLowerCase().includes("series") || url.includes("/series/");
      const type = isSeries ? "series" : "movie";
      const imdbId = info.imdbUrl ? info.imdbUrl.split("/title/")[1]?.split("/")[0]?.replace(/[^a-zA-Z0-9]/g, "") : "";
      let meta = null;
      if (imdbId) {
        try {
          const metaRes = await http_get(`${CINEMETA_URL}/${type}/${imdbId}.json`, DEFAULT_HEADERS);
          if (metaRes.body?.trim().startsWith("{")) meta = safeJsonParse(metaRes.body)?.meta;
        } catch (e) {}
      }
      const hrefs = [];
      for (const btn of await doc.querySelectorAll("a.maxbutton, a[href*='download']")) {
        const href = btn.getAttribute("href");
        if (href?.startsWith("http") && !isBlockedButton(btn.textContent)) hrefs.push(href);
      }
      const linksJson = JSON.stringify(hrefs);
      const result = new MultimediaItem({
        title: meta?.name || title,
        url: url,
        posterUrl: meta?.poster || info.poster || "",
        bannerUrl: meta?.background || info.poster,
        description: meta?.description || info.plot || info.description || "",
        type: type,
        year: meta?.year ? parseInt(meta.year) : (parseInt(info.yearRaw) || null),
        tags: meta?.genres || [],
        score: meta?.imdbRating ? parseFloat(meta.imdbRating) : 0,
        episodes: []
      });
      if (meta?.appExtras?.cast) result.cast = meta.appExtras.cast.map(c => ({ name: c.name })).filter(c => c.name);
      if (imdbId) result.imdbId = imdbId;
      if (isSeries) {
        const episodeMap = new Map();
        for (const h4 of await doc.querySelectorAll("h4")) {
          const seasonMatch = h4.textContent.match(/Season\s*(\d+)/i);
          if (!seasonMatch) continue;
          const seasonNum = parseInt(seasonMatch[1]);
          let sibling = h4.nextElementSibling();
          while (sibling && sibling.tagName === "P") {
            for (const seasonBtn of sibling.querySelectorAll("a.maxbutton, a[href*='download']")) {
              if (isBlockedButton(seasonBtn.textContent)) continue;
              const seasonPageUrl = seasonBtn.getAttribute("href");
              if (!seasonPageUrl?.startsWith("http")) continue;
              try {
                const seasonDoc = await fetchAndParse(seasonPageUrl);
                for (const epBtn of seasonDoc.querySelectorAll("a.maxbutton-ep, a[href*='episode'], a[href*='ep-']")) {
                  const epUrl = epBtn.getAttribute("href");
                  const epText = epBtn.textContent;
                  if (!epUrl?.startsWith("http") || isBlockedButton(epText)) continue;
                  const epMatch = epText.match(/(?:Episode|Ep|E)\s*(\d+)/i);
                  const epNum = epMatch ? parseInt(epMatch[1]) : 1;
                  const key = `${seasonNum}-${epNum}`;
                  if (!episodeMap.has(key)) {
                    episodeMap.set(key, { name: epText, url: JSON.stringify([epUrl]), season: seasonNum, episode: epNum, posterUrl: result.posterUrl });
                  }
                }
              } catch (e) {}
            }
            sibling = sibling.nextElementSibling();
          }
        }
        if (meta?.videos) {
          const metaMap = new Map(meta.videos.map(v => [`${v.season}-${v.episode}`, v]));
          result.episodes = Array.from(episodeMap.values()).map(ep => {
            const metaEp = metaMap.get(`${ep.season}-${ep.episode}`);
            return new Episode({ name: metaEp?.name || ep.name, url: ep.url, season: ep.season, episode: ep.episode, posterUrl: metaEp?.thumbnail || ep.posterUrl, description: metaEp?.overview || "" });
          }).sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
        } else {
          result.episodes = Array.from(episodeMap.values()).sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
        }
        if (!result.episodes.length) result.episodes = [new Episode({ name: title, url: linksJson, season: 1, episode: 1 })];
      } else {
        result.episodes = [new Episode({ name: title, url: linksJson, season: 1, episode: 1, posterUrl: result.posterUrl })];
      }
      cb({ success: true, data: result });
    } catch (e) { console.error("Load error:", e); cb({ success: false, errorCode: "LOAD_ERROR", message: e.message }); }
  }

  async function loadStreams(url, cb) {
    try {
      const streams = [];
      let links = [];
      try {
        const parsed = safeJsonParse(url);
        if (Array.isArray(parsed)) links = parsed;
        else if (typeof parsed === "string") links = [parsed];
      } catch { links = url.startsWith("http") ? [url] : []; }
      if (!links.length) { cb({ success: true, data: [] }); return; }
      await Promise.all(links.map(async link => { if (typeof link === "string") await resolveExtractor(link, "DudeFilms", streams); }));
      cb({ success: true, data: streams });
    } catch (e) { cb({ success: false, errorCode: "STREAM_ERROR", message: e.message }); }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
  globalThis.loadLinks = loadStreams;
})();
