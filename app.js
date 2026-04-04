// ==========================================
// GAME STATE & GLOBALS
// ==========================================
let role = null;
let peer = null;
let roomCode = '';
let connections = {};
let currentConnection = null;
let selectedLevel = '3-4'; // Default level
let selectedSubject = 'matematicas'; // Default subject
let isTugOfWar = false;
let towTeamAssign = {}; // { teamId: 1 or 2 }
let towRopePos = 0; // -100 to 100
const TOW_PULL_STRENGTH = 8; // % pull per correct answer
let towTimerInterval = null;

// Anti-repetition: tracks question hashes seen by each team
const seenQuestions = {};
let openAIKey = localStorage.getItem('openai_key') || '';

window.addEventListener('DOMContentLoaded', () => {
    const keyInput = document.getElementById('openai-key');
    if (keyInput) {
        keyInput.value = openAIKey;
        keyInput.addEventListener('change', (e) => {
            openAIKey = e.target.value.trim();
            localStorage.setItem('openai_key', openAIKey);
            showToast('OpenAI Key guardada localmente', 'success');
        });
    }
});

// ==========================================
// PEERJS CONFIGURATION — ROBUST FOR SCHOOLS
// ==========================================
const PEER_CONFIG = {
    debug: 1,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' }
        ],
        sdpSemantics: 'unified-plan'
    }
};

// ==========================================
// HEARTBEAT / KEEPALIVE SYSTEM
// ==========================================
const HEARTBEAT_INTERVAL_MS = 8000;   // Host pings every 8s
const HEARTBEAT_TIMEOUT_MS = 25000;   // Mark disconnected after 25s no pong
const BUZZER_HEARTBEAT_TIMEOUT_MS = 30000; // Buzzer reconnects if no ping for 30s
let heartbeatTimer = null;
const lastPong = {};    // { teamId: timestamp }
let lastHostPing = 0;   // Buzzer-side: last ping received from host
let buzzerHeartbeatChecker = null;

// ==========================================
// RECONNECTION SYSTEM
// ==========================================
const MAX_RECONNECT_ATTEMPTS = 8;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 10000;
let reconnectAttempts = 0;
let reconnectTimer = null;
let isReconnecting = false;
let savedRoomCode = '';
let savedTeamId = '';

// ==========================================
// CONNECTION STATES
// ==========================================
const CONN_STATE = {
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting'
};
const connectionStates = {}; // { teamId: state }

// ==========================================
// QUESTION GENERATION (delegated to modules)
// ==========================================
function generateQuestion(level, difficulty) {
    const mod = window.QuestionModules[selectedSubject];
    if (!mod) { console.error('No question module for:', selectedSubject); return { text: '???', answer: 0 }; }
    return mod.generateQuestion(level, difficulty);
}

// Generate a unique question for a team (anti-repetition + adaptive difficulty)
function getUniqueQuestion(teamId) {
    const ts = gameStatus[teamId];
    let attempts = 0;
    let q;
    do {
        q = generateQuestion(selectedLevel, ts ? ts.difficultyLevel : 2);
        attempts++;
        if (attempts > 50) {
            seenQuestions[teamId].clear();
        }
    } while (seenQuestions[teamId].has(q.text) && attempts < 60);
    seenQuestions[teamId].add(q.text);
    return q;
}

async function getUniqueQuestionAsync(teamId) {
    if (openAIKey) {
        const q = await generateOpenAIQuestion(selectedLevel, selectedSubject);
        if (q) return q;
    }
    return getUniqueQuestion(teamId);
}

