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
        siteId: '5'
    };

    // Хранилище токенов
    let tokenCache = {
        token: null,
        refreshToken: null,
        expiryTime: 0
    };

    // Загрузка токена
    function loadTokenFromStorage() {
        try {
            const saved = localStorage.getItem('animelib_token_data');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.token && data.expiryTime > Date.now()) {
                    tokenCache = data;
                    return true;
                }
            }
        } catch (e) {}
        return false;
    }

    // Сохранение токена
    function saveTokenToStorage() {
        try {
            localStorage.setItem('animelib_token_data', JSON.stringify(tokenCache));
        } catch (e) {}
    }

    // Получение токена
    async function ensureToken() {
        if (tokenCache.token && tokenCache.expiryTime > Date.now()) {
            return tokenCache.token;
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

    // Поиск аниме
    async function searchAnime(query) {
        const token = await ensureToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена');
            return [];
        }

        try {
            const url = `${CONFIG.apiHost}/api/anime?fields[]=rate_avg&fields[]=rate&fields[]=releaseDate&q=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const results = [];

            if (data.data && data.data.length > 0) {
                data.data.forEach(anime => {
                    const title = anime.rus_name || anime.eng_name || 'Без названия';
                    const year = anime.releaseDate ? anime.releaseDate.split('-')[0] : '0';
                    const poster = anime.cover ? anime.cover.default : null;
                    
                    results.push({
                        id: anime.slug_url,
                        title: title,
                        description: `${anime.eng_name || ''} (${year})`,
                        poster: poster,
                        year: year,
                        rating: anime.rate_avg || anime.rate || 0,
                        url: anime.slug_url,
                        source: 'animelib'
                    });
                });
            }

            return results;

        } catch (e) {
            console.error('[AnimeLib] Ошибка поиска:', e);
            return [];
        }
    }

    // Получение плейлиста
    async function getAnimePlaylist(item) {
        const token = await ensureToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена для плейлиста');
            return null;
        }

        try {
            const url = `${CONFIG.apiHost}/api/episodes?anime_id=${item.id}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return null;
            }

            const episodes = data.data;
            const playlist = [];

            for (let i = 0; i < Math.min(episodes.length, 50); i++) {
                const ep = episodes[i];
                
                try {
                    const epDetailsUrl = `${CONFIG.apiHost}/api/episodes/${ep.id}`;
                    const epResponse = await fetch(epDetailsUrl, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    const epData = await epResponse.json();
                    
                    const players = epData.data?.players || [];
                    const animelibPlayer = players.find(p => p.player === 'Animelib');
                    
                    if (animelibPlayer && animelibPlayer.video?.quality?.length > 0) {
                        const qualities = animelibPlayer.video.quality;
                        const bestQuality = qualities[qualities.length - 1];
                        
                        playlist.push({
                            id: ep.id,
                            title: `${ep.number} серия`,
                            description: ep.name || `${item.title} - ${ep.number} серия`,
                            url: bestQuality.href,
                            season: ep.season || 1,
                            episode: ep.number || i + 1
                        });
                    }
                } catch (e) {
                    console.warn(`[AnimeLib] Ошибка получения эпизода ${ep.id}:`, e);
                    continue;
                }
            }

            return playlist;

        } catch (e) {
            console.error('[AnimeLib] Ошибка получения плейлиста:', e);
            return null;
        }
    }

    // Создание компонента для Lampa
    function createVodComponent() {
        return function(object) {
            var network = new Lampa.Reguest();
            var scroll = new Lampa.Scroll({
                mask: true,
                over: true
            });
            var files = new Lampa.Explorer(object);
            var filter = new Lampa.Filter(object);
            var last;
            var source;
            var initialized;

            this.initialize = function() {
                var _this = this;
                this.loading(true);
                
                filter.onSearch = function(value) {
                    Lampa.Activity.replace({
                        search: value,
                        clarification: true
                    });
                };
                
                filter.onBack = function() {
                    _this.start();
                };
                
                filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
                
                scroll.body().addClass('torrent-list');
                files.appendFiles(scroll.render());
                files.appendHead(filter.render());
                scroll.minus(files.render().find('.explorer__files-head'));
                scroll.body().append(Lampa.Template.get('lampac_content_loading'));
                Lampa.Controller.enable('content');
                this.loading(false);

                // Поиск
                this.search();
            };

            this.search = function() {
                this.find();
            };

            this.find = function() {
                this.request(this.getRequestUrl());
            };

            this.getRequestUrl = function() {
                var url = '';
                var query = [];
                query.push('id=' + encodeURIComponent(object.movie.id));
                if (object.movie.imdb_id) query.push('imdb_id=' + (object.movie.imdb_id || ''));
                if (object.movie.kinopoisk_id) query.push('kinopoisk_id=' + (object.movie.kinopoisk_id || ''));
                if (object.movie.tmdb_id) query.push('tmdb_id=' + (object.movie.tmdb_id || ''));
                query.push('title=' + encodeURIComponent(object.clarification ? object.search : object.movie.title || object.movie.name));
                query.push('original_title=' + encodeURIComponent(object.movie.original_title || object.movie.original_name));
                query.push('serial=' + (object.movie.name ? 1 : 0));
                query.push('year=' + ((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
                query.push('clarification=' + (object.clarification ? 1 : 0));
                
                // Используем поиск через Anilib API
                var searchQuery = object.clarification ? object.search : object.movie.title;
                this.searchAnimeInternal(searchQuery);
                
                return '';
            };

            this.searchAnimeInternal = async function(query) {
                var _this = this;
                var results = await searchAnime(query);
                
                if (results && results.length > 0) {
                    // Показываем результаты
                    _this.drawResults(results);
                } else {
                    _this.empty();
                }
                _this.loading(false);
            };

            this.drawResults = function(results) {
                var _this = this;
                scroll.clear();
                
                results.forEach(function(result) {
                    var html = Lampa.Template.get('lampac_prestige_folder', {
                        title: result.title,
                        info: result.description,
                        time: result.year
                    });
                    
                    html.on('hover:enter', function() {
                        // Открываем плейлист
                        _this.getPlaylist(result);
                    }).on('hover:focus', function(e) {
                        last = e.target;
                        scroll.update($(e.target), true);
                    });
                    
                    scroll.append(html);
                });
                
                Lampa.Controller.enable('content');
            };

            this.getPlaylist = function(item) {
                var _this = this;
                this.loading(true);
                
                getAnimePlaylist(item).then(function(playlist) {
                    if (playlist && playlist.length > 0) {
                        _this.drawEpisodes(playlist, item);
                    } else {
                        _this.empty();
                    }
                    _this.loading(false);
                }).catch(function(e) {
                    _this.empty();
                    _this.loading(false);
                });
            };

            this.drawEpisodes = function(episodes, item) {
                var _this = this;
                scroll.clear();
                
                episodes.forEach(function(ep) {
                    var html = Lampa.Template.get('lampac_prestige_full', {
                        title: ep.title,
                        info: ep.description || '',
                        time: '',
                        quality: ''
                    });
                    
                    html.on('hover:enter', function() {
                        // Воспроизводим
                        Lampa.Player.play({
                            url: ep.url,
                            title: ep.title
                        });
                    }).on('hover:focus', function(e) {
                        last = e.target;
                        scroll.update($(e.target), true);
                    });
                    
                    scroll.append(html);
                });
                
                Lampa.Controller.enable('content');
            };

            this.empty = function() {
                var html = Lampa.Template.get('lampac_does_not_answer', {});
                html.find('.online-empty__buttons').remove();
                html.find('.online-empty__title').text('Ничего не найдено');
                html.find('.online-empty__time').text('Попробуйте изменить поисковый запрос');
                scroll.clear();
                scroll.append(html);
                this.loading(false);
            };

            this.loading = function(status) {
                if (status) this.activity.loader(true);
                else {
                    this.activity.loader(false);
                    this.activity.toggle();
                }
            };

            this.start = function() {
                if (Lampa.Activity.active().activity !== this.activity) return;
                if (!initialized) {
                    initialized = true;
                    this.initialize();
                }
                Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
                Lampa.Controller.add('content', {
                    toggle: function toggle() {
                        Lampa.Controller.collectionSet(scroll.render(), files.render());
                        Lampa.Controller.collectionFocus(last || false, scroll.render());
                    },
                    up: function up() {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else Lampa.Controller.toggle('head');
                    },
                    down: function down() {
                        Navigator.move('down');
                    },
                    right: function right() {
                        if (Navigator.canmove('right')) Navigator.move('right');
                        else filter.show('Фильтр', 'filter');
                    },
                    left: function left() {
                        if (Navigator.canmove('left')) Navigator.move('left');
                        else Lampa.Controller.toggle('menu');
                    },
                    back: this.back.bind(this)
                });
                Lampa.Controller.toggle('content');
            };

            this.render = function() {
                return files.render();
            };

            this.back = function() {
                Lampa.Activity.backward();
            };

            this.destroy = function() {
                network.clear();
                files.destroy();
                scroll.destroy();
            };
        };
    }

    // Добавление шаблонов
    function addTemplates() {
        Lampa.Template.add('lampac_prestige_full', '<div class="online-prestige online-prestige--full selector">\n            <div class="online-prestige__img">\n                <img alt="">\n                <div class="online-prestige__loader"></div>\n            </div>\n            <div class="online-prestige__body">\n                <div class="online-prestige__head">\n                    <div class="online-prestige__title">{title}</div>\n                    <div class="online-prestige__time">{time}</div>\n                </div>\n                <div class="online-prestige__footer">\n                    <div class="online-prestige__info">{info}</div>\n                    <div class="online-prestige__quality">{quality}</div>\n                </div>\n            </div>\n        </div>');

        Lampa.Template.add('lampac_prestige_folder', '<div class="online-prestige online-prestige--folder selector">\n            <div class="online-prestige__folder">\n                <svg viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">\n                    <rect y="20" width="128" height="92" rx="13" fill="white"></rect>\n                    <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"></path>\n                    <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"></rect>\n                </svg>\n            </div>\n            <div class="online-prestige__body">\n                <div class="online-prestige__head">\n                    <div class="online-prestige__title">{title}</div>\n                    <div class="online-prestige__time">{time}</div>\n                </div>\n                <div class="online-prestige__footer">\n                    <div class="online-prestige__info">{info}</div>\n                </div>\n            </div>\n        </div>');

        Lampa.Template.add('lampac_content_loading', '<div class="online-empty">\n            <div class="broadcast__scan"><div></div></div>\n            <div class="online-empty__templates">\n                <div class="online-empty-template selector">\n                    <div class="online-empty-template__ico"></div>\n                    <div class="online-empty-template__body"></div>\n                </div>\n            </div>\n        </div>');

        Lampa.Template.add('lampac_does_not_answer', '<div class="online-empty">\n            <div class="online-empty__title">Ничего не найдено</div>\n            <div class="online-empty__time">Попробуйте другой запрос</div>\n        </div>');

        // CSS
        var css = '<style>' +
            '.online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex;margin-bottom:1em}' +
            '.online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}' +
            '.online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}' +
            '.online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em}' +
            '.online-prestige__folder{padding:1em;flex-shrink:0}' +
            '.online-prestige__folder>svg{width:4.4em;height:4.4em}' +
            '.online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.online-prestige__info{display:flex;align-items:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.online-prestige__time{padding-left:2em}' +
            '.online-prestige__quality{padding-left:1em;white-space:nowrap}' +
            '.online-prestige__head,.online-prestige__footer{display:flex;justify-content:space-between;align-items:center}' +
            '.online-prestige.focus::after{content:"";position:absolute;top:-0.6em;left:-0.6em;right:-0.6em;bottom:-0.6em;border-radius:.7em;border:solid .3em #fff;z-index:-1;pointer-events:none}' +
            '.online-empty{line-height:1.4;padding:2em;text-align:center}' +
            '.online-empty__title{font-size:1.8em;margin-bottom:.3em}' +
            '.online-empty__time{font-size:1.2em;font-weight:300}' +
            '@media screen and (max-width:480px){.online-prestige__img{width:7em;min-height:6em}.online-prestige__title{font-size:1.2em}}' +
            '</style>';

        $('body').append(css);
    }

    // Основная функция запуска
    function startPlugin() {
        console.log('[AnimeLib] Запуск плагина...');

        // Добавляем шаблоны
        addTemplates();

        // Создаем компонент
        var VodComponent = createVodComponent();

        // Регистрируем компонент
        Lampa.Component.add('vod', VodComponent);

        // Добавляем кнопку в карточку
        var button = '<div class="full-start__button selector view--online" style="background:rgba(255,50,50,0.2)">\n            <svg viewBox="0 0 24 24" width="24" height="24">\n                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>\n            </svg>\n            <span>AnimeLib</span>\n        </div>';

        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var render = e.object.activity.render().find('.view--torrent');
                if (render.find('.view--online').length) return;
                var btn = $(button);
                btn.on('hover:enter', function() {
                    Lampa.Component.add('vod', VodComponent);
                    Lampa.Activity.push({
                        title: 'AnimeLib',
                        component: 'vod',
                        search: e.data.movie.title,
                        search_one: e.data.movie.title,
                        search_two: e.data.movie.original_title,
                        movie: e.data.movie,
                        page: 1
                    });
                });
                render.after(btn);
            }
        });

        // Добавляем настройки
        Lampa.SettingsApi.addComponent({
            component: 'animelib_settings',
            name: 'AnimeLib',
            icon: '🎌',
            settings: [
                {
                    type: 'input',
                    name: 'animelib_manual_token',
                    title: 'Access Token',
                    placeholder: 'Введите токен доступа',
                    value: localStorage.getItem('animelib_manual_token') || '',
                    onSave: function(value) {
                        localStorage.setItem('animelib_manual_token', value);
                        if (value) {
                            tokenCache.token = value;
                            tokenCache.expiryTime = Date.now() + 2592000000;
                            saveTokenToStorage();
                            if (Lampa.Notify) {
                                Lampa.Notify.show('✅ Токен сохранен', 'AnimeLib');
                            }
                        }
                    }
                },
                {
                    type: 'button',
                    name: 'animelib_test',
                    title: '🔍 Проверить подключение',
                    onClick: async function() {
                        try {
                            const token = await ensureToken();
                            if (token) {
                                const results = await searchAnime('naruto');
                                if (results && results.length > 0) {
                                    if (Lampa.Notify) {
                                        Lampa.Notify.show('✅ Подключение работает! Найдено ' + results.length + ' результатов', 'AnimeLib');
                                    }
                                } else {
                                    if (Lampa.Notify) {
                                        Lampa.Notify.show('⚠️ Токен есть, но ничего не найдено', 'AnimeLib');
                                    }
                                }
                            } else {
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('❌ Токен не найден. Введите токен в настройках', 'AnimeLib');
                                }
                            }
                        } catch (e) {
                            if (Lampa.Notify) {
                                Lampa.Notify.show('❌ Ошибка: ' + e.message, 'AnimeLib');
                            }
                        }
                    }
                },
                {
                    type: 'button',
                    name: 'animelib_clear_cache',
                    title: '🗑️ Очистить кэш',
                    onClick: function() {
                        try {
                            const keys = Object.keys(localStorage);
                            let count = 0;
                            keys.forEach(key => {
                                if (key.startsWith('animelib_')) {
                                    localStorage.removeItem(key);
                                    count++;
                                }
                            });
                            if (Lampa.Notify) {
                                Lampa.Notify.show('✅ Очищено ' + count + ' записей', 'AnimeLib');
                            }
                        } catch (e) {
                            if (Lampa.Notify) {
                                Lampa.Notify.show('❌ Ошибка: ' + e.message, 'AnimeLib');
                            }
                        }
                    }
                }
            ]
        });

        console.log('[AnimeLib] Плагин запущен!');
    }

    // Запуск
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            startPlugin();
        } else {
            Lampa.Listener.follow('app', function(event) {
                if (event.type === 'ready') {
                    startPlugin();
                }
            });
        }
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            var checkLampa = setInterval(function() {
                if (typeof Lampa !== 'undefined') {
                    clearInterval(checkLampa);
                    if (window.appready) {
                        startPlugin();
                    } else {
                        Lampa.Listener.follow('app', function(event) {
                            if (event.type === 'ready') {
                                startPlugin();
                            }
                        });
                    }
                }
            }, 200);
        });
    }

    console.log('[AnimeLib] Плагин загружен');
})();
