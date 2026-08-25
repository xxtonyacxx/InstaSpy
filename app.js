// ===== Matrix Rain Background =====
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const chars = 'INSTASPY01@#.';
const fontSize = 14;
let columns;
let drops;

function initMatrix() {
    columns = Math.floor(canvas.width / fontSize);
    drops = Array(columns).fill(1).map(() => Math.random() * canvas.height / fontSize);
}
initMatrix();
window.addEventListener('resize', initMatrix);

function drawMatrix() {
    ctx.fillStyle = 'rgba(10, 10, 15, 0.06)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = `${fontSize}px monospace`;

    for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Random purple or blue-ish color
        const r = Math.random();
        if (r < 0.3) {
            ctx.fillStyle = 'rgba(6, 182, 212, 0.28)';
        } else if (r < 0.6) {
            ctx.fillStyle = 'rgba(34, 211, 238, 0.20)';
        } else {
            ctx.fillStyle = 'rgba(103, 232, 249, 0.15)';
        }

        ctx.fillText(char, x, y);

        if (y > canvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i] += 0.5 + Math.random() * 0.5;
    }
}

setInterval(drawMatrix, 50);

// ===== Typing Animation for Hero =====
const words = ['Cônjuge', 'Ex', 'Namorado(a)', 'Crush', 'Amigo(a)'];
let wordIndex = 0;
let charIndex = 0;
let isDeleting = false;
const typingEl = document.getElementById('typingWord');

function typeWord() {
    const currentWord = words[wordIndex];

    if (!isDeleting) {
        typingEl.textContent = currentWord.substring(0, charIndex + 1);
        charIndex++;

        if (charIndex === currentWord.length) {
            setTimeout(() => { isDeleting = true; typeWord(); }, 2000);
            return;
        }
        setTimeout(typeWord, 100);
    } else {
        typingEl.textContent = currentWord.substring(0, charIndex - 1);
        charIndex--;

        if (charIndex === 0) {
            isDeleting = false;
            wordIndex = (wordIndex + 1) % words.length;
            setTimeout(typeWord, 400);
            return;
        }
        setTimeout(typeWord, 60);
    }
}

setTimeout(typeWord, 1500);

// ===== Step Navigation =====
const steps = {
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    stepPasswordCrack: document.getElementById('stepPasswordCrack'),
    step3: document.getElementById('step3'),
    step4: document.getElementById('step4'),
};

function goToStep(stepId) {
    Object.values(steps).forEach(s => s && s.classList.remove('active'));
    if (steps[stepId]) {
        steps[stepId].classList.add('active');
    }
    window.scrollTo(0, 0);
}

// ===== Step 1: Username Input =====
const usernameInput = document.getElementById('usernameInput');
const searchBtn = document.getElementById('searchBtn');

usernameInput.addEventListener('input', () => {
    const val = usernameInput.value.trim();
    if (val.length > 0) {
        searchBtn.style.display = 'flex';
    } else {
        searchBtn.style.display = 'none';
    }
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && usernameInput.value.trim().length > 0) {
        goToConfirm();
    }
});

searchBtn.addEventListener('click', goToConfirm);

// Used only when Instagram cannot be reached. Seeded by the handle so the same
// profile always shows the same numbers -- with Math.random() they changed on
// every reload, which gave the guesswork away instantly.
function generateFallbackStats(username) {
    let seed = 0;
    const key = String(username || '');
    for (let i = 0; i < key.length; i++) {
        seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    }

    const next = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    return {
        posts: Math.floor(next() * 200) + 1,
        followers: Math.floor(next() * 15000 + 500),
        following: Math.floor(next() * 1500) + 50,
    };
}

function formatNumber(num) {
    return Number(num).toLocaleString('pt-BR');
}

let currentUsername = '';
let currentStats = {};
let currentProfilePic = '';
let currentFullName = '';

async function fetchInstagramProfile(username) {
    try {
        const response = await fetch(`/api/profile/${encodeURIComponent(username)}`);
        const data = await response.json();

        if (data.error && data.fallback) {
            return null;
        }

        return data;
    } catch (e) {
        console.error('Failed to fetch profile:', e);
        return null;
    }
}

