const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const instagramDataProvider = require('./instagramDataProvider');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname)));

// Proxy endpoint to fetch Instagram profile data
app.get('/api/profile/:username', async (req, res) => {
    const username = req.params.username.replace('@', '').trim();

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const profileData = await fetchInstagramProfile(username);
        res.json(profileData);
    } catch (error) {
        console.error('Error fetching profile for ' + username + ':', error.message);
        res.status(404).json({
            error: 'Could not fetch profile',
            fallback: true,
            username: username
        });
    }
});

// Temporary: reports exactly what Instagram answers from wherever this runs,
// so a production failure can be told apart from a local one.
app.get('/api/_diag/:username', async (req, res) => {
    const username = req.params.username.replace('@', '').trim();
    const started = Date.now();

    const probe = (label, hostname, reqPath, headers) => new Promise((resolve) => {
        const t0 = Date.now();
        const r = https.get({ hostname, path: reqPath, headers }, (resp) => {
            let body = '';
            resp.on('data', c => { body += c; });
            resp.on('end', () => resolve({
                metodo: label,
                status: resp.statusCode,
                ms: Date.now() - t0,
                redirect: resp.headers.location || null,
                amostra: body.slice(0, 180)
            }));
        });
        r.on('error', (e) => resolve({ metodo: label, erro: e.message, ms: Date.now() - t0 }));
        r.setTimeout(9000, () => { r.destroy(); resolve({ metodo: label, erro: 'timeout 9s', ms: Date.now() - t0 }); });
    });

    const resultados = await Promise.all([
        probe('html-scrape', 'www.instagram.com', `/${encodeURIComponent(username)}/`, {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept-Language': 'en-US,en;q=0.9'
        }),
        probe('api-web-profile', 'i.instagram.com', `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
            'User-Agent': 'Instagram 275.0.0.27.98 Android',
            'X-IG-App-ID': '936619743392459'
        })
    ]);

    res.json({
        onde: process.env.VERCEL ? 'vercel' : 'local',
        regiao: process.env.VERCEL_REGION || 'n/a',
        node: process.version,
        totalMs: Date.now() - started,
        resultados
    });
});

async function fetchInstagramProfile(username) {
    // HikerAPI first when a key is configured: Instagram blocks datacenter IPs,
    // so the two free methods below only work from a home connection.
    try {
        const viaHiker = await instagramDataProvider.fetchProfileViaHiker(username);
        if (viaHiker) return viaHiker;
    } catch (err) {
        console.warn(`[HikerAPI] profile lookup failed for ${username}:`, err.message);
    }

    return fetchInstagramProfileFree(username);
}

function fetchInstagramProfileFree(username) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'www.instagram.com',
            path: `/${encodeURIComponent(username)}/`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            }
        };

        const request = https.get(options, (response) => {
            // Handle redirects if any
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                const redirectUrl = response.headers.location;
                if (!redirectUrl.includes('/accounts/login')) {
                    // Follow redirect
                    return fetchFromUrl(redirectUrl, username).then(resolve).catch(reject);
                }
            }

            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const result = parseInstagramHTML(data, username);
                    if (result && (result.profilePic || result.followers > 0 || result.posts > 0)) {
                        resolve(result);
                    } else {
                        // Try fallback method
                        fetchViaAlternateMethod(username).then(resolve).catch(() => {
                            if (result) resolve(result);
                            else reject(new Error('Profile not found'));
                        });
                    }
                } catch (e) {
                    fetchViaAlternateMethod(username).then(resolve).catch(reject);
                }
            });
        });

        request.on('error', (e) => {
            fetchViaAlternateMethod(username).then(resolve).catch(reject);
        });

        request.setTimeout(10000, () => {
            request.destroy();
            fetchViaAlternateMethod(username).then(resolve).catch(reject);
        });
    });
}

function fetchFromUrl(urlStr, username) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(urlStr);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        protocol.get(urlStr, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                const parsed = parseInstagramHTML(data, username);
                if (parsed) resolve(parsed);
                else reject(new Error('Failed to parse from redirected URL'));
            });
        }).on('error', reject);
    });
}

function parseInstagramHTML(html, username) {
    const result = {
        username: username,
        fullName: '',
        profilePic: '',
        posts: 0,
        followers: 0,
        following: 0,
        bio: '',
        isPrivate: false,
    };

    // 1. og:image for profile picture
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
    if (ogImageMatch) {
        result.profilePic = ogImageMatch[1].replace(/&amp;/g, '&');
    }

    // 2. og:title or title for full name
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+content="([^"]+)"\s+property="og:title"/i)
        || html.match(/<title>([^<]+)<\/title>/i);
    if (ogTitleMatch) {
        const titleContent = ogTitleMatch[1];
        // Pattern: "Name (@username) • Instagram photos and videos" or "Name (&#064;username)..."
        const nameMatch = titleContent.match(/^([^(]+)\s*\(/);
        if (nameMatch) {
            result.fullName = decodeHTMLEntities(nameMatch[1]).trim();
        }
    }

    // 3. og:description for followers, following, posts
    // Pattern: "1,058 Followers, 1,613 Following, 9 Posts - See Instagram photos..."
    // or Portuguese: "1.058 seguidores, 1.613 seguindo, 9 publicações..."
    const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)
        || html.match(/<meta\s+content="([^"]+)"\s+property="og:description"/i)
        || html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
    if (ogDescMatch) {
        const desc = ogDescMatch[1].replace(/&amp;/g, '&');

        const followersMatch = desc.match(/([\d.,KkMm]+)\s*(?:Followers|seguidores|Seguidores)/i);
        const followingMatch = desc.match(/([\d.,KkMm]+)\s*(?:Following|seguindo|Seguindo)/i);
        const postsMatch = desc.match(/([\d.,KkMm]+)\s*(?:Posts|publicações|Publicações|fotos)/i);

        if (followersMatch) result.followers = parseCount(followersMatch[1]);
        if (followingMatch) result.following = parseCount(followingMatch[1]);
        if (postsMatch) result.posts = parseCount(postsMatch[1]);

        const bioMatch = desc.match(/Posts?\s*[-–—]\s*(.+)/i)
            || desc.match(/publicações?\s*[-–—]\s*(.+)/i);
        if (bioMatch) {
            result.bio = decodeHTMLEntities(bioMatch[1]).trim();
        }
    }

    // 4. Try JSON structures if values are still missing
    if (!result.followers || !result.following || !result.posts) {
        const fcMatch = html.match(/"edge_followed_by":\s*\{\s*"count":\s*(\d+)/);
        const fgMatch = html.match(/"edge_follow":\s*\{\s*"count":\s*(\d+)/);
        const pcMatch = html.match(/"edge_owner_to_timeline_media":\s*\{\s*"count":\s*(\d+)/);
        const picMatch = html.match(/"profile_pic_url_hd":\s*"([^"]+)"/) || html.match(/"profile_pic_url":\s*"([^"]+)"/);

        if (fcMatch && !result.followers) result.followers = parseInt(fcMatch[1]);
        if (fgMatch && !result.following) result.following = parseInt(fgMatch[1]);
        if (pcMatch && !result.posts) result.posts = parseInt(pcMatch[1]);
        if (picMatch && !result.profilePic) result.profilePic = picMatch[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
    }

    if (result.profilePic) {
        result.profilePic = result.profilePic.replace(/&amp;/g, '&');
    }

    if (result.profilePic || result.followers > 0 || result.posts > 0 || result.fullName) {
        return result;
    }

    return null;
}

function fetchViaAlternateMethod(username) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'i.instagram.com',
            path: `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; pt_BR; 458229258)',
                'X-IG-App-ID': '936619743392459',
                'Accept': '*/*',
                'Accept-Language': 'pt-BR,pt;q=0.9',
            }
        };

        const request = https.get(options, (response) => {
            let data = '';
            response.on('data', chunk => { data += chunk; });
            response.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const user = json?.data?.user;
                    if (user) {
                        resolve({
                            username: user.username || username,
                            fullName: user.full_name || '',
                            profilePic: (user.profile_pic_url_hd || user.profile_pic_url || '').replace(/&amp;/g, '&'),
                            posts: user.edge_owner_to_timeline_media?.count || 0,
                            followers: user.edge_followed_by?.count || 0,
                            following: user.edge_follow?.count || 0,
                            bio: user.biography || '',
                            isPrivate: user.is_private || false,
                        });
                    } else {
                        reject(new Error('User not found in alternate API'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse alternate API response'));
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(6000, () => {
            request.destroy();
            reject(new Error('Alternate API timeout'));
        });
    });
}

function parseCount(str) {
    if (!str) return 0;
    str = str.replace(/,/g, '').trim();

    const multiplierMatch = str.match(/([\d.]+)\s*([KkMm])/);
    if (multiplierMatch) {
        const num = parseFloat(multiplierMatch[1]);
        const mult = multiplierMatch[2].toLowerCase();
        if (mult === 'k') return Math.round(num * 1000);
        if (mult === 'm') return Math.round(num * 1000000);
    }

    // Handle Brazilian format with dots (e.g. 1.058 -> 1058)
    if (/^\d+\.\d{3}$/.test(str)) {
        return parseInt(str.replace(/\./g, ''));
    }

    return parseInt(str) || 0;
}

function decodeHTMLEntities(str) {
    if (!str) return '';
    return str
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#064;/g, '@');
}


// ===== Deterministic Direct Message generation =====
// Every searched profile gets its own stable set of conversations: same username
// always yields the same messages, different usernames yield different ones.

function seededRandom(username) {
    let s = 0;
    for (let i = 0; i < username.length; i++) {
        s = (s << 5) - s + username.charCodeAt(i) * (i + 7);
        s |= 0;
    }
    s = Math.abs(s) || 987654321;
    return function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

const DM_TEXTS = [
    "Blz depois a gente se fala", "Kkkkkk vc é doido", "Tá on?", "Me chama quando puder",
    "Delícia você 😈 😈", "Bora sair hoje?", "Vi seu story kkkk", "Sdds de vc",
    "Manda o print aí", "Tô indo dormir, bjs", "Que horas vc chega?", "Nem me fala kkkk",
    "Amanhã eu te conto tudo", "Tô com saudade viu", "Pode falar", "Que isso mano kkkkk",
    "Confirma comigo depois", "Vou te mandar por aqui", "Combinado então", "Some não hein",
    "Cê sumiu de novo", "Depois me liga", "Tá bom, fechou", "Achei que vc tinha esquecido",
    "Vc tá em casa?", "Manda oi pra ela por mim", "Foi mal, tava dormindo", "Olha isso aqui kkkk",
    "Não conta pra ninguém", "Já vi, kkkkk", "Amanhã cedo eu te chamo", "Vou pensar no seu caso 😏",
    "Que saudade dos rolês", "Vc vai na festa sábado?", "Tô morrendo de rir aqui",
    "Me responde vai", "Vamo marcar essa semana", "Tá gravando?", "Vi que vc curtiu 👀",
    "Depois te explico melhor"
];

const DM_REACTIONS = ["👍", "❤️", "😂", "🔥", "😍", "😮", "😢", "💜"];
const DM_TIMES = [
    " • 2 min", " • 12 min", " • 34 min", " • 1 h", " • 2 h", " • 4 h", " • 5 h",
    " • 6 h", " • 8 h", " • 10 h", " • 14 h", " • 18 h", " • 1 d", " • 2 d", " • 3 d", " • 5 d"
];


function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
}

function maskName(username, rng) {
    const base = (username || 'usu').substring(0, 3);
    const stars = 5 + Math.floor(rng() * 3); // 5 to 7 asterisks
    return base + '*'.repeat(stars);
}

/**
 * Build the Direct conversation list for a searched profile.
 * The pool of senders comes from that profile's real related accounts, and the
 * message bodies are drawn with an RNG seeded by the searched username.
 */
function buildDirectChats(username, searchedProfile, related) {
    const rng = seededRandom(username + '::chats');
    const firstName = (searchedProfile.full_name || '').split(' ')[0]
        || searchedProfile.username || 'vc';

    // Message shapes, weighted so plain text dominates like a real inbox
    const kinds = [
        'text', 'text', 'text', 'text', 'text',
        'reaction', 'reel', 'unread', 'audio', 'photo', 'like', 'story'
    ];

    const total = 7 + Math.floor(rng() * 3); // 7 to 9 conversations
    const senders = (related || []).filter(p => p && p.username);
    const usedTexts = new Set();
    const chats = [];

    // Time slots always run newest to oldest down the list
    let timeIndex = Math.floor(rng() * 3);

    for (let i = 0; i < total; i++) {
        const sender = senders[i % Math.max(senders.length, 1)];
        const senderName = sender ? sender.username : `user${i}`;

        const kind = i === 0 ? 'opener' : pick(rng, kinds);
        let lastMessage;

        switch (kind) {
            case 'opener':
                lastMessage = `${firstName} adivinha o que vc esquec...`;
                break;
            case 'reaction':
                lastMessage = `Reagiu com ${pick(rng, DM_REACTIONS)} à sua mensagem`;
                break;
            case 'reel': {
                // Credit somebody other than the sender -- nobody forwards their own reel
                const others = senders.filter(p => !sender || p.username !== sender.username);
                const other = others.length
                    ? others[Math.floor(rng() * others.length) % others.length]
                    : null;
                lastMessage = other
                    ? `Enviou um reel de ${maskName(other.username, rng)}`
                    : 'Encaminhou um reel';
                break;
            }
            case 'unread':
                lastMessage = `${2 + Math.floor(rng() * 6)} novas mensagens`;
                break;
            case 'audio':
                lastMessage = `Enviou um áudio • ${Math.floor(rng() * 2)}:${String(10 + Math.floor(rng() * 49)).padStart(2, '0')}`;
                break;
            case 'photo':
                lastMessage = rng() > 0.5 ? 'Enviou uma foto' : 'Enviou um vídeo';
                break;
            case 'like':
                lastMessage = 'Curtiu sua mensagem';
                break;
            case 'story':
                lastMessage = 'Respondeu ao seu story';
                break;
            default: {
                // Plain text, never repeated inside the same inbox
                let text = pick(rng, DM_TEXTS);
                let guard = 0;
                while (usedTexts.has(text) && guard++ < 12) text = pick(rng, DM_TEXTS);
                usedTexts.add(text);
                lastMessage = text;
            }
        }

        timeIndex = Math.min(timeIndex + 1 + Math.floor(rng() * 2), DM_TIMES.length - 1);

        chats.push({
            id: `chat_${i + 1}`,
            displayName: maskName(senderName, rng),
            profilePic: (sender && sender.profilePicture)
                || `/images/avatars/fallback/av-fallback-${(i % 14) + 1}.jpg`,
            lastMessage,
            time: DM_TIMES[timeIndex],
            isUnread: i < 2 ? true : rng() > 0.65
        });
    }

    return chats;
}


// Endpoint to fetch following list tailored uniquely to the searched profile
app.get('/api/instagram/related/:username', async (req, res) => {
    const username = req.params.username.replace('@', '').trim().toLowerCase();
    if (!username) {
        return res.status(400).json({ success: false, error: 'Username is required' });
    }

    try {
        const profiles = await instagramDataProvider.getRelatedProfiles(username, 10);
        res.json({
            success: true,
            profiles: profiles.map(p => ({
                username: p.username,
                fullName: p.fullName,
                profilePicture: p.profilePicture,
                isCloseFriends: p.isCloseFriends,
                location: p.location
            }))
        });
    } catch (err) {
        console.error('Error fetching related profiles:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch related profiles' });
    }
});

// Endpoint for Direct Messages & Notes
app.get('/api/direct/:username', async (req, res) => {
    const username = req.params.username.replace('@', '').trim().toLowerCase();
    if (!username) {
        return res.status(400).json({ error: 'Username required' });
    }

    try {
        const related = await instagramDataProvider.getRelatedProfiles(username, 12);

        // Prefer the real scraped profile: instagramDataProvider.getProfile() only
        // returns a generic fallback avatar, which would show a stranger's face
        // on the user's own note.
        let searchedProfile = await instagramDataProvider.getProfile(username);
        try {
            const realProfile = await fetchInstagramProfile(username);
            if (realProfile && realProfile.profilePic) {
                searchedProfile = {
                    ...searchedProfile,
                    full_name: realProfile.fullName || searchedProfile.full_name,
                    profile_pic_url: realProfile.profilePic
                };
            }
        } catch (e) {
            console.error('Could not fetch real profile pic for ' + username + ':', e.message);
        }

        // Notes: same pool for everyone, but each searched profile draws its own
        // phrases so two different searches never show the same notes row.
        const notesPhrases = [
            "Preguiça Hoje 😴😴",
            "O vontde fudê a 3 😈",
            "Já não aguento mais!",
            "👀",
            "Só paz e tranquilidade ✌️",
            "Sextou com S de saudade",
            "Mais um dia de glória 🙏",
            "Bora sumir uns dias",
            "Cansada mas feliz ✨",
            "Alguém me chama pra sair",
            "Focado 🔒",
            "Saudade de quem?",
            "Hoje não 😮‍💨",
            "Contando os dias ⏳",
            "Deixa comigo 😎"
        ];
        const notesRng = seededRandom(username + '::notes');
        const usedNotes = new Set();
        const pickNote = () => {
            let phrase = pick(notesRng, notesPhrases);
            let guard = 0;
            while (usedNotes.has(phrase) && guard++ < 12) phrase = pick(notesRng, notesPhrases);
            usedNotes.add(phrase);
            return phrase;
        };

        const notes = [
            {
                username: username,
                displayName: "Sua nota",
                profilePic: searchedProfile.profile_pic_url,
                isOwn: true,
                label: "Conte as novidades"
            },
            ...related.slice(0, 7).map((user, idx) => {
                const isMusic = idx === 1;
                return {
                    username: user.username,
                    displayName: user.username.substring(0, 3) + '*****',
                    profilePic: user.profilePicture,
                    isOwn: false,
                    isMusicNote: isMusic,
                    music: isMusic ? { title: "Coração Partido", artist: "Grupo Menos É Mais" } : null,
                    label: pickNote(),
                    isCloseFriends: user.isCloseFriends
                };
            })
        ];

        const chats = buildDirectChats(username, searchedProfile, related);

        res.json({ notes, chats });
    } catch (err) {
        console.error('Error fetching direct data:', err.message);
        res.json({ notes: [], chats: [] });
    }
});



// Proxy for Instagram profile images (to bypass CORS and token issues)
app.get('/api/proxy-image', (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('URL required');
    }

    // If it is a local relative image (like /images/avatars/fallback/...), serve directly
    if (imageUrl.startsWith('/')) {
        const localPath = path.join(__dirname, imageUrl);
        return res.sendFile(localPath, (err) => {
            if (err) res.status(404).send('Not found');
        });
    }

    try {
        const targetUrl = new URL(imageUrl);
        const protocol = targetUrl.protocol === 'https:' ? https : http;

        const proxyReq = protocol.get(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.instagram.com/',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            }
        }, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                // Follow image redirect
                return https.get(proxyRes.headers.location, (redRes) => {
                    res.set('Content-Type', redRes.headers['content-type'] || 'image/jpeg');
                    res.set('Cache-Control', 'public, max-age=86400');
                    redRes.pipe(res);
                }).on('error', () => res.status(500).send('Failed redirect'));
            }

            res.set('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
            res.set('Cache-Control', 'public, max-age=86400');
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Image proxy error:', err.message);
            res.status(500).send('Failed to proxy image');
        });

        proxyReq.setTimeout(8000, () => {
            proxyReq.destroy();
            res.status(504).send('Image proxy timeout');
        });
    } catch (e) {
        res.status(400).send('Invalid URL');
    }
});

// Vercel imports this file as a serverless function via the export below;
// it never runs this listener there, only for local `npm run dev`.
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`\n🔍 InstaSpy server running at http://localhost:${PORT}\n`);
    });
}

module.exports = app;