async function generateOpenAIQuestion(level, subject) {
    const prompt = `Actúa como un profesor experto en ${subject} para nivel escolar ${level}. 
    Genera UNA pregunta educativa donde la respuesta sea un NÚMERO ENTERO.
    Sé creativo, usa problemas divertidos.
    IMPORTANTE: Responde SOLO con el JSON: {"text": "la pregunta", "answer": 42}
    No incluyas nada más en la respuesta.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openAIKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        const json = JSON.parse(data.choices[0].message.content.trim());
        return json;
    } catch (e) {
        console.error("Error OpenAI:", e);
        showToast("Error Generando con IA, usando generador local", "warning");
        return null;
    }
}

const WINNING_SCORE = 10;
const TURBO_TIME_MS = 3000;
const SHIELD_STREAK = 5;
const DIFF_UP_STREAK = 3;   // Consecutive correct to increase difficulty
const DIFF_DOWN_MISS = 2;   // Consecutive incorrect to decrease difficulty
let gameStatus = {};
let gameStartTime = null;
let playerCounter = 0; // Para asignar IDs de UI únicos

// Anti-pegado timer
const questionTimers = {};
const QUESTION_TIMEOUT_S = 45;

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-hiding');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
    }, duration);
}

// ==========================================
// SCREEN NAVIGATION
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function goLobby() {
    // Stop demo mode
    if (typeof stopDemoMode === 'function') stopDemoMode();
    // Stop TOW timer
    if (towTimerInterval) { clearInterval(towTimerInterval); towTimerInterval = null; }
    // Stop heartbeat
    stopHeartbeat();
    stopBuzzerHeartbeatChecker();
    // Stop reconnection
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    isReconnecting = false;
    reconnectAttempts = 0;

    if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }
    role = null;
    connections = {};
    currentConnection = null;
    // Reset scores and seen questions
    gameStatus = {};
    for (let key in seenQuestions) delete seenQuestions[key];
    for (let key in connectionStates) delete connectionStates[key];
    for (let key in lastPong) delete lastPong[key];
    playerCounter = 0;
    // Clear anti-pegado timers
    Object.keys(questionTimers).forEach(k => { clearTimeout(questionTimers[k]); delete questionTimers[k]; });
    // Hide victory
    const vo = document.getElementById('victory-overlay');
    if (vo) { vo.classList.add('hidden'); vo.classList.remove('active'); }
    // Hide reconnect overlay
    hideReconnectOverlay();
    showScreen('lobby-screen');
}

// ==========================================
// PEER.JS UTILS
// ==========================================
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
    let result = '';
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

// Sanitize teamId to avoid collisions & problematic chars
function sanitizeTeamId(rawName, existingIds) {
    let name = rawName.trim().substring(0, 12);
    if (!name) name = 'Jugador';
    // Check if already connected with this name
    if (existingIds[name] && connections[name]) {
        // Name taken by an active connection — append suffix
        let suffix = 2;
        while (existingIds[`${name}-${suffix}`] && connections[`${name}-${suffix}`]) {
            suffix++;
        }
        name = `${name}-${suffix}`;
    }
    return name;
}

// ==========================================
// HOST LOGIC
// ==========================================
async function initHostMode(is1v1 = false) {
    role = 'HOST';
    showScreen('host-screen');
    document.getElementById('display-room-code').innerText = "PREPARANDO...";

    // Read selected level and subject from lobby
    const levelSelect = document.getElementById('level-selector');
    if (levelSelect) selectedLevel = levelSelect.value;
    const subjectSelect = document.getElementById('subject-selector');
    if (subjectSelect) selectedSubject = subjectSelect.value;

    roomCode = generateRoomCode();
    document.getElementById('display-room-code').innerText = roomCode;

    // Victory overlay reset
    const vo = document.getElementById('victory-overlay');
    vo.classList.add('hidden');
    vo.classList.remove('active');

    // PeerJS Host with robust config
    const hostPeerId = `mathrace-${roomCode}`;
    peer = new Peer(hostPeerId, PEER_CONFIG);

    peer.on('open', () => {
        console.log('✅ Host ready:', hostPeerId);
        showToast('Sala creada — esperando alumnos', 'success');
        // Start heartbeat
        startHostHeartbeat();
    });

    peer.on('connection', (conn) => {
        handleNewConnection(conn);
    });

    peer.on('error', (err) => {
        console.error('Host PeerJS error:', err);
        if (err.type === 'unavailable-id') {
            // Room code collision — regenerate
            roomCode = generateRoomCode();
            document.getElementById('display-room-code').innerText = roomCode;
            showToast('Código de sala en uso, generando nuevo...', 'warning');
            if (peer) { try { peer.destroy(); } catch(e) {} }
            const newHostPeerId = `mathrace-${roomCode}`;
            peer = new Peer(newHostPeerId, PEER_CONFIG);
            peer.on('open', () => {
                console.log('✅ Host ready (retry):', newHostPeerId);
                startHostHeartbeat();
            });
            peer.on('connection', (conn) => handleNewConnection(conn));
            peer.on('error', (e2) => {
                console.error('Host PeerJS error (retry):', e2);
                showToast('Error de conexión del host. Intenta de nuevo.', 'error');
            });
        } else if (err.type === 'network') {
            showToast('Error de red — verifica tu conexión a internet', 'error');
        } else if (err.type === 'server-error') {
            showToast('Error del servidor PeerJS — reintentando...', 'error');
        } else {
            showToast(`Error: ${err.type || 'desconocido'}`, 'error');
        }
    });

    peer.on('disconnected', () => {
        console.warn('Host disconnected from PeerJS server, attempting reconnect...');
        showToast('Reconectando al servidor...', 'warning');
        try { peer.reconnect(); } catch(e) { console.error('Reconnect failed:', e); }
    });

    // Reset game dynamically
    gameStatus = {};
    isTugOfWar = is1v1;
    towTeamAssign = {};
    towRopePos = 0;

    for (let key in seenQuestions) delete seenQuestions[key];
    for (let key in connectionStates) delete connectionStates[key];
    for (let key in lastPong) delete lastPong[key];
    
    const lanesContainer = document.getElementById('lanes-container');
    const towArea = document.getElementById('tug-of-war-area');
    
    if (isTugOfWar) {
        if (lanesContainer) lanesContainer.classList.add('hidden');
        if (towArea) towArea.classList.remove('hidden');
        document.getElementById('tow-rope').style.transform = 'translateX(0%)';
        document.getElementById('tow-main-timer').innerText = '00:00';
        // Reset score bar
        updateTOWScoreBar();
        // Show demo button
        const demoBtn = document.getElementById('demo-btn');
        if (demoBtn) demoBtn.classList.remove('hidden');
        // Reset calc headers
        const h1 = document.querySelector('#host-calc-1 .hc-header');
        const h2 = document.querySelector('#host-calc-2 .hc-header');
        if (h1) h1.innerText = 'EQUIPO 1';
        if (h2) h2.innerText = 'EQUIPO 2';
    } else {
        if (lanesContainer) {
            lanesContainer.classList.remove('hidden');
            lanesContainer.innerHTML = '';
        }
        if (towArea) towArea.classList.add('hidden');
        const demoBtn = document.getElementById('demo-btn');
        if (demoBtn) demoBtn.classList.add('hidden');
    }

    playerCounter = 0;
    gameStartTime = null;
}

function handleNewConnection(conn) {
    conn.on('open', async () => {
        const rawTeamId = conn.metadata.team || 'Jugador';
        let teamId = rawTeamId.trim();

        // Check if this is a reconnection (team exists but disconnected)
        if (gameStatus[teamId] && !connections[teamId]) {
            // Reconnection! Restore state
            console.log(`♻️ ${teamId} reconnected!`);
            connections[teamId] = conn;
            conn.metadata.team = teamId;
            connectionStates[teamId] = CONN_STATE.CONNECTED;
            lastPong[teamId] = Date.now();
            updateConnectionCount();
            updateConnectionIndicators();
            // Resend current question
            await sendQuestionToTeam(teamId);
            showToast(`${teamId} reconectado ✅`, 'success');
            showHostNotification('♻️ ¡RECONECTADO!', 'reconnect', teamId);
            return;
        }

        // New player — handle duplicate names
        teamId = sanitizeTeamId(teamId, gameStatus);
        conn.metadata.team = teamId;
        connections[teamId] = conn;
        connectionStates[teamId] = CONN_STATE.CONNECTED;
        lastPong[teamId] = Date.now();

        // Tell the buzzer their final assigned name and team number
        conn.send({ type: 'ASSIGNED_NAME', name: teamId });

        // Initialize new player if not exists
        if (!gameStatus[teamId]) {
            gameStatus[teamId] = {
                score: 0,
                currentQuestion: null,
                streak: 0,
                bestStreak: 0,
                incorrect: 0,
                totalAnswerTimeMs: 0,
                lastQuestionTime: 0,
                hasShield: false,
                turboCount: 0,
                difficultyLevel: 2,
                consecutiveWrong: 0,
                errorDetails: []
            };
            seenQuestions[teamId] = new Set();
            
            if (isTugOfWar) {
                // Alternar equipos 1 y 2
                const pCount = Object.keys(gameStatus).length;
                const assignedTeam = (pCount % 2 === 0) ? 2 : 1;
                towTeamAssign[teamId] = assignedTeam;
                gameStatus[teamId].uiId = assignedTeam;
                showToast(`${teamId} asignado al EQUIPO ${assignedTeam}`, 'info');
                
                // Tell buzzer which team they are on
                conn.send({ type: 'TEAM_ASSIGNED', teamNum: assignedTeam });
                
                // Actualizar encabezados
                const hName = document.getElementById(`host-calc-${assignedTeam}`).querySelector('.hc-header');
                if (hName) hName.innerText = teamId.toUpperCase();

                // Hide demo button once real players join
                const demoBtn = document.getElementById('demo-btn');
                if (demoBtn) demoBtn.classList.add('hidden');
            } else {
                createPlayerTrack(teamId);
            }
        }
        updateConnectionCount();
        updateConnectionIndicators();
        await sendQuestionToTeam(teamId);
        
        if (!gameStartTime) {
            gameStartTime = Date.now();
            if (isTugOfWar) startTOWTimer();
        }
        showToast(`${teamId} se unió 🎮`, 'info');
    });

    conn.on('data', async (data) => {
        const teamId = conn.metadata.team;
        if (data.type === 'PONG') {
            lastPong[teamId] = Date.now();
            if (connectionStates[teamId] !== CONN_STATE.CONNECTED) {
                connectionStates[teamId] = CONN_STATE.CONNECTED;
                updateConnectionIndicators();
            }
            return;
        }
        await handleHostData(teamId, data);
    });

    conn.on('close', () => {
        const tid = conn.metadata.team;
        console.warn(`⚠️ ${tid} disconnected`);
        delete connections[tid];
        connectionStates[tid] = CONN_STATE.DISCONNECTED;
        if (questionTimers[tid]) { clearTimeout(questionTimers[tid]); delete questionTimers[tid]; }
        updateConnectionCount();
        updateConnectionIndicators();
    });

    conn.on('error', (err) => {
        const tid = conn.metadata.team;
        console.error(`Connection error for ${tid}:`, err);
        connectionStates[tid] = CONN_STATE.DISCONNECTED;
        updateConnectionIndicators();
    });
}

// ==========================================
// HOST HEARTBEAT
// ==========================================
function startHostHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        const now = Date.now();
        for (let teamId in connections) {
            try {
                connections[teamId].send({ type: 'PING', t: now });
            } catch (e) {
                console.warn(`Failed to ping ${teamId}:`, e);
            }
        }
        // Check for stale connections
        for (let teamId in lastPong) {
            if (!connections[teamId]) continue;
            const elapsed = now - (lastPong[teamId] || 0);
            if (elapsed > HEARTBEAT_TIMEOUT_MS) {
                console.warn(`💀 ${teamId} heartbeat timeout (${Math.round(elapsed/1000)}s)`);
                connectionStates[teamId] = CONN_STATE.DISCONNECTED;
                updateConnectionIndicators();
                // Close stale connection gracefully
                try { connections[teamId].close(); } catch(e) {}
                delete connections[teamId];
                updateConnectionCount();
            }
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ==========================================
// CONNECTION UI INDICATORS (HOST)
// ==========================================
function updateConnectionIndicators() {
    for (let teamId in gameStatus) {
        const uiId = gameStatus[teamId].uiId;
        const state = connectionStates[teamId] || CONN_STATE.DISCONNECTED;
        const labels = {
            [CONN_STATE.CONNECTED]: '🟢',
            [CONN_STATE.CONNECTING]: '🟡',
            [CONN_STATE.RECONNECTING]: '🟡',
            [CONN_STATE.DISCONNECTED]: '🔴'
        };
        const icon = labels[state] || '⚪';

        if (isTugOfWar) {
            // No hay indicador visual por ahora en TOW mode o podríamos ponerlo en los nombres
        } else {
            const laneEl = document.querySelector(`.race-lane[data-team-ui="${uiId}"]`);
            if (!laneEl) continue;
            const indicator = laneEl.querySelector('.conn-indicator');
            if (indicator) {
                indicator.className = `conn-indicator conn-${state}`;
                indicator.textContent = icon;
            }
        }
    }
}

function createPlayerTrack(teamId) {
    playerCounter++;
    // Generar un color o tema aleatorio o basado en ID
    const colors = ['blue', 'pink', 'green', 'yellow', 'cyan', 'orange'];
    const trackColor = colors[playerCounter % colors.length];

    // Asignamos una ID de UI a este teamId
    gameStatus[teamId].uiId = playerCounter;

    const container = document.getElementById('lanes-container');
    if (!container) return;

    // Auto-compact mode for many players
    const totalPlayers = Object.keys(gameStatus).length;
    const compactClass = totalPlayers > 8 ? 'lane-compact' : '';

    const laneDiv = document.createElement('div');
    laneDiv.className = `race-lane lane-${trackColor} ${compactClass}`;
    laneDiv.setAttribute('data-team-ui', playerCounter);
    laneDiv.innerHTML = `
        <div class="lane-label"><span class="conn-indicator conn-connected">🟢</span> ${teamId} <span id="streak-${playerCounter}" class="streak-badge hidden"></span></div>
        <div class="progress-track">
            <div class="progress-fill" id="progress-fill-${playerCounter}" style="background: var(--accent-${trackColor}); box-shadow: 0 0 20px var(--accent-${trackColor});"></div>
            <div class="progress-markers">
                <span></span><span></span><span></span><span></span><span></span>
                <span></span><span></span><span></span><span></span>
            </div>
        </div>
        <div class="lane-runner" id="avatar-${playerCounter}">
            <div class="runner-character ${trackColor}-char">
                <div class="char-ear char-ear-l"></div>
                <div class="char-ear char-ear-r"></div>
                <div class="char-head">
                    <div class="char-eye eye-l"></div>
                    <div class="char-eye eye-r"></div>
                    <div class="char-mouth"></div>
                </div>
                <div class="char-body"></div>
                <div class="char-legs">
                    <div class="char-leg leg-l"></div>
                    <div class="char-leg leg-r"></div>
                </div>
            </div>
        </div>
        <div class="finish-marker">🏁</div>
    `;
    container.appendChild(laneDiv);

    // If we passed the threshold, retroactively compact all lanes
    if (totalPlayers === 9) {
        container.querySelectorAll('.race-lane').forEach(l => l.classList.add('lane-compact'));
    }
}

function updateConnectionCount() {
    const count = Object.keys(connections).length;
    const total = Object.keys(gameStatus).length;
    const el = document.getElementById('connected-count');
    if (el) el.innerText = `${count}/${total}`;
    
    // Hide waiting message once at least 1 team connects
    const wm = document.getElementById('waiting-msg');
    if (wm) {
        if (isTugOfWar) {
            wm.style.display = count >= 2 ? 'none' : 'flex';
        } else {
            wm.style.display = count > 0 ? 'none' : 'flex';
        }
    }
}

function updateScoreDisplay() {
    // Ya no actualizamos `#score-1` o `#score-2` porque se eliminaron
}

