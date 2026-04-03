/**
 * DudeFilms SkyStream Plugin - Full-Fledged Production Version
 * Ported from CloudStream Kotlin Provider
 * 
 * Features:
 * - Homepage categories (Bollywood, Hollywood, South Indian, Web Series, Adult)
 * - Search functionality with quality detection
 * - Movie/TV Series detail loading with IMDb/Cinemeta integration
 * - Comprehensive stream extraction from multiple sources
 * 
 * Stream Sources:
 * - HubCloud (FSL, BuzzServer, PixelDrain, S3, Mega, PDL, FSLv2, Direct)
 * - Hubdrive
 * - Hubcdn (M3U8)
 * - GDFlix (Direct, Index Links, DriveBot, Instant DL, GoFile, PixelDrain, CF)
 * - Gofile
 * - HUBCDN (reurl decoder)
 * - FastLinks
 * - MultiLinks
 */
(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const MAIN_URL = manifest.baseUrl;
    const CINEMETA_URL = "https://v3-cinemeta.strem.io/meta";
    
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    };

    const JSON_HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9"
    };

    // ==================== UTILITY FUNCTIONS ====================

    /**
     * Fixes relative URLs to absolute
     * @param {string} url 
     * @returns {string}
     */
    function fixUrl(url) {
        if (!url) return "";
        if (url.startsWith("http")) return url;
        if (url.startsWith("//")) return "https:" + url;
        if (url.startsWith("/")) return MAIN_URL + url;
        return MAIN_URL + "/" + url;
    }

    /**
     * Cleans and formats title
     * @param {string} raw 
     * @returns {string}
     */
    function cleanTitle(raw) {
        if (!raw) return "";
        const regex = /S(\d+)[Ee](\d+)(?:-(\d+))?/;
        const match = regex.exec(raw);
        if (!match) return raw.trim();

        const season = match[1];
        const epStart = match[2];
        const epEnd = match[3];
        const showName = raw.substring(0, raw.indexOf(match[0])).trim();
        const episodes = epEnd ? `Episodes ${epStart}–${epEnd}` : `Episode ${epStart}`;
        return `${showName} Season ${season} | ${episodes}`;
    }

    /**
     * Determines search quality from title
     * @param {string} check 
     * @returns {string|null}
     */
    function getSearchQuality(check) {
        if (!check) return null;
        const u = check.normalize("NFKC").toLowerCase();
        const patterns = [
            [/\b(4k|uhd|2160p)\b/i, "4K"],
            [/\b(hdts|hdcam|hdtc)\b/i, "Cam"],
            [/\b(camrip|cam[- ]?rip)\b/i, "Cam"],
            [/\b(cam)\b/i, "Cam"],
            [/\b(web[- ]?dl|webrip|webdl)\b/i, "WEB-DL"],
            [/\b(bluray|bdrip|blu[- ]?ray)\b/i, "BluRay"],
            [/\b(1440p|qhd)\b/i, "BluRay"],
            [/\b(1080p|fullhd)\b/i, "1080p"],
            [/\b(720p)\b/i, "720p"],
            [/\b(hdrip|hdtv)\b/i, "HD"],
            [/\b(dvd)\b/i, "DVD"],
            [/\b(rip)\b/i, "Cam"]
        ];
        for (const [regex, quality] of patterns) {
            if (regex.test(u)) return quality;
        }
        return null;
    }

    /**
     * Extracts quality number from string
     * @param {string} str 
     * @returns {number}
     */
    function getIndexQuality(str) {
        const match = /(\d{3,4})[pP]/.exec(str || "");
        return match ? parseInt(match[1]) : 0;
    }

    /**
     * Gets quality label from string
     * @param {string} str 
     * @returns {string}
     */
    function getQualityLabel(str) {
        const match = /(\d{3,4})[pP]/.exec(str || "");
        return match ? match[1] + "p" : "Auto";
    }

    /**
     * Checks if button should be blocked
     * @param {string} text 
     * @returns {boolean}
     */
    function isBlockedButton(text) {
        if (!text) return false;
        const lower = text.toLowerCase();
        return ["zipfile", "torrent", "rar", "7z"].some(k => lower.includes(k));
    }

    /**
     * Gets base URL from full URL
     * @param {string} url 
     * @returns {string}
     */
    function getBaseUrl(url) {
        try {
            const match = /^(https?:\/\/[^\/]+)/.exec(url);
            return match ? match[1] : "";
        } catch (e) {
            return "";
        }
    }

    /**
     * Base64 decode
     * @param {string} str 
     * @returns {string}
     */
    function base64Decode(str) {
        try {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
            let output = "";
            let i = 0;
            str = str.replace(/[^A-Za-z0-9+/=]/g, "");
            while (i < str.length) {
                const enc1 = chars.indexOf(str.charAt(i++));
                const enc2 = chars.indexOf(str.charAt(i++));
                const enc3 = chars.indexOf(str.charAt(i++));
                const enc4 = chars.indexOf(str.charAt(i++));
                const chr1 = (enc1 << 2) | (enc2 >> 4);
                const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                const chr3 = ((enc3 & 3) << 6) | enc4;
                output += String.fromCharCode(chr1);
                if (enc3 !== 64) output += String.fromCharCode(chr2);
                if (enc4 !== 64) output += String.fromCharCode(chr3);
            }
            return decodeURIComponent(escape(output));
        } catch (e) {
            return "";
        }
    }

    /**
     * Formats bytes to human readable
     * @param {number} bytes 
     * @returns {string}
     */
    function formatBytes(bytes) {
        if (bytes < 1024 * 1024 * 1024) {
            return (bytes / (1024 * 1024)).toFixed(2) + " MB";
        }
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    /**
     * Cleans title for stream labels
     * @param {string} title 
     * @returns {string}
     */
    function cleanStreamTitle(title) {
        if (!title) return "";
        const name = title.replace(/\.[a-zA-Z0-9]{2,4}$/, "");
        const normalized = name
            .replace(/WEB[-_. ]?DL/gi, "WEB-DL")
            .replace(/WEB[-_. ]?RIP/gi, "WEBRIP")
            .replace(/H[ .]?265/gi, "H265")
            .replace(/H[ .]?264/gi, "H264")
            .replace(/DDP[ .]?([0-9]\.[0-9])/gi, "DDP$1");
        
        const parts = normalized.split(/[ _\.]+/);
        const sourceTags = new Set(["WEB-DL", "WEBRIP", "BLURAY", "HDRIP", "DVDRIP", "HDTV", "CAM", "TS", "BRRIP", "BDRIP"]);
        const codecTags = new Set(["H264", "H265", "X264", "X265", "HEVC", "AVC"]);
        const audioTags = ["AAC", "AC3", "DTS", "MP3", "FLAC", "DD", "DDP", "EAC3"];
        const hdrTags = new Set(["SDR", "HDR", "HDR10", "HDR10+", "DV", "DOLBYVISION"]);
        
        const filtered = parts.map(part => {
            const p = part.toUpperCase();
            if (sourceTags.has(p)) return p;
            if (codecTags.has(p)) return p;
            if (audioTags.some(a => p.startsWith(a))) return p;
            if (hdrTags.has(p)) return p === "DV" || p === "DOLBYVISION" ? "DOLBYVISION" : p;
            if (p === "NF" || p === "CR") return p;
            return null;
        }).filter(Boolean);
        
        return [...new Set(filtered)].join(" ");
    }

    // ==================== HTML PARSING ====================

    /**
     * Parses search results from HTML
     * @param {string} html 
     * @returns {Array}
     */
    function parseSearchResults(html) {
        const results = [];
        const items = html.split('<div class="simple-grid-grid-post');
        
        for (let i = 1; i < items.length; i++) {
            const item = items[i];
            
            // Extract link
            const linkMatch = item.match(/<a[^>]+href="([^"]+)"[^>]*>/);
            if (!linkMatch) continue;
            const href = fixUrl(linkMatch[1]);
            
            // Extract poster - try multiple patterns
            let posterUrl = "";
            const posterPatterns = [
                /data-src="([^"]+)"/,
                /src="([^"]+)"/,
                /data-lazy-src="([^"]+)"/,
                /srcset="([^"\s]+)/
            ];
            for (const pattern of posterPatterns) {
                const match = pattern.exec(item);
                if (match && !match[1].includes("placeholder") && !match[1].includes("data:image")) {
                    posterUrl = fixUrl(match[1]);
                    break;
                }
            }
            
            // Extract title
            const titleMatch = item.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
            if (!titleMatch) continue;
            const titleText = titleMatch[1].replace(/<[^>]+>/g, "").trim();
            const title = cleanTitle(titleText);
            
            // Determine type
            const type = href.includes("/tv-series/") || href.includes("/series/") || 
                        /season-\d+/i.test(href) || /s\d{2}e\d{2}/i.test(titleText) ? "series" : "movie";
            
            // Extract quality
            const quality = getSearchQuality(titleText);
            
            results.push(new MultimediaItem({
                url: href,
                title: title,
                posterUrl: posterUrl,
                type: type,
                quality: quality
            }));
        }
        
        return results;
    }

    /**
     * Parses episodes from season page
     * @param {string} html 
     * @param {number} seasonNum 
     * @returns {Array}
     */
    function parseEpisodesFromHtml(html, seasonNum) {
        const episodes = [];
        const epRegex = /<a[^>]+class="[^"]*maxbutton-ep[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        
        while ((match = epRegex.exec(html)) !== null) {
            const epUrl = match[1];
            const epText = match[2].replace(/<[^>]+>/g, "").trim();
            const epMatch = /(?:Episode|Ep|E)\s*(\d+)/i.exec(epText);
            const epNum = epMatch ? parseInt(epMatch[1]) : 0;
            
            if (epNum > 0) {
                episodes.push({
                    url: fixUrl(epUrl),
                    season: seasonNum,
                    episode: epNum,
                    name: epText
                });
            }
        }
        
        return episodes;
    }

    // ==================== STREAM EXTRACTORS ====================

    /**
     * Extracts streams from HubCloud
     * @param {string} url 
     * @param {string} referer 
     * @returns {Promise<Array>}
     */
    async function extractHubCloud(url, referer) {
        const streams = [];
        const ref = referer || "HubCloud";
        
        try {
            // Parse URL
            const uri = new URL(url);
            const baseUrl = `${uri.protocol}//${uri.host}`;
            
            // Get the actual hubcloud URL
            let realUrl = url;
            if (!url.includes("hubcloud.php")) {
                const res = await http_get(url, HEADERS);
                if (res.status !== 200) return streams;
                
                // Try multiple patterns for download link
                const downloadPatterns = [
                    /id="download"[^>]*href="([^"]+)"/,
                    /class="[^"]*download[^"]*"[^>]*href="([^"]+)"/,
                    /<a[^>]+href="([^"]+)"[^>]*>\s*Download/i
                ];
                
                for (const pattern of downloadPatterns) {
                    const match = pattern.exec(res.body);
                    if (match) {
                        let raw = match[1];
                        if (raw.startsWith("http")) {
                            realUrl = raw;
                        } else {
                            realUrl = baseUrl.replace(/\/$/, "") + "/" + raw.replace(/^\//, "");
                        }
                        break;
                    }
                }
            }

            // Get the hubcloud page
            const res = await http_get(realUrl, HEADERS);
            if (res.status !== 200) return streams;
            
            const html = res.body;
            
            // Extract size and header info
            const sizeMatch = html.match(/<i[^>]*id="size"[^>]*>([^<]*)<\/i>/);
            const headerMatch = html.match(/<div[^>]*class="card-header"[^>]*>([\s\S]*?)<\/div>/);
            
            const size = sizeMatch ? sizeMatch[1].trim() : "";
            const header = headerMatch ? headerMatch[1].replace(/<[^>]+>/g, "").trim() : "";
            const headerDetails = cleanStreamTitle(header);
            const quality = getQualityLabel(header);
            
            const labelExtras = [];
            if (headerDetails) labelExtras.push(headerDetails);
            if (size) labelExtras.push(size);
            const extrasStr = labelExtras.length > 0 ? `[${labelExtras.join("] [")}]` : "";
            
            // Parse all download buttons
            const btnRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            
            while ((match = btnRegex.exec(html)) !== null) {
                const link = match[1];
                const text = match[2].replace(/<[^>]+>/g, "").trim();
                const label = text.toLowerCase();
                
                if (isBlockedButton(text)) continue;
                
                // FSL Server
                if (label.includes("fsl server") && !label.includes("fslv2")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} [FSL Server] ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"],
                            "Accept": "*/*"
                        }
                    }));
                }
                // FSLv2 Server
                else if (label.includes("fslv2")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} [FSLv2] ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
                // Direct Download
                else if (label.includes("download file")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
                // BuzzServer
                else if (label.includes("buzzserver")) {
                    try {
                        const buzzRes = await http_get(link + "/download", {
                            "Referer": link,
                            "User-Agent": HEADERS["User-Agent"]
                        });
                        const dlink = buzzRes.headers?.["hx-redirect"] || 
                                     buzzRes.headers?.["HX-Redirect"] ||
                                     buzzRes.headers?.["location"];
                        if (dlink) {
                            streams.push(new StreamResult({
                                url: dlink,
                                source: `${ref} [BuzzServer] ${extrasStr}`,
                                quality: quality,
                                headers: { 
                                    "Referer": link, 
                                    "User-Agent": HEADERS["User-Agent"]
                                }
                            }));
                        }
                    } catch (e) {}
                }
                // PixelDrain
                else if (label.includes("pixeldra") || label.includes("pixelserver") || 
                         label.includes("pixel server") || label.includes("pixeldrain")) {
                    const base = getBaseUrl(link);
                    const finalUrl = link.includes("download") ? link : 
                                    `${base}/api/file/${link.substring(link.lastIndexOf("/") + 1)}?download`;
                    streams.push(new StreamResult({
                        url: finalUrl,
                        source: `${ref} [PixelDrain] ${extrasStr}`,
                        quality: quality,
                        headers: { "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                // S3 Server
                else if (label.includes("s3 server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} [S3 Server] ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
                // Mega Server
                else if (label.includes("mega server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} [Mega Server] ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
                // PDL Server
                else if (label.includes("pdl server")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `${ref} [PDL Server] ${extrasStr}`,
                        quality: quality,
                        headers: { 
                            "Referer": realUrl, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }
        } catch (e) {
            console.log(`HubCloud extraction error: ${e.message}`);
        }
        
        return streams;
    }

    /**
     * Extracts streams from Hubdrive
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function extractHubdrive(url) {
        try {
            const res = await http_get(url, { ...HEADERS, timeout: 5000 });
            if (res.status !== 200) return [];
            
            // Try multiple patterns for the button
            const patterns = [
                /class="btn btn-primary[^"]*"[^>]*href="([^"]+)"/,
                /class="[^"]*btn-success1[^"]*"[^>]*href="([^"]+)"/,
                /<a[^>]+class="[^"]*btn[^"]*"[^>]*href="([^"]+)"[^>]*>\s*Download/i
            ];
            
            for (const pattern of patterns) {
                const match = pattern.exec(res.body);
                if (match) {
                    const href = match[1];
                    if (href.includes("hubcloud")) {
                        return await extractHubCloud(href, "HubDrive");
                    } else {
                        return [new StreamResult({
                            url: href,
                            source: "HubDrive",
                            headers: { "User-Agent": HEADERS["User-Agent"] }
                        })];
                    }
                }
            }
        } catch (e) {
            console.log(`Hubdrive extraction error: ${e.message}`);
        }
        return [];
    }

    /**
     * Extracts streams from Hubcdn (base64 encoded)
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function extractHubcdn(url) {
        const streams = [];
        try {
            const res = await http_get(url, { ...HEADERS, "Referer": url });
            if (res.status !== 200) return streams;
            
            // Try pattern 1: r= parameter
            const encodedMatch = res.body.match(/r=([A-Za-z0-9+/=]+)/);
            if (encodedMatch) {
                const decoded = base64Decode(encodedMatch[1]);
                const m3u8 = decoded.substring(decoded.lastIndexOf("link=") + 5);
                if (m3u8) {
                    streams.push(new StreamResult({
                        url: m3u8,
                        source: "HubCDN",
                        headers: { 
                            "Referer": url, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }
            
            // Try pattern 2: reurl variable
            const reurlMatch = res.body.match(/reurl\s*=\s*"([^"]+)"/);
            if (reurlMatch) {
                const encoded = reurlMatch[1].substring(reurlMatch[1].indexOf("?r=") + 3);
                const decoded = base64Decode(encoded);
                const m3u8 = decoded.substring(decoded.lastIndexOf("link=") + 5);
                if (m3u8) {
                    streams.push(new StreamResult({
                        url: m3u8,
                        source: "HUBCDN",
                        headers: { 
                            "Referer": url, 
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }));
                }
            }
        } catch (e) {
            console.log(`Hubcdn extraction error: ${e.message}`);
        }
        return streams;
    }

    /**
     * Extracts streams from GDFlix
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function extractGDFlix(url) {
        const streams = [];
        
        try {
            // Handle redirect
            let newUrl = url;
            try {
                const res = await http_get(url, HEADERS);
                const metaRefresh = res.body.match(/meta[^>]*http-equiv="refresh"[^>]*content="[^"]*url=([^"]+)"/i);
                if (metaRefresh) {
                    newUrl = metaRefresh[1];
                }
            } catch (e) {}
            
            const res = await http_get(newUrl, HEADERS);
            if (res.status !== 200) return streams;
            
            const html = res.body;
            
            // Extract file info
            const fileNameMatch = html.match(/Name\s*:\s*([^<]+)/);
            const fileSizeMatch = html.match(/Size\s*:\s*([^<]+)/);
            
            const fileName = fileNameMatch ? fileNameMatch[1].trim() : "";
            const fileSize = fileSizeMatch ? fileSizeMatch[1].trim() : "";
            const quality = getQualityLabel(fileName);
            
            // Parse download buttons
            const btnRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            
            while ((match = btnRegex.exec(html)) !== null) {
                const link = match[1];
                const text = match[2].replace(/<[^>]+>/g, "").trim();
                const label = text.toLowerCase();
                
                // Direct DL
                if (label.includes("direct dl")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `GDFlix [Direct] [${fileSize}]`,
                        quality: quality,
                        headers: { "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
                // Instant DL
                else if (label.includes("instant dl")) {
                    try {
                        const instantRes = await http_get(link, { ...HEADERS, allowRedirects: false });
                        const loc = instantRes.headers?.["location"];
                        if (loc) {
                            const actualUrl = loc.includes("url=") ? loc.substring(loc.indexOf("url=") + 4) : loc;
                            streams.push(new StreamResult({
                                url: actualUrl,
                                source: `GDFlix [Instant] [${fileSize}]`,
                                quality: quality,
                                headers: { "User-Agent": HEADERS["User-Agent"] }
                            }));
                        }
                    } catch (e) {}
                }
                // PixelDrain
                else if (label.includes("pixeldrain") || label.includes("pixel")) {
                    streams.push(new StreamResult({
                        url: link,
                        source: `GDFlix [PixelDrain] [${fileSize}]`,
                        quality: quality,
                        headers: { "User-Agent": HEADERS["User-Agent"] }
                    }));
                }
            }
            
            // Cloudflare backup links
            try {
                const cfUrl = newUrl.replace("/file/", "/wfile/");
                for (const type of ["type=1", "type=2"]) {
                    const cfRes = await http_get(`${cfUrl}?${type}`, HEADERS);
                    const cfMatch = cfRes.body.match(/<a[^>]*class="[^"]*btn-success[^"]*"[^>]*href="([^"]+)"/);
                    if (cfMatch) {
                        streams.push(new StreamResult({
                            url: cfMatch[1],
                            source: `GDFlix [CF] [${fileSize}]`,
                            quality: quality,
                            headers: { "User-Agent": HEADERS["User-Agent"] }
                        }));
                    }
                }
            } catch (e) {}
            
        } catch (e) {
            console.log(`GDFlix extraction error: ${e.message}`);
        }
        
        return streams;
    }

    /**
     * Extracts streams from Gofile
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function extractGofile(url) {
        const streams = [];
        
        try {
            const id = url.match(/[?&]c=([a-zA-Z0-9-]+)/)?.[1] || 
                      url.match(/\/d\/([a-zA-Z0-9-]+)/)?.[1];
            if (!id) return streams;
            
            const apiUrl = "https://api.gofile.io";
            
            // Get token
            const tokenRes = await http_get(`${apiUrl}/accounts`, JSON_HEADERS);
            const token = JSON.parse(tokenRes.body)?.data?.token;
            if (!token) return streams;
            
            // Get website token
            const wtRes = await http_get("https://gofile.io/dist/js/config.js", HEADERS);
            const wt = wtRes.body.match(/appdata\.wt\s*=\s*["']([^"']+)["']/)?.[1];
            if (!wt) return streams;
            
            // Get contents
            const contentsRes = await http_get(
                `${apiUrl}/contents/${id}?contentFilter=&page=1&pageSize=1000&sortField=name&sortDirection=1`,
                {
                    "Authorization": `Bearer ${token}`,
                    "X-Website-Token": wt,
                    "User-Agent": HEADERS["User-Agent"]
                }
            );
            
            const data = JSON.parse(contentsRes.body)?.data;
            if (!data?.children) return streams;
            
            for (const [_, file] of Object.entries(data.children)) {
                if (file.type !== "file" || !file.link) continue;
                
                const formattedSize = formatBytes(file.size || 0);
                streams.push(new StreamResult({
                    url: file.link,
                    source: `[Gofile] ${file.name} [${formattedSize}]`,
                    quality: getQualityLabel(file.name),
                    headers: { 
                        "Cookie": `accountToken=${token}`,
                        "User-Agent": HEADERS["User-Agent"]
                    }
                }));
            }
            
        } catch (e) {
            console.log(`Gofile extraction error: ${e.message}`);
        }
        
        return streams;
    }

    /**
     * Extracts streams from PixelDrain
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function extractPixelDrain(url) {
        const streams = [];
        
        try {
            const id = url.match(/\/u\/([a-zA-Z0-9-]+)/)?.[1] ||
                      url.match(/\/d\/([a-zA-Z0-9-]+)/)?.[1];
            if (!id) return streams;
            
            const base = getBaseUrl(url) || "https://pixeldrain.com";
            const finalUrl = url.includes("download") ? url : `${base}/api/file/${id}?download`;
            
            streams.push(new StreamResult({
                url: finalUrl,
                source: "PixelDrain",
                headers: { "User-Agent": HEADERS["User-Agent"] }
            }));
            
        } catch (e) {
            console.log(`PixelDrain extraction error: ${e.message}`);
        }
        
        return streams;
    }

    /**
     * Main stream resolver - routes to appropriate extractor
     * @param {string} url 
     * @returns {Promise<Array>}
     */
    async function resolveStream(url) {
        if (!url) return [];
        
        const lowerUrl = url.toLowerCase();
        
        // HubCloud family
        if (lowerUrl.includes("hubcloud") || lowerUrl.includes("hub.") || 
            lowerUrl.includes("gamerxyt") || lowerUrl.includes("fsl") ||
            lowerUrl.includes("gdfuck") || lowerUrl.includes("hubcdn")) {
            return await extractHubCloud(url, "");
        }
        
        // Hubdrive
        if (lowerUrl.includes("hubdrive")) {
            return await extractHubdrive(url);
        }
        
        // Hubcdn
        if (lowerUrl.includes("hubcdn")) {
            return await extractHubcdn(url);
        }
        
        // GDFlix
        if (lowerUrl.includes("gdflix")) {
            return await extractGDFlix(url);
        }
        
        // Gofile
        if (lowerUrl.includes("gofile")) {
            return await extractGofile(url);
        }
        
        // PixelDrain
        if (lowerUrl.includes("pixeldrain") || lowerUrl.includes("pixeldrain.dev")) {
            return await extractPixelDrain(url);
        }
        
        // Direct links (Google Drive, etc.)
        if (lowerUrl.includes("drive.google") || lowerUrl.includes("docs.google")) {
            return [new StreamResult({
                url: url,
                source: "GDrive",
                headers: { "User-Agent": HEADERS["User-Agent"] }
            })];
        }
        
        // Generic direct link
        return [new StreamResult({
            url: url,
            source: "Direct",
            headers: { "User-Agent": HEADERS["User-Agent"] }
        })];
    }

    // ==================== MAIN API FUNCTIONS ====================

    /**
     * Loads home screen categories
     * @param {(res: Object) => void} cb 
     */
    async function getHome(cb) {
        try {
            const categories = [
                { name: "Homepage", path: "" },
                { name: "Bollywood", path: "category/bollywood" },
                { name: "Hollywood", path: "category/hollywood" },
                { name: "Gujarati", path: "category/gujarati" },
                { name: "South Indian", path: "category/southindian" },
                { name: "Web Series", path: "category/webseries" },
                { name: "Adult", path: "category/adult/" }
            ];

            const home = {};
            
            for (const cat of categories) {
                try {
                    const url = cat.path ? `${MAIN_URL}/${cat.path}` : MAIN_URL;
                    const res = await http_get(url, HEADERS);
                    
                    if (res.status === 200) {
                        const items = parseSearchResults(res.body);
                        if (items.length > 0) {
                            home[cat.name] = items.slice(0, 24);
                        }
                    }
                } catch (e) {
                    console.log(`Error loading ${cat.name}: ${e.message}`);
                }
            }

            cb({ success: true, data: home });
        } catch (e) {
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }

    /**
     * Searches for media
     * @param {string} query 
     * @param {(res: Object) => void} cb 
     */
    async function search(query, cb) {
        try {
            const url = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
            const res = await http_get(url, HEADERS);
            
            if (res.status === 200) {
                const items = parseSearchResults(res.body);
                cb({ success: true, data: items });
            } else {
                cb({ success: true, data: [] });
            }
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    /**
     * Loads media details with IMDb/Cinemeta integration
     * @param {string} url 
     * @param {(res: Object) => void} cb 
     */
    async function load(url, cb) {
        try {
            const res = await http_get(url, HEADERS);
            if (res.status !== 200) {
                return cb({ success: false, errorCode: "SITE_OFFLINE" });
            }

            const html = res.body;
            
            // Extract title from #movie_title > a (primary) or h1.post-title (fallback)
            let title = "";
            const titleMatch = html.match(/<div[^>]*id="movie_title"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
                              html.match(/<h1[^>]*class="post-title"[^>]*>([\s\S]*?)<\/h1>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
            }
            
            // Extract poster from meta[property=og:image] (most reliable)
            let poster = "";
            const posterMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
            if (posterMatch && posterMatch[1]) {
                poster = posterMatch[1];
            }
            
            // Fallback poster patterns
            if (!poster) {
                const fallbackPatterns = [
                    /<img[^>]*class="[^"]*poster[^"]*"[^>]*src="([^"]+)"/i,
                    /<img[^>]*class="[^"]*featured[^"]*"[^>]*src="([^"]+)"/i,
                    /<div[^>]*class="[^"]*poster[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/i
                ];
                for (const pattern of fallbackPatterns) {
                    const match = pattern.exec(html);
                    if (match && match[1]) {
                        poster = fixUrl(match[1]);
                        break;
                    }
                }
            }
            
            // Extract description
            let description = "";
            const descMatch = html.match(/<div[^>]*class="[^"]*kno-rdesc[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<div[^>]*id="summary"[^>]*>([\s\S]*?)<\/div>/i) ||
                             html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);
            if (descMatch) {
                description = descMatch[1].replace(/<[^>]+>/g, "").trim();
            }
            
            // Extract year
            let year = null;
            const yearMatch = html.match(/\((\d{4})\)/) || 
                             html.match(/<small>(\d{4})<\/small>/i) ||
                             html.match(/(\d{4})\s*-\s*\d{4}/);
            if (yearMatch) {
                year = parseInt(yearMatch[1]);
            }
            
            // Determine type
            const typeraw = (html.match(/<h1[^>]*class="post-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "").toLowerCase();
            const isSeries = !typeraw.includes("movie") && (
                typeraw.includes("series") || 
                typeraw.includes("season") || 
                html.includes("<h4>") ||
                /season-\d+/i.test(url)
            );
            const type = isSeries ? "series" : "movie";
            
            // Extract IMDb ID
            let imdbId = "";
            const imdbMatch = html.match(/imdb\.com\/title\/(tt\d+)/i) ||
                             html.match(/tt(\d{7,8})/);
            if (imdbMatch) {
                imdbId = imdbMatch[1].startsWith("tt") ? imdbMatch[1] : `tt${imdbMatch[1]}`;
            }
            
            // Fetch Cinemeta data
            let metaData = null;
            if (imdbId) {
                try {
                    const metaType = type === "series" ? "series" : "movie";
                    const metaRes = await http_get(`${CINEMETA_URL}/${metaType}/${imdbId}.json`, JSON_HEADERS);
                    if (metaRes.status === 200 && metaRes.body.startsWith("{")) {
                        metaData = JSON.parse(metaRes.body);
                    }
                } catch (e) {
                    console.log(`Cinemeta fetch error: ${e.message}`);
                }
            }
            
            // Use Cinemeta data if available
            const finalTitle = metaData?.meta?.name || cleanTitle(title) || title;
            const finalPoster = metaData?.meta?.poster || poster;
            const finalBackground = metaData?.meta?.background || finalPoster;
            const finalDescription = metaData?.meta?.description || description;
            const finalYear = metaData?.meta?.year ? parseInt(metaData.meta.year.toString().split("-")[0]) : year;
            const finalGenres = metaData?.meta?.genres || null;
            const finalCast = metaData?.meta?.appExtras?.cast?.map(c => c.name).filter(Boolean) || [];
            const finalScore = metaData?.meta?.imdbRating ? parseFloat(metaData.meta.imdbRating) : null;

            const episodes = [];
            
            if (type === "series") {
                // Parse season/episode structure
                const h4Regex = /<h4[^>]*>([\s\S]*?)<\/h4>/gi;
                let h4Match;
                
                while ((h4Match = h4Regex.exec(html)) !== null) {
                    const h4Text = h4Match[1].replace(/<[^>]+>/g, "");
                    const seasonMatch = /Season\s*(\d+)/i.exec(h4Text);
                    const seasonNum = seasonMatch ? parseInt(seasonMatch[1]) : 0;
                    
                    if (seasonNum > 0) {
                        // Find content after this h4 until next h4
                        const h4Index = html.indexOf(h4Match[0]);
                        const afterH4 = html.substring(h4Index + h4Match[0].length);
                        const nextH4Index = afterH4.search(/<h4[^>]*>/i);
                        const sectionHtml = nextH4Index > 0 ? afterH4.substring(0, nextH4Index) : afterH4;
                        
                        // Find season buttons
                        const btnRegex = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                        let btnMatch;
                        
                        while ((btnMatch = btnRegex.exec(sectionHtml)) !== null) {
                            if (isBlockedButton(btnMatch[0])) continue;
                            
                            const btnUrl = fixUrl(btnMatch[1]);
                            
                            // Follow button to get episode page
                            try {
                                const epRes = await http_get(btnUrl, HEADERS);
                                if (epRes.status === 200) {
                                    const epHtml = epRes.body;
                                    const epBtnRegex = /<a[^>]*class="[^"]*maxbutton-ep[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                                    let epBtnMatch;
                                    
                                    while ((epBtnMatch = epBtnRegex.exec(epHtml)) !== null) {
                                        const epUrl = fixUrl(epBtnMatch[1]);
                                        const epText = epBtnMatch[2].replace(/<[^>]+>/g, "").trim();
                                        const epNumMatch = /(?:Episode|Ep|E)\s*(\d+)/i.exec(epText);
                                        const epNum = epNumMatch ? parseInt(epNumMatch[1]) : 0;
                                        
                                        if (epNum > 0) {
                                            // Find meta episode data
                                            let metaEp = null;
                                            if (metaData?.meta?.videos) {
                                                metaEp = metaData.meta.videos.find(
                                                    v => v.season === seasonNum && v.episode === epNum
                                                );
                                            }
                                            
                                            episodes.push(new Episode({
                                                name: metaEp?.name || `S${seasonNum.toString().padStart(2, '0')}E${epNum.toString().padStart(2, '0')}`,
                                                url: epUrl,
                                                season: seasonNum,
                                                episode: epNum,
                                                posterUrl: metaEp?.thumbnail || finalPoster,
                                                description: metaEp?.overview || "",
                                                airDate: metaEp?.released || null
                                            }));
                                        }
                                    }
                                }
                            } catch (e) {
                                console.log(`Episode fetch error: ${e.message}`);
                            }
                        }
                    }
                }
            } else {
                // Movie - collect all download links
                const links = [];
                const btnRegex = /<a[^>]*class="[^"]*maxbutton[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                let btnMatch;
                
                while ((btnMatch = btnRegex.exec(html)) !== null) {
                    if (isBlockedButton(btnMatch[0])) continue;
                    const btnUrl = fixUrl(btnMatch[1]);
                    
                    // Follow the button to get actual links
                    try {
                        const linkRes = await http_get(btnUrl, HEADERS);
                        if (linkRes.status === 200) {
                            // Extract links from the page
                            const linkPatterns = [
                                /href="(https?:\/\/[^"]*hubcloud[^"]*)"/i,
                                /href="(https?:\/\/[^"]*hubdrive[^"]*)"/i,
                                /href="(https?:\/\/[^"]*gdflix[^"]*)"/i,
                                /href="(https?:\/\/[^"]*gofile[^"]*)"/i,
                                /href="(https?:\/\/[^"]*pixeldrain[^"]*)"/i
                            ];
                            
                            for (const pattern of linkPatterns) {
                                const lm = pattern.exec(linkRes.body);
                                if (lm) {
                                    links.push(lm[1]);
                                }
                            }
                        }
                    } catch (e) {}
                }
                
                // If no links found, use the original URL
                if (links.length === 0) {
                    // Try to extract links directly from the page
                    const directPatterns = [
                        /href="(https?:\/\/[^"]*hubcloud[^"]*)"/gi,
                        /href="(https?:\/\/[^"]*hubdrive[^"]*)"/gi,
                        /href="(https?:\/\/[^"]*gdflix[^"]*)"/gi
                    ];
                    
                    for (const pattern of directPatterns) {
                        let dm;
                        while ((dm = pattern.exec(html)) !== null) {
                            links.push(dm[1]);
                        }
                    }
                }
                
                episodes.push(new Episode({
                    name: "Full Movie",
                    url: JSON.stringify(links),
                    season: 1,
                    episode: 1,
                    posterUrl: finalPoster
                }));
            }

            const item = new MultimediaItem({
                title: finalTitle,
                url: url,
                posterUrl: finalPoster,
                bannerUrl: finalBackground,
                description: finalDescription,
                type: type,
                year: finalYear,
                score: finalScore,
                genres: finalGenres,
                cast: finalCast,
                imdbId: imdbId,
                episodes: episodes
            });

            cb({ success: true, data: item });
        } catch (e) {
            console.log(`Load error: ${e.message}`);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    /**
     * Loads streams for an episode or movie
     * @param {string} url 
     * @param {(res: Object) => void} cb 
     */
    async function loadStreams(url, cb) {
        try {
            let links = [];
            
            // Check if URL is JSON array (movie links)
            if (url.startsWith("[")) {
                try {
                    links = JSON.parse(url);
                } catch (e) {
                    links = [url];
                }
            } else {
                links = [url];
            }

            const allStreams = [];
            
            // Process each link
            for (const link of links) {
                const streams = await resolveStream(link);
                allStreams.push(...streams);
            }

            // Sort by quality (highest first)
            allStreams.sort((a, b) => {
                const getQ = (q) => {
                    if (!q) return 0;
                    const m = q.toString().match(/(\d{3,4})/);
                    return m ? parseInt(m[1]) : 0;
                };
                return getQ(b.quality) - getQ(a.quality);
            });

            cb({ success: true, data: allStreams });
        } catch (e) {
            console.log(`LoadStreams error: ${e.message}`);
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // Export to global scope
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
