/**
 * DudeFilms SkyStream Plugin
 * Ported from CloudStream Kotlin provider by phisher98
 *
 * Source: https://github.com/phisher98/cloudstream-extensions-phisher/tree/master/DudeFilms
 *
 * Implements:
 *  - getHomePage()   ← getMainPage()
 *  - search()        ← search()
 *  - load()          ← load()
 *  - loadLinks()     ← loadLinks()
 *  - Extractors      ← Extractors.kt + Utils.kt
 */

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = "https://dudefilms.llc";
const TMDB_API_KEY = "98ae14df2b8d8f8f8136499daf79f0e0"; // optional: set via plugin settings for TMDB enrichment

// Homepage category definitions ← mainPage list in dudefilms.kt
const HOME_SECTIONS = [
  { name: "Latest Movies",        path: "/category/movies/page/",    type: "movie" },
  { name: "Latest Web Series",    path: "/category/web-series/page/", type: "tv"    },
  { name: "Bollywood Movies",     path: "/category/bollywood/page/",  type: "movie" },
  { name: "South Indian Dubbed",  path: "/category/south-indian-hindi-dubbed/page/", type: "movie" },
  { name: "Hollywood Dubbed",     path: "/category/hollywood-hindi-dubbed/page/",    type: "movie" },
  { name: "Netflix Series",       path: "/category/netflix/page/",    type: "tv"    },
  { name: "Amazon Prime",         path: "/category/amazon-prime/page/", type: "tv"  },
];

// Known video-host patterns and their resolver strategies ← Extractors.kt
const EXTRACTOR_PATTERNS = [
  { pattern: /speedostream|speedo/i,     resolver: resolveSpeedostream },
  { pattern: /doodstream|dood\./i,       resolver: resolveDoodstream   },
  { pattern: /streamtape/i,             resolver: resolveStreamtape   },
  { pattern: /voe\.sx|voe\./i,           resolver: resolveVoe          },
  { pattern: /filemoon|moonplayer/i,     resolver: resolveFilemoon     },
  { pattern: /streamhub/i,              resolver: resolveStreamhub    },
  { pattern: /mixdrop/i,                resolver: resolveMixdrop      },
];

// Default fetch headers ← CloudStream app.get() default headers
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPERS  ← Utils.kt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure URL is absolute.
 * Mirrors CloudStream fixUrl() / fixUrlNull().
 */
function fixUrl(url, base = BASE_URL) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return base.replace(/\/$/, "") + url;
  return base.replace(/\/$/, "") + "/" + url;
}

/**
 * Decode base64 string safely (works in both Node and browser contexts).
 */