async function sendQuestionToTeam(teamId) {
    if (connections[teamId]) {
        if (isTugOfWar) {
            const teamNum = towTeamAssign[teamId];
            const qEl = document.getElementById(`hc-q-${teamNum}`);
            if (qEl) qEl.innerText = "Pensando... 🧠";
        }

        const ts = gameStatus[teamId];
        const q = await getUniqueQuestionAsync(teamId);
        ts.currentQuestion = q;
        ts.lastQuestionTime = Date.now();
        // Clear existing anti-pegado timer
        if (questionTimers[teamId]) clearTimeout(questionTimers[teamId]);
        // Start new anti-pegado timer
        questionTimers[teamId] = setTimeout(() => handleQuestionTimeout(teamId), QUESTION_TIMEOUT_S * 1000);
        
        // Get answer type from module
        const mod = window.QuestionModules[selectedSubject];
        const answerType = mod ? mod.answerType : 'numeric';
        const payload = { type: 'NEW_QUESTION', text: q.text, timeLimit: QUESTION_TIMEOUT_S, answerType: answerType };
        if (q.options) payload.options = q.options;
        
        if (isTugOfWar) {
            const teamNum = towTeamAssign[teamId];
            const qEl = document.getElementById(`hc-q-${teamNum}`);
            if (qEl) qEl.innerText = q.text;
            const iEl = document.getElementById(`hc-i-${teamNum}`);
            if (iEl) iEl.innerText = '_';
        }

        try {
            connections[teamId].send(payload);
        } catch (e) {
            console.warn(`Failed to send question to ${teamId}:`, e);
        }
    }
}