function updateAvatars(profilePicUrl) {
    if (!profilePicUrl) return;

    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(profilePicUrl)}`;

    // 1. Profile card placeholders (Step 2 and Step 4)
    document.querySelectorAll('.avatar-placeholder').forEach(container => {
        container.innerHTML = '';
        container.style.overflow = 'hidden';
        const img = document.createElement('img');
        img.src = proxyUrl;
        img.alt = currentUsername;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        container.appendChild(img);
    });

    // 2. Right panel small avatar (Step 3)
    document.querySelectorAll('.user-avatar-small').forEach(container => {
        container.innerHTML = '';
        container.style.overflow = 'hidden';
        const img = document.createElement('img');
        img.src = proxyUrl;
        img.alt = currentUsername;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        container.appendChild(img);
    });

    // 3. Your story avatar (Step 3)
    document.querySelectorAll('.story-avatar-placeholder').forEach(container => {
        container.innerHTML = '';
        container.style.overflow = 'hidden';
        const img = document.createElement('img');
        img.src = proxyUrl;
        img.alt = currentUsername;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        container.appendChild(img);
    });

    // 4. Map pin (Step 4)
    const mapPin = document.querySelector('.map-pin');
    if (mapPin) {
        mapPin.innerHTML = '';
        mapPin.style.overflow = 'hidden';
        const img = document.createElement('img');
        img.src = proxyUrl;
        img.alt = currentUsername;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        mapPin.appendChild(img);
    }

    // 5. DM avatar (Step 4)
    const dmAvatar = document.querySelector('.dm-avatar');
    if (dmAvatar) {
        dmAvatar.innerHTML = '';
        dmAvatar.style.overflow = 'hidden';
        const img = document.createElement('img');
        img.src = proxyUrl;
        img.alt = currentUsername;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        dmAvatar.appendChild(img);
    }
}

function goToConfirm() {
    currentUsername = usernameInput.value.trim().replace('@', '');
    if (!currentUsername) return;

    // Show loading while fetching real data
    document.getElementById('confirmUsername').textContent = currentUsername;

    showLoading('Buscando perfil de @' + currentUsername + '...', async () => {
        const profileData = await fetchInstagramProfile(currentUsername);

        if (profileData && !profileData.error) {
            // Use real data
            const fallback = generateFallbackStats(currentUsername);
            currentStats = {
                posts: profileData.posts || fallback.posts,
                followers: profileData.followers || fallback.followers,
                following: profileData.following || fallback.following,
            };
            currentProfilePic = profileData.profilePic || '';
            currentFullName = profileData.fullName || currentUsername;
        } else {
            // Fallback to generated data
            currentStats = generateFallbackStats(currentUsername);
            currentProfilePic = '';
            currentFullName = currentUsername;
        }

        // Update confirm screen
        document.getElementById('statPosts').textContent = formatNumber(currentStats.posts);
        document.getElementById('statFollowers').textContent = formatNumber(currentStats.followers);
        document.getElementById('statFollowing').textContent = formatNumber(currentStats.following);

        // Update profile pictures
        if (currentProfilePic) {
            updateAvatars(currentProfilePic);
        }

        goToStep('step2');
    });
}

// ===== Step 2: Confirm / Correct =====
document.getElementById('correctBtn').addEventListener('click', () => {
    goToStep('step1');
    usernameInput.focus();
});

document.getElementById('confirmBtn').addEventListener('click', () => {
    startPasswordCracking();
});

// ===== Step 2.5: Password Cracking Simulation =====
let crackInterval = null;
let crackAutoProceedTimeout = null;

function startPasswordCracking() {
    goToStep('stepPasswordCrack');

    const igLoginUser = document.getElementById('igLoginUser');
    const igLoginPass = document.getElementById('igLoginPass');
    const igPassError = document.getElementById('igPassError');
    const igSuccessBanner = document.getElementById('igSuccessBanner');
    const igCryptoBox = document.getElementById('igCryptoBox');
    const igCryptoIcon = document.getElementById('igCryptoIcon');
    const igCryptoTitle = document.getElementById('igCryptoTitle');
    const igCryptoSubtitle = document.getElementById('igCryptoSubtitle');
    const igLoginBtn = document.getElementById('igLoginBtn');

    // Reset initial state
    igLoginUser.value = currentUsername;
    igSuccessBanner.classList.remove('show');
    igPassError.style.display = 'block';
    igPassError.style.opacity = '1';
    igPassError.textContent = 'A senha que você inseriu está incorreta.';
    igCryptoIcon.classList.remove('success');
    igCryptoIcon.innerHTML = `
        <svg class="spin-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
    `;
    igCryptoTitle.textContent = 'Quebrando criptografia da conta';
    igCryptoSubtitle.textContent = 'Testando senha...';
    igLoginBtn.classList.remove('active');

    if (crackInterval) clearInterval(crackInterval);
    if (crackAutoProceedTimeout) clearTimeout(crackAutoProceedTimeout);

    let iteration = 0;
    const maxIterations = 36; // ~3.5 seconds total
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';

    crackInterval = setInterval(() => {
        iteration++;

        // Random password attempt
        const randomLength = Math.floor(Math.random() * 4) + 9;
        const lastChar = chars[Math.floor(Math.random() * chars.length)];
        igLoginPass.value = '*'.repeat(randomLength) + lastChar;

        // Dynamic status text
        if (iteration < 8) {
            igCryptoSubtitle.textContent = 'Testando senha...';
        } else if (iteration < 16) {
            igCryptoSubtitle.textContent = 'Testando combinações comuns...';
        } else if (iteration < 24) {
            igCryptoSubtitle.textContent = 'Quebrando chave de segurança...';
        } else if (iteration < 32) {
            igCryptoSubtitle.textContent = 'Buscando token de sessão...';
        }

        // Cracking complete!
        if (iteration >= maxIterations) {
            clearInterval(crackInterval);
            crackInterval = null;

            // Set discovered password
            igLoginPass.value = '************2';
            igPassError.style.display = 'none';

            // Success indicators
            igSuccessBanner.classList.add('show');
            igCryptoIcon.classList.add('success');
            igCryptoIcon.innerHTML = '✓';
            igCryptoTitle.textContent = 'Criptografia quebrada com sucesso!';
            igCryptoSubtitle.textContent = 'Acesso liberado à conta!';
            igLoginBtn.classList.add('active');

            // Click or auto-proceed to Dashboard
            igLoginBtn.onclick = () => {
                if (crackAutoProceedTimeout) clearTimeout(crackAutoProceedTimeout);
                proceedToDashboard();
            };

            crackAutoProceedTimeout = setTimeout(() => {
                proceedToDashboard();
            }, 2200);
        }
    }, 90);
}

// Global storage for real related/following data
let currentRelatedProfiles = [];

// ===== Component: InstagramRelatedProfiles =====
const InstagramRelatedProfiles = {
    /**
     * Render skeleton circles while loading related profiles
     */
    renderLoading() {
        const storiesRow = document.getElementById('storiesRow');
        if (!storiesRow) return;

        // Remove existing dynamic stories and previous skeletons (keep "Seu story")
        const existing = storiesRow.querySelectorAll('.story-item:not(.your-story), .story-skeleton');
        existing.forEach(el => el.remove());

        // Render 5 to 7 animated skeleton circles
        for (let i = 0; i < 6; i++) {
            const skeletonItem = document.createElement('div');
            skeletonItem.className = 'story-skeleton';
            skeletonItem.innerHTML = `
                <div class="story-skeleton-circle"></div>
                <div class="story-skeleton-name"></div>
            `;
            storiesRow.appendChild(skeletonItem);
        }
    },

    /**
     * Render real unblurred profiles with story borders and usernames
     */
    render(profiles) {
        const storiesRow = document.getElementById('storiesRow');
        if (!storiesRow) return;

        // Clean up skeletons and existing items
        const existing = storiesRow.querySelectorAll('.story-item:not(.your-story), .story-skeleton');
        existing.forEach(el => el.remove());

        if (!profiles || profiles.length === 0) return;

        profiles.forEach((profile, index) => {
            const storyItem = document.createElement('div');
            storyItem.className = 'story-item clickable-section'
                + (profile.isReal ? ' real-photo' : '');

            const isClose = !!profile.isCloseFriends;
            const storyCircle = document.createElement('div');
            storyCircle.className = isClose ? 'story-circle close-friends' : 'story-circle has-story';

            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'story-avatar-img';

            const img = document.createElement('img');
            img.src = getProxiedImageUrl(profile.profilePicture || profile.profile_pic_url, index + 1);
            img.alt = profile.username;
            img.loading = 'lazy';
            img.onerror = () => {
                // The real photo failed to load -- blur the stand-in that replaces it
                const num = (index % 14) + 1;
                img.src = `/images/avatars/fallback/av-fallback-${num}.jpg`;
                storyItem.classList.remove('real-photo');
                img.onerror = null;
            };

            avatarDiv.appendChild(img);
            storyCircle.appendChild(avatarDiv);
            storyItem.appendChild(storyCircle);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'story-name';
            nameSpan.textContent = maskStoryUsername(profile.username);
            storyItem.appendChild(nameSpan);

            storyItem.addEventListener('click', () => showVIPModal('stories'));
            storiesRow.appendChild(storyItem);
        });
    }
};

async function proceedToDashboard() {
    // Update dashboard usernames and details
    document.getElementById('dashUsername').textContent = currentFullName || currentUsername;
    document.getElementById('dashHandle').textContent = currentUsername;

    if (currentProfilePic) {
        updateAvatars(currentProfilePic);
    }

    goToStep('step3');
    startPreviewTimer();

    // 1. Show circular skeletons immediately
    InstagramRelatedProfiles.renderLoading();

    // 2. Fetch real related profiles from backend
    try {
        const response = await fetch(`/api/instagram/related/${encodeURIComponent(currentUsername)}`);
        const data = await response.json();

        if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
            currentRelatedProfiles = data.profiles;
        }
    } catch (e) {
        console.warn('Could not fetch related profiles:', e.message);
    }

    // 3. Render the related profiles
    InstagramRelatedProfiles.render(currentRelatedProfiles);
    populateFeedAvatars();
    populateSuggestions();
    setupVIPRedirects();
}

// Helper to correctly handle local vs external URLs
function getProxiedImageUrl(url, fallbackIndex = 1) {
    if (!url) {
        const num = (Math.abs(fallbackIndex) % 14) + 1;
        return `/images/avatars/fallback/av-fallback-${num}.jpg`;
    }
    if (url.startsWith('/') || url.startsWith('data:')) {
        return url;
    }
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function maskStoryUsername(username) {
    if (!username) return '***';
    if (username.startsWith('p.')) return 'p.l*****';
    const prefix = username.substring(0, 3);
    return prefix + '*****';
}

// ===== Populate Feed Post Avatars =====
function populateFeedAvatars() {
    const feedConfigs = [
        { avatarId: 'feedAvatar1', userElId: 'feedUser1', locElId: 'feedLocation1', likeElId: 'feedLikeUser1', defaultUser: 'nic*****', defaultLoc: 'São Joaquim de Bicas', index: 9 },
        { avatarId: 'feedAvatar2', userElId: 'feedUser2', locElId: 'feedLocation2', likeElId: 'feedLikeUser2', defaultUser: 'dhy*****', defaultLoc: 'Vila Velha, Espírito Santo', index: 6 },
        { avatarId: 'feedAvatar3', userElId: 'feedUser3', locElId: 'feedLocation3', likeElId: 'feedLikeUser3', defaultUser: 'fel*****', defaultLoc: 'Governador Valadares, Minas Gerais', index: 3 },
    ];

    feedConfigs.forEach(({ avatarId, userElId, locElId, likeElId, defaultUser, defaultLoc, index }) => {
        const container = document.getElementById(avatarId);
        if (!container) return;
        container.innerHTML = '';
        container.style.overflow = 'hidden';

        const follower = currentRelatedProfiles[index] || currentRelatedProfiles[index % Math.max(1, currentRelatedProfiles.length)];

        const img = document.createElement('img');
        const picUrl = follower ? getProxiedImageUrl(follower.profilePicture || follower.profilePic, index + 1) : `/images/avatars/fallback/av-fallback-${(index % 14) + 1}.jpg`;
        img.src = picUrl;
        img.alt = 'avatar';
        img.loading = 'lazy';
        img.onerror = () => {
            const num = (index % 14) + 1;
            img.src = `/images/avatars/fallback/av-fallback-${num}.jpg`;
            img.onerror = null;
        };
        container.appendChild(img);

        const userEl = document.getElementById(userElId);
        if (userEl) {
            userEl.textContent = follower ? maskStoryUsername(follower.username) : defaultUser;
        }

        const locEl = document.getElementById(locElId);
        if (locEl) {
            locEl.textContent = (follower && follower.location) ? follower.location : defaultLoc;
        }

        const likeEl = document.getElementById(likeElId);
        if (likeEl && currentRelatedProfiles.length > 0) {
            const liker = currentRelatedProfiles[(index + 1) % currentRelatedProfiles.length];
            likeEl.textContent = maskStoryUsername(liker.username);
        }
    });
}

// ===== Populate Suggestions Panel with Real Following Data =====
function populateSuggestions() {
    const suggestionList = document.querySelector('.suggestion-list');
    if (!suggestionList || currentRelatedProfiles.length === 0) return;

    // Clear existing static suggestions
    suggestionList.innerHTML = '';

    // Use real related profiles for suggestions (up to 4 or 5)
    currentRelatedProfiles.slice(0, 5).forEach((user, idx) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';

        const avatar = document.createElement('div');
        avatar.className = 'sug-avatar';
        avatar.style.overflow = 'hidden';

        const img = document.createElement('img');
        img.src = getProxiedImageUrl(user.profilePicture || user.profilePic, idx + 1);
        img.alt = user.username;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '50%';
        img.onerror = () => {
            const num = (idx % 14) + 1;
            img.src = `/images/avatars/fallback/av-fallback-${num}.jpg`;
            img.onerror = null;
        };
        avatar.appendChild(img);

        const info = document.createElement('div');
        info.className = 'sug-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'sug-name';
        nameSpan.textContent = user.username;

        const subSpan = document.createElement('span');
        subSpan.className = 'sug-sub';
        subSpan.textContent = 'Seguido(a) por alguém';

        info.appendChild(nameSpan);
        info.appendChild(subSpan);

        const followBtn = document.createElement('button');
        followBtn.className = 'sug-follow';
        followBtn.textContent = 'Seguindo';
        followBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showVIPModal('profile');
        });

        item.appendChild(avatar);
        item.appendChild(info);
        item.appendChild(followBtn);

        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('sug-follow')) {
                showVIPModal('profile');
            }
        });

        suggestionList.appendChild(item);
    });
}

// ===== Checkout: FAQ accordion & testimonial carousel =====
function setupCheckoutSections() {
    document.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.closest('.faq-item');
            const wasOpen = item.classList.contains('is-open');
            // One answer open at a time keeps the page from growing too tall
            document.querySelectorAll('.faq-item.is-open').forEach(o => o.classList.remove('is-open'));
            if (!wasOpen) item.classList.add('is-open');
        });
    });

    const cards = document.querySelectorAll('.testimonial-card');
    const dots = document.querySelectorAll('.testimonial-dots .dot');
    if (!cards.length || cards.length !== dots.length) return;

    let current = 0;
    let timer = null;

    const show = (index) => {
        current = (index + cards.length) % cards.length;
        cards.forEach((c, i) => c.classList.toggle('is-active', i === current));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === current));
    };

    const autoplay = () => {
        clearInterval(timer);
        timer = setInterval(() => show(current + 1), 6000);
    };

    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            show(i);
            autoplay();
        });
    });

    show(0);
    autoplay();
}

// ===== VIP Modal Logic =====
const VIP_MODAL_TARGETS = {
    stories: 'para ter acesso aos stories',
    posts: 'para ter acesso às publicações',
    direct: 'para ter acesso às mensagens',
    profile: 'para ter acesso ao perfil completo',
    notifications: 'para ter acesso às notificações',
    default: 'para ter acesso a esse conteúdo'
};

// `context` is optional; when used directly as a listener it receives an Event,
// which falls back to the default message.
function showVIPModal(context) {
    const modal = document.getElementById('vipModal');
    const targetSpan = document.getElementById('vipModalTarget');
    const key = typeof context === 'string' ? context : 'default';
    if (targetSpan) targetSpan.textContent = VIP_MODAL_TARGETS[key] || VIP_MODAL_TARGETS.default;
    modal.classList.add('show');
}

function hideVIPModal() {
    const modal = document.getElementById('vipModal');
    modal.classList.remove('show');
}

// Close modal events
document.getElementById('vipModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        hideVIPModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideVIPModal();
});

// VIP modal button -> Go to checkout
document.getElementById('vipModalBtn').addEventListener('click', () => {
    hideVIPModal();
    clearInterval(previewInterval);
    goToCheckout();
});

// Direct Messages & Feed Navigation
function showFeedView() {
    const feedArea = document.getElementById('feedArea');
    const directArea = document.getElementById('directArea');
    const rightPanel = document.querySelector('.right-panel');
    const navHome = document.getElementById('navHome');
    const navMessages = document.getElementById('navMessages');

    if (feedArea) feedArea.style.display = 'block';
    if (directArea) directArea.style.display = 'none';
    if (rightPanel) rightPanel.style.display = 'block';

    if (navHome) navHome.classList.add('active');
    if (navMessages) navMessages.classList.remove('active');
}

function showDirectView() {
    const feedArea = document.getElementById('feedArea');
    const directArea = document.getElementById('directArea');
    const rightPanel = document.querySelector('.right-panel');
    const navHome = document.getElementById('navHome');
    const navMessages = document.getElementById('navMessages');

    if (feedArea) feedArea.style.display = 'none';
    if (directArea) directArea.style.display = 'block';
    if (rightPanel) rightPanel.style.display = 'none';

    if (navHome) navHome.classList.remove('active');
    if (navMessages) navMessages.classList.add('active');

    loadDirectData(currentUsername);
}

async function loadDirectData(username) {
    const directHeaderUser = document.getElementById('directHeaderUser');
    if (directHeaderUser) {
        const span = directHeaderUser.querySelector('span');
        if (span) span.textContent = username || 'usuario';
    }

    try {
        const response = await fetch(`/api/direct/${encodeURIComponent(username || 'user')}`);
        const data = await response.json();

        renderDirectNotes(data.notes || []);
        renderDirectChats(data.chats || []);
    } catch (e) {
        console.error('Error loading direct data:', e);
    }
}

function renderDirectNotes(notes) {
    const directNotesRow = document.getElementById('directNotesRow');
    if (!directNotesRow) return;
    directNotesRow.innerHTML = '';

    notes.forEach((note, idx) => {
        const item = document.createElement('div');
        item.className = `direct-note-item ${note.isOwn ? 'is-own' : ''}`;

        // Bubble
        const bubbleCont = document.createElement('div');
        bubbleCont.className = 'note-bubble-container';

        const bubble = document.createElement('div');
        bubble.className = `note-bubble ${note.isOwn ? 'is-own' : ''} ${note.isMusicNote ? 'is-music' : ''}`;

        if (note.isMusicNote && note.music) {
            bubble.innerHTML = `<span class="note-music-icon"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg></span><span class="note-music-text"><strong>${note.music.title}</strong><span>${note.music.artist || ''}</span></span>`;
        } else {
            const text = document.createElement('span');
            text.className = 'note-bubble-text';
            text.textContent = note.label || 'Conte as novidades';
            bubble.appendChild(text);
        }
        bubbleCont.appendChild(bubble);

        // Avatar
        const avatarWrapper = document.createElement('div');
        avatarWrapper.className = 'note-avatar-wrapper';

        const img = document.createElement('img');
        // The own note must always show the searched profile's real picture --
        // same source as "Seu story" -- never a generic fallback avatar.
        img.src = note.isOwn
            ? getProxiedImageUrl(currentProfilePic || note.profilePic, idx + 1)
            : getProxiedImageUrl(note.profilePic, idx + 1);
        img.alt = note.displayName || note.username;
        img.onerror = () => {
            img.src = `/images/avatars/fallback/av-fallback-${(idx % 14) + 1}.jpg`;
            img.onerror = null;
        };
        avatarWrapper.appendChild(img);

        // Username
        const uname = document.createElement('span');
        uname.className = 'note-username';
        uname.textContent = note.displayName || note.username;

        item.appendChild(bubbleCont);
        item.appendChild(avatarWrapper);
        item.appendChild(uname);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            showVIPModal('direct');
        });

        directNotesRow.appendChild(item);
    });
}

function renderDirectChats(chats) {
    const directChatList = document.getElementById('directChatList');
    if (!directChatList) return;
    directChatList.innerHTML = '';

    chats.forEach((chat, idx) => {
        const item = document.createElement('div');
        item.className = `direct-chat-item ${chat.isUnread ? 'unread' : ''}`;

        // Avatar
        const avatarBox = document.createElement('div');
        avatarBox.className = 'chat-avatar-box';
        const img = document.createElement('img');
        img.src = getProxiedImageUrl(chat.profilePic, idx + 1);
        img.alt = chat.displayName;
        img.onerror = () => {
            img.src = `/images/avatars/fallback/av-fallback-${(idx % 14) + 1}.jpg`;
            img.onerror = null;
        };
        avatarBox.appendChild(img);

        // Details
        const details = document.createElement('div');
        details.className = 'chat-details';

        const headerLine = document.createElement('div');
        headerLine.className = 'chat-header-line';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'chat-name';
        nameSpan.textContent = chat.displayName;
        headerLine.appendChild(nameSpan);

        const previewText = document.createElement('div');
        previewText.className = 'chat-preview-text';
        previewText.textContent = `${chat.lastMessage} ${chat.time}`;

        details.appendChild(headerLine);
        details.appendChild(previewText);

        // Camera action icon
        const camBtn = document.createElement('div');
        camBtn.className = 'chat-camera-icon';
        camBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
            </svg>
        `;

        item.appendChild(avatarBox);
        item.appendChild(details);
        item.appendChild(camBtn);

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            showVIPModal('direct');
        });

        directChatList.appendChild(item);
    });
}

