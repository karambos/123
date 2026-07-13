(function() {
    'use strict';

    // Защита от двойной загрузки
    if (window.animelib_plugin_loaded) {
        return;
    }
    window.animelib_plugin_loaded = true;

    // Конфигурация
    const CONFIG = {
        host: 'https://anilib.me',
        apiHost: 'https://api.cdnlibs.org',
        clientId: '1',
        siteId: '5',
        cacheTime: 3600000, // 1 час в миллисекундах
        searchCacheTime: 14400000 // 4 часа
    };

    // Хранилище токенов
    let tokenData = null;
    let tokenCache = {
        token: null,
        refreshToken: null,
        expiryTime: 0
    };

    // Основная функция инициализации
    function startPlugin() {
        console.log('[AnimeLib] Плагин инициализирован');

        // Добавляем источник в Lampa
        addAnimeLibSource();
        
        // Добавляем настройки
        addPluginSettings();
        
        // Загружаем токен при старте
        loadTokenFromStorage();
    }

    // Загрузка токена из хранилища
    function loadTokenFromStorage() {
        try {
            const saved = Lampa.Storage.get('animelib_token_data');
            if (saved) {
                const data = JSON.parse(saved);
                if (data.token && data.expiryTime > Date.now()) {
                    tokenCache = data;
                    console.log('[AnimeLib] Токен загружен из хранилища');
                }
            }
        } catch (e) {
            console.warn('[AnimeLib] Ошибка загрузки токена:', e);
        }
    }

    // Сохранение токена в хранилище
    function saveTokenToStorage() {
        try {
            Lampa.Storage.set('animelib_token_data', JSON.stringify(tokenCache));
        } catch (e) {
            console.warn('[AnimeLib] Ошибка сохранения токена:', e);
        }
    }

    // Получение токена
    async function ensureToken() {
        // Если токен есть и не истек
        if (tokenCache.token && tokenCache.expiryTime > Date.now()) {
            return tokenCache.token;
        }

        // Если есть refresh токен - обновляем
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

        // Если нет токена - пробуем получить новый
        // В реальности нужен логин, но для примера используем демо-токен
        console.warn('[AnimeLib] Токен не найден, используйте настройки для входа');
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

    // Добавление источника в Lampa
    function addAnimeLibSource() {
        Lampa.Source.add('animelib', {
            name: 'AnimeLib',
            icon: '🎌',
            type: 'anime',
            search: async function(query, callback) {
                try {
                    const results = await searchAnime(query);
                    callback(results);
                } catch (e) {
                    console.error('[AnimeLib] Ошибка поиска:', e);
                    callback([]);
                }
            },
            getPlaylist: async function(item, callback) {
                try {
                    const playlist = await getAnimePlaylist(item);
                    callback(playlist);
                } catch (e) {
                    console.error('[AnimeLib] Ошибка получения плейлиста:', e);
                    callback(null);
                }
            }
        });
    }

    // Поиск аниме
    async function searchAnime(query) {
        const token = await ensureToken();
        if (!token) {
            return [{
                title: '❌ Ошибка: Токен не найден',
                description: 'Пожалуйста, настройте плагин в разделе "Настройки" -> "AnimeLib"',
                id: 'error'
            }];
        }

        const cacheKey = `animelib_search_${query}`;
        const cached = Lampa.Storage.get(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.timestamp && (Date.now() - data.timestamp) < CONFIG.searchCacheTime) {
                    return data.results;
                }
            } catch (e) {}
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

            // Сохраняем в кэш
            Lampa.Storage.set(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                results: results
            }));

            return results;

        } catch (e) {
            console.error('[AnimeLib] Ошибка поиска:', e);
            return [{
                title: '❌ Ошибка поиска',
                description: 'Проверьте подключение к интернету',
                id: 'error'
            }];
        }
    }

    // Получение плейлиста (серий)
    async function getAnimePlaylist(item) {
        const token = await ensureToken();
        if (!token) {
            return null;
        }

        const cacheKey = `animelib_playlist_${item.id}`;
        const cached = Lampa.Storage.get(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.timestamp && (Date.now() - data.timestamp) < CONFIG.cacheTime) {
                    return data.playlist;
                }
            } catch (e) {}
        }

        try {
            // Получаем список эпизодов
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

            // Получаем информацию о первом эпизоде для получения озвучек
            const firstEpisode = data.data[0];
            const detailsUrl = `${CONFIG.apiHost}/api/episodes/${firstEpisode.id}`;
            const detailsResponse = await fetch(detailsUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!detailsResponse.ok) {
                throw new Error(`HTTP error! status: ${detailsResponse.status}`);
            }

            const detailsData = await detailsResponse.json();
            const players = detailsData.data?.players || [];

            // Ищем плеер Animelib
            const animelibPlayer = players.find(p => p.player === 'Animelib');
            if (!animelibPlayer) {
                console.warn('[AnimeLib] Плеер Animelib не найден');
                return null;
            }

            // Собираем информацию о сериях
            const episodes = data.data;
            const playlist = [];

            for (let i = 0; i < episodes.length; i++) {
                const ep = episodes[i];
                
                // Получаем видео для каждой серии (в реальности нужно делать запрос к каждому эпизоду)
                // Для упрощения используем данные первого эпизода
                let videoUrl = null;
                let qualities = [];

                if (i === 0) {
                    // Для первого эпизода используем уже полученные данные
                    const video = animelibPlayer.video?.quality?.[0];
                    if (video) {
                        videoUrl = video.href;
                        qualities = animelibPlayer.video.quality.map(q => ({
                            url: q.href,
                            quality: `${q.quality}p`
                        }));
                    }
                } else {
                    // Для остальных - делаем запрос к каждому эпизоду
                    try {
                        const epDetailsUrl = `${CONFIG.apiHost}/api/episodes/${ep.id}`;
                        const epResponse = await fetch(epDetailsUrl, {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        const epData = await epResponse.json();
                        const epPlayer = epData.data?.players?.find(p => p.player === 'Animelib');
                        if (epPlayer && epPlayer.video?.quality?.length > 0) {
                            const video = epPlayer.video.quality[0];
                            videoUrl = video.href;
                            qualities = epPlayer.video.quality.map(q => ({
                                url: q.href,
                                quality: `${q.quality}p`
                            }));
                        }
                    } catch (e) {
                        console.warn(`[AnimeLib] Ошибка получения эпизода ${ep.id}:`, e);
                        continue;
                    }
                }

                if (!videoUrl) {
                    continue;
                }

                // Формируем ссылку (через прокси Lampa)
                const proxyUrl = `/proxy?url=${encodeURIComponent(videoUrl)}&headers=origin:${CONFIG.host}`;

                playlist.push({
                    id: ep.id,
                    title: `${ep.number} серия`,
                    description: ep.name || `${item.title} - ${ep.number} серия`,
                    url: proxyUrl,
                    season: ep.season || 1,
                    episode: ep.number || i + 1,
                    qualities: qualities.map(q => ({
                        url: `/proxy?url=${encodeURIComponent(q.url)}&headers=origin:${CONFIG.host}`,
                        quality: q.quality
                    })),
                    headers: {
                        'Origin': CONFIG.host,
                        'Referer': `${CONFIG.host}/`
                    }
                });
            }

            // Сохраняем в кэш
            Lampa.Storage.set(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                playlist: playlist
            }));

            return playlist;

        } catch (e) {
            console.error('[AnimeLib] Ошибка получения плейлиста:', e);
            return null;
        }
    }

    // Добавление настроек плагина
    function addPluginSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'animelib_settings',
            name: 'AnimeLib',
            icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor"/></svg>',
            settings: [
                {
                    type: 'input',
                    name: 'animelib_token',
                    title: 'Access Token',
                    placeholder: 'Введите токен доступа',
                    value: tokenCache.token || '',
                    onSave: function(value) {
                        tokenCache.token = value;
                        if (value) {
                            tokenCache.expiryTime = Date.now() + 2592000000; // 30 дней
                        }
                        saveTokenToStorage();
                        console.log('[AnimeLib] Токен сохранен');
                    }
                },
                {
                    type: 'input',
                    name: 'animelib_refresh_token',
                    title: 'Refresh Token',
                    placeholder: 'Введите refresh токен',
                    value: tokenCache.refreshToken || '',
                    onSave: function(value) {
                        tokenCache.refreshToken = value;
                        saveTokenToStorage();
                        console.log('[AnimeLib] Refresh токен сохранен');
                    }
                },
                {
                    type: 'button',
                    name: 'animelib_test',
                    title: 'Проверить подключение',
                    onClick: async function() {
                        try {
                            const token = await ensureToken();
                            if (token) {
                                Lampa.Notify.show('✅ Подключение успешно', 'AnimeLib');
                            } else {
                                Lampa.Notify.show('❌ Ошибка подключения', 'AnimeLib');
                            }
                        } catch (e) {
                            Lampa.Notify.show('❌ Ошибка: ' + e.message, 'AnimeLib');
                        }
                    }
                },
                {
                    type: 'button',
                    name: 'animelib_clear_cache',
                    title: 'Очистить кэш',
                    onClick: function() {
                        try {
                            // Очищаем все ключи кэша
                            const keys = Lampa.Storage.keys();
                            keys.forEach(key => {
                                if (key.startsWith('animelib_')) {
                                    Lampa.Storage.remove(key);
                                }
                            });
                            Lampa.Notify.show('✅ Кэш очищен', 'AnimeLib');
                        } catch (e) {
                            Lampa.Notify.show('❌ Ошибка очистки кэша', 'AnimeLib');
                        }
                    }
                }
            ]
        });
    }

    // Добавление дополнительной функции для очистки кэша
    function clearCache() {
        try {
            const keys = Lampa.Storage.keys();
            keys.forEach(key => {
                if (key.startsWith('animelib_')) {
                    Lampa.Storage.remove(key);
                }
            });
        } catch (e) {
            console.warn('[AnimeLib] Ошибка очистки кэша:', e);
        }
    }

    // Ожидание готовности приложения
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function(event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }

    console.log('[AnimeLib] Плагин загружен');
})();
