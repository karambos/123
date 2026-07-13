(function() {
    'use strict';

    // Защита от двойной загрузки
    if (window.animelib_plugin_loaded) {
        return;
    }
    window.animelib_plugin_loaded = true;

    console.log('[AnimeLib] Загрузка плагина...');

    // Конфигурация
    const CONFIG = {
        host: 'https://anilib.me',
        apiHost: 'https://api.cdnlibs.org',
        clientId: '1',
        siteId: '5',
        cacheTime: 3600000,
        searchCacheTime: 14400000
    };

    // Хранилище токенов
    let tokenCache = {
        token: null,
        refreshToken: null,
        expiryTime: 0
    };

    // Флаг инициализации
    let initialized = false;

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

    // Поиск аниме
    async function searchAnime(query) {
        const token = await ensureToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена');
            return [{
                id: 'error',
                title: '❌ Токен не найден',
                description: 'Перейдите в Настройки → Расширения → AnimeLib и введите токен'
            }];
        }

        const cacheKey = `animelib_search_${query}`;
        const cached = localStorage.getItem(cacheKey);
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

            if (response.status === 401) {
                // Токен истек - пробуем обновить
                tokenCache.token = null;
                tokenCache.expiryTime = 0;
                saveTokenToStorage();
                const newToken = await ensureToken();
                if (newToken) {
                    return searchAnime(query); // Повторяем запрос с новым токеном
                }
                return [{
                    id: 'error',
                    title: '❌ Ошибка авторизации',
                    description: 'Токен истек. Обновите его в настройках'
                }];
            }

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

            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                results: results
            }));

            return results;

        } catch (e) {
            console.error('[AnimeLib] Ошибка поиска:', e);
            return [{
                id: 'error',
                title: '❌ Ошибка поиска',
                description: e.message || 'Проверьте подключение к интернету'
            }];
        }
    }

    // Получение плейлиста
    async function getAnimePlaylist(item) {
        const token = await ensureToken();
        if (!token) {
            console.warn('[AnimeLib] Нет токена для плейлиста');
            return null;
        }

        const cacheKey = `animelib_playlist_${item.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                if (data.timestamp && (Date.now() - data.timestamp) < CONFIG.cacheTime) {
                    return data.playlist;
                }
            } catch (e) {}
        }

        try {
            const url = `${CONFIG.apiHost}/api/episodes?anime_id=${item.id}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                tokenCache.token = null;
                tokenCache.expiryTime = 0;
                saveTokenToStorage();
                const newToken = await ensureToken();
                if (newToken) {
                    return getAnimePlaylist(item);
                }
                return null;
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.data || data.data.length === 0) {
                return null;
            }

            const episodes = data.data;
            const playlist = [];

            // Получаем детали для каждого эпизода
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
                        const qualities = animelibPlayer.video.quality.map(q => ({
                            url: q.href,
                            quality: `${q.quality}p`
                        }));
                        
                        const bestQuality = qualities[qualities.length - 1];
                        
                        playlist.push({
                            id: ep.id,
                            title: `${ep.number} серия`,
                            description: ep.name || `${item.title} - ${ep.number} серия`,
                            url: bestQuality.url,
                            season: ep.season || 1,
                            episode: ep.number || i + 1,
                            qualities: qualities.map(q => ({
                                url: q.url,
                                quality: q.quality
                            }))
                        });
                    }
                } catch (e) {
                    console.warn(`[AnimeLib] Ошибка получения эпизода ${ep.id}:`, e);
                    continue;
                }
            }

            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                playlist: playlist
            }));

            return playlist;

        } catch (e) {
            console.error('[AnimeLib] Ошибка получения плейлиста:', e);
            return null;
        }
    }

    // Ожидание готовности Lampa.Source
    function waitForSource(callback, attempts = 0) {
        if (attempts > 50) {
            console.error('[AnimeLib] Не удалось дождаться Lampa.Source');
            return;
        }

        try {
            if (typeof Lampa !== 'undefined' && Lampa.Source && typeof Lampa.Source.add === 'function') {
                callback();
            } else {
                setTimeout(() => waitForSource(callback, attempts + 1), 100);
            }
        } catch (e) {
            setTimeout(() => waitForSource(callback, attempts + 1), 100);
        }
    }

    // Добавление источника
    function addSource() {
        try {
            // Проверяем, есть ли уже такой источник
            if (Lampa.Source.list && Lampa.Source.list().includes('animelib')) {
                console.log('[AnimeLib] Источник уже добавлен');
                return;
            }

            Lampa.Source.add('animelib', {
                name: 'AnimeLib',
                icon: '🎌',
                type: 'anime',
                search: function(query, callback) {
                    searchAnime(query).then(results => {
                        callback(results);
                    }).catch(e => {
                        console.error('[AnimeLib] Ошибка поиска:', e);
                        callback([]);
                    });
                },
                getPlaylist: function(item, callback) {
                    getAnimePlaylist(item).then(playlist => {
                        callback(playlist);
                    }).catch(e => {
                        console.error('[AnimeLib] Ошибка плейлиста:', e);
                        callback(null);
                    });
                }
            });

            console.log('[AnimeLib] Источник добавлен');
            initialized = true;

            // Добавляем настройки
            addSettings();

        } catch (e) {
            console.error('[AnimeLib] Ошибка добавления источника:', e);
        }
    }

    // Добавление настроек
    function addSettings() {
        try {
            // Проверяем, есть ли уже настройки
            if (Lampa.SettingsApi && Lampa.SettingsApi.getComponent && Lampa.SettingsApi.getComponent('animelib_settings')) {
                return;
            }

            if (!Lampa.SettingsApi || typeof Lampa.SettingsApi.addComponent !== 'function') {
                console.warn('[AnimeLib] SettingsApi не готов');
                setTimeout(addSettings, 500);
                return;
            }

            Lampa.SettingsApi.addComponent({
                component: 'animelib_settings',
                name: 'AnimeLib',
                icon: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor"/></svg>',
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
                                Lampa.Notify.show('✅ Токен сохранен', 'AnimeLib');
                            }
                            ensureToken();
                        }
                    },
                    {
                        type: 'input',
                        name: 'animelib_refresh_token',
                        title: 'Refresh Token',
                        placeholder: 'Введите refresh токен (опционально)',
                        value: tokenCache.refreshToken || '',
                        onSave: function(value) {
                            tokenCache.refreshToken = value;
                            saveTokenToStorage();
                            Lampa.Notify.show('✅ Refresh токен сохранен', 'AnimeLib');
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
                                    if (results && results.length > 0 && results[0].id !== 'error') {
                                        Lampa.Notify.show('✅ Подключение работает! Найдено ' + results.length + ' результатов', 'AnimeLib');
                                    } else if (results && results[0] && results[0].id === 'error') {
                                        Lampa.Notify.show('❌ ' + results[0].description, 'AnimeLib');
                                    } else {
                                        Lampa.Notify.show('⚠️ Токен есть, но ничего не найдено', 'AnimeLib');
                                    }
                                } else {
                                    Lampa.Notify.show('❌ Токен не найден. Введите токен в настройках', 'AnimeLib');
                                }
                            } catch (e) {
                                Lampa.Notify.show('❌ Ошибка: ' + e.message, 'AnimeLib');
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
                                Lampa.Notify.show('✅ Очищено ' + count + ' записей кэша', 'AnimeLib');
                            } catch (e) {
                                Lampa.Notify.show('❌ Ошибка: ' + e.message, 'AnimeLib');
                            }
                        }
                    }
                ]
            });

            console.log('[AnimeLib] Настройки добавлены');

        } catch (e) {
            console.error('[AnimeLib] Ошибка добавления настроек:', e);
        }
    }

    // Основная инициализация
    function initPlugin() {
        console.log('[AnimeLib] Инициализация...');

        // Загружаем токен
        loadTokenFromStorage();

        // Ждем готовности Lampa.Source
        waitForSource(function() {
            addSource();
        });
    }

    // Запуск плагина
    if (typeof Lampa !== 'undefined' && Lampa.Listener) {
        if (window.appready) {
            initPlugin();
        } else {
            Lampa.Listener.follow('app', function(event) {
                if (event.type === 'ready') {
                    initPlugin();
                }
            });
        }
    } else {
        // Если Lampa еще не загружена - ждем
        document.addEventListener('DOMContentLoaded', function() {
            const checkLampa = setInterval(function() {
                if (typeof Lampa !== 'undefined' && Lampa.Listener) {
                    clearInterval(checkLampa);
                    if (window.appready) {
                        initPlugin();
                    } else {
                        Lampa.Listener.follow('app', function(event) {
                            if (event.type === 'ready') {
                                initPlugin();
                            }
                        });
                    }
                }
            }, 100);
        });
    }

    console.log('[AnimeLib] Плагин загружен');
})();