async function handleHostData(teamId, data) {
    if (data.type === 'REQUEST_NEW') {
        if (questionTimers[teamId]) { clearTimeout(questionTimers[teamId]); delete questionTimers[teamId]; }
        await sendQuestionToTeam(teamId);
        return;
    }
    if (data.type === 'ANSWER_SUBMIT') {
        // Clear anti-pegado timer
        if (questionTimers[teamId]) { clearTimeout(questionTimers[teamId]); delete questionTimers[teamId]; }
        const ts = gameStatus[teamId];
        if (!ts || !ts.currentQuestion) return;
        const correct = ts.currentQuestion.answer;
        const submitted = parseInt(data.value);

        if (submitted === correct) {
            // Track answer time
            const answerMs = ts.lastQuestionTime ? (Date.now() - ts.lastQuestionTime) : 9999;
            ts.totalAnswerTimeMs += answerMs;

            // ⚡ TURBO: answer under 3s = +2
            const isTurbo = answerMs < TURBO_TIME_MS;
            const points = isTurbo ? 2 : 1;
            ts.score = Math.min(ts.score + points, WINNING_SCORE);
            if (isTurbo) ts.turboCount += 1;

            ts.streak += 1;
            ts.consecutiveWrong = 0; // Reset consecutive wrong on correct
            if (ts.streak > ts.bestStreak) ts.bestStreak = ts.streak;

            // 📈 ADAPTIVE DIFFICULTY: increase at streak milestones
            let diffUp = false;
            if (ts.streak > 0 && ts.streak % DIFF_UP_STREAK === 0 && ts.difficultyLevel < 3) {
                ts.difficultyLevel += 1;
                diffUp = true;
            }

            // 🛡️ SHIELD: earned at streak 5
            let shieldEarned = false;
            if (ts.streak === SHIELD_STREAK) {
                ts.hasShield = true;
                shieldEarned = true;
            }

            if (isTugOfWar) {
                const teamNum = towTeamAssign[teamId];
                const iEl = document.getElementById(`hc-i-${teamNum}`);
                if (iEl) iEl.innerText = data.value;
                
                const calc = document.getElementById(`host-calc-${teamNum}`);
                if (calc) {
                    calc.classList.add('hc-correct-anim');
                    setTimeout(() => calc.classList.remove('hc-correct-anim'), 500);
                }

                // Efecto de tirar la cuerda
                const pull = (teamNum === 1) ? -TOW_PULL_STRENGTH : TOW_PULL_STRENGTH;
                towRopePos = Math.max(-100, Math.min(100, towRopePos + pull));
                
                // Trigger pull animation on BOTH characters
                const anchor1 = document.getElementById('tow-char-1');
                const anchor2 = document.getElementById('tow-char-2');
                if (teamNum === 1 && anchor1) {
                    anchor1.classList.add('pulling');
                    setTimeout(() => anchor1.classList.remove('pulling'), 400);
                } else if (teamNum === 2 && anchor2) {
                    anchor2.classList.add('pulling');
                    setTimeout(() => anchor2.classList.remove('pulling'), 400);
                }
            }

            updateAvatars();
            updateScoreDisplay();
            updateStreakDisplay();

            // 🎆 HOST SCREEN EPIC NOTIFICATIONS
            let notifDelay = 0;
            if (isTurbo) {
                showHostNotification('⚡ ¡TURBO! +2 ⚡', 'turbo', teamId);
                notifDelay = 800;
            }
            if (ts.streak === 3 || ts.streak === 5 || ts.streak === 7 || (ts.streak >= 10 && ts.streak % 5 === 0)) {
                setTimeout(() => showHostNotification(`🔥 ¡RACHA ×${ts.streak}!`, 'streak', teamId), notifDelay);
                notifDelay += 800;
            }
            if (shieldEarned) {
                setTimeout(() => showHostNotification('🛡️ ¡ESCUDO ACTIVADO!', 'shield', teamId), notifDelay);
                notifDelay += 800;
            }
            if (diffUp) {
                const diffNames = { 2: '¡NIVEL MEDIO!', 3: '¡NIVEL DIFÍCIL!' };
                setTimeout(() => showHostNotification(`📈 ${diffNames[ts.difficultyLevel] || '¡NIVEL UP!'}`, 'diffup', teamId), notifDelay);
            }

            try {
                connections[teamId].send({
                    type: 'CORRECT',
                    streak: ts.streak,
                    turbo: isTurbo,
                    points: points,
                    shieldEarned: shieldEarned,
                    hasShield: ts.hasShield,
                    difficulty: ts.difficultyLevel
                });
            } catch(e) { console.warn('Send CORRECT failed:', e); }

            const isWinner = isTugOfWar ? (Math.abs(towRopePos) >= 100) : (ts.score >= WINNING_SCORE);

            if (isWinner) {
                // VICTORY! Clear all timers
                Object.keys(questionTimers).forEach(k => { clearTimeout(questionTimers[k]); delete questionTimers[k]; });
                const elapsed = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

                Object.values(connections).forEach(c => {
                    try { c.send({ type: 'GAME_OVER', winner: teamId }); } catch(e) {}
                });
                showVictory(teamId, timeStr);

                if (typeof sendMetricsToGAS === "function") {
                    sendMetricsToGAS(teamId, timeStr);
                }
            } else {
                await sendQuestionToTeam(teamId);
            }
        } else {
            // 🛡️ SHIELD: blocks freeze
            if (ts.hasShield) {
                ts.hasShield = false;
                try { connections[teamId].send({ type: 'SHIELD_USED' }); } catch(e) {}
                showHostNotification('🛡️ ¡SALVADO!', 'shield-used', teamId);
                // No freeze, just send new question
                await sendQuestionToTeam(teamId);
            } else {
                try { connections[teamId].send({ type: 'FREEZE_PENALTY', seconds: 3 }); } catch(e) {}
            }

            // Log specific error
            ts.errorDetails.push({
                question: ts.currentQuestion.text,
                expected: correct,
                submitted: submitted,
                timeSpentMs: ts.lastQuestionTime ? (Date.now() - ts.lastQuestionTime) : 0
            });

            ts.streak = 0;
            ts.incorrect += 1;
            ts.consecutiveWrong += 1;

            // 📉 ADAPTIVE DIFFICULTY: decrease after consecutive wrong
            if (ts.consecutiveWrong >= DIFF_DOWN_MISS && ts.difficultyLevel > 1) {
                ts.difficultyLevel -= 1;
                ts.consecutiveWrong = 0;
                showHostNotification('📉 NIVEL AJUSTADO', 'diffdown', teamId);
            }
            updateStreakDisplay();
            
            if (isTugOfWar) {
                // En TOW una mala respuesta tira hacia el otro lado un poquito
                const teamNum = towTeamAssign[teamId];
                const pullBack = (teamNum === 1) ? (TOW_PULL_STRENGTH/2) : -(TOW_PULL_STRENGTH/2);
                towRopePos = Math.max(-100, Math.min(100, towRopePos + pullBack));
                updateAvatars();

                const calc = document.getElementById(`host-calc-${teamNum}`);
                if (calc) {
                    calc.classList.add('hc-wrong-anim');
                    setTimeout(() => calc.classList.remove('hc-wrong-anim'), 400);
                }

                // Mostrar respuesta fallida en el host
                const iEl = document.getElementById(`hc-i-${teamNum}`);
                if (iEl) {
                    iEl.innerText = data.value || 'X';
                    iEl.style.color = '#ef4444';
                    setTimeout(() => {
                        iEl.style.color = '';
                        iEl.innerText = '_';
                    }, 1000);
                }
            }
        }
    }
}

function updateAvatars() {
    if (isTugOfWar) {
        const rope = document.getElementById('tow-rope');
        if (rope) {
            // ropePos: -100 (team 1 wins) to +100 (team 2 wins)
            // Map to a reasonable percentage movement (max ±35%)
            const movePercent = towRopePos * 0.35;
            rope.style.transform = `translateX(${movePercent}%)`;
        }
        
        // Update score bar
        updateTOWScoreBar();
        
        // Tension indicator when close to winning
        const tensionEl = document.getElementById('tow-tension-text');
        if (tensionEl) {
            if (Math.abs(towRopePos) >= 70) {
                tensionEl.classList.remove('hidden');
                if (towRopePos <= -70) {
                    tensionEl.innerText = '⚡ ¡EQUIPO 1 CASI GANA! ⚡';
                    tensionEl.style.color = 'var(--accent-blue)';
                } else {
                    tensionEl.innerText = '⚡ ¡EQUIPO 2 CASI GANA! ⚡';
                    tensionEl.style.color = 'var(--accent-pink)';
                }
            } else {
                tensionEl.classList.add('hidden');
            }
        }
        
        // Add rope tension visual (red glow near victory)
        const ropeContainer = document.getElementById('tow-rope-container');
        if (ropeContainer) {
            if (Math.abs(towRopePos) >= 80) {
                ropeContainer.classList.add('rope-critical');
            } else if (Math.abs(towRopePos) >= 60) {
                ropeContainer.classList.add('rope-tense');
                ropeContainer.classList.remove('rope-critical');
            } else {
                ropeContainer.classList.remove('rope-tense', 'rope-critical');
            }
        }
    } else {
        for (let teamId in gameStatus) {
            const ts = gameStatus[teamId];
            const uiId = ts.uiId;
            const p = Math.min((ts.score / WINNING_SCORE) * 100, 100);
            const avatarEl = document.getElementById(`avatar-${uiId}`);
            const fillEl = document.getElementById(`progress-fill-${uiId}`);
            if (avatarEl) avatarEl.style.left = `${2 + p * 0.85}%`;
            if (fillEl) fillEl.style.width = `${p}%`;
        }
    }
}