function safeAtob(str) {
  try {
    if (typeof atob === "function") return atob(str);
    return Buffer.from(str, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Extract first regex capture group or return null.
 * Mirrors Kotlin's Regex.find()?.groupValues?.get(1)
 */
function regexFind(pattern, text, group = 1) {
  const match = text.match(pattern);
  return match ? match[group] || null : null;
}

/**
 * Extract all matches for a regex capture group.
 * Mirrors Kotlin's Regex.findAll()
 */
function regexFindAll(pattern, text, group = 1) {
  const re = new RegExp(pattern.source || pattern, "g");
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[group] !== undefined) results.push(m[group]);
  }
  return results;
}

/**
 * Parse quality hint from title/URL string.
 * Mirrors Utils.getQuality()
 */
function parseQuality(text) {
  if (!text) return "Unknown";
  const t = text.toUpperCase();
  if (/2160P|4K|UHD/.test(t)) return "4K";
  if (/1080P|FHD|FULL.?HD/.test(t)) return "1080p";
  if (/720P|HD/.test(t)) return "720p";
  if (/480P/.test(t)) return "480p";
  if (/360P/.test(t)) return "360p";
  return "Unknown";
}

/**
 * Clean title by removing quality/format tags.
 * Mirrors Utils.cleanTitle()
 */
function cleanTitle(raw) {
  if (!raw) return "";
  return raw
    .replace(/\(?\d{4}\)?/, "")            // year
    .replace(/\b(480p|720p|1080p|4K|HDRip|WEB-DL|BluRay|DVDRip)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Extract year from a string.
 */
function extractYear(text) {
  const m = text && text.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Build a normalized media card from raw DOM data.
 * Mirrors SearchResponse / MovieSearchResponse construction.
 */
function buildMediaCard({ title, url, poster, type, year, rating }) {
  return {
    title:  cleanTitle(title) || title,
    url:    fixUrl(url),
    poster: fixUrl(poster),
    type:   type || "movie",
    year:   year || null,
    rating: rating || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrapped fetch with merged default headers and error safety.
 * Mirrors CloudStream app.get() / app.post()
 */
async function httpGet(url, extraHeaders = {}) {
  const headers = Object.assign({}, DEFAULT_HEADERS, extraHeaders);
  const response = await skystream.fetch(url, { method: "GET", headers });
  return response;
}

async function httpPost(url, data = {}, extraHeaders = {}) {
  const headers = Object.assign({}, DEFAULT_HEADERS, {
    "Content-Type": "application/x-www-form-urlencoded",
  }, extraHeaders);
  const body = typeof data === "string" ? data :
    Object.entries(data).map(([k, v]) =>
      encodeURIComponent(k) + "=" + encodeURIComponent(v)
    ).join("&");
  const response = await skystream.fetch(url, { method: "POST", headers, body });
  return response;
}

/**
 * Fetch and parse HTML DOM.
 * Mirrors app.get(url).document
 */
async function fetchDoc(url, extraHeaders = {}) {
  const res = await httpGet(url, extraHeaders);
  return skystream.parseHTML(res.body || res.text || res);
}

/**
 * Fetch text body.
 */
async function fetchText(url, extraHeaders = {}) {
  const res = await httpGet(url, extraHeaders);
  return res.body || res.text || res || "";
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML PARSING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse article/post cards from a listing page DOM.
 * Mirrors dudefilms.kt toSearchResult() / toResult()
 * Selector matches WordPress theme used by DudeFilms.
 */
function parseMediaCards(doc) {
  const cards = [];
  // Primary selector: WordPress loop articles
  const items = doc.querySelectorAll("article.post, div.post-item, div.item");
  items.forEach((el) => {
    try {
      const anchor   = el.querySelector("a[href]");
      const imgEl    = el.querySelector("img");
      const titleEl  = el.querySelector(".entry-title, h2, h3, .title");
      const ratingEl = el.querySelector(".rating, .imdb-rating, span.gmr-rating");
      const yearEl   = el.querySelector(".gmr-meta-date, .year, time");

      const url    = anchor ? anchor.getAttribute("href") : null;
      const poster = imgEl
        ? (imgEl.getAttribute("data-src") ||
           imgEl.getAttribute("data-lazy-src") ||
           imgEl.getAttribute("src"))
        : null;
      const title  = titleEl ? titleEl.textContent.trim() : (anchor ? anchor.textContent.trim() : "");
      const rating = ratingEl ? ratingEl.textContent.trim().replace(/[^\d.]/g, "") : null;
      const yearText = yearEl ? yearEl.textContent.trim() : title;
      const year   = extractYear(yearText);

      // Determine type from URL / category hint
      const type   = url && /series|season|episode|tv/i.test(url) ? "tv" : "movie";

      if (url && title) {
        cards.push(buildMediaCard({ title, url, poster, type, year, rating }));
      }
    } catch (_) { /* skip malformed card */ }
  });
  return cards;
}

/**
 * Parse episode list from a TV show detail page.
 * Mirrors TvSeriesLoadResponse episode list construction.
 */
function parseEpisodes(doc, showUrl) {
  const episodes = [];
  // DudeFilms uses accordion / season tabs with episode links
  const seasonBlocks = doc.querySelectorAll(
    ".gmr-listseries, .series-list, .episodelist, ul.episodios"
  );

  let seasonNum = 1;
  seasonBlocks.forEach((block) => {
    // Try to detect season number from heading
    const heading = block.previousElementSibling || block.querySelector("h2, h3, .season-title");
    if (heading) {
      const sMatch = heading.textContent.match(/season\s*(\d+)/i);
      if (sMatch) seasonNum = parseInt(sMatch[1], 10);
    }

    const epLinks = block.querySelectorAll("a[href]");
    let epNum = 1;
    epLinks.forEach((a) => {
      const epUrl   = fixUrl(a.getAttribute("href"));
      const epTitle = a.textContent.trim();
      const epMatch = epTitle.match(/episode\s*(\d+)/i) || epTitle.match(/ep[.\s]*(\d+)/i);
      if (epMatch) epNum = parseInt(epMatch[1], 10);

      if (epUrl && epTitle) {
        episodes.push({
          title:   epTitle,
          url:     epUrl,
          season:  seasonNum,
          episode: epNum,
        });
        epNum++;
      }
    });
    seasonNum++;
  });

  // Fallback: single-level episode links (many DudeFilms series pages)
  if (episodes.length === 0) {
    doc.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/episode|ep-\d|S\d+E\d+/i.test(href) && href.includes(BASE_URL.replace("https://", ""))) {
        episodes.push({
          title:   a.textContent.trim(),
          url:     fixUrl(href),
          season:  1,
          episode: episodes.length + 1,
        });
      }
    });
  }

  return episodes;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTORS  ← Extractors.kt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Master extractor dispatcher.
 * Examines URL and routes to the correct resolver.
 * Mirrors the when() block in loadLinks().
 */
async function extractStreamLinks(embedUrl, quality = "Unknown") {
  for (const { pattern, resolver } of EXTRACTOR_PATTERNS) {
    if (pattern.test(embedUrl)) {
      try {
        const links = await resolver(embedUrl, quality);
        return Array.isArray(links) ? links : (links ? [links] : []);
      } catch (e) {
        console.warn("[DudeFilms] Extractor failed for", embedUrl, e.message);
        return [];
      }
    }
  }
  // Generic iframe scrape fallback
  return genericExtract(embedUrl, quality);
}

/**
 * Generic extractor: scrape m3u8 / mp4 from page source.
 * Mirrors Utils.extractM3u8()
 */
async function genericExtract(url, quality) {
  const text = await fetchText(url, { Referer: BASE_URL });
  const links = [];

  // m3u8
  const m3u8Matches = regexFindAll(/(https?:[^"'\s]+\.m3u8[^"'\s]*)/g, text);
  m3u8Matches.forEach((src) => {
    links.push({ url: src, quality: quality || "HLS", type: "hls",
                 headers: { Referer: url } });
  });

  // mp4
  if (links.length === 0) {
    const mp4Matches = regexFindAll(/(https?:[^"'\s]+\.mp4[^"'\s]*)/g, text);
    mp4Matches.forEach((src) => {
      links.push({ url: src, quality: quality || parseQuality(src), type: "mp4",
                   headers: { Referer: url } });
    });
  }

  return links;
}

/**
 * Speedostream extractor ← SpeedoStream extractor in Extractors.kt
 * DudeFilms's primary host.
 */
async function resolveSpeedostream(url, quality) {
  const text = await fetchText(url, {
    Referer: BASE_URL,
    "X-Requested-With": "XMLHttpRequest",
  });

  // Pattern 1: direct sources array
  let sources = regexFind(/sources\s*:\s*\[{[^}]*file\s*:\s*["']([^"']+)["']/i, text);

  // Pattern 2: packed/obfuscated JS
  if (!sources) {
    const packed = regexFind(/eval\(function\(p,a,c,k,e,d\).*?\)\)/s, text);
    if (packed) {
      try {
        // eslint-disable-next-line no-eval
        const unpacked = Function(`"use strict"; return (${packed})`)();
        sources = regexFind(/file\s*:\s*["']([^"']+\.m3u8[^"']*)/i, unpacked);
      } catch (_) {}
    }
  }

  // Pattern 3: jwplayer setup
  if (!sources) {
    sources = regexFind(/file\s*:\s*["']([^"']*\.m3u8[^"']*)/i, text);
  }

  if (sources) {
    return [{
      url:     fixUrl(sources),
      quality: quality || "HLS",
      type:    "hls",
      headers: { Referer: url, Origin: new URL(url).origin },
    }];
  }
  return await genericExtract(url, quality);
}

/**
 * Doodstream extractor ← DoodExtractor in Extractors.kt
 */
async function resolveDoodstream(url, quality) {
  // Normalise to dood.wf canonical domain
  const normUrl = url.replace(/dood\.\w+/, "dood.wf");
  const text    = await fetchText(normUrl, { Referer: "https://dood.wf" });

  // Extract pass_md5 path
  const passMd5 = regexFind(/\/pass_md5\/[^"']+/i, text);
  if (!passMd5) return [];

  const passUrl = "https://dood.wf" + passMd5;
  const token   = regexFind(/\?token=([^&"'\s]+)/i, text);

  const passRes = await fetchText(passUrl, {
    Referer: normUrl,
    "X-Requested-With": "XMLHttpRequest",
  });

  if (!passRes) return [];

  // Dood appends random chars + token
  const randomStr = Math.random().toString(36).substring(2, 14);
  const finalUrl  = passRes.trim() + randomStr + (token ? "?token=" + token + "&expiry=" + Date.now() : "");

  return [{
    url:     finalUrl,
    quality: quality || "HLS",
    type:    "mp4",
    headers: { Referer: "https://dood.wf/" },
  }];
}

/**
 * Streamtape extractor ← StreamtapeExtractor
 */
async function resolveStreamtape(url, quality) {
  const text = await fetchText(url, { Referer: BASE_URL });

  // Streamtape obfuscates the link across two JS variables
  const token1 = regexFind(/id=([^&"']+)/i, text);
  const token2 = regexFind(/,\s*"([^"]+)"\s*\+\s*token/i, text) ||
                 regexFind(/robotlink\S*\s*=\s*["']([^"']+)/i, text);

  if (token1 && token2) {
    const finalUrl = "https://streamtape.com/get_video?id=" + token1 + "&stream=1";
    return [{
      url:     finalUrl,
      quality: quality || "HLS",
      type:    "mp4",
      headers: { Referer: url },
    }];
  }

  // Fallback: grep for direct mp4 link
  const direct = regexFind(/(https?:\/\/tapecontent[^"'\s]+\.mp4[^"'\s]*)/i, text);
  if (direct) {
    return [{ url: direct, quality, type: "mp4", headers: { Referer: url } }];
  }
  return [];
}

/**
 * Voe.sx extractor ← VoeExtractor
 */
async function resolveVoe(url, quality) {
  const text = await fetchText(url, { Referer: BASE_URL });

  // Voe stores HLS URL in a JS variable
  let hls = regexFind(/'hls'\s*:\s*'([^']+)'/i, text) ||
            regexFind(/"hls"\s*:\s*"([^"]+)"/i, text);

  if (!hls) {
    // Try base64 encoded payload
    const b64 = regexFind(/atob\(['"]([A-Za-z0-9+/=]+)['"]\)/i, text);
    if (b64) hls = regexFind(/\.m3u8/, safeAtob(b64)) ? safeAtob(b64) : null;
  }

  if (hls) {
    return [{
      url:     hls,
      quality: quality || "HLS",
      type:    "hls",
      headers: { Referer: url, Origin: "https://voe.sx" },
    }];
  }
  return await genericExtract(url, quality);
}

/**
 * Filemoon extractor ← FilemoonExtractor
 */
async function resolveFilemoon(url, quality) {
  const text = await fetchText(url, { Referer: BASE_URL });

  // Filemoon uses packed JS
  const packed = regexFind(/eval\(function\(p,a,c,k,e,d\).*?\)\)/s, text);
  let unpacked = "";
  if (packed) {
    try {
      unpacked = Function(`"use strict"; return (${packed})`)();
    } catch (_) { unpacked = text; }
  } else {
    unpacked = text;
  }

  const m3u8 = regexFind(/file\s*:\s*["']([^"']*\.m3u8[^"']*)/i, unpacked) ||
               regexFind(/(https?:[^"'\s]+\.m3u8[^"'\s]*)/i, unpacked);

  if (m3u8) {
    return [{
      url:     m3u8,
      quality: quality || "HLS",
      type:    "hls",
      headers: { Referer: url, Origin: new URL(url).origin },
    }];
  }
  return [];
}

/**
 * Streamhub extractor (generic fallback)
 */
async function resolveStreamhub(url, quality) {
  return await genericExtract(url, quality);
}

/**
 * Mixdrop extractor
 */
async function resolveMixdrop(url, quality) {
  const text = await fetchText(url, { Referer: BASE_URL });
  const src  = regexFind(/MDCore\.wurl\s*=\s*["']([^"']+)/i, text);
  if (src) {
    return [{
      url:     src.startsWith("//") ? "https:" + src : src,
      quality: quality || "Unknown",
      type:    "mp4",
      headers: { Referer: "https://mixdrop.co" },
    }];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMBED SCRAPER  ← loadLinks() in dudefilms.kt
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scrape all iFrame / embed URLs from a DudeFilms content page.
 * DudeFilms uses a WordPress plugin that renders server-side iframes.
 * Mirrors the iframe loop in loadLinks().
 */
async function scrapeEmbeds(pageUrl) {
  const doc    = await fetchDoc(pageUrl, { Referer: BASE_URL });
  const embeds = [];

  // Primary: <iframe src="...">
  doc.querySelectorAll("iframe[src]").forEach((frame) => {
    const src = frame.getAttribute("src");
    if (src && !src.includes("google.com/maps")) {
      embeds.push({ url: fixUrl(src), quality: "Unknown" });
    }
  });

  // Secondary: data-src iframes (lazy loaded)
  doc.querySelectorAll("iframe[data-src]").forEach((frame) => {
    const src = frame.getAttribute("data-src");
    if (src) embeds.push({ url: fixUrl(src), quality: "Unknown" });
  });

  // Tertiary: direct server links in specific WP shortcodes / divs
  // DudeFilms renders watch buttons with quality in text
  doc.querySelectorAll(
    ".wp-block-buttons a, .gmr-download-box a, .server-button a, " +
    "a[href*='speedostream'], a[href*='dood'], a[href*='streamtape'], " +
    "a[href*='voe.sx'], a[href*='filemoon'], a[href*='mixdrop']"
  ).forEach((a) => {
    const href = a.getAttribute("href");
    if (href) {
      const qualityHint = parseQuality(a.textContent || a.closest("*")?.textContent || "");
      embeds.push({ url: fixUrl(href), quality: qualityHint });
    }
  });

  // Quaternary: onclick attributes with embed URLs
  doc.querySelectorAll("[onclick]").forEach((el) => {
    const onclick = el.getAttribute("onclick") || "";
    const found   = regexFind(/(https?:\/\/[^"')\s]+)/i, onclick);
    if (found) embeds.push({ url: found, quality: "Unknown" });
  });

  // Deduplicate by URL
  const seen = new Set();
  return embeds.filter(({ url }) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// IMDB ENRICHMENT  (bonus: poster + metadata via TMDB/IMDB)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to enrich a media card with TMDB metadata.
 * Falls back to original data if TMDB unavailable.
 * Uses TMDB's free search API (no key required for basic search).
 */
async function enrichWithTMDB(card) {
  try {
    const query   = encodeURIComponent(card.title);
    const tmdbType = card.type === "tv" ? "tv" : "movie";
    const apiBase = "https://api.themoviedb.org/3";
    const searchUrl = `${apiBase}/search/${tmdbType}?query=${query}&language=en-US&page=1` +
                      (TMDB_API_KEY ? `&api_key=${TMDB_API_KEY}` : "");

    const res     = await httpGet(searchUrl, { Accept: "application/json" });
    const json    = typeof res.json === "function" ? await res.json() :
                    (res.json || JSON.parse(res.body || res.text || "{}"));
    const results = json.results || [];

    if (results.length > 0) {
      const hit     = results[0];
      const imgBase = "https://image.tmdb.org/t/p/w500";
      const poster  = hit.poster_path ? imgBase + hit.poster_path : card.poster;
      const backdrop = hit.backdrop_path ? imgBase.replace("w500","w1280") + hit.backdrop_path : null;
      const year    = (hit.release_date || hit.first_air_date || "").split("-")[0];
      const rating  = hit.vote_average ? hit.vote_average.toFixed(1) : card.rating;
      const desc    = hit.overview || card.description;
      const imdbId  = hit.imdb_id || null;

      return Object.assign({}, card, {
        poster:    poster  || card.poster,
        backdrop:  backdrop || card.backdrop || null,
        year:      year    || card.year,
        rating:    rating  || card.rating,
        description: desc  || card.description,
        imdbId:    imdbId  || card.imdbId || null,
        tmdbId:    hit.id  || null,
        tmdbType:  tmdbType,
        genres:    (hit.genre_ids || []).join(",") || card.genres || null,
      });
    }
  } catch (e) {
    // TMDB enrichment is best-effort; never break the main flow
    console.warn("[DudeFilms] TMDB enrichment failed:", e.message);
  }
  return card;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLUGIN IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

const plugin = {

  // ── Metadata ──────────────────────────────────────────────────────────────
  id:          "dudefilms",
  name:        "DudeFilms",
  version:     "1.0.0",
  baseUrl:     BASE_URL,
  language:    "hi",
  types:       ["movie", "tv"],
  hasHomePage: true,
  icon:        BASE_URL + "/wp-content/uploads/2022/09/cropped-logopng-1-32x32.png",

  // ── init ──────────────────────────────────────────────────────────────────
  /**
   * Called once after plugin load.
   * Mirrors CloudStream plugin onLoaded() / init block.
   */
  async init() {
    console.log("[DudeFilms] Plugin initialised →", BASE_URL);
  },

  // ── getHomePage ───────────────────────────────────────────────────────────
  /**
   * Returns homepage sections.
   * Mirrors getMainPage(page, request).
   *
   * @param {number} page - 1-based page number
   * @returns {{ sections: Array<{ title, items }> }}
   */
  async getHomePage(page = 1) {
    const sections = [];

    await Promise.allSettled(
      HOME_SECTIONS.map(async (section) => {
        try {
          const url = BASE_URL + section.path + page + "/";
          const doc = await fetchDoc(url);
          const items = parseMediaCards(doc);

          if (items.length > 0) {
            sections.push({
              title: section.name,
              type:  section.type,
              items,
            });
          }
        } catch (e) {
          console.warn("[DudeFilms] Homepage section failed:", section.name, e.message);
        }
      })
    );

    return { sections };
  },

  // ── search ────────────────────────────────────────────────────────────────
  /**
   * Searches DudeFilms.
   * Mirrors search(query).
   *
   * @param {string} query
   * @returns {Array<MediaCard>}
   */
  async search(query) {
    if (!query || !query.trim()) return [];

    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query.trim())}`;
    const doc       = await fetchDoc(searchUrl);
    const results   = parseMediaCards(doc);

    // Also check secondary search endpoint WordPress uses
    if (results.length === 0) {
      try {
        const altUrl = `${BASE_URL}/search/${encodeURIComponent(query.replace(/\s+/g, "+"))}/`;
        const doc2   = await fetchDoc(altUrl);
        results.push(...parseMediaCards(doc2));
      } catch (_) {}
    }

    // Deduplicate by URL
    const seen = new Set();
    return results.filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  },

  // ── load ──────────────────────────────────────────────────────────────────
  /**
   * Parses a content detail page.
   * Mirrors load(url) → MovieLoadResponse | TvSeriesLoadResponse.
   *
   * @param {string} url - Content page URL
   * @returns {MediaDetail}
   */
  async load(url) {
    const doc = await fetchDoc(url, { Referer: BASE_URL });

    // ── Title ──────────────────────────────────────────────────────────────
    const titleEl = doc.querySelector(
      "h1.entry-title, h1.post-title, h1, .entry-title"
    );
    const rawTitle = titleEl ? titleEl.textContent.trim() : "";
    const title    = cleanTitle(rawTitle) || rawTitle;

    // ── Poster ────────────────────────────────────────────────────────────
    const posterEl = doc.querySelector(
      ".entry-thumbnail img, .post-thumbnail img, img.wp-post-image, " +
      "meta[property='og:image']"
    );
    const poster = posterEl
      ? fixUrl(
          posterEl.getAttribute("content") ||
          posterEl.getAttribute("data-src") ||
          posterEl.getAttribute("src")
        )
      : null;

    // ── Background / Backdrop ─────────────────────────────────────────────
    const bgEl   = doc.querySelector("meta[property='og:image']");
    const backdrop = bgEl ? fixUrl(bgEl.getAttribute("content")) : poster;

    // ── Description ───────────────────────────────────────────────────────
    const descEl = doc.querySelector(
      ".entry-content p, .post-content p, .synopsis, .gmr-movie-description, " +
      "meta[name='description'], meta[property='og:description']"
    );
    const description = descEl
      ? (descEl.getAttribute("content") || descEl.textContent.trim())
      : "";

    // ── Year / Rating / Genres ────────────────────────────────────────────
    const year   = extractYear(rawTitle) ||
                   extractYear(doc.querySelector("time, .year, .gmr-movie-on")?.textContent || "");
    const ratingEl = doc.querySelector(".gmr-rating, .imdb-rating, .rating-count, [itemprop='ratingValue']");
    const rating   = ratingEl
      ? ratingEl.textContent.replace(/[^\d.]/g, "").trim()
      : null;
    const genreEls = doc.querySelectorAll("a[rel='category tag'], .gmr-genre a, .gmr-movie-genre a");
    const genres   = Array.from(genreEls).map((g) => g.textContent.trim()).join(", ");

    // ── Type detection ────────────────────────────────────────────────────
    const isTv = /series|season|episode|web.series/i.test(rawTitle + url + genres);
    const type = isTv ? "tv" : "movie";

    // ── IMDB ID ───────────────────────────────────────────────────────────
    const imdbLinkEl = doc.querySelector("a[href*='imdb.com/title/']");
    const imdbId     = imdbLinkEl
      ? regexFind(/title\/(tt\d+)/i, imdbLinkEl.getAttribute("href") || "")
      : null;

    // ── Episodes (TV only) ────────────────────────────────────────────────
    const episodes = isTv ? parseEpisodes(doc, url) : [];

    // ── Streaming entry points ────────────────────────────────────────────
    // For movies: current URL is the watch page.
    // For TV: each episode URL is a watch page.
    const watchUrls = isTv && episodes.length > 0
      ? episodes.map((e) => e.url)
      : [url];

    // ── Base card ─────────────────────────────────────────────────────────
    let mediaDetail = {
      title,
      url,
      poster,
      backdrop,
      description,
      year,
      rating,
      genres,
      type,
      imdbId,
      episodes: isTv ? episodes : undefined,
      watchUrls,
      sourceUrl: url,
    };

    // ── Enrich with TMDB ──────────────────────────────────────────────────
    mediaDetail = await enrichWithTMDB(mediaDetail);

    return mediaDetail;
  },

  // ── loadLinks ─────────────────────────────────────────────────────────────
  /**
   * Extracts stream links for a given watch URL.
   * Mirrors loadLinks(data, isCasting, subtitleCallback, callback).
   *
   * @param {string} url       - Watch page URL (movie or episode)
   * @param {string} showKey   - Optional show identifier (for TV episodes)
   * @returns {Array<StreamLink>}
   */
  async loadLinks(url, showKey) {
    const allLinks = [];

    // Step 1: Scrape embed URLs from the page
    const embeds = await scrapeEmbeds(url);

    if (embeds.length === 0) {
      console.warn("[DudeFilms] No embeds found at:", url);
      return allLinks;
    }

    // Step 2: Resolve each embed in parallel (bounded concurrency)
    const CONCURRENCY = 4;
    for (let i = 0; i < embeds.length; i += CONCURRENCY) {
      const batch = embeds.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(({ url: embedUrl, quality }) =>
          extractStreamLinks(embedUrl, quality)
        )
      );
      settled.forEach((result) => {
        if (result.status === "fulfilled") {
          allLinks.push(...(result.value || []));
        }
      });
    }

    // Step 3: Sort by quality preference
    const Q_ORDER = { "4K": 0, "1080p": 1, "720p": 2, "480p": 3, "360p": 4, "HLS": 5, "Unknown": 6 };
    allLinks.sort((a, b) => (Q_ORDER[a.quality] ?? 99) - (Q_ORDER[b.quality] ?? 99));

    return allLinks;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT (SkyStream plugin registration)
// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = plugin; // CommonJS / test environment
} else {
  // SkyStream runtime registration
  skystream.registerPlugin(plugin);
}
