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
            const saved = Lampa.Storage.get('animelib_token_data');
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
            Lampa.Storage.set('animelib_token_data', JSON.stringify(tokenCache));
        } catch (e) {}
    }

    // Получение токена
    async function ensureToken() {
        if (tokenCache.token && tokenCache.expiryTime > Date.now()) {
            return tokenCache.token;
        }

        const manualToken = Lampa.Storage.get('animelib_manual_token');
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
                    
                    results.push({
                        id: anime.slug_url,
                        title: title,
                        description: `${anime.eng_name || ''} (${year})`,
                        year: year,
                        url: anime.slug_url
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

    // Компонент для Lampa
    function AnimeLibComponent() {
        return function(object) {
            var self = this;
            var scroll = new Lampa.Scroll({
                mask: true,
                over: true
            });
            var filter = new Lampa.Filter(object);
            var initialized = false;

            this.create = function() {
                console.log('[AnimeLib] Создание компонента');
                self.initialize();
                return self.render();
            };

            this.initialize = function() {
                console.log('[AnimeLib] Инициализация');
                
                filter.onSearch = function(value) {
                    if (value && value.length > 0) {
                        self.searchAnime(value);
                    }
                };
                
                filter.onBack = function() {
                    self.start();
                };
                
                filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
                
                scroll.body().addClass('torrent-list');
                
                var loadingHtml = $('<div class="torrent-loading" style="padding:2em;text-align:center;color:rgba(255,255,255,0.5)">Загрузка...</div>');
                scroll.append(loadingHtml);
                
                Lampa.Controller.enable('content');

                var searchQuery = object.search || (object.movie ? object.movie.title || object.movie.name : '');
                if (searchQuery) {
                    self.searchAnime(searchQuery);
                } else {
                    self.showError('Введите название', 'Для поиска введите название аниме');
                }
            };

            this.searchAnime = function(query) {
                self.loading(true);
                object.search = query;
                
                searchAnime(query).then(function(results) {
                    if (results && results.length > 0) {
                        self.drawResults(results);
                    } else {
                        self.showError('Ничего не найдено', 'Попробуйте изменить поисковый запрос');
                    }
                    self.loading(false);
                }).catch(function(e) {
                    console.error('[AnimeLib] Ошибка поиска:', e);
                    self.showError('Ошибка поиска', e.message || 'Проверьте подключение к интернету');
                    self.loading(false);
                });
            };

            this.drawResults = function(results) {
                scroll.clear();
                
                results.forEach(function(result) {
                    var html = $('<div class="animelib-item selector" style="padding:1em;margin:0.5em 0;background:rgba(0,0,0,0.2);border-radius:0.3em;cursor:pointer">' +
                        '<div style="font-size:1.3em;font-weight:500">' + result.title + '</div>' +
                        '<div style="opacity:0.7;font-size:0.9em">' + result.description + '</div>' +
                        '</div>');
                    
                    html.on('hover:enter', function() {
                        self.loadEpisodes(result);
                    }).on('hover:focus', function(e) {
                        scroll.update($(e.target), true);
                    });
                    
                    scroll.append(html);
                });
                
                Lampa.Controller.enable('content');
            };

            this.loadEpisodes = function(item) {
                self.loading(true);
                
                getAnimePlaylist(item).then(function(playlist) {
                    if (playlist && playlist.length > 0) {
                        self.drawEpisodes(playlist, item);
                    } else {
                        self.showError('Нет серий', 'Для этого аниме пока нет доступных серий');
                    }
                    self.loading(false);
                }).catch(function(e) {
                    console.error('[AnimeLib] Ошибка загрузки эпизодов:', e);
                    self.showError('Ошибка загрузки', e.message || 'Не удалось загрузить серии');
                    self.loading(false);
                });
            };

            this.drawEpisodes = function(episodes, item) {
                scroll.clear();
                
                episodes.forEach(function(ep) {
                    var html = $('<div class="animelib-item selector" style="padding:1em;margin:0.5em 0;background:rgba(0,0,0,0.2);border-radius:0.3em;cursor:pointer">' +
                        '<div style="font-size:1.2em;font-weight:500">' + ep.title + '</div>' +
                        '<div style="opacity:0.7;font-size:0.9em">' + (ep.description || '') + '</div>' +
                        '</div>');
                    
                    html.on('hover:enter', function() {
                        Lampa.Player.play({
                            url: ep.url,
                            title: ep.title
                        });
                    }).on('hover:focus', function(e) {
                        scroll.update($(e.target), true);
                    });
                    
                    scroll.append(html);
                });
                
                Lampa.Controller.enable('content');
            };

            this.showError = function(title, message) {
                scroll.clear();
                var html = $('<div style="padding:2em;text-align:center">' +
                    '<div style="font-size:1.8em;margin-bottom:0.5em">' + title + '</div>' +
                    '<div style="opacity:0.7;font-size:1.2em">' + message + '</div>' +
                    '</div>');
                scroll.append(html);
                self.loading(false);
            };

            this.loading = function(status) {
                if (status) {
                    if (self.activity) self.activity.loader(true);
                } else {
                    if (self.activity) {
                        self.activity.loader(false);
                        self.activity.toggle();
                    }
                }
            };

            this.start = function() {
                if (!initialized) {
                    initialized = true;
                    self.initialize();
                }
                
                if (object.movie) {
                    Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
                }
                
                Lampa.Controller.add('content', {
                    toggle: function() {
                        Lampa.Controller.collectionSet(scroll.render(), scroll.render());
                    },
                    up: function() {
                        if (Navigator.canmove('up')) {
                            Navigator.move('up');
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    },
                    down: function() {
                        Navigator.move('down');
                    },
                    left: function() {
                        Lampa.Controller.toggle('menu');
                    },
                    back: function() {
                        Lampa.Activity.backward();
                    }
                });
                
                Lampa.Controller.toggle('content');
            };

            this.render = function() {
                return scroll.render();
            };

            this.destroy = function() {
                scroll.destroy();
            };

            this.pause = function() {};
            this.stop = function() {};
        };
    }

    // Добавление кнопки в карточку
    function addButtonToCard() {
        var buttonHtml = '<div class="full-start__button selector view--animelib" style="background:rgba(255,50,50,0.2);margin-top:0.5em;cursor:pointer">\n            <svg viewBox="0 0 24 24" width="24" height="24">\n                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" fill="currentColor"/>\n            </svg>\n            <span>AnimeLib</span>\n        </div>';

        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var container = e.object.activity.render().find('.view--torrent');
                if (!container.length) return;
                
                if (container.find('.view--animelib').length) return;
                
                var btn = $(buttonHtml);
                btn.on('hover:enter', function() {
                    var movie = e.data.movie;
                    if (!movie) return;
                    
                    Lampa.Activity.push({
                        title: 'AnimeLib',
                        component: 'animelib_component',
                        search: movie.title || movie.name,
                        movie: movie
                    });
                });
                
                container.after(btn);
            }
        });

        try {
            var active = Lampa.Activity.active();
            if (active && active.component == 'full' && active.card) {
                var container = active.activity.render().find('.view--torrent');
                if (container.length && !container.find('.view--animelib').length) {
                    var btn = $(buttonHtml);
                    btn.on('hover:enter', function() {
                        var movie = active.card;
                        Lampa.Activity.push({
                            title: 'AnimeLib',
                            component: 'animelib_component',
                            search: movie.title || movie.name,
                            movie: movie
                        });
                    });
                    container.after(btn);
                }
            }
        } catch (e) {}
    }

    // Функция для показа уведомлений
    function showNotify(message, isError = false) {
        try {
            if (Lampa.Notify && typeof Lampa.Notify.show === 'function') {
                Lampa.Notify.show(message, isError ? '❌ AnimeLib' : '✅ AnimeLib');
            } else {
                console.log('[AnimeLib]', message);
            }
        } catch (e) {
            console.log('[AnimeLib]', message);
        }
    }

    // Добавление настроек через меню
    function addSettings() {
        try {
            // Проверяем, есть ли уже настройки
            if (Lampa.SettingsApi.getComponent && Lampa.SettingsApi.getComponent('animelib_settings')) {
                return;
            }

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
                        value: Lampa.Storage.get('animelib_manual_token') || '',
                        onSave: function(value) {
                            if (value) {
                                Lampa.Storage.set('animelib_manual_token', value);
                                tokenCache.token = value;
                                tokenCache.expiryTime = Date.now() + 2592000000;
                                saveTokenToStorage();
                                showNotify('✅ Токен сохранен');
                            }
                        }
                    },
                    {
                        type: 'input',
                        name: 'animelib_refresh_token',
                        title: 'Refresh Token',
                        placeholder: 'Введите refresh токен (опционально)',
                        value: tokenCache.refreshToken || '',
                        onSave: function(value) {
                            if (value) {
                                tokenCache.refreshToken = value;
                                saveTokenToStorage();
                                showNotify('✅ Refresh токен сохранен');
                            }
                        }
                    },
                    {
                        type: 'button',
                        name: 'animelib_test',
                        title: '🔍 Проверить подключение',
                        onClick: async function() {
                            try {
                                showNotify('⏳ Проверка подключения...');
                                const token = await ensureToken();
                                if (token) {
                                    const results = await searchAnime('naruto');
                                    if (results && results.length > 0) {
                                        showNotify('✅ Подключение работает! Найдено ' + results.length + ' результатов');
                                    } else {
                                        showNotify('⚠️ Токен есть, но ничего не найдено');
                                    }
                                } else {
                                    showNotify('❌ Токен не найден. Введите токен в настройках', true);
                                }
                            } catch (e) {
                                showNotify('❌ Ошибка: ' + e.message, true);
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
                                showNotify('✅ Очищено ' + count + ' записей');
                            } catch (e) {
                                showNotify('❌ Ошибка: ' + e.message, true);
                            }
                        }
                    }
                ]
            });

            console.log('[AnimeLib] Настройки добавлены');
        } catch (e) {
            console.warn('[AnimeLib] Ошибка добавления настроек:', e);
        }
    }

    // Запуск плагина
    function startPlugin() {
        console.log('[AnimeLib] Запуск плагина...');

        // Загружаем токен
        loadTokenFromStorage();

        // Регистрируем компонент
        var component = new AnimeLibComponent();
        Lampa.Component.add('animelib_component', component);

        // Добавляем кнопку
        setTimeout(addButtonToCard, 1000);

        // Добавляем настройки
        setTimeout(addSettings, 1500);

        console.log('[AnimeLib] Плагин запущен!');
    }

    // Инициализация
    if (typeof Lampa !== 'undefined') {
        if (window.appready) {
            setTimeout(startPlugin, 500);
        } else {
            Lampa.Listener.follow('app', function(event) {
                if (event.type === 'ready') {
                    setTimeout(startPlugin, 500);
                }
            });
        }
    } else {
        var checkLampa = setInterval(function() {
            if (typeof Lampa !== 'undefined') {
                clearInterval(checkLampa);
                if (window.appready) {
                    setTimeout(startPlugin, 500);
                } else {
                    Lampa.Listener.follow('app', function(event) {
                        if (event.type === 'ready') {
                            setTimeout(startPlugin, 500);
                        }
                    });
                }
            }
        }, 200);
    }

    console.log('[AnimeLib] Плагин загружен');
})();