// ===== Setup VIP Redirects & Navigation =====
function setupVIPRedirects() {
    // 1. All clickable sections (feed posts)
    document.querySelectorAll('.clickable-section').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showVIPModal('posts');
        });
    });

    // 2. Sidebar navigation
    const navHome = document.getElementById('navHome');
    if (navHome) {
        navHome.addEventListener('click', (e) => {
            e.preventDefault();
            showFeedView();
        });
    }

    const navMessages = document.getElementById('navMessages');
    if (navMessages) {
        navMessages.addEventListener('click', (e) => {
            e.preventDefault();
            showDirectView();
        });
    }

    // Mobile Instagram top bar
    const igTopbarDirect = document.getElementById('igTopbarDirect');
    if (igTopbarDirect) {
        igTopbarDirect.addEventListener('click', (e) => {
            e.preventDefault();
            showDirectView();
        });
    }

    const igTopbarNotifications = document.getElementById('igTopbarNotifications');
    if (igTopbarNotifications) {
        igTopbarNotifications.addEventListener('click', (e) => {
            e.preventDefault();
            showVIPModal('notifications');
        });
    }

    const directBackBtn = document.getElementById('directBackBtn');
    if (directBackBtn) {
        directBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showFeedView();
        });
    }

    document.querySelectorAll('.sidebar .nav-item:not(#navHome):not(#navMessages)').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showVIPModal();
        });
    });

    // 3. Right panel elements
    document.querySelectorAll('.sug-follow').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showVIPModal('profile');
        });
    });

    document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('sug-follow')) {
                showVIPModal('profile');
            }
        });
    });

    // 4. "Ver tudo" link
    const seeAll = document.querySelector('.see-all');
    if (seeAll) {
        seeAll.addEventListener('click', () => showVIPModal('profile'));
    }

    // 5. "Mudar" link
    const switchBtn = document.querySelector('.switch-btn');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => showVIPModal('profile'));
    }

    // 6. Post images
    document.querySelectorAll('.post-image-locked').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            showVIPModal('posts');
        });
    });

    // 7. Post action icons
    document.querySelectorAll('.post-action-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            showVIPModal('posts');
        });
    });

    // 8. Post "more" button
    document.querySelectorAll('.post-more').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showVIPModal('posts');
        });
    });
}

