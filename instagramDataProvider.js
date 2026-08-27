const https = require('https');
require('dotenv').config();

// In-memory cache with 30-minute TTL
const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

// High-fidelity Brazilian datasets for realistic generation & fallback
const BRAZILIAN_FIRST_NAMES = [
    "Ana", "Maria", "João", "Pedro", "Carlos", "Julia", "Fernanda", "Lucas", "Gabriel", "Mariana",
    "Rafael", "Beatriz", "Thiago", "Camila", "Bruno", "Isabela", "Larissa", "André", "Amanda", "Sophia",
    "Enzo", "Valentina", "Benjamin", "Helena", "Arthur", "Alice", "Theo", "Laura", "Davi", "Letícia",
    "Heitor", "Melissa", "Gustavo", "Yasmin", "Lorenzo", "Eduarda", "Vitor", "Carolina", "Matheus", "Júlia",
    "Felipe", "Luana", "Nicolas", "Vitória", "Daniel", "Giovanna", "Henrique", "Manuela", "Miguel", "Bárbara",
    "Dayane", "Lays", "Emilly", "Ondina", "Fishel", "Wellington", "Brenda", "Rebeca", "Lorena", "Igor"
];

const BRAZILIAN_LAST_NAMES = [
    "Silva", "Santos", "Oliveira", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo",
    "Fernandes", "Carvalho", "Gomes", "Martins", "Rocha", "Ribeiro", "Alves", "Monteiro", "Barbosa", "Souza",
    "Dias", "Castro", "Ramos", "Pinto", "Azevedo", "Freitas", "Vieira", "Cardoso", "Correia", "Teixeira",
    "Moreira", "Reis", "Mendes", "Soares", "Nunes", "Lopes", "Cunha", "Melo", "Pires", "Ferreira"
];

const BRAZILIAN_CITIES = [
    "Sabará, Minas Gerais", "São Joaquim de Bicas", "Vila Velha, Espírito Santo",
    "Belo Horizonte, Brazil", "Rio de Janeiro, Brazil", "São Paulo, Brazil",
    "Betim, Minas Gerais", "Contagem, Minas Gerais", "Governador Valadares, Minas Gerais",
    "Niterói, Rio de Janeiro", "Curitiba, Paraná", "Campinas, São Paulo",
    "Goiânia, Goiás", "Florianópolis, Santa Catarina", "Salvador, Bahia"
];

