(function() {
    'use strict';

    // Защита от двойной загрузки
    if (window.animelib_plugin_loaded) {
        return;
    }
    window.animelib_plugin_loaded = true;

    console.log('[AnimeLib] Плагин загружается...');

    // Конфигурация
    const CONFIG = {
        host: 'https://anilib.me',
        apiHost: 'https://api.cdnlibs.org',
        clientId: '1',
        siteId: '5',
        cacheTime: 3600000,
        searchCacheTime: 14400000
    };

    // Получение балансировщика (как в Lampac)
    function getBalancerUrl() {
        var servers = [
            'https://api.cdnlibs.org'
        ];
        return servers[Math.floor(Math.random() * servers.length)];
    }

    var default_host = 'https://api.cdnlibs.org';

    var Defined = {
        api: 'animelib',
        localhost: default_host + '/',
        apn: ''
    };

    // Хранилище токенов
    let tokenCache = {
        token: null,
        refreshToken: null,
        expiryTime: 0
    };

    var unic_id = Lampa.Storage.get('animelib_unic_id', '');
    if (!unic_id) {
        unic_id = Lampa.Utils.uid(8).toLowerCase();
        Lampa.Storage.set('animelib_unic_id', unic_id);
    }

    function getAndroidVersion() {
        if (Lampa.Platform.is('android')) {
            try {
                var current = AndroidJS.appVersion().split('-');
                return parseInt(current.pop());
            } catch (e) {
                return 0;
            }
        } else {
            return 0;
        }
    }

    var hostkey = 'anilib.me';

    if (!window.rch_nws || !window.rch_nws[hostkey]) {
        if (!window.rch_nws) window.rch_nws = {};

        window.rch_nws[hostkey] = {
            type: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : undefined,
            startTypeInvoke: false,
            rchRegistry: false,
            apkVersion: getAndroidVersion()
        };
    }

    window.rch_nws[hostkey].typeInvoke = function rchtypeInvoke(host, call) {
        if (!window.rch_nws[hostkey].startTypeInvoke) {
            window.rch_nws[hostkey].startTypeInvoke = true;

            var check = function check(good) {
                window.rch_nws[hostkey].type = Lampa.Platform.is('android') ? 'apk' : good ? 'cors' : 'web';
                call();
            };

            if (Lampa.Platform.is('android') || Lampa.Platform.is('tizen')) check(true);
            else {
                var net = new Lampa.Reguest();
                var check_url = getBalancerUrl();
                net.silent(check_url.indexOf(location.host) >= 0 ? 'https://github.com/' : check_url + '/cors/check', function() {
                    check(true);
                }, function() {
                    check(false);
                }, false, {
                    dataType: 'text'
                });
            }
        } else call();
    };

    window.rch_nws[hostkey].Registry = function RchRegistry(client, startConnection) {
        window.rch_nws[hostkey].typeInvoke(getBalancerUrl(), function() {
            client.invoke("RchRegistry", JSON.stringify({
                version: 149,
                host: location.host,
                rchtype: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : window.rch_nws[hostkey].type,
                apkVersion: window.rch_nws[hostkey].apkVersion,
                player: Lampa.Storage.field('player')
            }));

            if (client._shouldReconnect && window.rch_nws[hostkey].rchRegistry) {
                if (startConnection) startConnection();
                return;
            }

            window.rch_nws[hostkey].rchRegistry = true;

            client.on('RchRegistry', function(clientIp) {
                if (startConnection) startConnection();
            });

            client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
                var network = new Lampa.Reguest();

                function result(html) {
                    if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) {
                        html = JSON.stringify(html);
                    }

                    if (typeof CompressionStream !== 'undefined' && html && html.length > 1000) {
                        var compressionStream = new CompressionStream('gzip');
                        var encoder = new TextEncoder();
                        var readable = new ReadableStream({
                            start: function(controller) {
                                controller.enqueue(encoder.encode(html));
                                controller.close();
                            }
                        });
                        var compressedStream = readable.pipeThrough(compressionStream);
                        new Response(compressedStream).arrayBuffer()
                            .then(function(compressedBuffer) {
                                var compressedArray = new Uint8Array(compressedBuffer);
                                if (compressedArray.length > html.length) {
                                    client.invoke("RchResult", rchId, html);
                                } else {
                                    $.ajax({
                                        url: getBalancerUrl() + '/rch/gzresult?id=' + rchId,
                                        type: 'POST',
                                        data: compressedArray,
                                        async: true,
                                        cache: false,
                                        contentType: false,
                                        processData: false,
                                        success: function(j) {},
                                        error: function() {
                                            client.invoke("RchResult", rchId, html);
                                        }
                                    });
                                }
                            })
                            .catch(function() {
                                client.invoke("RchResult", rchId, html);
                            });
                    } else {
                        client.invoke("RchResult", rchId, html);
                    }
                }

                if (url == 'eval') {
                    console.log('RCH', url, data);
                    result(eval(data));
                } else if (url == 'ping') {
                    result('pong');
                } else {
                    console.log('RCH', url);
                    network["native"](url, result, function() {
                        console.log('RCH', 'result empty');
                        result('');
                    }, data, {
                        dataType: 'text',
                        timeout: 1000 * 8,
                        headers: headers,
                        returnHeaders: returnHeaders
                    });
                }
            });

            client.on('Connected', function(connectionId) {
                console.log('RCH', 'ConnectionId: ' + connectionId);
                window.rch_nws[hostkey].connectionId = connectionId;
            });
            client.on('Closed', function() {
                console.log('RCH', 'Connection closed');
            });
            client.on('Error', function(err) {
                console.log('RCH', 'error:', err);
            });
        });
    };

    window.rch_nws[hostkey].typeInvoke(default_host, function() {});

    function rchInvoke(json, call) {
        if (window.nwsClient && window.nwsClient[hostkey] && window.nwsClient[hostkey]._shouldReconnect) {
            call();
            return;
        }
        if (!window.nwsClient) window.nwsClient = {};
        if (window.nwsClient[hostkey] && window.nwsClient[hostkey].socket)
            window.nwsClient[hostkey].socket.close();
        window.nwsClient[hostkey] = new NativeWsClient(json.nws, {
            autoReconnect: false
        });
        window.nwsClient[hostkey].on('Connected', function(connectionId) {
            window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], function() {
                call();
            });
        });
        window.nwsClient[hostkey].connect();
    }

    function rchRun(json, call) {
        if (typeof NativeWsClient == 'undefined') {
            Lampa.Utils.putScript([getBalancerUrl() + "/js/nws-client-es5.js?v18112025"], function() {}, false, function() {
                rchInvoke(json, call);
            }, true);
        } else {
            rchInvoke(json, call);
        }
    }

    // Загрузка токена
    function loadTokenFromStorage() {
        try {
            const saved = localStorage.getItem('animelib_token_data');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.token && data.expiryTime > Date.now()) {
                    tokenCache = data;
                    console.log('[AnimeLib] Токен загружен');
                    return true;
                }
            }
        } catch (e) {
            console.warn('[AnimeLib] Ошибка загрузки токена:', e);
        }
        return false;
    }

    // Сохранение токена
    function saveTokenToStorage() {
        try {
            localStorage.setItem('animelib_token_data', JSON.stringify(tokenCache));
        } catch (e) {
            console.warn('[AnimeLib] Ошибка сохранения токена:', e);
        }
    }

    // Получение токена
    async function ensureToken() {
        if (tokenCache.token && tokenCache.expiryTime > Date.now()) {
            return tokenCache.token;
        }

        if (tokenCache.refreshToken) {
            try {
                const newToken = await refreshToken(tokenCache.refreshToken);
                if (newToken) {
                    tokenCache.token = newToken.accessToken;
                    tokenCache.refreshToken = newToken.refreshToken;
                    tokenCache.expiryTime = Date.now() + (newToken.expiresIn * 1000);
                    saveTokenToStorage();
                    return tokenCache.token;
                }
            } catch (e) {
                console.warn('[AnimeLib] Ошибка обновления токена:', e);
            }
        }

        const manualToken = localStorage.getItem('animelib_manual_token');
        if (manualToken) {
            tokenCache.token = manualToken;
            tokenCache.expiryTime = Date.now() + 2592000000;
            saveTokenToStorage();
            return manualToken;
        }

        return null;
    }

    // Обновление токена
    async function refreshToken(refreshToken) {
        try {
            const response = await fetch(`${CONFIG.apiHost}/api/auth/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Origin': CONFIG.host,
                    'Referer': `${CONFIG.host}/`,
                    'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
                    'Client-Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
                    'Site-Id': CONFIG.siteId
                },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    client_id: CONFIG.clientId,
                    refresh_token: refreshToken,
                    scope: ''
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in || 2592000
            };
        } catch (e) {
            console.error('[AnimeLib] Ошибка обновления токена:', e);
            return null;
        }
    }

    function account(url) {
        url = url + '';
        
        var random_host = getBalancerUrl();
        
        var replaceable = [
            'https://api.cdnlibs.org'
        ];
        
        for (var i = 0; i < replaceable.length; i++) {
            if (url.indexOf(replaceable[i]) !== -1) {
                url = url.replace(replaceable[i], random_host);
                break;
            }
        }

        if (url.indexOf('account_email=') == -1) {
            var email = Lampa.Storage.get('account_email');
            if (email) url = Lampa.Utils.addUrlComponent(url, 'account_email=' + encodeURIComponent(email));
        }
        if (url.indexOf('uid=') == -1) {
            var uid = Lampa.Storage.get('animelib_unic_id', '');
            if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
        }
        if (url.indexOf('nws_id=') == -1 && window.rch_nws && window.rch_nws[hostkey]) {
            var nws_id = window.rch_nws[hostkey].connectionId || '';
            if (nws_id) url = Lampa.Utils.addUrlComponent(url, 'nws_id=' + encodeURIComponent(nws_id));
        }
        return url;
    }

    var Network = Lampa.Reguest;

    function component(object) {
        var network = new Network();
        var scroll = new Lampa.Scroll({
            mask: true,
            over: true
        });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var sources = {};
        var last;
        var source;
        var balanser;
        var initialized;
        var balanser_timer;
        var images = [];
        var number_of_requests = 0;
        var number_of_requests_timer;
        var filter_sources = {};
        var filter_translate = {
            season: Lampa.Lang.translate('torrent_serial_season'),
            voice: Lampa.Lang.translate('torrent_parser_voice'),
            source: Lampa.Lang.translate('settings_rest_source')
        };
        var filter_find = {
            season: [],
            voice: []
        };

        function balanserName(j) {
            return 'animelib';
        }

        this.initialize = function() {
            var _this = this;
            this.loading(true);
            filter.onSearch = function(value) {
                Lampa.Activity.replace({
                    search: value,
                    clarification: true,
                    similar: true
                });
            };
            filter.onBack = function() {
                _this.start();
            };
            filter.render().find('.selector').on('hover:enter', function() {
                clearInterval(balanser_timer);
            });
            filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
            filter.onSelect = function(type, a, b) {
                if (type == 'filter') {
                    if (a.reset) {
                        _this.replaceChoice({
                            season: 0,
                            voice: 0,
                            voice_url: '',
                            voice_name: ''
                        });
                        setTimeout(function() {
                            Lampa.Select.close();
                            Lampa.Activity.replace({
                                clarification: 0,
                                similar: 0
                            });
                        }, 10);
                    } else {
                        var url = filter_find[a.stype][b.index].url;
                        var choice = _this.getChoice();
                        if (a.stype == 'voice') {
                            choice.voice_name = filter_find.voice[b.index].title;
                            choice.voice_url = url;
                        }
                        choice[a.stype] = b.index;
                        _this.saveChoice(choice);
                        _this.reset();
                        _this.request(url);
                        setTimeout(Lampa.Select.close, 10);
                    }
                }
            };
            if (filter.addButtonBack) filter.addButtonBack();
            filter.render().find('.filter--sort span').text(Lampa.Lang.translate('lampac_balanser'));
            scroll.body().addClass('torrent-list');
            files.appendFiles(scroll.render());
            files.appendHead(filter.render());
            scroll.minus(files.render().find('.explorer__files-head'));
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
            Lampa.Controller.enable('content');
            this.loading(false);

            sources = {};
            sources['animelib'] = { name: 'AnimeLib' };
            balanser = 'animelib';
            filter_sources = ['animelib'];

            this.search();
        };

        this.rch = function(json, noreset) {
            var _this2 = this;
            rchRun(json, function() {
                if (!noreset) _this2.find();
                else noreset();
            });
        };

        this.requestParams = function(url) {
            var query = [];
            var card_source = object.movie.source || 'tmdb';
            query.push('id=' + encodeURIComponent(object.movie.id));
            if (object.movie.imdb_id) query.push('imdb_id=' + (object.movie.imdb_id || ''));
            if (object.movie.kinopoisk_id) query.push('kinopoisk_id=' + (object.movie.kinopoisk_id || ''));
            if (object.movie.tmdb_id) query.push('tmdb_id=' + (object.movie.tmdb_id || ''));
            query.push('title=' + encodeURIComponent(object.clarification ? object.search : object.movie.title || object.movie.name));
            query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name));
            query.push('serial=' + (object.movie.name ? 1 : 0));
            query.push('original_language=' + (object.movie.original_language || ''));
            query.push('year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
            query.push('source=' + card_source);
            query.push('clarification=' + (object.clarification ? 1 : 0));
            query.push('similar=' + (object.similar ? true : false));
            
            return url + (url.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
        };

        this.getChoice = function(for_balanser) {
            var data = Lampa.Storage.cache('online_choice_' + (for_balanser || balanser), 3000, {});
            var save = data[object.movie.id] || {};
            Lampa.Arrays.extend(save, {
                season: 0,
                voice: 0,
                voice_name: '',
                voice_id: 0,
                episodes_view: {},
                movie_view: ''
            });
            return save;
        };

        this.saveChoice = function(choice, for_balanser) {
            var data = Lampa.Storage.cache('online_choice_' + (for_balanser || balanser), 3000, {});
            data[object.movie.id] = choice;
            Lampa.Storage.set('online_choice_' + (for_balanser || balanser), data);
        };

        this.replaceChoice = function(choice, for_balanser) {
            var to = this.getChoice(for_balanser);
            Lampa.Arrays.extend(to, choice, true);
            this.saveChoice(to, for_balanser);
        };

        this.search = function() {
            this.filter({
                source: filter_sources
            }, this.getChoice());
            this.find();
        };

        this.find = function() {
            this.request(this.requestParams(source));
        };

        this.request = function(url) {
            number_of_requests++;
            if (number_of_requests < 10) {
                network["native"](account(url), this.parse.bind(this), this.doesNotAnswer.bind(this), false, {
                    dataType: 'text'
                });
                clearTimeout(number_of_requests_timer);
                number_of_requests_timer = setTimeout(function() {
                    number_of_requests = 0;
                }, 4000);
            } else this.empty();
        };

        this.parseJsonDate = function(str, name) {
            try {
                var html = $('<div>' + str + '</div>');
                var elems = [];
                html.find(name).each(function() {
                    var item = $(this);
                    var data = JSON.parse(item.attr('data-json'));
                    var season = item.attr('s');
                    var episode = item.attr('e');
                    var text = item.text();
                    if (!object.movie.name) {
                        if (text.match(/\d+p/i)) {
                            if (!data.quality) {
                                data.quality = {};
                                data.quality[text] = data.url;
                            }
                            text = object.movie.title;
                        }
                        if (text == 'По умолчанию') {
                            text = object.movie.title;
                        }
                    }
                    if (episode) data.episode = parseInt(episode);
                    if (season) data.season = parseInt(season);
                    if (text) data.text = text;
                    data.active = item.hasClass('active');
                    elems.push(data);
                });
                return elems;
            } catch (e) {
                return [];
            }
        };

        this.getFileUrl = function(file, call, waiting_rch) {
            var _this = this;

            if (Lampa.Storage.field('player') !== 'inner' && file.stream && Lampa.Platform.is('apple')) {
                var newfile = Lampa.Arrays.clone(file);
                newfile.method = 'play';
                newfile.url = file.stream;
                call(newfile, {});
            } else if (file.method == 'play') {
                call(file, {});
            } else {
                Lampa.Loading.start(function() {
                    Lampa.Loading.stop();
                    Lampa.Controller.toggle('content');
                    network.clear();
                });
                network["native"](account(file.url), function(json) {
                    if (json.rch) {
                        if (waiting_rch) {
                            Lampa.Loading.stop();
                            call(false, {});
                        } else {
                            _this.rch(json, function() {
                                Lampa.Loading.stop();
                                _this.getFileUrl(file, call, true);
                            });
                        }
                    } else {
                        Lampa.Loading.stop();
                        call(json, json);
                    }
                }, function() {
                    Lampa.Loading.stop();
                    call(false, {});
                });
            }
        };

        this.toPlayElement = function(file) {
            var play = {
                title: file.title,
                url: file.url,
                quality: file.qualitys,
                timeline: file.timeline,
                subtitles: file.subtitles,
                segments: file.segments,
                callback: file.mark,
                season: file.season,
                episode: file.episode,
                voice_name: file.voice_name
            };
            return play;
        };

        this.setDefaultQuality = function(data) {
            if (Lampa.Arrays.getKeys(data.quality).length) {
                for (var q in data.quality) {
                    if (parseInt(q) == Lampa.Storage.field('video_quality_default')) {
                        data.url = data.quality[q];
                    }
                    if (data.quality[q].indexOf(" or ") !== -1)
                        data.quality[q] = data.quality[q].split(" or ")[0];
                }
            }
        };

        this.display = function(videos) {
            var _this5 = this;
            this.draw(videos, {
                onEnter: function onEnter(item, html) {
                    _this5.getFileUrl(item, function(json, json_call) {
                        if (json && json.url) {
                            var playlist = [];
                            var first = _this5.toPlayElement(item);
                            first.url = json.url;
                            first.headers = json_call.headers || json.headers;
                            first.quality = json_call.quality || item.qualitys;
                            first.segments = json_call.segments || item.segments;
                            first.hls_manifest_timeout = json_call.hls_manifest_timeout || json.hls_manifest_timeout;
                            first.subtitles = json.subtitles;
                            first.subtitles_call = json_call.subtitles_call || json.subtitles_call;
                            if (json.vast && json.vast.url) {
                                first.vast_url = json.vast.url;
                                first.vast_msg = json.vast.msg;
                                first.vast_region = json.vast.region;
                                first.vast_platform = json.vast.platform;
                                first.vast_screen = json.vast.screen;
                            }
                            _this5.setDefaultQuality(first);
                            if (item.season) {
                                videos.forEach(function(elem) {
                                    var cell = _this5.toPlayElement(elem);
                                    if (elem == item) cell.url = json.url;
                                    else {
                                        if (elem.method == 'call') {
                                            if (Lampa.Storage.field('player') !== 'inner') {
                                                cell.url = elem.stream;
                                                delete cell.quality;
                                            } else {
                                                cell.url = function(call) {
                                                    _this5.getFileUrl(elem, function(stream, stream_json) {
                                                        if (stream.url) {
                                                            cell.url = stream.url;
                                                            cell.quality = stream_json.quality || elem.qualitys;
                                                            cell.segments = stream_json.segments || elem.segments;
                                                            cell.subtitles = stream.subtitles;
                                                            _this5.setDefaultQuality(cell);
                                                            elem.mark();
                                                        } else {
                                                            cell.url = '';
                                                            Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
                                                        }
                                                        call();
                                                    }, function() {
                                                        cell.url = '';
                                                        call();
                                                    });
                                                };
                                            }
                                        } else {
                                            cell.url = elem.url;
                                        }
                                    }
                                    _this5.setDefaultQuality(cell);
                                    playlist.push(cell);
                                });
                            } else {
                                playlist.push(first);
                            }
                            if (playlist.length > 1) first.playlist = playlist;
                            if (first.url) {
                                var element = first;
                                element.isonline = true;
                                if (element.url && element.isonline) {
                                    Lampa.Player.play(element);
                                    Lampa.Player.playlist(playlist);
                                    if (element.subtitles_call) _this5.loadSubtitles(element.subtitles_call);
                                    item.mark();
                                } else {
                                    Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
                                }
                            } else {
                                Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
                            }
                        } else {
                            Lampa.Noty.show(Lampa.Lang.translate('lampac_nolink'));
                        }
                    }, true);
                },
                onContextMenu: function onContextMenu(item, html, data, call) {
                    _this5.getFileUrl(item, function(stream) {
                        call({
                            file: stream.url,
                            quality: item.qualitys
                        });
                    }, true);
                }
            });
            this.filter({
                season: filter_find.season.map(function(s) {
                    return s.title;
                }),
                voice: filter_find.voice.map(function(b) {
                    return b.title;
                })
            }, this.getChoice());
        };

        this.loadSubtitles = function(link) {
            network.silent(account(link), function(subs) {
                Lampa.Player.subtitles(subs);
            });
        };

        this.parse = function(str) {
            var json = Lampa.Arrays.decodeJson(str, {});
            if (Lampa.Arrays.isObject(str) && str.rch) json = str;
            if (json.rch) return this.rch(json);

            try {
                var items = this.parseJsonDate(str, '.videos__item');
                var buttons = this.parseJsonDate(str, '.videos__button');

                if (items.length == 1 && items[0].method == 'link' && !items[0].similar) {
                    filter_find.season = items.map(function(s) {
                        return {
                            title: s.text,
                            url: s.url
                        };
                    });
                    this.replaceChoice({
                        season: 0
                    });
                    this.request(items[0].url);
                } else {
                    this.activity.loader(false);
                    var videos = items.filter(function(v) {
                        return v.method == 'play' || v.method == 'call';
                    });
                    var similar = items.filter(function(v) {
                        return v.similar;
                    });

                    if (videos.length) {
                        if (buttons.length) {
                            filter_find.voice = buttons.map(function(b) {
                                return {
                                    title: b.text,
                                    url: b.url
                                };
                            });
                            var select_voice_url = this.getChoice(balanser).voice_url;
                            var select_voice_name = this.getChoice(balanser).voice_name;
                            var find_voice_url = buttons.find(function(v) {
                                return v.url == select_voice_url;
                            });
                            var find_voice_name = buttons.find(function(v) {
                                return v.text == select_voice_name;
                            });
                            var find_voice_active = buttons.find(function(v) {
                                return v.active;
                            });

                            if (find_voice_url && !find_voice_url.active) {
                                this.replaceChoice({
                                    voice: buttons.indexOf(find_voice_url),
                                    voice_name: find_voice_url.text
                                });
                                this.request(find_voice_url.url);
                            } else if (find_voice_name && !find_voice_name.active) {
                                this.replaceChoice({
                                    voice: buttons.indexOf(find_voice_name),
                                    voice_name: find_voice_name.text
                                });
                                this.request(find_voice_name.url);
                            } else {
                                if (find_voice_active) {
                                    this.replaceChoice({
                                        voice: buttons.indexOf(find_voice_active),
                                        voice_name: find_voice_active.text
                                    });
                                }
                                this.display(videos);
                            }
                        } else {
                            this.replaceChoice({
                                voice: 0,
                                voice_url: '',
                                voice_name: ''
                            });
                            this.display(videos);
                        }
                    } else if (items.length) {
                        if (similar.length) {
                            this.similars(similar);
                            this.activity.loader(false);
                        } else {
                            filter_find.season = items.map(function(s) {
                                return {
                                    title: s.text,
                                    url: s.url
                                };
                            });
                            var select_season = this.getChoice(balanser).season;
                            var season = filter_find.season[select_season];
                            if (!season) season = filter_find.season[0];
                            this.request(season.url);
                        }
                    } else {
                        this.doesNotAnswer(json);
                    }
                }
            } catch (e) {
                this.doesNotAnswer(e);
            }
        };

        this.similars = function(json) {
            var _this6 = this;
            scroll.clear();
            json.forEach(function(elem) {
                elem.title = elem.text;
                elem.info = '';
                var info = [];
                var year = ((elem.start_date || elem.year || object.movie.release_date || object.movie.first_air_date || '') + '').slice(0, 4);
                if (year) info.push(year);
                if (elem.details) info.push(elem.details);
                var name = elem.title || elem.text;
                elem.title = name;
                elem.time = elem.time || '';
                elem.info = info.join('<span class="online-prestige-split">●</span>');
                var item = Lampa.Template.get('lampac_prestige_folder', elem);
                if (elem.img) {
                    var image = $('<img style="height: 7em; width: 7em; border-radius: 0.3em;"/>');
                    item.find('.online-prestige__folder').empty().append(image);
                    if (elem.img !== undefined) {
                        if (elem.img.charAt(0) === '/')
                            elem.img = Defined.localhost + elem.img.substring(1);
                        if (elem.img.indexOf('/proxyimg') !== -1)
                            elem.img = account(elem.img);
                    }
                    Lampa.Utils.imgLoad(image, elem.img);
                }
                item.on('hover:enter', function() {
                    _this6.reset();
                    _this6.request(elem.url);
                }).on('hover:focus', function(e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });
                scroll.append(item);
            });
            this.filter({
                season: filter_find.season.map(function(s) {
                    return s.title;
                }),
                voice: filter_find.voice.map(function(b) {
                    return b.title;
                })
            }, this.getChoice());
            Lampa.Controller.enable('content');
        };

        this.clearImages = function() {
            images.forEach(function(img) {
                img.onerror = function() {};
                img.onload = function() {};
                img.src = '';
            });
            images = [];
        };

        this.reset = function() {
            last = false;
            clearInterval(balanser_timer);
            network.clear();
            this.clearImages();
            scroll.render().find('.empty').remove();
            scroll.clear();
            scroll.reset();
            scroll.body().append(Lampa.Template.get('lampac_content_loading'));
        };

        this.loading = function(status) {
            if (status) this.activity.loader(true);
            else {
                this.activity.loader(false);
                this.activity.toggle();
            }
        };

        this.filter = function(filter_items, choice) {
            var _this7 = this;
            var select = [];
            var add = function add(type, title) {
                var need = _this7.getChoice();
                var items = filter_items[type];
                var subitems = [];
                var value = need[type];
                items.forEach(function(name, i) {
                    subitems.push({
                        title: name,
                        selected: value == i,
                        index: i
                    });
                });
                select.push({
                    title: title,
                    subtitle: items[value],
                    items: subitems,
                    stype: type
                });
            };
            filter_items.source = filter_sources;
            select.push({
                title: Lampa.Lang.translate('torrent_parser_reset'),
                reset: true
            });
            this.saveChoice(choice);
            if (filter_items.voice && filter_items.voice.length) add('voice', Lampa.Lang.translate('torrent_parser_voice'));
            if (filter_items.season && filter_items.season.length) add('season', Lampa.Lang.translate('torrent_serial_season'));
            filter.set('filter', select);
            filter.set('sort', filter_sources.map(function(e) {
                return {
                    title: sources[e].name,
                    source: e,
                    selected: e == balanser,
                    ghost: !sources[e].show
                };
            }));
            this.selected(filter_items);
        };

        this.selected = function(filter_items) {
            var need = this.getChoice(),
                select = [];
            for (var i in need) {
                if (filter_items[i] && filter_items[i].length) {
                    if (i == 'voice') {
                        select.push(filter_translate[i] + ': ' + filter_items[i][need[i]]);
                    } else if (i !== 'source') {
                        if (filter_items.season.length >= 1) {
                            select.push(filter_translate.season + ': ' + filter_items[i][need[i]]);
                        }
                    }
                }
            }
            filter.chosen('filter', select);
            filter.chosen('sort', [sources[balanser].name]);
        };

        this.getEpisodes = function(season, call) {
            var episodes = [];
            var tmdb_id = object.movie.id;
            if (['cub', 'tmdb'].indexOf(object.movie.source || 'tmdb') == -1)
                tmdb_id = object.movie.tmdb_id;
            if (typeof tmdb_id == 'number' && object.movie.name) {
                var tmdburl = 'tv/' + tmdb_id + '/season/' + season + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru');
                var baseurl = Lampa.TMDB.api(tmdburl);
                network.timeout(1000 * 10);
                network["native"](baseurl, function(data) {
                    episodes = data.episodes || [];
                    call(episodes);
                }, function(a, c) {
                    call(episodes);
                });
            } else call(episodes);
        };

        this.draw = function(items) {
            var _this8 = this;
            var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
            if (!items.length) return this.empty();
            scroll.clear();
            scroll.append(Lampa.Template.get('lampac_prestige_watched', {}));
            this.getEpisodes(items[0].season, function(episodes) {
                var viewed = Lampa.Storage.cache('online_view', 5000, []);
                var serial = object.movie.name ? true : false;
                var choice = _this8.getChoice();
                var fully = window.innerWidth > 480;
                var scroll_to_element = false;
               
