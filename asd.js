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

    // Работа с токеном через Lampa.Storage
    function getToken() {
        return Lampa.Storage.get('animelib_token', '');
    }

    function setToken(token) {
        Lampa.Storage.set('animelib_token', token);
    }

    function hasToken() {
        var token = getToken();
        return token && token.length > 0;
    }

    // Поиск аниме
    async function searchAnime(query) {
        var token = getToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена');
            return [];
        }

        try {
            var url = CONFIG.apiHost + '/api/anime?fields[]=rate_avg&fields[]=rate&fields[]=releaseDate&q=' + encodeURIComponent(query);
            var response = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });

            if (response.status === 401) {
                Lampa.Storage.remove('animelib_token');
                return [];
            }

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            var data = await response.json();
            var results = [];

            if (data.data && data.data.length > 0) {
                data.data.forEach(function(anime) {
                    var title = anime.rus_name || anime.eng_name || 'Без названия';
                    var year = anime.releaseDate ? anime.releaseDate.split('-')[0] : '0';
                    
                    results.push({
                        id: anime.slug_url,
                        title: title,
                        description: (anime.eng_name || '') + ' (' + year + ')',
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
        var token = getToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена для плейлиста');
            return null;
        }

        try {
            var url = CONFIG.apiHost + '/api/episodes?anime_id=' + item.id;
            var response = await fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + token
                }
            });

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            var data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return null;
            }

            var episodes = data.data;
            var playlist = [];

            for (var i = 0; i < Math.min(episodes.length, 50); i++) {
                var ep = episodes[i];
                
                try {
                    var epDetailsUrl = CONFIG.apiHost + '/api/episodes/' + ep.id;
                    var epResponse = await fetch(epDetailsUrl, {
                        headers: {
                            'Authorization': 'Bearer ' + token
                        }
                    });
                    var epData = await epResponse.json();
                    
                    var players = epData.data?.players || [];
                    var animelibPlayer = null;
                    
                    for (var j = 0; j < players.length; j++) {
                        if (players[j].player === 'Animelib') {
                            animelibPlayer = players[j];
                            break;
                        }
                    }
                    
                    if (animelibPlayer && animelibPlayer.video?.quality?.length > 0) {
                        var qualities = animelibPlayer.video.quality;
                        var bestQuality = qualities[qualities.length - 1];
                        
                        playlist.push({
                            id: ep.id,
                            title: ep.number + ' серия',
                            description: ep.name || item.title + ' - ' + ep.number + ' серия',
                            url: bestQuality.href,
                            season: ep.season || 1,
                            episode: ep.number || i + 1
                        });
                    }
                } catch (e) {
                    console.warn('[AnimeLib] Ошибка получения эпизода ' + ep.id + ':', e);
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

                if (!hasToken()) {
                    self.showNoToken();
                    return;
                }

                var searchQuery = object.search || (object.movie ? object.movie.title || object.movie.name : '');
                if (searchQuery) {
                    self.searchAnime(searchQuery);
                } else {
                    self.showError('Введите название', 'Для поиска введите название аниме');
                }
            };

            this.showNoToken = function() {
                scroll.clear();
                var html = $('<div style="padding:2em;text-align:center">' +
                    '<div style="font-size:1.8em;margin-bottom:0.5em">🔑 Требуется токен</div>' +
                    '<div style="opacity:0.7;font-size:1.2em;margin-bottom:1em">Для работы с AnimeLib необходим Access Token</div>' +
                    '<div style="opacity:0.6;font-size:1em">Перейдите в Настройки → Расширения → AnimeLib</div>' +
                    '</div>');
                scroll.append(html);
                Lampa.Controller.enable('content');
            };

            this.searchAnime = function(query) {
                if (!hasToken()) {
                    self.showNoToken();
                    return;
                }

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
                if (!hasToken()) {
                    self.showNoToken();
                    return;
                }

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

    // Добавление настроек
    function addSettings() {
        console.log('[AnimeLib] Добавление настроек...');
        
        try {
            // Проверяем, есть ли уже настройки
            if (Lampa.SettingsApi.getComponent('animelib_settings')) {
                console.log('[AnimeLib] Настройки уже добавлены');
                return;
            }

            var settings = {
                component: 'animelib_settings',
                name: 'AnimeLib',
                icon: '🎌',
                settings: [
                    {
                        type: 'input',
                        name: 'animelib_token_input',
                        title: 'Access Token',
                        placeholder: 'Введите токен доступа',
                        value: getToken(),
                        onSave: function(value) {
                            if (value && value.trim()) {
                                setToken(value.trim());
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('✅ Токен сохранен', 'AnimeLib');
                                }
                                console.log('[AnimeLib] Токен сохранен');
                            } else {
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('❌ Токен не может быть пустым', 'AnimeLib');
                                }
                            }
                        }
                    },
                    {
                        type: 'button',
                        name: 'animelib_test_btn',
                        title: '🔍 Проверить подключение',
                        onClick: async function() {
                            try {
                                var token = getToken();
                                if (!token) {
                                    if (Lampa.Notify) {
                                        Lampa.Notify.show('❌ Сначала введите токен', 'AnimeLib');
                                    }
                                    return;
                                }
                                
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('⏳ Проверка подключения...', 'AnimeLib');
                                }
                                
                                var results = await searchAnime('naruto');
                                if (results && results.length > 0) {
                                    if (Lampa.Notify) {
                                        Lampa.Notify.show('✅ Подключение работает! Найдено ' + results.length + ' результатов', 'AnimeLib');
                                    }
                                } else {
                                    if (Lampa.Notify) {
                                        Lampa.Notify.show('⚠️ Токен есть, но ничего не найдено', 'AnimeLib');
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
                        name: 'animelib_clear_btn',
                        title: '🗑️ Очистить токен',
                        onClick: function() {
                            Lampa.Storage.remove('animelib_token');
                            if (Lampa.Notify) {
                                Lampa.Notify.show('✅ Токен удален', 'AnimeLib');
                            }
                            // Обновляем значение в поле
                            var input = document.querySelector('[name="animelib_token_input"]');
                            if (input) {
                                input.value = '';
                            }
                        }
                    }
                ]
            };

            Lampa.SettingsApi.addComponent(settings);
            console.log('[AnimeLib] Настройки добавлены!');
            
        } catch (e) {
            console.error('[AnimeLib] Ошибка добавления настроек:', e);
        }
    }

    // Запуск плагина
    function startPlugin() {
        console.log('[AnimeLib] Запуск плагина...');

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