function createSeededRandom(seed) {
    let s = Math.abs(seed) || 123456789;
    return function() {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function normalizeName(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Handle fragments typical of fan pages, brands, news outlets and official
// accounts. The app is meant to look like someone's personal circle, so none of
// these belong in the stories row or the inbox.
const PUBLIC_FIGURE_TOKENS = [
    'oficial', 'ofc', 'fanpage', 'fanspage', 'fans', 'fandom', 'fclub', 'fcclub',
    'fc_', '_fc', 'news', 'noticias', 'portal', 'tvoficial', 'canal', 'record',
    'globo', 'gshow', 'sbt', 'band', 'espn', 'fifa', 'cbf', 'store', 'shop',
    'loja', 'oficialbr', 'brasiloficial', 'memes', 'humor', 'viral', 'clipes',
    'agencia', 'assessoria', 'contato', 'promo', 'sorteio', 'marketing',
    'poker', 'cassino', 'apostas', 'talentos', 'familia', 'equipe', 'staff'
];

function looksLikePublicFigure(candidate, target) {
    const uname = (candidate || '').toLowerCase();
    const owner = (target || '').toLowerCase();

    // Fan pages and backup accounts are built out of the target's own handle.
    // Match on the CORE of the name: "neymarjr" -> "neymar", so "neymar.familia"
    // and "fc_neymarjr2024" are both caught.
    const strip = (v) => v
        .replace(/[^a-z0-9]/g, '')
        .replace(/\d+$/, '')
        .replace(/(jr|junior|oficial|official|ofc|real|the)$/g, '')
        .replace(/^(jr|oficial|official|ofc|real|the|fc)/g, '');

    const ownerRoot = strip(owner);
    const unameRoot = strip(uname);
    if (ownerRoot.length >= 4 && (unameRoot.includes(ownerRoot) || ownerRoot.includes(unameRoot))) {
        return true;
    }

    return PUBLIC_FIGURE_TOKENS.some(token => uname.includes(token));
}

const TOTAL_FALLBACK_AVATARS = 30;

function cleanApiKey(key) {
    if (!key) return '';
    return String(key).replace(/[^a-zA-Z0-9_-]/g, '').trim();
}

function hashUsername(username, salt = 0) {
    let hash = 0;
    const str = (username || '') + salt;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) % TOTAL_FALLBACK_AVATARS) + 1;
}

class InstagramDataProvider {
    constructor() {
        this.hikerKey = cleanApiKey(process.env.HIKER_API_KEY)
            || cleanApiKey(process.env.INSTAGRAM_API_KEY)
            || 'ahaoef65hzom39skbrsmlk2i6s8sb6be';
    }

    /**
     * Get cached item if valid
     */
    _getCached(key) {
        const entry = cache.get(key);
        if (entry && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
            return entry.data;
        }
        cache.delete(key);
        return null;
    }

    /**
     * Store item in cache
     */
    _setCache(key, data) {
        cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * Fetch user profile
     */
    async getProfile(username) {
        const cleanUsername = username.replace(/^@+/, '').trim().toLowerCase();
        const cacheKey = `instagram:profile:${cleanUsername}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        const profile = {
            username: cleanUsername,
            full_name: cleanUsername,
            profile_pic_url: `/images/avatars/fallback/av-fallback-${hashUsername(cleanUsername)}.jpg`
        };

        this._setCache(cacheKey, profile);
        return profile;
    }

    /**
     * Fetch related profiles (followers / following) for the search bar
     */
    async getRelatedProfiles(username, limit = 10) {
        const cleanUsername = username.replace(/^@+/, '').trim().toLowerCase();
        const cacheKey = `instagram:related:${cleanUsername}`;
        const cached = this._getCached(cacheKey);
        if (cached) return cached;

        // Sources are ADDED together, best first, until `limit` profiles are found.
        // An earlier source is never thrown away by a later one.
        let profiles = [];

        // 1. HikerAPI: the only source with a real follow list for ANY profile.
        const key = this.hikerKey || process.env.HIKER_API_KEY || process.env.INSTAGRAM_API_KEY || 'ahaoef65hzom39skbrsmlk2i6s8sb6be';
        if (key) {
            try {
                profiles = await this._fetchFromHikerAPI(cleanUsername, limit);
            } catch (err) {
                console.warn(`[HikerAPI] lookup failed for ${cleanUsername}:`, err.message);
                profiles = [];
            }
        }

        // 2. Free fallback: Instagram's public endpoint. Only returns anything for
        // reasonably large accounts, and the IP gets throttled if called too often.
        if (profiles.length < limit) {
            try {
                const free = await this._fetchPublicRelatedProfiles(cleanUsername, limit);
                profiles = profiles.concat(free);
            } catch (err) {
                console.warn(`[InstagramDataProvider] public lookup failed for ${cleanUsername}:`, err.message);
            }
        }

        // 3. Top up with generated profiles so the row is always full
        if (profiles.length < limit) {
            profiles = profiles.concat(this._generateDeterministicProfiles(cleanUsername, limit));
        }

        // 4. Clean, validate, filter and deduplicate
        const uniqueProfiles = [];
        const seen = new Set();

        for (const p of profiles) {
            if (!p || !p.username) continue;
            const uname = p.username.replace(/^@+/, '').trim().toLowerCase();
            if (uname === cleanUsername || seen.has(uname)) continue;
            seen.add(uname);

            uniqueProfiles.push({
                username: uname,
                fullName: p.fullName || p.full_name || uname,
                profilePicture: p.profilePicture
                    || `/images/avatars/fallback/av-fallback-${hashUsername(uname, 7)}.jpg`,
                // Only a picture that really came from Instagram is shown sharp;
                // generated stand-ins stay blurred so nothing looks invented.
                isReal: !!p.profilePicture,
                isCloseFriends: !!p.isCloseFriends,
                location: p.location || 'Brasil'
            });

            if (uniqueProfiles.length >= limit) break;
        }

        this._setCache(cacheKey, uniqueProfiles);
        return uniqueProfiles;
    }

    /**
     * Deterministic profile generation for any Instagram handle
     */
    _generateDeterministicProfiles(username, limit = 10) {
        let seed = 0;
        for (let i = 0; i < username.length; i++) {
            seed = (seed << 5) - seed + username.charCodeAt(i) * (i + 13);
            seed |= 0;
        }

        const rng = createSeededRandom(seed);
        const results = [];
        const used = new Set();
        const separators = ['.', '_', ''];
        const avatarIndices = Array.from({ length: TOTAL_FALLBACK_AVATARS }, (_, i) => i + 1).sort(() => rng() - 0.5);

        const targetCount = Math.min(Math.max(limit, 5), 10);

        for (let i = 0; i < targetCount; i++) {
            const fIndex = Math.floor(rng() * BRAZILIAN_FIRST_NAMES.length);
            const lIndex = Math.floor(rng() * BRAZILIAN_LAST_NAMES.length);
            const firstName = BRAZILIAN_FIRST_NAMES[fIndex];
            const lastName = BRAZILIAN_LAST_NAMES[lIndex];

            const normFirst = normalizeName(firstName);
            const normLast = normalizeName(lastName);
            const sep = separators[Math.floor(rng() * separators.length)];
            const suffix = rng() > 0.6 ? Math.floor(rng() * 99) + 1 : '';

            let handle = `${normFirst}${sep}${normLast}${suffix}`;
            if (used.has(handle)) {
                handle = `${normFirst}${sep}${normLast}${Math.floor(rng() * 900) + 100}`;
            }
            used.add(handle);

            const avatarNum = avatarIndices[i % avatarIndices.length];
            const locIndex = Math.floor(rng() * BRAZILIAN_CITIES.length);

            results.push({
                username: handle,
                fullName: `${firstName} ${lastName}`,
                profilePicture: `/images/avatars/fallback/av-fallback-${avatarNum}.jpg`,
                isCloseFriends: i < 3 || rng() > 0.6,
                location: BRAZILIAN_CITIES[locIndex]
            });
        }

        return results;
    }

    /**
     * One authenticated HikerAPI GET with multi-host fallback.
     */
    async _hikerGet(path, params = {}) {
        const rawKey = this.hikerKey || process.env.HIKER_API_KEY || process.env.INSTAGRAM_API_KEY || 'ahaoef65hzom39skbrsmlk2i6s8sb6be';
        const key = cleanApiKey(rawKey) || 'ahaoef65hzom39skbrsmlk2i6s8sb6be';
        if (!key) return null;

        const allParams = { ...params, access_key: key };
        const qs = new URLSearchParams(allParams).toString();
        const hosts = ['api.hikerapi.com', 'api.instagrapi.com'];

        for (const hostname of hosts) {
            const res = await new Promise((resolve) => {
                const options = {
                    hostname,
                    path: `${path}?${qs}`,
                    method: 'GET',
                    headers: {
                        'x-access-key': key,
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (compatible; InstaSpy/2.0)'
                    }
                };

                const req = https.get(options, (response) => {
                    let data = '';
                    response.on('data', chunk => { data += chunk; });
                    response.on('end', () => {
                        if (response.statusCode !== 200) {
                            console.warn(`[HikerAPI (${hostname})] ${path} -> HTTP ${response.statusCode}: ${data.slice(0, 160)}`);
                            return resolve(null);
                        }
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });

                req.on('error', (err) => {
                    console.warn(`[HikerAPI (${hostname})] ${path} failed:`, err.message);
                    resolve(null);
                });
                req.setTimeout(8000, () => { req.destroy(); resolve(null); });
            });

            if (res) return res;
        }

        return null;
    }

    /**
     * Full profile (name, picture, counts) via HikerAPI.
     *
     * Instagram blocks datacenter IPs, so the free scrape and the public API
     * both fail once the app is deployed -- this is the only path that works
     * from a host like Vercel. Returns null when no key is set or the lookup
     * fails, so callers can fall back to the free methods.
     */
    async fetchProfileViaHiker(username) {
        if (!this.hikerKey) return null;

        const clean = username.replace(/^@+/, '').trim().toLowerCase();
        const cacheKey = `instagram:hikerprofile:${clean}`;
        const cached = this._getCached(cacheKey);
        // `false` is a remembered miss -- see below
        if (cached === false) return null;
        if (cached !== null) return cached;

        const data = await this._hikerGet('/v2/user/by/username', { username: clean });
        const u = data && (data.user || data);
        if (!u || !u.username) {
            // A handle that does not exist still costs a request, and every
            // caller would ask again. Remember the miss for the cache window.
            this._setCache(cacheKey, false);
            return null;
        }

        // HikerAPI mirrors Instagram's private API shape, but some endpoints
        // return the GraphQL `edge_*` shape instead -- accept either.
        const count = (flat, edge) => {
            if (typeof u[flat] === 'number') return u[flat];
            return (u[edge] && u[edge].count) || 0;
        };

        const profile = {
            username: u.username,
            // Kept so _fetchFromHikerAPI does not pay for the same lookup twice
            pk: u.pk || u.id || null,
            fullName: u.full_name || '',
            profilePic: (u.profile_pic_url_hd || u.profile_pic_url || '').replace(/&amp;/g, '&'),
            posts: count('media_count', 'edge_owner_to_timeline_media'),
            followers: count('follower_count', 'edge_followed_by'),
            following: count('following_count', 'edge_follow'),
            bio: u.biography || '',
            isPrivate: !!u.is_private
        };

        this._setCache(cacheKey, profile);
        return profile;
    }

    /**
     * Real accounts the person FOLLOWS, via HikerAPI.
     *
     * Instagram's own public endpoints never expose a follow list without a
     * logged-in session, so this is the only source that works for every profile
     * rather than only for large or well-connected ones. Billed per request, so
     * results ride the same 30-minute cache as everything else.
     */
    async _fetchFromHikerAPI(username, limit = 10) {
        if (!this.hikerKey) return [];

        // Goes through the cached profile lookup: billing is per request, and
        // the account id it returns is the only thing needed here.
        const profile = await this.fetchProfileViaHiker(username);
        const userId = profile && profile.pk;
        if (!userId) {
            console.warn(`[HikerAPI] no user id for ${username}`);
            return [];
        }

        const following = await this._hikerGet('/v2/user/following', {
            user_id: userId,
            page_id: '1'
        });

        const users = (following && following.response && following.response.users)
            || (following && following.users)
            || [];

        return users
            .filter(u => u && u.username && (u.profile_pic_url || u.profile_pic_url_hd))
            .filter(u => !u.is_verified)
            .filter(u => !looksLikePublicFigure(u.username, username))
            .slice(0, limit)
            .map(u => ({
                username: u.username,
                fullName: u.full_name || u.username,
                profilePicture: u.profile_pic_url_hd || u.profile_pic_url
            }));
    }

    /**
     * Accounts Instagram itself lists as related to `username`, from its public
     * web endpoint -- no key and no login. Returns nothing for small profiles,
     * and the IP gets throttled when called too often.
     */
    async _fetchPublicRelatedProfiles(username, limit = 10) {
        return new Promise((resolve) => {
            const options = {
                hostname: 'www.instagram.com',
                path: `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'X-IG-App-ID': '936619743392459',
                    'Accept': '*/*',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                    'Referer': `https://www.instagram.com/${encodeURIComponent(username)}/`
                }
            };

            const req = https.get(options, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const user = JSON.parse(data)?.data?.user;
                        if (!user) return resolve([]);

                        // --- Source A: profiles Instagram hands over with a picture ---
                        const edges = [
                            ...((user.edge_mutual_followed_by && user.edge_mutual_followed_by.edges) || []),
                            ...((user.edge_related_profiles && user.edge_related_profiles.edges) || [])
                        ];

                        const list = edges
                            .map(e => e && e.node)
                            .filter(n => n && n.username && n.profile_pic_url)
                            // Celebrities / brands break the illusion of a personal
                            // circle: Instagram flags the big ones with is_verified,
                            // and the rest are fan pages built off the target's handle.
                            .filter(n => !n.is_verified)
                            .filter(n => !looksLikePublicFigure(n.username, username))
                            .map(n => ({
                                username: n.username,
                                fullName: n.full_name || n.username,
                                profilePicture: n.profile_pic_url
                            }));

                        resolve(list.slice(0, limit));
                    } catch (e) {
                        resolve([]);
                    }
                });
            });

            req.on('error', () => resolve([]));
            req.setTimeout(8000, () => {
                req.destroy();
                resolve([]);
            });
        });
    }

}

module.exports = new InstagramDataProvider();