// ===== Loading Overlay =====
function showLoading(text, callback) {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text">${text}</p>
        <div class="loading-progress">
            <div class="loading-progress-bar" id="loadingBar"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const bar = overlay.querySelector('#loadingBar');
    let progress = 0;
    const messages = [
        'Conectando aos servidores do Instagram...',
        'Carregando perfil de @' + currentUsername + '...',
        'Analisando direct e mensagens privadas...',
        'Rastreando histórico de localização...',
        'Processando histórias e publicações ocultas...',
        'Finalizando descriptografia...',
    ];

    const textEl = overlay.querySelector('.loading-text');
    let msgIndex = 0;

    const interval = setInterval(() => {
        progress += Math.random() * 14 + 6;
        if (progress >= 100) {
            progress = 100;
            bar.style.width = '100%';
            clearInterval(interval);
            setTimeout(() => {
                overlay.remove();
                if (callback) callback();
            }, 400);
            return;
        }
        bar.style.width = progress + '%';

        if (progress > (msgIndex + 1) * (100 / messages.length) && msgIndex < messages.length - 1) {
            msgIndex++;
            textEl.textContent = messages[msgIndex];
        }
    }, 250);
}

// ===== Step 3: Preview Timer =====
let previewInterval;

function startPreviewTimer() {
    let totalSeconds = 10 * 60; // 10 minutes
    const timerEl = document.getElementById('previewTimer');

    if (previewInterval) clearInterval(previewInterval);

    previewInterval = setInterval(() => {
        totalSeconds--;
        if (totalSeconds <= 0) {
            clearInterval(previewInterval);
            goToCheckout();
            return;
        }
        const min = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
        timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    }, 1000);
}