function updateTOWScoreBar() {
    const leftFill = document.getElementById('tow-fill-left');
    const rightFill = document.getElementById('tow-fill-right');
    const leftLabel = document.getElementById('tow-score-left');
    const rightLabel = document.getElementById('tow-score-right');
    if (!leftFill || !rightFill) return;
    
    // towRopePos: negative = team 1 winning, positive = team 2 winning
    const team1Pct = Math.max(0, Math.round(-towRopePos));
    const team2Pct = Math.max(0, Math.round(towRopePos));
    
    leftFill.style.width = `${team1Pct / 2}%`;
    rightFill.style.width = `${team2Pct / 2}%`;
    
    if (leftLabel) leftLabel.innerText = `🔵 ${team1Pct}%`;
    if (rightLabel) rightLabel.innerText = `${team2Pct}% 🔴`;
}

function startTOWTimer() {
    if (towTimerInterval) clearInterval(towTimerInterval);
    const start = Date.now();
    towTimerInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - start) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const el = document.getElementById('tow-main-timer');
        if (el) el.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

// ==========================================
// STREAK DISPLAY (🔥)
// ==========================================
function updateStreakDisplay() {
    const diffLabels = { 1: '🟢', 2: '🟡', 3: '🔴' };
    for (let teamId in gameStatus) {
        const ts = gameStatus[teamId];
        const uiId = ts.uiId;
        const streak = ts.streak;
        const el = document.getElementById(`streak-${uiId}`);
        if (!el) continue;
        const diffIcon = diffLabels[ts.difficultyLevel] || '🟡';
        if (streak >= 2) {
            let fires = '🔥';
            if (streak >= 7) fires = '🔥🔥🔥';
            else if (streak >= 5) fires = '🔥🔥';
            el.innerText = `${fires}×${streak} ${diffIcon}`;
            el.classList.remove('hidden');
            el.classList.add('streak-pop');
            setTimeout(() => el.classList.remove('streak-pop'), 400);
        } else {
            el.innerText = diffIcon;
            el.classList.remove('hidden');
        }
    }
}

// ==========================================
// HOST EPIC NOTIFICATIONS
// ==========================================
function showHostNotification(text, type, teamId) {
    const container = document.getElementById('host-notifications');
    if (!container) return;
    const notif = document.createElement('div');
    const uiId = gameStatus[teamId] ? gameStatus[teamId].uiId : 0;
    notif.className = `host-notif notif-${type} notif-team-${uiId}`;
    notif.innerHTML = `<span class="notif-team">${teamId}</span><span class="notif-text">${text}</span>`;
    container.appendChild(notif);
    setTimeout(() => { if (notif.parentNode) notif.remove(); }, 3500);
}

// ==========================================
// ANTI-PEGADO TIMEOUT
// ==========================================
function handleQuestionTimeout(teamId) {
    delete questionTimers[teamId];
    const ts = gameStatus[teamId];
    if (!ts) return;
    // Reset streak (they got stuck) but no score penalty
    ts.streak = 0;
    updateStreakDisplay();
    // Notify buzzer
    if (connections[teamId]) {
        try { connections[teamId].send({ type: 'TIMEOUT' }); } catch(e) {}
    }
    // Epic notification on host
    showHostNotification('⚠️ ¡TIEMPO! ¡CAMBIO!', 'timeout', teamId);
    // Send new question after a brief delay
    setTimeout(async () => { await sendQuestionToTeam(teamId); }, 2500);
}

function showVictory(teamId, timeStr) {
    const vo = document.getElementById('victory-overlay');
    vo.classList.remove('hidden');
    vo.classList.add('active');
    document.getElementById('victory-text').innerText = '🎉 ¡VICTORIA! 🎉';
    
    let winnerName = teamId;
    if (isTugOfWar) {
        const teamNum = towTeamAssign[teamId];
        const hName = document.getElementById(`host-calc-${teamNum}`).querySelector('.hc-header');
        if (hName) winnerName = hName.innerText;
        else winnerName = `EQUIPO ${teamNum}`;
    }

    document.getElementById('victory-team').innerText = `${winnerName} gana en ${timeStr}`;
    launchConfetti();

    // Build post-race summary
    const summaryEl = document.getElementById('post-race-summary');
    if (summaryEl) {
        let html = '<div class="summary-grid">';
        for (let tId in gameStatus) {
            const ts = gameStatus[tId];
            const total = ts.score + ts.incorrect;
            const accuracy = total > 0 ? Math.round((ts.score / total) * 100) : 0;
            const avgTime = ts.score > 0 ? (ts.totalAnswerTimeMs / ts.score / 1000).toFixed(1) : '—';
            const isWinner = tId == teamId;
            html += `
                <div class="summary-card ${isWinner ? 'summary-winner' : ''} ${ts.uiId % 2 === 0 ? 'card-blue' : 'card-pink'}">
                    <div class="summary-team">${isWinner ? '🏆 ' : ''}${tId}</div>
                    <div class="summary-stats">
                        <div class="stat-row"><span class="stat-label">✅ Correctas</span><span class="stat-value">${ts.score}</span></div>
                        <div class="stat-row" style="cursor: pointer;" onclick="document.getElementById('report-${ts.uiId}').classList.toggle('hidden')"><span class="stat-label">❌ Incorrectas (Click Ver Detalles)</span><span class="stat-value">${ts.incorrect}</span></div>
                        <div class="stat-row"><span class="stat-label">🎯 Precisión</span><span class="stat-value">${accuracy}%</span></div>
                        <div class="stat-row"><span class="stat-label">🔥 Mejor racha</span><span class="stat-value">${ts.bestStreak}</span></div>
                        <div class="stat-row"><span class="stat-label">⚡ Turbos</span><span class="stat-value">${ts.turboCount}</span></div>
                        <div class="stat-row"><span class="stat-label">⏱️ Promedio</span><span class="stat-value">${avgTime}s</span></div>
                    </div>
                    <div id="report-${ts.uiId}" class="error-report hidden">
                        ${ts.errorDetails.length > 0 ? ts.errorDetails.map(err =>
                `<div class="error-item">
                                <b>P:</b> ${err.question}<br>
                                Su respuesta: <span style="color:#ff4444">${err.submitted || 'Nada'}</span> | Correcta: <span style="color:#39ff14">${err.expected}</span><br>
                                <small>⏱️ Tardó ${(err.timeSpentMs / 1000).toFixed(1)}s</small>
                            </div>`
            ).join('') : '<i>¡Perfecto! No hubo errores.</i>'}
                    </div>
                </div>`;
        }
        html += '</div>';
        summaryEl.innerHTML = html;
        summaryEl.classList.remove('hidden');
    }
}

