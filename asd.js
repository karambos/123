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

    // Показать диалог ввода токена
    function showTokenDialog(callback) {
        var currentToken = getToken();
        
        var dialog = $('<div class="modal animelib-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.85);z-index:99999">' +
            '<div style="background:#1a1a2e;padding:2em;border-radius:0.5em;max-width:500px;width:90%;border:1px solid #333">' +
            '<div style="font-size:1.5em;margin-bottom:0.3em;text-align:center">🎌 AnimeLib</div>' +
            '<div style="opacity:0.6;margin-bottom:1.5em;text-align:center;font-size:0.9em">Введите Access Token для доступа к Anilib.me</div>' +
            '<input type="text" id="animelib_token_input" style="width:100%;padding:0.8em;border-radius:0.3em;border:1px solid #444;background:#2a2a4e;color:#fff;font-size:1em;box-sizing:border-box" placeholder="Введите токен..." value="' + currentToken + '">' +
            '<div style="display:flex;gap:0.5em;margin-top:1em">' +
            '<button class="animelib-save-btn selector" style="flex:1;padding:0.8em;border:none;border-radius:0.3em;background:#e74c3c;color:#fff;font-size:1em;cursor:pointer">💾 Сохранить</button>' +
            '<button class="animelib-cancel-btn selector" style="flex:1;padding:0.8em;border:none;border-radius:0.3em;background:#444;color:#fff;font-size:1em;cursor:pointer">❌ Отмена</button>' +
            '</div>' +
            '<div id="animelib_token_status" style="margin-top:0.5em;text-align:center;font-size:0.9em;opacity:0.7"></div>' +
            '</div>' +
            '</div>');

        $('body').append(dialog);

        setTimeout(function() {
            dialog.find('#animelib_token_input').focus();
        }, 100);

        dialog.find('.animelib-save-btn').on('hover:enter', function() {
            var token = dialog.find('#animelib_token_input').val().trim();
            if (token && token.length > 0) {
                setToken(token);
                dialog.find('#animelib_token_status').text('✅ Токен сохранен!').css('color', '#2ecc71');
                setTimeout(function() {
                    dialog.remove();
                    if (callback) callback(true);
                }, 500);
            } else {
                dialog.find('#animelib_token_status').text('❌ Введите токен').css('color', '#e74c3c');
            }
        });

        dialog.find('.animelib-cancel-btn').on('hover:enter', function() {
            dialog.remove();
            if (callback) callback(false);
        });

        dialog.on('click', function(e) {
            if (e.target === this) {
                dialog.remove();
                if (callback) callback(false);
            }
        });

        dialog.find('#animelib_token_input').on('keydown', function(e) {
            if (e.key === 'Enter') {
                dialog.find('.animelib-save-btn').trigger('hover:enter');
            }
        });
    }

    // Добавление настроек
    function addSettings() {
        console.log('[AnimeLib] Добавление настроек...');
        
        try {
            if (Lampa.SettingsApi.getComponent && Lampa.SettingsApi.getComponent('animelib_settings')) {
                return;
            }

            Lampa.SettingsApi.addComponent({
                component: 'animelib_settings',
                name: '🎌 AnimeLib',
                icon: '🎌',
                settings: [
                    {
                        type: 'input',
                        name: 'animelib_token',
                        title: 'Access Token',
                        placeholder: 'Введите токен доступа',
                        value: getToken(),
                        onSave: function(value) {
                            if (value && value.trim()) {
                                setToken(value.trim());
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('✅ Токен сохранен', 'AnimeLib');
                                }
                            } else {
                                if (Lampa.Notify) {
                                    Lampa.Notify.show('❌ Токен не может быть пустым', 'AnimeLib');
                                }
                            }
                        }
                    },
                    {
                        type: 'button',
                        name: 'animelib_test',
                        title: '🔍 Проверить подключение',
                        onClick: async function() {
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
                            
                            try {
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
                        name: 'animelib_clear',
                        title: '🗑️ Очистить токен',
                        onClick: function() {
                            Lampa.Storage.remove('animelib_token');
                            if (Lampa.Notify) {
                                Lampa.Notify.show('✅ Токен удален', 'AnimeLib');
                            }
                        }
                    }
                ]
            });

            console.log('[AnimeLib] Настройки добавлены!');
            
        } catch (e) {
            console.error('[AnimeLib] Ошибка добавления настроек:', e);
        }
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
                        url: anime.slug_url,
                        poster: anime.cover ? anime.cover.default : null
                    });
                });
            }

            return results;

        } catch (e) {
            console.error('[AnimeLib] Ошибка поиска:', e);
            return [];
        }
    }

    // Получение плейлиста с качеством
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
                        
                        qualities.sort(function(a, b) {
                            var qa = parseInt(a.quality) || 0;
                            var qb = parseInt(b.quality) || 0;
                            return qb - qa;
                        });
                        
                        var qualityMap = {};
                        qualities.forEach(function(q) {
                            var qualityName = q.quality + 'p';
                            qualityMap[qualityName] = q.href;
                        });
                        
                        var bestQuality = qualities[0];
                        
                        playlist.push({
                            id: ep.id,
                            title: ep.number + ' серия',
                            description: ep.name || item.title + ' - ' + ep.number + ' серия',
                            url: bestQuality.href,
                            season: ep.season || 1,
                            episode: ep.number || i + 1,
                            qualities: qualityMap,
                            allQualities: qualities
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

    // Воспроизведение видео
    function playVideo(episode) {
        try {
            if (!episode.url) {
                if (Lampa.Notify) {
                    Lampa.Notify.show('❌ Ссылка на видео не найдена', 'AnimeLib');
                }
                return;
            }

            console.log('[AnimeLib] Воспроизведение:', episode.title, episode.url);

            var playerData = {
                url: episode.url,
                title: episode.title,
                description: episode.description || ''
            };

            if (episode.qualities && Object.keys(episode.qualities).length > 0) {
                playerData.quality = episode.qualities;
            }

            Lampa.Player.play(playerData);
            
        } catch (e) {
            console.error('[AnimeLib] Ошибка воспроизведения:', e);
            if (Lampa.Notify) {
                Lampa.Notify.show('❌ Ошибка воспроизведения: ' + e.message, 'AnimeLib');
            }
        }
    }

    // Компонент для Lampa - исправлен
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
                    // Просто закрываем, без рекурсии
                    Lampa.Activity.backward();
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
                    '<div class="selector" style="display:inline-block;padding:0.8em 2em;background:#e74c3c;border-radius:0.3em;cursor:pointer">📝 Ввести токен</div>' +
                    '<div style="opacity:0.5;font-size:0.9em;margin-top:1em">Или перейдите в Настройки → Расширения → AnimeLib</div>' +
                    '</div>');
                
                html.find('.selector').on('hover:enter', function() {
                    showTokenDialog(function(success) {
                        if (success) {
                            self.searchAnime(object.search || object.movie.title || object.movie.name);
                        }
                    });
                });
                
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
                        '<div style="font-size:0.8em;opacity:0.5;margin-top:0.3em">' + 
                            (ep.allQualities ? ep.allQualities.map(function(q) { return q.quality + 'p'; }).join(' | ') : '') + 
                        '</div>' +
                        '</div>');
                    
                    html.on('hover:enter', function() {
                        if (ep.allQualities && ep.allQualities.length > 1) {
                            var qualityItems = ep.allQualities.map(function(q, index) {
                                return {
                                    title: q.quality + 'p',
                                    url: q.href,
                                    index: index
                                };
                            });
                            
                            Lampa.Select.show({
                                title: 'Выберите качество',
                                items: qualityItems.map(function(q) {
                                    return {
                                        title: q.title,
                                        data: q
                                    };
                                }),
                                onSelect: function(item) {
                                    var selected = item.data;
                                    var playData = {
                                        url: selected.url,
                                        title: ep.title + ' (' + selected.title + ')',
                                        description: ep.description
                                    };
                                    playVideo(playData);
                                    Lampa.Select.close();
                                },
                                onBack: function() {
                                    Lampa.Select.close();
                                }
                            });
                        } else {
                            playVideo(ep);
                        }
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
                    right: function() {
                        if (Navigator.canmove('right')) {
                            Navigator.move('right');
                        }
                    },
                    left: function() {
                        if (Navigator.canmove('left')) {
                            Navigator.move('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    back: function() {
                        // Просто закрываем без рекурсии
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
    function addCardButton() {
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
    }

    // Запуск плагина
    function startPlugin() {
        console.log('[AnimeLib] Запуск плагина...');

        var component = new AnimeLibComponent();
        Lampa.Component.add('animelib_component', component);

        setTimeout(addSettings, 1000);
        setTimeout(addCardButton, 1500);

        if (!hasToken()) {
            console.log('[AnimeLib] Токен не найден. Перейдите в Настройки → Расширения → AnimeLib');
        } else {
            console.log('[AnimeLib] Токен загружен');
        }

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