document.getElementById('goVipBtn').addEventListener('click', () => {
    clearInterval(previewInterval);
    goToCheckout();
});

// ===== Step 4: Checkout =====
function goToCheckout() {
    // Update all username references on checkout page
    document.getElementById('checkoutUser').textContent = currentFullName || currentUsername;
    document.getElementById('checkoutHandle').textContent = currentUsername;
    document.getElementById('checkPosts').textContent = formatNumber(currentStats.posts);
    document.getElementById('checkFollowers').textContent = formatNumber(currentStats.followers);
    document.getElementById('checkFollowing').textContent = formatNumber(currentStats.following);

    document.getElementById('featureUser1').textContent = currentUsername;
    document.getElementById('featureUser2').textContent = currentUsername;
    document.getElementById('featureUser3').textContent = currentUsername;
    document.getElementById('featureUser4').textContent = currentUsername;
    document.getElementById('dmUser').textContent = currentUsername;
    document.getElementById('dmTarget').textContent = currentUsername;
    document.getElementById('mapUser').textContent = currentUsername;
    document.getElementById('pricingUser').textContent = currentUsername;
    document.getElementById('fl1').textContent = currentUsername;
    document.getElementById('fl2').textContent = currentUsername;

    if (currentProfilePic) {
        updateAvatars(currentProfilePic);
    }

    showLoading('Preparando resultados para @' + currentUsername + '...', () => {
        goToStep('step4');
        setupCheckoutSections();
    });
}

// CTA & Unlock buttons (just scroll to pricing or show alert)
document.getElementById('ctaBtn').addEventListener('click', () => {
    alert('Redirecionando para o pagamento seguro...');
});

document.getElementById('unlockBtn').addEventListener('click', () => {
    const pricingSection = document.querySelector('.pricing-section');
    if (pricingSection) {
        pricingSection.scrollIntoView({ behavior: 'smooth' });
    }
});

// ===== Blue Glow Effect on edges =====
const glowStyle = document.createElement('style');
glowStyle.textContent = `
    body::before {
        content: '';
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        box-shadow: 
            inset 0 0 120px rgba(59, 130, 246, 0.08),
            inset 0 0 60px rgba(124, 58, 237, 0.05);
    }
`;
document.head.appendChild(glowStyle);