// ==========================================
// CONFETTI ENGINE
// ==========================================
function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = [];
    const colors = ['#00e5ff', '#d946ef', '#39ff14', '#fbbf24', '#ff3366', '#00a2ff', '#f0abfc'];

    for (let i = 0; i < 200; i++) {
        pieces.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            w: Math.random() * 12 + 4,
            h: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rot: Math.random() * 360,
            vx: (Math.random() - 0.5) * 4,
            vy: Math.random() * 4 + 2,
            vr: (Math.random() - 0.5) * 8,
            opacity: 1
        });
    }

    let frames = 0;
    function animate() {
        if (frames > 300) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        pieces.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            p.vy += 0.05; // gravity
            if (frames > 200) p.opacity -= 0.01;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.globalAlpha = Math.max(0, p.opacity);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        frames++;
        requestAnimationFrame(animate);
    }
    animate();
}

// ==========================================
// BUZZER LOGIC — WITH RECONNECTION
// ==========================================
let buzzerTeamId = null;

function initBuzzerMode() {
    role = 'BUZZER';
    showScreen('buzzer-screen');
    document.getElementById('join-section').classList.remove('hidden');
    document.getElementById('gameplay-section').classList.add('hidden');
    document.getElementById('input-room-code').value = '';
    hideReconnectOverlay();
    setTimeout(() => document.getElementById('input-room-code').focus(), 100);
}

function joinRoom() {
    const code = document.getElementById('input-room-code').value.toUpperCase();
    const teamInput = document.getElementById('team-selector').value.trim();

    if (code.length !== 4) { showToast("El código debe tener 4 caracteres.", 'warning'); return; }
    if (!teamInput) { showToast("Por favor ingresa tu nombre.", 'warning'); return; }

    savedRoomCode = code;
    savedTeamId = teamInput;
    buzzerTeamId = teamInput;
    connectBuzzerToPeer(code, teamInput);
}

function connectBuzzerToPeer(code, team) {
    const hostPeerId = `mathrace-${code}`;

    // Destroy existing peer if any
    if (peer) { try { peer.destroy(); } catch(e) {} peer = null; }

    peer = new Peer(PEER_CONFIG);

    peer.on('open', () => {
        console.log('✅ Buzzer peer ready, connecting to host...');
        currentConnection = peer.connect(hostPeerId, {
            metadata: { team: team },
            reliable: true
        });

        currentConnection.on('open', () => {
            console.log('✅ Connected to host!');
            reconnectAttempts = 0;
            isReconnecting = false;
            hideReconnectOverlay();

            document.getElementById('join-section').classList.add('hidden');
            document.getElementById('gameplay-section').classList.remove('hidden');
            const th = document.getElementById('buzzer-team-name');
            th.innerText = `${team}`;
            th.className = `team-header team-blue-theme`;
            updateBuzzerConnectionStatus('connected');

            // Start buzzer-side heartbeat checker
            startBuzzerHeartbeatChecker();
        });

        currentConnection.on('data', (data) => handleBuzzerData(data));

        currentConnection.on('close', () => {
            console.warn('⚠️ Connection to host closed');
            updateBuzzerConnectionStatus('disconnected');
            attemptReconnect();
        });

        currentConnection.on('error', (err) => {
            console.error('Connection error:', err);
            updateBuzzerConnectionStatus('disconnected');
            attemptReconnect();
        });
    });

    peer.on('error', (err) => {
        console.error('Buzzer PeerJS error:', err);
        if (err.type === 'peer-unavailable') {
            showToast('Sala no encontrada. ¿Está el Host activo?', 'error');
            if (!isReconnecting) {
                hideReconnectOverlay();
            }
        } else if (err.type === 'network') {
            showToast('Error de red — verifica tu Wi-Fi', 'error');
            attemptReconnect();
        } else if (err.type === 'server-error') {
            showToast('Error del servidor — reintentando...', 'error');
            attemptReconnect();
        } else {
            if (isReconnecting) {
                attemptReconnect();
            } else {
                showToast(`Error de conexión: ${err.type || 'desconocido'}`, 'error');
            }
        }
    });

    peer.on('disconnected', () => {
        console.warn('Buzzer disconnected from PeerJS server');
        updateBuzzerConnectionStatus('disconnected');
        attemptReconnect();
    });
}

function handleBuzzerData(data) {
    // Handle heartbeat
    if (data.type === 'PING') {
        lastHostPing = Date.now();
        if (currentConnection) {
            try { currentConnection.send({ type: 'PONG' }); } catch(e) {}
        }
        return;
    }

    // Handle assigned name (for duplicate resolution)
    if (data.type === 'ASSIGNED_NAME') {
        buzzerTeamId = data.name;
        savedTeamId = data.name;
        const th = document.getElementById('buzzer-team-name');
        if (th) th.innerText = data.name;
        return;
    }

    // Handle team assignment (1 or 2)
    if (data.type === 'TEAM_ASSIGNED') {
        const teamNum = data.teamNum;
        const th = document.getElementById('buzzer-team-name');
        if (th) {
            th.className = `team-header team-${teamNum === 1 ? 'blue' : 'pink'}-theme`;
            th.innerText = `${buzzerTeamId} — EQUIPO ${teamNum}`;
        }
        showToast(`Asignado al Equipo ${teamNum}`, teamNum === 1 ? 'info' : 'success');
        return;
    }

    if (data.type === 'NEW_QUESTION') {
        document.getElementById('buzzer-question-display').innerText = data.text;
        clearNum();
        startBuzzerCountdown(data.timeLimit || QUESTION_TIMEOUT_S);
        // Switch between numpad and multiple-choice
        const numpad = document.getElementById('numpad-container');
        const optionsEl = document.getElementById('options-container');
        const answerBar = document.querySelector('.answer-bar');
        if (data.answerType === 'multiple-choice' && data.options) {
            numpad.classList.add('hidden');
            answerBar.classList.add('hidden');
            optionsEl.classList.remove('hidden');
            data.options.forEach((opt, i) => {
                const el = document.getElementById(`opt-text-${i + 1}`);
                if (el) el.innerText = opt;
            });
        } else {
            numpad.classList.remove('hidden');
            answerBar.classList.remove('hidden');
            optionsEl.classList.add('hidden');
        }
    }
    if (data.type === 'CORRECT') {
        stopBuzzerCountdown();
        showCorrectFlash();
        const th = document.getElementById('buzzer-team-name');
        let headerText = `${buzzerTeamId}`;

        // Show turbo flash
        if (data.turbo) {
            headerText = `⚡ TURBO! +${data.points} ⚡`;
            th.style.background = 'linear-gradient(90deg, #ff9100, #ffd700)';
            th.style.color = '#000';
            setTimeout(() => {
                th.style.background = '';
                th.style.color = '';
            }, 1200);
        }

        // Show shield earned
        if (data.shieldEarned) {
            setTimeout(() => {
                th.innerText = '🛡️ ¡ESCUDO ACTIVADO! 🛡️';
                th.style.background = 'linear-gradient(90deg, #00b4ff, #00e5ff)';
                th.style.color = '#000';
                setTimeout(() => {
                    th.style.background = '';
                    th.style.color = '';
                    th.innerText = `EQUIPO ${buzzerTeamId} 🛡️`;
                }, 1500);
            }, data.turbo ? 1300 : 0);
        }

        // Show streak + shield indicator
        if (data.streak && data.streak >= 2) {
            let fires = '🔥';
            if (data.streak >= 7) fires = '🔥🔥🔥';
            else if (data.streak >= 5) fires = '🔥🔥';
            headerText = `${buzzerTeamId} ${fires}×${data.streak}`;
            if (data.hasShield) headerText += ' 🛡️';
        }

        if (!data.turbo && !data.shieldEarned) {
            th.innerText = headerText;
        } else if (!data.shieldEarned) {
            th.innerText = headerText;
            setTimeout(() => {
                let restoreText = `${buzzerTeamId}`;
                if (data.streak >= 2) {
                    let f = '🔥';
                    if (data.streak >= 7) f = '🔥🔥🔥';
                    else if (data.streak >= 5) f = '🔥🔥';
                    restoreText += ` ${f}×${data.streak}`;
                }
                if (data.hasShield) restoreText += ' 🛡️';
                th.innerText = restoreText;
            }, 1200);
        }
    }
    if (data.type === 'SHIELD_USED') {
        stopBuzzerCountdown();
        // Shield blocked the freeze!
        const th = document.getElementById('buzzer-team-name');
        th.innerText = '🛡️ ¡ESCUDO USADO! ¡SALVADO! 🛡️';
        th.style.background = 'linear-gradient(90deg, #39ff14, #00e5ff)';
        th.style.color = '#000';
        setTimeout(() => {
            th.style.background = '';
            th.style.color = '';
            th.innerText = `${buzzerTeamId}`;
        }, 2000);
    }
    if (data.type === 'FREEZE_PENALTY') {
        stopBuzzerCountdown();
        applyFreeze(data.seconds);
    }
    if (data.type === 'TIMEOUT') {
        stopBuzzerCountdown();
        clearNum();
        const tOverlay = document.getElementById('timeout-overlay');
        tOverlay.classList.remove('hidden');
        setTimeout(() => {
            tOverlay.classList.add('hidden');
        }, 2500);
    }
    if (data.type === 'GAME_OVER') {
        stopBuzzerCountdown();
        stopBuzzerHeartbeatChecker();
        const isWinner = data.winner == buzzerTeamId;
        document.getElementById('buzzer-question-display').innerText =
            isWinner ? "🏆 ¡GANASTE! 🏆" : "😓 FIN DEL JUEGO";
        if (isWinner) {
            document.querySelector('.buzzer-question').style.color = '#fbbf24';
        }
    }
}

