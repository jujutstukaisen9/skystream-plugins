(function () {
  /**
   * 5Movierulz SkyStream Gen 2 Plugin
   * Scrapes movies from 5movierulz.army
   * Implements: getHome, search, load, loadStreams
   */

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

  function getBaseUrl() {
    return (manifest && manifest.baseUrl) || "https://www.5movierulz.army";
  }

  function getHeaders() {
    return {
      "User-Agent": UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: getBaseUrl() + "/",
    };
  }

  // ─── URL Helpers ───────────────────────────────────────────────

  function normalizeUrl(url, base) {
    if (!url) return "";
    const raw = String(url).trim();
    if (!raw) return "";
    if (raw.startsWith("//")) return "https:" + raw;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) return (base || getBaseUrl()) + raw;
    return (base || getBaseUrl()) + "/" + raw;
  }

  // ─── Text Helpers ─────────────────────────────────────────────

  function htmlDecode(text) {
    if (!text) return "";
    return String(text)
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(
        /&#(\d+);/g,
        (_, code) => String.fromCharCode(parseInt(code, 10))
      );
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

  function parseYear(text) {
    const m = String(text || "").match(/\b(19\d{2}|20\d{2})\b/);
    return m ? parseInt(m[1], 10) : undefined;
  }

  function cleanTitle(raw) {
    return htmlDecode(String(raw || ""))
      .replace(/\s+/g, " ")
      .trim();
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

  // ─── HTTP Helpers ─────────────────────────────────────────────

  async function request(url, headers) {
    return http_get(url, {
      headers: Object.assign({}, getHeaders(), headers || {}),
    });
  }

  async function loadDoc(url, headers) {
    const res = await request(url, headers);
    return parseHtml(res.body);
  }

  async function fetchRawBody(url, headers) {
    const res = await request(url, headers);
    return res.body || "";
  }

  // ─── Parsing: Homepage / Category / Search listing ────────────

  /**
   * The site uses:
   *   <li>
   *     <div class="boxed film">
   *       <div class="cont_display">
   *         <a title="..." href="..."><img src="..." alt="..."></a>
   *       </div>
   *       <p><b>Title text</b></p>
   *     </div>
   *   </li>
   */
  function parseBoxedFilm(card) {
    if (!card) return null;
    const a = card.querySelector("a[href]");
    if (!a) return null;
    const href = normalizeUrl(getAttr(a, "href"));
    if (!href || href === getBaseUrl() + "/" || href === getBaseUrl())
      return null;
    // Skip menu / non-movie links
    if (
      href.includes("/category/") ||
      href.includes("/language/") ||
      href.includes("/quality/") ||
      href.includes("/download-movierulz") ||
      href.includes("#")
    )
      return null;

    const img = card.querySelector("img");
    const title = cleanTitle(
      textOf(card.querySelector("p b, p strong")) ||
        getAttr(a, "title") ||
        getAttr(img, "alt", "title") ||
        textOf(a)
    );
    if (!title || title.length < 3) return null;

    const posterUrl = normalizeUrl(
      getAttr(img, "src", "data-src", "data-lazy-src")
    );
    const type =
      /series|season|episode/i.test(href + " " + title) ? "series" : "movie";

    return new MultimediaItem({
      title,
      url: href,
      posterUrl,
      type,
      contentType: type,
      year: parseYear(title),
    });
  }

  /**
   * Collect movie items from a page document.
   * Primary selector: .boxed.film (the exact structure used on 5movierulz).
   * Falls back to broader selectors if needed.
   */
  function collectItems(doc) {
    let found = [];

    // Primary: .boxed.film cards
    const boxedCards = Array.from(doc.querySelectorAll(".boxed.film"));
    for (const card of boxedCards) {
      const item = parseBoxedFilm(card);
      if (item) found.push(item);
    }

    // Fallback: li elements that contain an anchor with a movie href
    if (found.length < 3) {
      const lis = Array.from(
        doc.querySelectorAll("#list li, .content li, .films li")
      );
      for (const li of lis) {
        const item = parseBoxedFilm(li);
        if (item) found.push(item);
      }
    }

    return uniqueByUrl(found);
  }

  // ─── getHome ──────────────────────────────────────────────────

  async function getHome(cb) {
    try {
      const base = getBaseUrl();
      const sections = [
        { name: "Latest", path: "" },
        { name: "Featured", path: "/movies?sort=featured" },
        { name: "Bollywood", path: "/category/bollywood-featured" },
        { name: "Telugu", path: "/category/telugu-featured" },
        { name: "Tamil", path: "/category/tamil-featured" },
        { name: "Malayalam", path: "/category/malayalam-featured" },
        { name: "Hollywood", path: "/category/hollywood-featured" },
        { name: "Hindi Dubbed", path: "/language/hindi-dubbed" },
      ];

      const homeData = {};

      for (const section of sections) {
        try {
          const url = section.path ? base + section.path : base;
          const doc = await loadDoc(url);
          const items = collectItems(doc);
          if (items.length > 0) {
            homeData[section.name] = items.slice(0, 30);
          }
        } catch (err) {
          console.error(
            "[5Movierulz] Error loading section " + section.name + ":",
            err
          );
          homeData[section.name] = [];
        }
      }

      cb({ success: true, data: homeData });
    } catch (e) {
      cb({
        success: false,
        errorCode: "HOME_ERROR",
        message: String(e?.message || e),
      });
    }
  }

  // ─── search ───────────────────────────────────────────────────

  async function search(query, cb) {
    try {
      const raw = String(query || "").trim();
      if (!raw) return cb({ success: true, data: [] });

      const q = encodeURIComponent(raw);
      // The site uses GET /search_movies?s=QUERY
      const searchUrl = getBaseUrl() + "/search_movies?s=" + q;
      const doc = await loadDoc(searchUrl);
      const items = collectItems(doc);

      cb({ success: true, data: uniqueByUrl(items).slice(0, 40) });
    } catch (e) {
      cb({
        success: false,
        errorCode: "SEARCH_ERROR",
        message: String(e?.message || e),
      });
    }
  }

  // ─── load (movie detail page) ─────────────────────────────────

  /**
   * The movie detail page has:
   *  - <h2 class="entry-title">Title</h2>
   *  - og:image meta for poster
   *  - og:description meta for description
   *  - A JS block: var locations = ["url1","url2",...];
   *  - Stream links as <a> tags with hostnames like streamlare, uperbox, streamwish, filelions, etc.
   *
   * For `load`, we store the movie page URL itself in the episode URL.
   * The `loadStreams` function will re-fetch the page and extract streams.
   */
  async function load(url, cb) {
    try {
      const target = normalizeUrl(url);
      const doc = await loadDoc(target);
      const rawBody = doc.body?.innerHTML || "";

      // Title
      const title = cleanTitle(
        textOf(doc.querySelector("h2.entry-title")) ||
          textOf(doc.querySelector("h1")) ||
          getAttr(
            doc.querySelector('meta[property="og:title"]'),
            "content"
          ) ||
          "Unknown"
      );

      // Poster
      const posterUrl = normalizeUrl(
        getAttr(
          doc.querySelector('meta[property="og:image"]'),
          "content"
        ) ||
          getAttr(
            doc.querySelector("article img, .entry-content img, #post img"),
            "src",
            "data-src"
          )
      );

      // Description
      const description = cleanTitle(
        getAttr(
          doc.querySelector('meta[property="og:description"]'),
          "content"
        ) || ""
      );

      const contentType =
        /series|season|episode/i.test(target + " " + title)
          ? "series"
          : "movie";
      const year = parseYear(title + " " + description);

      // Extract stream links from the detail page to store in episodes
      const streamData = extractStreamDataFromPage(doc, rawBody, target);

      const item = new MultimediaItem({
        title,
        url: target,
        posterUrl,
        bannerUrl: posterUrl,
        description,
        type: contentType,
        contentType,
        year,
        episodes: [
          new Episode({
            name: title,
            url: JSON.stringify(streamData),
            season: 1,
            episode: 1,
            posterUrl,
          }),
        ],
      });

      cb({ success: true, data: item });
    } catch (e) {
      cb({
        success: false,
        errorCode: "LOAD_ERROR",
        message: String(e?.message || e),
      });
    }
  }

  // ─── Stream extraction helpers ────────────────────────────────

  /**
   * Extract all stream sources from a movie detail page.
   * Returns an array of {url, name} objects.
   *
   * Sources:
   * 1. `var locations = [...]` JS array (primary player embeds)
   * 2. <a> tags linking to known hosts (streamlare, streamwish, filelions, etc.)
   * 3. <iframe> sources
   */
  function extractStreamDataFromPage(doc, rawBody, pageUrl) {
    const streams = [];
    const seen = new Set();

    function addStream(url, name) {
      if (!url || seen.has(url)) return;
      // Skip internal site links
      const base = getBaseUrl();
      if (url.startsWith(base) && !url.includes("video")) return;
      if (url === "#" || url.endsWith("#")) return;
      seen.add(url);
      streams.push({ url, name: name || guessHostName(url) });
    }

    // 1. Extract from var locations = [...] in JavaScript
    const locMatch = rawBody.match(
      /var\s+locations\s*=\s*\[([\s\S]*?)\]/i
    );
    if (locMatch) {
      const locContent = locMatch[1];
      // Extract quoted strings, handling escaped slashes
      const urlMatches = locContent.match(/"([^"]+)"/g) || [];
      urlMatches.forEach((m, idx) => {
        let u = m.replace(/^"|"$/g, "");
        u = u.replace(/\\\//g, "/");
        addStream(u, "Player " + (idx + 1));
      });
    }

    // 2. Extract <a> tags linking to known video hosts
    const knownHosts = [
      "streamlare",
      "uperbox",
      "easysyncr",
      "streamwish",
      "filelions",
      "streamvin",
      "vcdnlare",
      "streamtape",
      "doodstream",
      "mixdrop",
      "upstream",
      "vtube",
      "vidoza",
      "supervideo",
      "fembed",
      "gdplayer",
      "embedsito",
      "watchfree",
      "123onlinewatch",
      "hubcloud",
      "gdflix",
      "gdlink",
    ];

    const allAnchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const a of allAnchors) {
      const href = getAttr(a, "href");
      if (!href || !href.startsWith("http")) continue;

      const hrefLower = href.toLowerCase();
      const isKnownHost = knownHosts.some((h) => hrefLower.includes(h));
      if (isKnownHost) {
        const linkText = textOf(a) || "";
        // Try to extract host name from link text
        let name = "";
        const dashMatch = linkText.match(
          /(?:watch\s*online|download)\s*[-–—]\s*(.+)/i
        );
        if (dashMatch) {
          name = dashMatch[1].trim();
        } else {
          name = guessHostName(href);
        }
        addStream(href, name);
      }
    }

    // 3. Extract from mv_button_css links (download/watch buttons)
    const buttons = Array.from(doc.querySelectorAll("a.mv_button_css"));
    for (const btn of buttons) {
      const href = getAttr(btn, "href");
      if (href && href.startsWith("http")) {
        addStream(href, textOf(btn) || guessHostName(href));
      }
    }

    // 4. Extract iframe sources
    const iframes = Array.from(doc.querySelectorAll("iframe[src]"));
    for (const iframe of iframes) {
      const src = getAttr(iframe, "src");
      if (src && src.startsWith("http")) {
        addStream(src, "Embedded Player");
      }
    }

    // 5. Fallback: look for any external links in the article content
    if (streams.length === 0) {
      const articleLinks = Array.from(
        doc.querySelectorAll(
          "article a[href], .entry-content a[href], #post a[href]"
        )
      );
      for (const a of articleLinks) {
        const href = getAttr(a, "href");
        if (!href || !href.startsWith("http")) continue;
        const base = getBaseUrl();
        if (href.startsWith(base)) continue;
        if (href.includes("google") || href.includes("facebook")) continue;
        addStream(href, textOf(a) || guessHostName(href));
      }
    }

    // If still nothing, store the page URL itself so loadStreams can re-fetch
    if (streams.length === 0) {
      streams.push({ url: pageUrl, name: "Page", isPageUrl: true });
    }

    return streams;
  }

  function guessHostName(url) {
    try {
      const hostname = new URL(url).hostname
        .replace(/^www\./, "")
        .replace(/^ww\d+\./, "");
      const parts = hostname.split(".");
      return parts.length > 1
        ? parts[parts.length - 2].charAt(0).toUpperCase() +
            parts[parts.length - 2].slice(1)
        : hostname;
    } catch (_) {
      return "Unknown";
    }
  }

  // ─── loadStreams ───────────────────────────────────────────────

  /**
   * loadStreams receives the episode URL which is a JSON-stringified array
   * of {url, name} objects from the load() function.
   *
   * For each URL:
   * - If it's an HLS/m3u8 link → direct stream
   * - If it's an MP4 link → direct stream
   * - If it's an embed player page (streamvin, vcdnlare, etc.) → fetch & extract
   * - Otherwise → return as iframe/direct link
   */
  async function loadStreams(url, cb) {
    try {
      const streams = [];
      let urlsToProcess = [];

      // Parse the JSON array from episode URL
      try {
        const parsed = JSON.parse(url);
        if (Array.isArray(parsed)) {
          urlsToProcess = parsed;
        } else if (typeof parsed === "object" && parsed.url) {
          urlsToProcess = [parsed];
        } else {
          urlsToProcess = [{ url: url, name: "Direct" }];
        }
      } catch (_) {
        urlsToProcess = [{ url: url, name: "Direct" }];
      }

      for (const item of urlsToProcess) {
        const streamUrl =
          typeof item === "string" ? item : item.url || "";
        const streamName =
          typeof item === "string" ? "Direct" : item.name || "Direct";
        const isPageUrl = item.isPageUrl === true;

        if (!streamUrl) continue;

        try {
          if (isPageUrl) {
            // Re-fetch the movie page and extract streams
            const pageStreams = await extractStreamsFromMoviePage(streamUrl);
            streams.push(...pageStreams);
          } else if (
            streamUrl.includes(".m3u8") ||
            streamUrl.includes("t=hls")
          ) {
            streams.push(
              new StreamResult({
                url: streamUrl,
                source: "5Movierulz - " + streamName + " (HLS)",
                headers: {
                  Referer: getBaseUrl() + "/",
                  "User-Agent": UA,
                },
              })
            );
          } else if (streamUrl.includes(".mp4")) {
            streams.push(
              new StreamResult({
                url: streamUrl,
                source: "5Movierulz - " + streamName + " (MP4)",
                headers: {
                  Referer: getBaseUrl() + "/",
                  "User-Agent": UA,
                },
              })
            );
          } else if (
            streamUrl.includes("streamvin") ||
            streamUrl.includes("vcdnlare")
          ) {
            // Try to extract actual stream from embed pages
            const extracted = await extractFromEmbedPage(
              streamUrl,
              streamName
            );
            streams.push(...extracted);
          } else if (
            streamUrl.includes("streamwish") ||
            streamUrl.includes("filelions") ||
            streamUrl.includes("streamtape") ||
            streamUrl.includes("doodstream") ||
            streamUrl.includes("mixdrop")
          ) {
            // These are known embed hosts - try extraction
            const extracted = await extractFromEmbedPage(
              streamUrl,
              streamName
            );
            if (extracted.length > 0) {
              streams.push(...extracted);
            } else {
              // Fallback: return as iframe source
              streams.push(
                new StreamResult({
                  url: streamUrl,
                  source: "5Movierulz - " + streamName,
                  headers: {
                    Referer: getBaseUrl() + "/",
                    "User-Agent": UA,
                  },
                })
              );
            }
          } else {
            // Generic: return as direct link
            streams.push(
              new StreamResult({
                url: streamUrl,
                source: "5Movierulz - " + streamName,
                headers: {
                  Referer: getBaseUrl() + "/",
                  "User-Agent": UA,
                },
              })
            );
          }
        } catch (err) {
          console.error(
            "[5Movierulz] Error processing stream " + streamUrl + ":",
            err
          );
          // Still add as fallback
          streams.push(
            new StreamResult({
              url: streamUrl,
              source: "5Movierulz - " + streamName + " (Fallback)",
              headers: {
                Referer: getBaseUrl() + "/",
                "User-Agent": UA,
              },
            })
          );
        }
      }

      cb({ success: true, data: streams });
    } catch (e) {
      cb({
        success: false,
        errorCode: "STREAM_ERROR",
        message: String(e?.message || e),
      });
    }
  }

  /**
   * Re-fetch a movie page and extract all streams when the page URL was stored.
   */
  async function extractStreamsFromMoviePage(pageUrl) {
    const streams = [];
    try {
      const body = await fetchRawBody(pageUrl);
      const doc = await parseHtml(body);
      const streamData = extractStreamDataFromPage(doc, body, pageUrl);

      for (const item of streamData) {
        if (item.isPageUrl) continue; // prevent infinite loop
        if (item.url.includes(".m3u8") || item.url.includes("t=hls")) {
          streams.push(
            new StreamResult({
              url: item.url,
              source: "5Movierulz - " + item.name + " (HLS)",
              headers: { Referer: pageUrl, "User-Agent": UA },
            })
          );
        } else {
          streams.push(
            new StreamResult({
              url: item.url,
              source: "5Movierulz - " + item.name,
              headers: { Referer: pageUrl, "User-Agent": UA },
            })
          );
        }
      }
    } catch (err) {
      console.error("[5Movierulz] extractStreamsFromMoviePage error:", err);
    }
    return streams;
  }

  /**
   * Try to extract a playable video URL from an embed page.
   * Common patterns:
   *  - file:"https://...m3u8" or source: [{file:"..."}]
   *  - jwplayer(...).setup({sources:[{file:"..."}]})
   *  - <source src="...">
   *  - eval(function(p,a,c,k,e,d){...}) packed JS
   */
  async function extractFromEmbedPage(embedUrl, name) {
    const streams = [];
    try {
      const body = await fetchRawBody(embedUrl, {
        Referer: getBaseUrl() + "/",
      });

      // Pattern 1: file:"url" or file:'url'
      const fileMatches =
        body.match(/file\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/gi) ||
        [];
      for (const fm of fileMatches) {
        const urlMatch = fm.match(/["']([^"']+)/);
        if (urlMatch) {
          const u = urlMatch[1].replace(/\\\//g, "/");
          streams.push(
            new StreamResult({
              url: u,
              source:
                "5Movierulz - " +
                name +
                (u.includes(".m3u8") ? " (HLS)" : " (MP4)"),
              headers: { Referer: embedUrl, "User-Agent": UA },
            })
          );
        }
      }

      // Pattern 2: sources:[{src:"url"...}] or sources:[{file:"url"...}]
      if (streams.length === 0) {
        const srcMatches =
          body.match(
            /(?:src|file)\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)/gi
          ) || [];
        for (const sm of srcMatches) {
          const urlMatch = sm.match(/["'](https?:\/\/[^"']+)/);
          if (urlMatch) {
            const u = urlMatch[1].replace(/\\\//g, "/");
            streams.push(
              new StreamResult({
                url: u,
                source: "5Movierulz - " + name,
                headers: { Referer: embedUrl, "User-Agent": UA },
              })
            );
          }
        }
      }

      // Pattern 3: <source src="...">
      if (streams.length === 0) {
        const doc = await parseHtml(body);
        const sources = Array.from(doc.querySelectorAll("source[src]"));
        for (const s of sources) {
          const src = getAttr(s, "src");
          if (src && src.startsWith("http")) {
            streams.push(
              new StreamResult({
                url: src,
                source: "5Movierulz - " + name,
                headers: { Referer: embedUrl, "User-Agent": UA },
              })
            );
          }
        }
      }

      // Pattern 4: Generic URL extraction for m3u8/mp4
      if (streams.length === 0) {
        const genericMatches =
          body.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi) ||
          [];
        const seen = new Set();
        for (const gm of genericMatches) {
          const clean = gm.replace(/\\\//g, "/").replace(/\\u002F/g, "/");
          if (!seen.has(clean)) {
            seen.add(clean);
            streams.push(
              new StreamResult({
                url: clean,
                source: "5Movierulz - " + name + " (Extracted)",
                headers: { Referer: embedUrl, "User-Agent": UA },
              })
            );
          }
        }
      }
    } catch (err) {
      console.error("[5Movierulz] extractFromEmbedPage error:", err);
    }
    return streams;
  }

  // ─── Register global functions ────────────────────────────────

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
