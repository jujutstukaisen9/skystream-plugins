(function() {

    var EXCL = ['79601436077', '13297974909'];

    function getBaseUrl() {
        return manifest.baseUrl || 'https://teluguscreen.com';
    }

    async function fetchMovies() {
        var url = getBaseUrl() + '/movies.json';
        var res = await http_get(url, {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        if (!res || !res.body) return [];
        var data = JSON.parse(res.body);
        return data.filter(function(m) { return EXCL.indexOf(String(m.id)) === -1; });
    }

    function movieToItem(m) {
        return new MultimediaItem({
            title: m.title,
            url: getBaseUrl() + '/player.html?id=' + m.id,
            posterUrl: m.imagePath || '',
            type: 'movie',
            year: parseInt(m.year) || 0,
            description: m.plot || '',
            score: m.rating ? parseFloat(m.rating) : 0
        });
    }

    function toYearRange(year) {
        var y = parseInt(year) || 0;
        if (y >= 2021) return '2021+';
        if (y >= 2016) return '2016-20';
        if (y >= 2011) return '2011-15';
        if (y >= 2006) return '2006-10';
        if (y >= 2001) return '2001-05';
        if (y >= 1991) return '1991-00';
        return 'Classic';
    }

    async function getHome(cb) {
        try {
            var movies = await fetchMovies();
            if (!movies || movies.length === 0) {
                return cb({ success: false, errorCode: 'NO_MOVIES', message: 'No movies found' });
            }

            var trending = [];
            var recent = [];
            var genres = {};
            var years = {};
            var qualities = {};

            movies.forEach(function(m) {
                var item = movieToItem(m);
                var yr = toYearRange(m.year);
                var quality = m.quality || 'All';

                recent.push(item);

                if (!years[yr]) years[yr] = [];
                years[yr].push(item);

                if (!qualities[quality]) qualities[quality] = [];
                qualities[quality].push(item);

                if (m.genre) {
                    m.genre.split(',').forEach(function(g) {
                        g = g.trim();
                        if (!g) return;
                        if (!genres[g]) genres[g] = [];
                        genres[g].push(item);
                    });
                }
            });

            trending = recent.slice(0, 15);

            var data = {};
            data['Trending'] = trending;

            var sortedQualities = Object.keys(qualities).sort(function(a, b) {
                var order = { 'BluRay': 0, 'WEB-DL': 1, 'HDRip': 2, 'DVDRip': 3, 'All': 4 };
                return (order[a] || 99) - (order[b] || 99);
            });

            sortedQualities.forEach(function(q) {
                data['Quality: ' + q] = qualities[q].slice(0, 30);
            });

            var sortedYears = Object.keys(years).sort(function(a, b) {
                var extract = function(s) { var n = parseInt(s); return isNaN(n) ? 0 : n; };
                return extract(b) - extract(a);
            });

            sortedYears.forEach(function(y) {
                data['Year: ' + y] = years[y].slice(0, 30);
            });

            var sortedGenres = Object.keys(genres).sort();
            sortedGenres.forEach(function(g) {
                data['Genre: ' + g] = genres[g].slice(0, 30);
            });

            cb({ success: true, data: data });
        } catch (e) {
            cb({ success: false, errorCode: 'GET_HOME_ERROR', message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            var movies = await fetchMovies();
            var q = query.toLowerCase();
            var results = movies.filter(function(m) {
                return (m.title || '').toLowerCase().indexOf(q) !== -1 ||
                       (m.year || '').indexOf(q) !== -1 ||
                       (m.quality || '').toLowerCase().indexOf(q) !== -1 ||
                       (m.genre || '').toLowerCase().indexOf(q) !== -1 ||
                       (m.actors || '').toLowerCase().indexOf(q) !== -1 ||
                       (m.director || '').toLowerCase().indexOf(q) !== -1;
            }).map(function(m) { return movieToItem(m); });
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: e.message });
        }
    }

    async function load(url, cb) {
        try {
            var idMatch = url.match(/id=([^&]+)/);
            var movieId = idMatch ? idMatch[1] : null;
            if (!movieId) {
                return cb({ success: false, errorCode: 'NO_ID', message: 'Could not extract movie ID from URL' });
            }

            var movies = await fetchMovies();
            var movie = null;
            for (var i = 0; i < movies.length; i++) {
                if (String(movies[i].id) === String(movieId)) {
                    movie = movies[i];
                    break;
                }
            }

            if (!movie) {
                return cb({ success: false, errorCode: 'NOT_FOUND', message: 'Movie not found' });
            }

            var streams = [];
            var qualities = movie.qualities || {};
            if (qualities.Q360p && qualities.Q360p.indexOf('.mp4') !== -1) {
                var sizes = qualities.Sizes || {};
                streams.push(new StreamResult({
                    url: qualities.Q360p,
                    quality: '360p',
                    source: '360p' + (sizes.Q360p ? ' (' + sizes.Q360p + ')' : '')
                }));
            }
            if (qualities.Q480p && qualities.Q480p.indexOf('.mp4') !== -1) {
                var sizes = qualities.Sizes || {};
                streams.push(new StreamResult({
                    url: qualities.Q480p,
                    quality: '480p',
                    source: '480p' + (sizes.Q480p ? ' (' + sizes.Q480p + ')' : '')
                }));
            }
            if (qualities.Q720p && qualities.Q720p.indexOf('.mp4') !== -1) {
                var sizes = qualities.Sizes || {};
                streams.push(new StreamResult({
                    url: qualities.Q720p,
                    quality: '720p',
                    source: '720p' + (sizes.Q720p ? ' (' + sizes.Q720p + ')' : '')
                }));
            }

            var item = new MultimediaItem({
                title: movie.title,
                url: url,
                posterUrl: movie.imagePath || '',
                type: 'movie',
                year: parseInt(movie.year) || 0,
                description: movie.plot || '',
                score: movie.rating ? parseFloat(movie.rating) : 0,
                contentRating: '',
                genres: movie.genre ? movie.genre.split(',').map(function(g) { return g.trim(); }) : [],
                cast: movie.actors ? movie.actors.split(',').map(function(a) {
                    return { name: a.trim(), role: '' };
                }) : [],
                episodes: []
            });

            if (streams.length > 0) {
                item.episodes = [new Episode({
                    name: 'Play Movie',
                    url: JSON.stringify(streams),
                    season: 1,
                    episode: 1
                })];
            }

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: e.message });
        }
    }

    async function loadStreams(url, cb) {
        try {
            var streams = [];
            try {
                var parsed = JSON.parse(url);
                if (Array.isArray(parsed)) {
                    streams = parsed;
                }
            } catch (e) {
                var idMatch = url.match(/id=([^&]+)/);
                var movieId = idMatch ? idMatch[1] : null;
                if (!movieId) {
                    return cb({ success: false, errorCode: 'NO_ID', message: 'Could not extract movie ID' });
                }

                var movies = await fetchMovies();
                var movie = null;
                for (var i = 0; i < movies.length; i++) {
                    if (String(movies[i].id) === String(movieId)) {
                        movie = movies[i];
                        break;
                    }
                }

                if (!movie) {
                    return cb({ success: false, errorCode: 'NOT_FOUND', message: 'Movie not found' });
                }

                var qualities = movie.qualities || {};
                if (qualities.Q360p && qualities.Q360p.indexOf('.mp4') !== -1) {
                    var sizes = qualities.Sizes || {};
                    streams.push(new StreamResult({
                        url: qualities.Q360p,
                        quality: '360p',
                        source: '360p' + (sizes.Q360p ? ' (' + sizes.Q360p + ')' : '')
                    }));
                }
                if (qualities.Q480p && qualities.Q480p.indexOf('.mp4') !== -1) {
                    var sizes = qualities.Sizes || {};
                    streams.push(new StreamResult({
                        url: qualities.Q480p,
                        quality: '480p',
                        source: '480p' + (sizes.Q480p ? ' (' + sizes.Q480p + ')' : '')
                    }));
                }
                if (qualities.Q720p && qualities.Q720p.indexOf('.mp4') !== -1) {
                    var sizes = qualities.Sizes || {};
                    streams.push(new StreamResult({
                        url: qualities.Q720p,
                        quality: '720p',
                        source: '720p' + (sizes.Q720p ? ' (' + sizes.Q720p + ')' : '')
                    }));
                }

                if (movie.moviePath360p && movie.moviePath360p.indexOf('.mp4') !== -1 && qualities.Q360p !== movie.moviePath360p) {
                    streams.push(new StreamResult({
                        url: movie.moviePath360p,
                        quality: '360p',
                        source: '360p (Alt)'
                    }));
                }
                if (movie.moviePath480p && movie.moviePath480p.indexOf('.mp4') !== -1 && qualities.Q480p !== movie.moviePath480p) {
                    streams.push(new StreamResult({
                        url: movie.moviePath480p,
                        quality: '480p',
                        source: '480p (Alt)'
                    }));
                }
                if (movie.moviePath720p && movie.moviePath720p.indexOf('.mp4') !== -1 && qualities.Q720p !== movie.moviePath720p) {
                    streams.push(new StreamResult({
                        url: movie.moviePath720p,
                        quality: '720p',
                        source: '720p (Alt)'
                    }));
                }
            }

            if (streams.length === 0) {
                return cb({ success: false, errorCode: 'NO_STREAMS', message: 'No streams found' });
            }

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_STREAMS_ERROR', message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