// ==========================================
// RECONNECTION ENGINE
// ==========================================
function attemptReconnect() {
    if (isReconnecting) return; // Already trying
    if (!savedRoomCode || !savedTeamId) return; // No saved info to reconnect with
    if (role !== 'BUZZER') return; // Only buzzers reconnect

    isReconnecting = true;
    reconnectAttempts = 0;
    showReconnectOverlay();
    doReconnectAttempt();
}

function doReconnectAttempt() {
    if (!isReconnecting) return;
    reconnectAttempts++;

    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        // Give up after max attempts
        isReconnecting = false;
        hideReconnectOverlay();
        showToast('No se pudo reconectar. Intenta unirte de nuevo.', 'error', 5000);
        // Show join section so they can retry manually
        document.getElementById('join-section').classList.remove('hidden');
        document.getElementById('gameplay-section').classList.add('hidden');
        return;
    }

    const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(1.5, reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
    console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${Math.round(delay)}ms`);
    updateReconnectOverlay(reconnectAttempts, MAX_RECONNECT_ATTEMPTS);

    reconnectTimer = setTimeout(() => {
        if (!isReconnecting) return;
        connectBuzzerToPeer(savedRoomCode, savedTeamId);
    }, delay);
}

function showReconnectOverlay() {
    const overlay = document.getElementById('reconnect-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function hideReconnectOverlay() {
    const overlay = document.getElementById('reconnect-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function updateReconnectOverlay(attempt, max) {
    const el = document.getElementById('reconnect-attempt-text');
    if (el) el.innerText = `Intento ${attempt} de ${max}...`;
}

function cancelReconnect() {
    isReconnecting = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    hideReconnectOverlay();
    goLobby();
}

// ==========================================
// BUZZER HEARTBEAT CHECKER
// ==========================================
function startBuzzerHeartbeatChecker() {
    stopBuzzerHeartbeatChecker();
    lastHostPing = Date.now();
    buzzerHeartbeatChecker = setInterval(() => {
        const elapsed = Date.now() - lastHostPing;
        if (elapsed > BUZZER_HEARTBEAT_TIMEOUT_MS) {
            console.warn(`💀 No host ping for ${Math.round(elapsed/1000)}s, attempting reconnect...`);
            stopBuzzerHeartbeatChecker();
            updateBuzzerConnectionStatus('disconnected');
            attemptReconnect();
        }
    }, 5000);
}

function stopBuzzerHeartbeatChecker() {
    if (buzzerHeartbeatChecker) { clearInterval(buzzerHeartbeatChecker); buzzerHeartbeatChecker = null; }
}

// ==========================================
// BUZZER CONNECTION STATUS INDICATOR
// ==========================================
function updateBuzzerConnectionStatus(status) {
    const indicator = document.getElementById('buzzer-conn-status');
    if (!indicator) return;
    const labels = {
        connected: '🟢 Conectado',
        disconnected: '🔴 Desconectado',
        reconnecting: '🟡 Reconectando...'
    };
    indicator.textContent = labels[status] || '⚪ Desconocido';
    indicator.className = `buzzer-conn-status conn-${status}`;
}

// ==========================================
// NUMPAD
// ==========================================
function getAnswerInput() { return document.getElementById('answer-input'); }

function appendNum(num) {
    const inp = getAnswerInput();
    if (inp.value.length < 6) inp.value += num;
}

function appendNeg() {
    const inp = getAnswerInput();
    if (inp.value.startsWith('-')) {
        inp.value = inp.value.substring(1);
    } else {
        inp.value = '-' + inp.value;
    }
}

function clearNum() { getAnswerInput().value = ''; }

function submitAnswer() {
    const inp = getAnswerInput();
    if (!inp.value || !currentConnection) return;
    try {
        currentConnection.send({ type: 'ANSWER_SUBMIT', value: inp.value });
    } catch (e) {
        showToast('Error al enviar respuesta', 'error');
    }
}

function submitOption(num) {
    if (!currentConnection) return;
    try {
        currentConnection.send({ type: 'ANSWER_SUBMIT', value: String(num) });
    } catch (e) {
        showToast('Error al enviar respuesta', 'error');
    }
}

// ==========================================
// VISUAL FEEDBACK (Buzzer)
// ==========================================
function applyFreeze(seconds) {
    const overlay = document.getElementById('freeze-overlay');
    const timer = document.getElementById('freeze-timer');
    overlay.classList.remove('hidden');
    clearNum();
    let remaining = seconds;
    timer.innerText = remaining;

    const interval = setInterval(() => {
        remaining--;
        timer.innerText = remaining;
        if (remaining <= 0) {
            clearInterval(interval);
            overlay.classList.add('hidden');
            if (currentConnection) {
                try { currentConnection.send({ type: 'REQUEST_NEW' }); } catch(e) {}
            }
        }
    }, 1000);
}

function showCorrectFlash() {
    const flash = document.getElementById('correct-flash');
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 600);
}

// ==========================================
// BUZZER COUNTDOWN TIMER
// ==========================================
let buzzerCountdownInterval = null;

function startBuzzerCountdown(seconds) {
    stopBuzzerCountdown();
    const container = document.getElementById('countdown-container');
    const bar = document.getElementById('countdown-bar');
    const urgentEl = document.getElementById('countdown-urgent');
    const numEl = document.getElementById('countdown-number');
    if (!container || !bar) return;

    container.classList.remove('hidden');
    urgentEl.classList.add('hidden');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    bar.className = 'countdown-fill';
    bar.offsetHeight; // force reflow
    bar.style.transition = `width ${seconds}s linear`;
    bar.style.width = '0%';

    let remaining = seconds;
    buzzerCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 15 && remaining > 0) {
            urgentEl.classList.remove('hidden');
            numEl.innerText = remaining;
        }
        if (remaining <= 10) {
            bar.classList.add('countdown-urgent');
            urgentEl.classList.remove('countdown-critical-num');
        }
        if (remaining <= 5) {
            bar.classList.add('countdown-critical');
            urgentEl.classList.add('countdown-critical-num');
        }
        if (remaining <= 0) {
            clearInterval(buzzerCountdownInterval);
            buzzerCountdownInterval = null;
        }
    }, 1000);
}

function stopBuzzerCountdown() {
    if (buzzerCountdownInterval) {
        clearInterval(buzzerCountdownInterval);
        buzzerCountdownInterval = null;
    }
    const container = document.getElementById('countdown-container');
    const bar = document.getElementById('countdown-bar');
    const urgentEl = document.getElementById('countdown-urgent');
    if (container) container.classList.add('hidden');
    if (bar) { bar.style.width = '100%'; bar.style.transition = 'none'; bar.className = 'countdown-fill'; }
    if (urgentEl) { urgentEl.classList.add('hidden'); urgentEl.classList.remove('countdown-critical-num'); }
}

// ==========================================
// DEMO / TEST MODE (Internal Testing)
// ==========================================
let demoInterval = null;
let demoRunning = false;

function startDemoMode() {
    if (demoRunning) {
        stopDemoMode();
        return;
    }
    
    demoRunning = true;
    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
        demoBtn.innerText = '⏹ PARAR DEMO';
        demoBtn.classList.add('demo-active');
    }
    
    // Read selected level and subject
    const levelSelect = document.getElementById('level-selector');
    if (levelSelect) selectedLevel = levelSelect.value;
    const subjectSelect = document.getElementById('subject-selector');
    if (subjectSelect) selectedSubject = subjectSelect.value;

    // Set up fake teams
    const team1Name = 'DemoAzul';
    const team2Name = 'DemoRosa';
    
    if (!gameStatus[team1Name]) {
        gameStatus[team1Name] = {
            score: 0, currentQuestion: null, streak: 0, bestStreak: 0,
            incorrect: 0, totalAnswerTimeMs: 0, lastQuestionTime: 0,
            hasShield: false, turboCount: 0, difficultyLevel: 2,
            consecutiveWrong: 0, errorDetails: [], uiId: 1
        };
        seenQuestions[team1Name] = new Set();
        towTeamAssign[team1Name] = 1;
    }
    if (!gameStatus[team2Name]) {
        gameStatus[team2Name] = {
            score: 0, currentQuestion: null, streak: 0, bestStreak: 0,
            incorrect: 0, totalAnswerTimeMs: 0, lastQuestionTime: 0,
            hasShield: false, turboCount: 0, difficultyLevel: 2,
            consecutiveWrong: 0, errorDetails: [], uiId: 2
        };
        seenQuestions[team2Name] = new Set();
        towTeamAssign[team2Name] = 2;
    }
    
    // Update headers
    const h1 = document.querySelector('#host-calc-1 .hc-header');
    const h2 = document.querySelector('#host-calc-2 .hc-header');
    if (h1) h1.innerText = team1Name.toUpperCase();
    if (h2) h2.innerText = team2Name.toUpperCase();
    
    // Hide waiting msg
    const wm = document.getElementById('waiting-msg');
    if (wm) wm.style.display = 'none';
    
    if (!gameStartTime) {
        gameStartTime = Date.now();
        startTOWTimer();
    }
    
    showToast('🧪 Modo Demo iniciado — simulando partida', 'success');
    
    // Generate initial questions
    demoShowQuestion(team1Name, 1);
    demoShowQuestion(team2Name, 2);
    
    // Simulate game at random intervals
    let turnCounter = 0;
    demoInterval = setInterval(() => {
        if (!demoRunning) return;
        
        turnCounter++;
        const activeTeamName = turnCounter % 2 === 1 ? team1Name : team2Name;
        const teamNum = towTeamAssign[activeTeamName];
        const isCorrect = Math.random() > 0.35; // 65% chance correct
        
        const ts = gameStatus[activeTeamName];
        if (!ts.currentQuestion) {
            ts.currentQuestion = getUniqueQuestion(activeTeamName);
        }
        
        const calc = document.getElementById(`host-calc-${teamNum}`);
        
        if (isCorrect) {
            const answerMs = Math.floor(Math.random() * 5000) + 1000;
            ts.totalAnswerTimeMs += answerMs;
            
            const isTurbo = answerMs < TURBO_TIME_MS;
            const points = isTurbo ? 2 : 1;
            ts.score += points;
            if (isTurbo) ts.turboCount += 1;
            ts.streak += 1;
            ts.consecutiveWrong = 0;
            if (ts.streak > ts.bestStreak) ts.bestStreak = ts.streak;
            
            // Pull rope
            const pull = (teamNum === 1) ? -TOW_PULL_STRENGTH : TOW_PULL_STRENGTH;
            towRopePos = Math.max(-100, Math.min(100, towRopePos + pull));
            
            // Show on calc
            const iEl = document.getElementById(`hc-i-${teamNum}`);
            if (iEl) iEl.innerText = ts.currentQuestion.answer;
            
            if (calc) {
                calc.classList.add('hc-correct-anim');
                setTimeout(() => calc.classList.remove('hc-correct-anim'), 500);
            }
            
            // Pull animation
            const anchor = document.getElementById(`tow-char-${teamNum}`);
            if (anchor) {
                anchor.classList.add('pulling');
                setTimeout(() => anchor.classList.remove('pulling'), 400);
            }
            
            // Notifications
            if (isTurbo) showHostNotification('⚡ ¡TURBO! +2 ⚡', 'turbo', activeTeamName);
            if (ts.streak >= 3 && ts.streak % 2 === 1) {
                showHostNotification(`🔥 ¡RACHA ×${ts.streak}!`, 'streak', activeTeamName);
            }
        } else {
            ts.streak = 0;
            ts.incorrect += 1;
            ts.consecutiveWrong += 1;
            
            // Pull back
            const pullBack = (teamNum === 1) ? (TOW_PULL_STRENGTH / 2) : -(TOW_PULL_STRENGTH / 2);
            towRopePos = Math.max(-100, Math.min(100, towRopePos + pullBack));
            
            if (calc) {
                calc.classList.add('hc-wrong-anim');
                setTimeout(() => calc.classList.remove('hc-wrong-anim'), 400);
            }
            
            const iEl = document.getElementById(`hc-i-${teamNum}`);
            if (iEl) {
                iEl.innerText = 'X';
                iEl.style.color = '#ef4444';
                setTimeout(() => { iEl.style.color = ''; iEl.innerText = '_'; }, 800);
            }
        }
        
        updateAvatars();
        
        // Generate new question
        demoShowQuestion(activeTeamName, teamNum);
        
        // Check victory
        if (Math.abs(towRopePos) >= 100) {
            const winner = towRopePos <= -100 ? team1Name : team2Name;
            const elapsed = gameStartTime ? Math.round((Date.now() - gameStartTime) / 1000) : 0;
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            showVictory(winner, `${mins}:${secs.toString().padStart(2, '0')}`);
            stopDemoMode();
        }
        
    }, 1800); // Every 1.8 seconds
}

function demoShowQuestion(teamName, teamNum) {
    const q = getUniqueQuestion(teamName);
    gameStatus[teamName].currentQuestion = q;
    gameStatus[teamName].lastQuestionTime = Date.now();
    
    const qEl = document.getElementById(`hc-q-${teamNum}`);
    if (qEl) qEl.innerText = q.text;
    const iEl = document.getElementById(`hc-i-${teamNum}`);
    if (iEl) iEl.innerText = '_';
}

function stopDemoMode() {
    demoRunning = false;
    if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
        demoBtn.innerText = '🧪 DEMO';
        demoBtn.classList.remove('demo-active');
    }
}
