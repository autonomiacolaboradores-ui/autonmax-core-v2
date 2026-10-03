let currentMode = 'consumer';
let isVisible = true;
let userAccount = null;
let splashTimeout = null;

// Sprint 9 — Estado de Onboarding & Subscription
let subscriptionStatus = null;    // Objeto retornado por checkAccessStatus
let selectedAccountType = 'PERSONAL'; // 'PERSONAL' | 'BUSINESS' — salvo na escolha da tela de boas-vindas

let recognition = null;
let isRecording = false;

// Estado do Onboarding Executivo do Max
let maxConfig = null;
let currentOnboardingStep = 1;
let onboardingData = {
  catalogChoice: '',
  catalogItems: [],
  workingHours: '',
  policies: '',
  tone: ''
};

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'pt-BR';

    recognition.onresult = function(event) {
        const text = event.results[0][0].transcript;
        const input = document.getElementById('userInputDash') || document.getElementById('userInput');
        if (input) input.value = text;
        
        const wavesLabel = document.getElementById('audioWavesLabel');
        if (wavesLabel) wavesLabel.innerText = 'Transcrição concluída! Processando...';

        setTimeout(() => {
            toggleVoice();
            sendMessageDash();
        }, 400);
    };

    recognition.onerror = function(err) {
        console.warn('Speech Recognition Error:', err);
        toggleVoice();
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 1. GOOGLE OAUTH2 LOCKSCREEN & ONBOARDING SOBERANO
// ══════════════════════════════════════════════════════════════════════════

async function executeGoogleLogin() {
    return new Promise((resolve) => {
        const calendarConsent = true; // Forçado para MVP pois a checkbox da UI foi removida
        let scopes = 'openid email profile';
        if (calendarConsent) {
            scopes += ' https://www.googleapis.com/auth/calendar.events';
        }

        const initGsi = () => {
            const client = google.accounts.oauth2.initCodeClient({
                client_id: '472981274200-lbikqds3selukhlk8r0fsar786h8vt2v.apps.googleusercontent.com',
                scope: scopes,
                ux_mode: 'popup',
                access_type: 'offline',
                prompt: 'consent',
                callback: async (response) => {
                    if (response.error) {
                        console.error('Google Login Error:', response.error);
                        resolve();
                        return;
                    }
                    try {
                        const res = await fetch('/api/v1/auth/google', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ code: response.code })
                        });
                        const data = await res.json();
                        
                        if (data && data.user) {
                            userAccount = data.user;
                            const token = data.sessionToken || data.token;
                            if (token) {
                                localStorage.setItem('x-session-token', token);
                                window.sessionToken = token; // Define no estado global do app
                            }
                        }
                    } catch (e) {
                        console.error('Backend Login Error:', e);
                    }
                    
                    const lock = document.getElementById('googleLockscreen');
                    if (lock) lock.style.display = 'none';
                    const welcomeOverlay = document.getElementById('welcomeOverlay') || document.getElementById('welcomeScreen');
                    if (welcomeOverlay) welcomeOverlay.classList.add('is-hidden');
                    
                    resolve();
                }
            });
            client.requestCode();
        };

        const checkAndInit = (attempts = 0) => {
            if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                initGsi();
            } else if (attempts < 15) {
                // Aguarda o script carregar da tag <head> (máx 7.5s)
                setTimeout(() => checkAndInit(attempts + 1), 500);
            } else {
                console.error('Falha ao carregar Google Identity Services a tempo.');
                alert('Falha ao carregar o login do Google. Por favor, verifique sua conexão e tente novamente.');
                resolve();
            }
        };

        checkAndInit();
    });
}

// ══════════════════════════════════════════════════════════════════════════
// 1.5. NATIVE AUTH (Desvio Provisório)
// ══════════════════════════════════════════════════════════════════════════
window.handleNativeLogin = async (isRegister) => {
    const email = document.getElementById('nativeAuthEmail')?.value;
    const password = document.getElementById('nativeAuthPassword')?.value;
    const feedback = document.getElementById('nativeAuthFeedback');
    
    if (!email || !password) {
        if(feedback) { feedback.innerText = 'Preencha e-mail e senha'; feedback.style.display = 'block'; }
        return;
    }
    
    try {
        const endpoint = isRegister ? '/api/v1/auth/native/register' : '/api/v1/auth/native/login';
        const payload = { email, password, name: isRegister ? email.split('@')[0] : undefined };
        
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok && data.success) {
            userAccount = data.user;
            const token = data.token;
            if (token) {
                localStorage.setItem('x-session-token', token);
                window.sessionToken = token;
            }
            if(feedback) feedback.style.display = 'none';
            
            // Avança jornada recarregando a página para garantir a montagem limpa do Painel PME (fix mobile)
            window.location.reload();
        } else {
            if(feedback) { feedback.innerText = data.error || 'Erro na autenticação'; feedback.style.display = 'block'; }
        }
    } catch (e) {
        console.error('Native Auth Error:', e);
        if(feedback) { feedback.innerText = 'Erro ao conectar ao servidor'; feedback.style.display = 'block'; }
    }
};

// ══════════════════════════════════════════════════════════════════════════
// 2. WELCOMING SPLASH VIDEO (10s)
// ══════════════════════════════════════════════════════════════════════════

function startWelcomingSplash() {
    const welcome = document.getElementById('welcomeOverlay');
    if (welcome) welcome.style.display = 'none';

    skipSplashIntro();
}

function switchMainView(targetTab) {
    UI_STATE.showMainApp();
    const el = document.getElementById('viewAttendant');
    if (el) el.classList.remove('is-hidden');
    
    const btn = document.getElementById('tabBtnAttendant');
    if (btn) btn.classList.add('active');
    
    if (typeof renderAttendantState === 'function') renderAttendantState();
    if (window.PmeEngineV2) window.PmeEngineV2.load();
    if (window.lucide) lucide.createIcons();
}

function skipSplashIntro() {
    if (splashTimeout) {
        clearTimeout(splashTimeout);
        splashTimeout = null;
    }
    const welcome = document.getElementById('welcomeOverlay');
    if (welcome) welcome.classList.add('is-hidden');

    // Garante que o mainApp fique oculto enquanto escolhemos
    const mainApp = document.getElementById('mainApp');
    if (mainApp) mainApp.classList.add('is-hidden');

    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) {
        welcomeScreen.classList.remove('is-hidden');
    } else {
        switchMainView('ATTENDANT');
    }
}

function startAppJourney() {
    console.log('[AUTON.MAX] Iniciando jornada do app sem recursão...');
    const welcome = document.getElementById('welcomeOverlay');
    if (welcome) welcome.classList.add('is-hidden');

    skipSplashIntro();
}

// Vinculação Global Direta sem Encapsulamento Recursivo
window.startAppJourney = startAppJourney;
window.skipSplashIntro = skipSplashIntro;
window.switchMainView = switchMainView;

// Botão "Painel de Configurações" sempre visível — decide o fluxo conforme estado do usuário
function goToEmpresaMode() {
    document.querySelectorAll('.tab-section, .attendant-view-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    const btnAtt = document.getElementById('tabBtnAttendant');
    if(btnAtt) btnAtt.classList.add('active');

    const isParceiro = (typeof isPmeAuthenticated !== 'undefined' && isPmeAuthenticated) ||
                       (userAccount && userAccount.is_partner);
    if (isParceiro) {
        document.getElementById('viewAttendant').style.display = 'block';
        switchMainView('ATTENDANT');
    } else {
        openPartnerAuthModal();
    }
}
window.goToEmpresaMode = goToEmpresaMode;

const hideElement = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('is-hidden');
        el.style.display = '';
        el.removeAttribute('style');
    }
};

const showElement = (id) => {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('is-hidden');
        el.style.display = '';
    }
};

const UI_STATE = {
    showOnboarding: () => {
        showElement('welcomeScreen');
        hideElement('mainApp');
    },
    showProfileSelect: function() { this.showOnboarding(); },
    showAuth: function() { this.showOnboarding(); },
    showMainApp: () => {
        hideElement('welcomeScreen');
        showElement('mainApp');
    },
    showMain: function() { this.showMainApp(); }
};
window.UI_STATE = UI_STATE;

// ══════════════════════════════════════════════════════════════════════
// Sprint 9 — ONBOARDING & SUBSCRIPTION HANDLERS
// ══════════════════════════════════════════════════════════════════════

/**
 * Chamado ao clicar em "Para Meu Uso Pessoal" ou "Para Meu Negócio / Empresa".
 * Salva o tipo de conta escolhido, executa o login Google, registra o onboarding
 * e verifica o status da subscription antes de liberar o app.
 *
 * @param {'PERSONAL'|'BUSINESS'} accountType
 */
async function handleAuthChoice(accountType) {
    try {
        // 1. Salvar o tipo de conta escolhido
        selectedAccountType = accountType || 'PERSONAL';

        // 2. Executar o login Google (mock ou real)
        await executeGoogleLogin();

        const token = localStorage.getItem('x-session-token') || window.sessionToken;
        if (!token || !userAccount) {
            console.warn('[AUTH_CHOICE] Login não concluído ou cancelado.');
            UI_STATE.showOnboarding();
            return;
        }

        // 3. Definir o displayName baseado no tipo de conta
        const rawDisplayName = (selectedAccountType === 'BUSINESS' && userAccount.store_name)
            ? userAccount.store_name
            : (userAccount.name || userAccount.email || 'Usuário AutonMax');

        // 4. Chamar o endpoint de onboarding para iniciar o Trial no banco
        try {
            await fetch('/api/v1/auth/google/onboarding', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-session-token': token
                },
                body: JSON.stringify({
                    userId: userAccount.id,
                    accountType: selectedAccountType,
                    displayName: rawDisplayName,
                    email: userAccount.email
                })
            });
        } catch (err) {
            console.warn('[SPRINT9] Falha ao registrar onboarding:', err.message);
        }

        // 5. Atualizar o nome no header imediatamente com os dados do login
        updateHeaderLicense(null, rawDisplayName);

        // 6. Verificar o status da subscription (Trial ativo? Expirado?)
        await checkSubscriptionStatus();

        // 7. Transição segura para MainApp somente após sucesso autenticado
        UI_STATE.showMainApp();
        if (typeof switchMainView === 'function') switchMainView('ATTENDANT');
    } catch (e) {
        console.error('[AUTH_CHOICE] Falha no fluxo de login:', e);
        UI_STATE.showOnboarding();
    }
}

/**
 * Consulta o servidor e decide se libera o app ou exibe o modal de trava.
 */
async function checkSubscriptionStatus() {
    if (!userAccount) {
        switchMainView('ATTENDANT');
        return;
    }

    try {
        const token = localStorage.getItem('x-session-token') || '';
        const url = token
            ? '/api/v1/subscription/status'
            : `/api/v1/subscription/status?userId=${encodeURIComponent(userAccount.id)}`;

        const res = await fetch(url, {
            headers: token ? { 'x-session-token': token } : {}
        });
        const data = await res.json();

        if (data && data.access) {
            subscriptionStatus = data.access;
            updateHeaderLicense(subscriptionStatus);

            if (!subscriptionStatus.allowed) {
                // Licença expirada — exibir modal de trava
                const lockModal = document.getElementById('subscriptionLockModal');
                if (lockModal) lockModal.style.display = 'flex';
                return;
            }
        }
    } catch (err) {
        console.warn('[SPRINT9] Falha ao verificar subscription, liberando acesso:', err.message);
    }

    // Licença válida (ou erro na verificação) — liberar o app
    switchMainView('ATTENDANT');
}

/**
 * Ativa a licença com o código AUTON-XXXXX recebido no WhatsApp.
 */
async function activateLicense() {
    const input = document.getElementById('activationCodeInput');
    const activationCode = input ? input.value.trim() : '';

    if (!activationCode) {
        alert('Por favor, cole o Código de Ativação recebido no WhatsApp.');
        return;
    }

    if (!userAccount) {
        alert('Nenhuma conta de usuário encontrada. Reinicie o aplicativo.');
        return;
    }

    const btn = document.getElementById('btnActivateLicense');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Verificando...';
    }

    try {
        const res = await fetch('/api/v1/subscription/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userAccount.id,
                activationCode
            })
        });
        const data = await res.json();

        if (data && data.success && data.access && data.access.allowed) {
            subscriptionStatus = data.access;
            updateHeaderLicense(subscriptionStatus);

            // Fechar o modal de trava
            const lockModal = document.getElementById('subscriptionLockModal');
            if (lockModal) lockModal.style.display = 'none';

            // Limpar o campo
            if (input) input.value = '';

            // Liberar o app
            switchMainView('ATTENDANT');
        } else {
            const errorMsg = (data && data.error) || 'Código inválido. Verifique e tente novamente.';
            alert(errorMsg);
        }
    } catch (err) {
        alert('Erro de conexão ao ativar a licença. Tente novamente.');
        console.error('[SPRINT9] activateLicense error:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Ativar Licença Agora';
        }
    }
}

/**
 * Atualiza os elementos do header com o nome do usuário e o badge de licença.
 *
 * @param {object|null} access  - Objeto retornado por checkAccessStatus (pode ser null)
 * @param {string|null} nameOverride - Nome a forçar (usado antes da chamada ao servidor)
 */
let _isUpdatingHeader = false;
function updateHeaderLicense(access, nameOverride) {
    if (_isUpdatingHeader) return;
    _isUpdatingHeader = true;
    try {
        const badgeEl = document.getElementById('headerLicenseBadge');
        const legacyNameEl = document.getElementById('userNameText');

        // Determinar o nome a exibir
        const displayName = nameOverride
            || (access && access.displayName)
            || (userAccount && userAccount.name)
            || '';

        // Atualizar o chip de perfil com avatar
        if (displayName && legacyNameEl) {
            legacyNameEl.textContent = displayName;
        }

        // Determinar o texto do badge de licença
        if (access && badgeEl) {
            if (access.status === 'trial' && access.allowed) {
                badgeEl.textContent = `Trial: ${access.daysRemaining} dia${access.daysRemaining !== 1 ? 's' : ''}`;
                badgeEl.style.display = 'flex';
                badgeEl.style.background = 'rgba(255, 180, 0, 0.15)';
                badgeEl.style.color = '#ffb400';
                badgeEl.style.border = '1px solid rgba(255, 180, 0, 0.4)';
            } else if (access.status === 'active' && access.allowed) {
                badgeEl.textContent = 'Licença Ativa ✔';
                badgeEl.style.display = 'flex';
                badgeEl.style.background = 'rgba(0, 200, 100, 0.15)';
                badgeEl.style.color = '#00c864';
                badgeEl.style.border = '1px solid rgba(0, 200, 100, 0.4)';
            } else if (access.status === 'expired') {
                badgeEl.textContent = 'Licença Expirada';
                badgeEl.style.display = 'flex';
                badgeEl.style.background = 'rgba(255, 50, 80, 0.15)';
                badgeEl.style.color = '#ff3250';
                badgeEl.style.border = '1px solid rgba(255, 50, 80, 0.4)';
            }
        }
    } finally {
        setTimeout(() => { _isUpdatingHeader = false; }, 1000);
    }
}

// Expor funções Sprint 9 globalmente
window.handleAuthChoice = handleAuthChoice;
window.activateLicense  = activateLicense;
window.checkSubscriptionStatus = checkSubscriptionStatus;
window.updateHeaderLicense = updateHeaderLicense;


async function refreshUserProfile() {
    if (!userAccount) return;
    try {
        const res = await fetch(`/api/v1/user/profile?userId=${userAccount.id}`);
        const data = await res.json();
        if (data.success && data.user) {
            userAccount = data.user;
        }
    } catch (_) {}

    const nameText = document.getElementById('userNameText');
    const avatarImg = document.getElementById('userAvatarImg');
    if (nameText && userAccount.name) nameText.innerText = userAccount.name;
    if (avatarImg && userAccount.picture) avatarImg.src = userAccount.picture;
}




function toggleAccordion(accId) {
    const card = document.getElementById(accId);
    if (card) card.classList.toggle('open');
}



// ══════════════════════════════════════════════════════════════════════════
// 4. EXPERIÊNCIA DE VOZ HERO & FEEDBACK EM TEMPO REAL
// ══════════════════════════════════════════════════════════════════════════

let mediaRecorder = null;
let audioChunks = [];
let voiceTimeoutTimer = null;

async function toggleVoice() {
    const micBtn = document.getElementById('micBtnDash') || document.getElementById('micBtn');
    const inputDash = document.getElementById('userInputDash') || document.getElementById('userInput');
    const waves = document.getElementById('audioWaves');
    const wavesLabel = document.getElementById('audioWavesLabel');
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Para a gravação manualmente ao clicar de novo
        mediaRecorder.stop();
        if (micBtn) {
            micBtn.classList.remove('pulse-recording');
            micBtn.classList.remove('active');
        }
        if (waves) waves.classList.remove('active');
        if (statusBadge) statusBadge.classList.remove('listening');
        if (statusText) statusText.innerText = 'Online';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            clearTimeout(voiceTimeoutTimer);
            if (micBtn) {
                micBtn.classList.remove('pulse-recording');
                micBtn.classList.remove('active');
            }
            if (waves) waves.classList.remove('active');
            if (statusBadge) statusBadge.classList.remove('listening');
            if (statusText) statusText.innerText = 'Online';

            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

            // Envia o Blob de áudio gravado para o backend (Ring 2)
            try {
                const res = await fetch('/api/v1/voice/transcribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'audio/webm' },
                    body: audioBlob
                });
                const data = await res.json();
                if (data.status === 'SUCCESS' && data.text) {
                    if (inputDash) inputDash.value = data.text;
                    // Auto-envia após transcrição confirmada
                    if (typeof sendMessageDash === 'function') sendMessageDash();
                }
            } catch (err) {
                console.warn('[VOICE_PIPELINE] Falha no fallback server-side:', err);
            }

            // Desliga os tracks do microfone
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        if (micBtn) {
            micBtn.classList.add('pulse-recording');
            micBtn.classList.add('active');
        }
        if (waves) waves.classList.add('active');
        if (wavesLabel) wavesLabel.innerText = 'Ouvindo sua voz em tempo real...';
        if (statusBadge) statusBadge.classList.add('listening');
        if (statusText) statusText.innerText = 'Ouvindo...';

        // Trava Anti-Stuck: Para automaticamente após 7 segundos se o usuário não falar nada
        voiceTimeoutTimer = setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 7000);

    } catch (err) {
        alert('Não foi possível acessar o microfone: ' + err.message);
    }
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.05;
        speechSynthesis.speak(utterance);
    }
}

function autoResizeTextarea(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    appendMessage('bot', `📄 <strong>Anexo Recebido:</strong> Extraindo texto do arquivo <em>"${file.name}"</em> (${(file.size / 1024).toFixed(1)} KB)...`);

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Content = e.target.result.split(',')[1];
        try {
            const res = await fetch('/api/v1/tools/extract-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileContentBase64: base64Content,
                    mimeType: file.type
                })
            });
            const data = await res.json();
            if (data.status === 'SUCCESS' && data.extraction) {
                const text = data.extraction.extractedText;
                const input = document.getElementById('userInputDash') || document.getElementById('userInput');
                if (input) {
                    input.value = `[Documento Anexado: ${file.name}]:\n${text.substring(0, 1500)}`;
                }
                appendMessage('bot', `✅ <strong>Texto Extraído:</strong> ${data.extraction.charCount} caracteres identificados. Pressione "Enviar" para que o MAX processe o documento.`);
                speakText('Texto extraído com sucesso do documento anexado.');
            }
        } catch (err) {
            appendMessage('bot', `⚠️ Falha ao extrair texto do arquivo ${file.name}.`);
        }
    };
    reader.readAsDataURL(file);
}

async function triggerSkill(skillName) {
    const input = document.getElementById('userInputDash') || document.getElementById('userInput');
    const prompts = {
        'Calendar': 'Sincronizar minha agenda do Google Calendar e verificar compromissos de hoje',
        'Secretario': 'Ativar o modo Secretário MAX para responder minhas chamadas e mensagens',
        'WhatsApp': 'Verificar estado da conexão Omnichannel do WhatsApp',
        'Atendente': 'Configurar mensagem de boas-vindas do Atendente Digital PME',
        'Search': 'Realizar busca web por dados de mercado em tempo real',
        'Analytics': 'Gerar relatório consolidado de métricas e analytics',
        'Router': 'Chavear provedor de I.A. para o Gemini Flash 2026',
        'Auth': 'Validar token de sessão e permissões do Google OAuth2',
        'Voice': 'Ativar transcrição e sintetização de voz em tempo real',
        'Catalog': 'Listar produtos e serviços do catálogo PME',
        'Stream': 'Iniciar streaming em tempo real via Server-Sent Events (SSE)'
    };

    const promptText = prompts[skillName] || `Executar ferramenta ${skillName}`;
    if (input) input.value = promptText;

    try {
        const res = await fetch('/api/v1/tools/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolName: skillName, payload: { amountBRL: 100 } })
        });
        const data = await res.json();
        if (data.status === 'SUCCESS') {
            sendMessageDash();
            return;
        }
    } catch (_) {}

    sendMessageDash();
}

// ══════════════════════════════════════════════════════════════════════════
// 5. CHAT CONVERSACIONAL STREAMING
// ══════════════════════════════════════════════════════════════════════════

async function streamChatToContainer(text, containerId, targetInput) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // const hero = document.getElementById('welcomeHero');
    // if (hero) hero.style.display = 'none';

    const userDiv = document.createElement('div');
    userDiv.className = 'message user';
    userDiv.innerHTML = `<div class="msg-avatar">👤</div><div class="msg-bubble"></div>`;
    userDiv.querySelector('.msg-bubble').textContent = text;
    container.appendChild(userDiv);
    container.scrollTop = container.scrollHeight;

    if (targetInput) targetInput.value = '';

    const botDiv = document.createElement('div');
    botDiv.className = 'message bot';
    botDiv.innerHTML = `
        <div class="msg-avatar"><i data-lucide="bot"></i></div>
        <div class="msg-bubble streaming-bubble">
            <span class="processing-indicator">
                Processando... <span class="typing-dots"><span></span><span></span><span></span></span>
            </span>
        </div>
    `;
    container.appendChild(botDiv);
    if (window.lucide) lucide.createIcons();
    container.scrollTop = container.scrollHeight;

    const bubble = botDiv.querySelector('.streaming-bubble');
    if (!bubble) return;

    try {
        const token = localStorage.getItem('x-session-token');
        const res = await fetch('/api/v1/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : '',
                'x-session-token': token || ''
            },
            body: JSON.stringify({ userMessage: text, message: text })
        });

        if (!res.ok) {
            throw new Error(`Falha no servidor: ${res.status}`);
        }

        if (res.body) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            let streamText = '';
            let firstChunk = true;
            let buffer = '';

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    // Mantém o último fragmento no buffer (caso a quebra de linha ainda não tenha chegado)
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.replace('data: ', '');
                            if (dataStr === '[DONE]') continue;
                            
                            try {
                                const parsed = JSON.parse(dataStr);
                                const tokenText = parsed.chunk !== undefined ? parsed.chunk : (parsed.text || parsed.content || parsed.html || '');
                                if (tokenText) {
                                    if (firstChunk) {
                                        bubble.innerHTML = '';
                                        firstChunk = false;
                                    }
                                    streamText += tokenText;
                                    let displayText = streamText.replace(/<think>[\s\S]*?<\/think>\s*/gi, '');
                                    if (displayText.match(/<think>/i)) {
                                        displayText = displayText.replace(/<think>[\s\S]*/gi, '🤔 Processando raciocínio...\n\n');
                                    }
                                    bubble.textContent = displayText;
                                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                                }
                            } catch (_) {}
                        }
                    }
                }
            }
            return;
        }
    } catch (err) {
        bubble.innerHTML = `⚠️ Falha na conexão: ${err.message}. Tente novamente.`;
    }
}

function sendMessageDash() {
    const input = document.getElementById('userInputDash') || document.getElementById('userInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    streamChatToContainer(text, 'chatMessagesDash', input);
}

function appendMessage(sender, text, htmlAddon = '') {
    const container = document.getElementById('chatMessagesDash');
    if (!container) return;

    // const hero = document.getElementById('welcomeHero');
    // if (hero) hero.style.display = 'none';

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    
    const avatar = sender === 'user' ? '👤' : '<i data-lucide="bot"></i>';
    
    msgDiv.innerHTML = `
        <div class="msg-avatar">${avatar}</div>
        <div class="msg-bubble">
            ${text}
            ${htmlAddon}
        </div>
    `;
    
    container.appendChild(msgDiv);
    if (window.lucide) lucide.createIcons();
    container.scrollTop = container.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════════════
// 6. GESTÃO DE MODO (CONSUMIDOR X PARCEIRO PME) & FUNCIONÁRIO DIGITAL MAX
// Funções canônicas definidas no bloco v2 (~linha 1695). Aqui apenas helpers.
// ══════════════════════════════════════════════════════════════════════════

let isPartnerRegistered = false;

async function submitMerchantUpgrade() {
    const storeName = document.getElementById('merchantStoreName')?.value.trim();
    const segment = document.getElementById('merchantSegment')?.value;

    if (!storeName) return alert('Informe o nome do estabelecimento.');

    try {
        const sessionToken = localStorage.getItem('x-session-token');
        await fetch('/api/v1/partner/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken || '' },
            body: JSON.stringify({ storeName, segment })
        });
    } catch (_) {}

    closeMerchantModal();
    if (!userAccount) userAccount = {};
    userAccount.is_partner = true;
    userAccount.store_name = storeName;
    isPmeAuthenticated = true;
    currentMode = 'partner';
    applyModeUI();
    switchMainView('ATTENDANT');
}

/* V1 loadAttendantConfig removido (Strangler Fig) */
let _isRenderingAttendant = false;
function renderAttendantState() {
    if (_isRenderingAttendant) return;
    _isRenderingAttendant = true;
    try {
        const configuredView = document.getElementById('attendantConfiguredState');
        if (configuredView) configuredView.style.display = 'block';
        updateConfiguredKnowledgeCards();
    } finally {
        setTimeout(() => { _isRenderingAttendant = false; }, 1500);
    }
}

let _isUpdatingCards = false;
function updateConfiguredKnowledgeCards() {
    if (_isUpdatingCards) return;
    _isUpdatingCards = true;
    try {
        if (!maxConfig) return;

        if (maxConfig.catalog) {
            const countEl = document.getElementById('kCatalogCount');
            if (countEl) countEl.innerText = `${maxConfig.catalog.length} serviços cadastrados`;
            const sampleEl = document.getElementById('kCatalogSample');
            if (sampleEl) sampleEl.innerText = maxConfig.catalog.map(c => c.name).slice(0, 2).join(', ');
        }

        if (maxConfig.workingHours) {
            const hoursEl = document.getElementById('kHoursVal');
            if (hoursEl) hoursEl.innerText = `Seg - Sáb (${maxConfig.workingHours.startTime || '09:00'} às ${maxConfig.workingHours.endTime || '18:00'})`;
        }

        if (maxConfig.existingAppointments) {
            const apptsEl = document.getElementById('kApptsVal');
            if (apptsEl) apptsEl.innerText = `${maxConfig.existingAppointments.length} agendamentos hoje`;
        }

        const toggle = document.getElementById('attendantTabToggle');
        if (toggle) toggle.checked = !!maxConfig.isActive;
    } finally {
        setTimeout(() => { _isUpdatingCards = false; }, 1000);
    }
}

onboardingData = {
  catalogChoice: '',
  workingHours: '',
  policies: '',
  tone: '',
  customCharacteristics: '',
  attachedFiles: []
};

async function handleOnboardingFileUpload(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    appendOnboardingUserMsg(`📎 [Anexando arquivo: ${file.name}]`);

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Content = e.target.result.split(',')[1];
        let extractedText = `Documento / Imagem anexada (${file.name})`;

        try {
            const res = await fetch('/api/v1/tools/extract-text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    fileContentBase64: base64Content,
                    mimeType: file.type
                })
            });
            const data = await res.json();
            if (data.extraction?.extractedText) {
                extractedText = data.extraction.extractedText;
            }
        } catch (_) {}

        if (!onboardingData.attachedFiles) onboardingData.attachedFiles = [];
        onboardingData.attachedFiles.push({
            name: file.name,
            type: file.type,
            text: extractedText,
            step: currentOnboardingStep
        });

        appendOnboardingBotMsg(`
            ✅ <strong>Arquivo Anexado com Sucesso!</strong><br>
            📄 <strong>Documento/Imagem:</strong> <code>${file.name}</code><br>
            💡 <em>${extractedText.substring(0, 240)}...</em><br><br>
            O Max leu e incorporou o conteúdo deste arquivo no seu perfil. Você pode digitar mais detalhes ou clicar em <strong>"Salvar & Avançar"</strong>.
        `);
    };
    reader.readAsDataURL(file);
}

function startOnboardingSetup(isEdit = false) {
    switchMainView('ATTENDANT');
    const onboardingView = document.getElementById('attendantOnboardingState');
    const configuredView = document.getElementById('attendantConfiguredState');
    
    if (onboardingView) onboardingView.style.display = 'block';
    if (configuredView) configuredView.style.display = 'none';

    currentOnboardingStep = 1;
    onboardingData = {
        catalogChoice: '',
        workingHours: '',
        policies: '',
        tone: '',
        customCharacteristics: '',
        attachedFiles: []
    };
    
    const chatBox = document.getElementById('onboardingChatStream');
    if (chatBox) chatBox.innerHTML = '';

    renderOnboardingStep();
}

function renderOnboardingStep() {
    const chatBox = document.getElementById('onboardingChatStream');
    const pillsRow = document.getElementById('onboardingPillsRow');
    if (!chatBox) return;

    // Atualizar Stepper chips (7 passos)
    for (let i = 1; i <= 7; i++) {
        const chip = document.getElementById(`stepChip${i}`);
        if (chip) {
            if (i === currentOnboardingStep) {
                chip.className = 'step-chip active';
            } else if (i < currentOnboardingStep) {
                chip.className = 'step-chip completed';
            } else {
                chip.className = 'step-chip';
            }
        }
    }

    if (currentOnboardingStep === 1) {
        appendOnboardingBotMsg(`
            👔 <strong>Olá! Sou o Max.</strong><br>
            Como seu executivo sênior de operações, estou aqui para personalizar seu Atendente Digital com as características exatas do seu negócio.<br><br>
            Você poderá personalizar cada etapa digitando suas regras ou anexando <strong>PDFs, imagens PNG/JPG e documentos de tabela de preços</strong>!
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('🚀 Vamos começar a personalização!')">🚀 Vamos começar a personalização!</button>
            `;
        }
    } else if (currentOnboardingStep === 2) {
        appendOnboardingBotMsg(`
            📦 <strong>Etapa 2 — Catálogo de Serviços & Tabela de Preços</strong><br><br>
            Para que eu possa vender seus serviços no WhatsApp, escolha uma opção abaixo ou <strong>anexe um PDF / Imagem da sua tabela de preços</strong> usando o botão de clipe 📎.<br><br>
            <em>Você também pode digitar seus produtos/serviços diretamente no campo de texto.</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('Anexei/Digitar meu catálogo próprio')">📄 Já tenho catálogo (PDF/Texto)</button>
                <button class="onboarding-pill" onclick="selectOnboardingPill('Usar os 3 serviços padrão da loja')">✨ Usar os 3 serviços padrão da loja</button>
            `;
        }
    } else if (currentOnboardingStep === 3) {
        appendOnboardingBotMsg(`
            📅 <strong>Etapa 3 — Horários de Funcionamento & Agenda</strong><br><br>
            Informe em quais dias e horários seu estabelecimento atende.<br><br>
            <em>Escolha um padrão ou digite seus horários específicos no campo abaixo:</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('Segunda a Sábado (09:00 às 18:00)')">🗓️ Segunda a Sábado (09:00 às 18:00)</button>
                <button class="onboarding-pill" onclick="selectOnboardingPill('Segunda a Sexta (08:00 às 18:00)')">🗓️ Segunda a Sexta (08:00 às 18:00)</button>
            `;
        }
    } else if (currentOnboardingStep === 4) {
        appendOnboardingBotMsg(`
            🛡️ <strong>Etapa 4 — Políticas Internas e Formas de Pagamento</strong><br><br>
            Quais são suas regras operacionais? (Ex: tolerância de atraso, regras de cancelamento, formas de pagamento que você aceita).<br><br>
            <em>Selecione uma opção ou digite suas regras customizadas:</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('Cancelamento até 2h antes | Formas de pagamento a combinar')">✅ Cancelamento 2h | Pagamento a combinar</button>
                <button class="onboarding-pill" onclick="selectOnboardingPill('Confirmação de horário com antecedência mínima de 2h')">⚡ Antecedência mínima de 2h</button>
            `;
        }
    } else if (currentOnboardingStep === 5) {
        appendOnboardingBotMsg(`
            🗣️ <strong>Etapa 5 — Tom de Atendimento & Personalidade</strong><br><br>
            Como devo conversar com os clientes no WhatsApp?<br><br>
            <em>Escolha a postura que melhor representa a sua marca:</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('Consultivo & Executivo (Recomendado)')">👔 Consultivo & Executivo (Recomendado)</button>
                <button class="onboarding-pill" onclick="selectOnboardingPill('Cordial & Amigável')">😊 Cordial & Amigável</button>
                <button class="onboarding-pill" onclick="selectOnboardingPill('Formal & Tradicional')">🏛️ Formal & Tradicional</button>
            `;
        }
    } else if (currentOnboardingStep === 6) {
        appendOnboardingBotMsg(`
            📎 <strong>Etapa 6 — Características Especiais & Documentos Adicionais</strong><br><br>
            Existe algum detalhe adicional sobre seu negócio que você queira ensinar ao Max?<br>
            (Ex: descontos especiais, localização, vagas de estacionamento, avisos importantes ou arquivos de regulamento).<br><br>
            <em>Digite no campo abaixo ou anexe um PDF/PNG com o botão 📎:</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill" onclick="selectOnboardingPill('Tudo certo, não preciso de regras extras')">👍 Tudo certo, sem regras extras</button>
            `;
        }
    } else if (currentOnboardingStep === 7) {
        const filesCount = onboardingData.attachedFiles ? onboardingData.attachedFiles.length : 0;
        appendOnboardingBotMsg(`
            📋 <strong>Etapa 7 — Resumo Executivo & Ativação do Max</strong><br><br>
            Configuração concluída com sucesso! Confira o perfil do seu Atendente Digital Max:<br>
            • <strong>Catálogo:</strong> ${onboardingData.catalogChoice || 'Cadastrado no perfil'}<br>
            • <strong>Horários:</strong> ${onboardingData.workingHours || 'Seg - Sáb (09:00 - 18:00)'}<br>
            • <strong>Políticas:</strong> ${onboardingData.policies || 'Cancelamento 2h antes | Pagamento conforme a loja'}<br>
            • <strong>Tom:</strong> ${onboardingData.tone || 'Consultivo Executivo'}<br>
            • <strong>Características Especiais:</strong> ${onboardingData.customCharacteristics || 'Inseridas pelo parceiro'}<br>
            • <strong>Anexos PDF/PNG:</strong> ${filesCount} arquivo(s) carregado(s)<br><br>
            <em>Deseja ativar seu Atendente Digital Max no WhatsApp agora?</em>
        `);
        if (pillsRow) {
            pillsRow.innerHTML = `
                <button class="onboarding-pill primary glow-neon" onclick="finishOnboardingActivation()">✅ Confirmar & Ativar o Max</button>
            `;
        }
    }
}

function appendOnboardingBotMsg(html) {
    const chatBox = document.getElementById('onboardingChatStream');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'sim-message bot';
    msgDiv.innerHTML = `
        <div class="sim-avatar">👔</div>
        <div class="sim-bubble">${html}</div>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendOnboardingUserMsg(text) {
    const chatBox = document.getElementById('onboardingChatStream');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'sim-message user';
    msgDiv.innerHTML = `
        <div class="sim-avatar">👤</div>
        <div class="sim-bubble">${text}</div>
    `;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function selectOnboardingPill(text) {
    const input = document.getElementById('onboardingUserInput');
    if (input) input.value = text;
    handleOnboardingAnswer();
}

function handleOnboardingAnswer() {
    const input = document.getElementById('onboardingUserInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    appendOnboardingUserMsg(text);
    input.value = '';

    if (currentOnboardingStep === 1) {
        currentOnboardingStep = 2;
    } else if (currentOnboardingStep === 2) {
        onboardingData.catalogChoice = text;
        currentOnboardingStep = 3;
    } else if (currentOnboardingStep === 3) {
        onboardingData.workingHours = text;
        currentOnboardingStep = 4;
    } else if (currentOnboardingStep === 4) {
        onboardingData.policies = text;
        currentOnboardingStep = 5;
    } else if (currentOnboardingStep === 5) {
        onboardingData.tone = text;
        currentOnboardingStep = 6;
    } else if (currentOnboardingStep === 6) {
        onboardingData.customCharacteristics = text;
        currentOnboardingStep = 7;
    }

    setTimeout(() => {
        renderOnboardingStep();
    }, 400);
}

async function finishOnboardingActivation() {
    // Montar o payload completo com TODOS os dados coletados nas 7 etapas
    const payload = {
        partnerId: (userAccount && userAccount.id) || 'usr_google_demo_100',
        isActive: true,
        isOnboarded: true,
        // Dados do onboarding das 7 etapas
        welcomeMsg: `Olá! Bem-vindo! Sou o Max, assistente virtual do estabelecimento. Como posso te ajudar?`,
        customCharacteristics: [
            onboardingData.catalogChoice ? `Catálogo: ${onboardingData.catalogChoice}` : '',
            onboardingData.workingHours ? `Horários: ${onboardingData.workingHours}` : '',
            onboardingData.policies ? `Políticas: ${onboardingData.policies}` : '',
            onboardingData.tone ? `Tom de atendimento: ${onboardingData.tone}` : '',
            onboardingData.customCharacteristics || ''
        ].filter(Boolean).join('\n'),
        workingHours: (() => {
            const h = onboardingData.workingHours || 'Segunda a Sábado (09:00 às 18:00)';
            const match = h.match(/(\d{2}:\d{2})\s*às\s*(\d{2}:\d{2})/);
            return {
                days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
                startTime: match ? match[1] : '09:00',
                endTime: match ? match[2] : '18:00'
            };
        })(),
        policies: {
            cancellationPolicy: onboardingData.policies || 'Cancelamento gratuito até 2 horas antes.',
            paymentMethods: 'Conforme políticas informadas pelo estabelecimento.',
            minAdvanceHours: 2,
            otherRules: onboardingData.customCharacteristics || ''
        },
        personalityPrompt: `Tom de atendimento: ${onboardingData.tone || 'Consultivo & Executivo'}. ${onboardingData.customCharacteristics || ''}`,
        attachedFiles: onboardingData.attachedFiles || []
    };

    try {
        const token = localStorage.getItem('x-session-token') || '';
        const res = await fetch('/api/v1/partner/attendant/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-session-token': token
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success && data.config) {
            maxConfig = data.config;
            console.log('[PME] Configuração do Max salva no backend com sucesso!', data.config.partnerId);
        }
    } catch (err) {
        console.warn('[PME] Backend indisponível — salvando localmente:', err.message);
        if (!maxConfig) maxConfig = {};
        Object.assign(maxConfig, payload);
    }

    renderAttendantState();
}

async function toggleAttendantStatus() {
    const toggle = document.getElementById('attendantTabToggle');
    const active = toggle ? toggle.checked : true;
    
    const pill = document.getElementById('attendantStatusPill');
    const statusText = document.getElementById('attendantStatusText');
    const caption = document.getElementById('attendantToggleCaption');

    if (active) {
        if (pill) { pill.className = 'status-indicator-pill active'; }
        if (statusText) statusText.innerText = 'ATIVO E ATENDENDO';
        if (caption) caption.innerText = 'Max Online';
    } else {
        if (pill) { pill.className = 'status-indicator-pill paused'; }
        if (statusText) statusText.innerText = 'PAUSADO';
        if (caption) caption.innerText = 'Pausado — WhatsApp conectado';
    }

    try {
        const token = window.sessionToken || localStorage.getItem('x-session-token') || '';
        const partnerId = window.PmeEngineV2 ? window.PmeEngineV2.getPartnerId() : 'usr_google_demo_100';

        await fetch('/api/v1/pme/v2/config', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-session-token': token
            },
            body: JSON.stringify({ 
                partnerId,
                isActive: active 
            })
        });
        // Soft-pause global: para a IA sem desconectar o Baileys
        try {
            await fetch('/api/v1/whatsapp/soft-pause', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-token': token
                },
                body: JSON.stringify({
                    global: true,
                    action: active ? 'resume' : 'pause',
                    paused: !active
                })
            });
        } catch (spErr) {
            console.warn('[SOFT_PAUSE] sync:', spErr.message);
        }
        console.log(`[PME V2] Estado de atendimento atualizado: ${active ? 'ATIVO' : 'PAUSADO'} (Baileys permanece conectado)`);
    } catch (err) {
        console.warn('[PME V2] Erro ao sincronizar estado do atendente:', err.message);
    }
}

async function downloadDailyPdfReport() {
    try {
        const res = await fetch('/api/v1/merchant/generate-daily-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: 'usr_google_demo_100' })
        });
        const data = await res.json();
        if (data.success && data.pdfUrl) {
            window.open(data.pdfUrl, '_blank');
        } else {
            alert('Relatório PDF gerado com sucesso!');
        }
    } catch (err) {
        alert('Erro ao gerar relatório PDF: ' + err.message);
    }
}

async function simulateCustomerInteraction(typeOrPrompt) {
    let prompt = typeOrPrompt || 'Olá, gostaria de saber os horários disponíveis e a tabela de preços do estabelecimento.';
    
    if (typeOrPrompt === 'PRECO') {
        prompt = 'Qual o valor dos seus serviços/produtos e tabela de preços?';
    } else if (typeOrPrompt === 'AGENDAMENTO') {
        prompt = 'Gostaria de consultar os horários livres e agendar um horário para hoje.';
    } else if (typeOrPrompt === 'PRODUTOS') {
        prompt = 'Quais ofertas e serviços estão disponíveis no catálogo?';
    }

    if (typeof switchMainView === 'function') {
        switchMainView('CHAT');
    }

    const inputDash = document.getElementById('userInputDash') || document.getElementById('userInput');
    if (inputDash) {
        inputDash.value = prompt;
        if (typeof sendMessageDash === 'function') {
            await sendMessageDash();
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 8. FUNÇÕES FINANCEIRAS & MODAIS & HITL CARDS
// ══════════════════════════════════════════════════════════════════════════

// Renderiza Card HITL de Confirmação Financeira no Chat
function renderHitlPixCard(container, { amount, description, recipient, onConfirm }) {
    const cardHtml = `
        <div class="hitl-card-box border-neon-yellow p-3 my-2 rounded bg-dark" style="border: 1px solid #EAB308; background: #0F172A; padding: 12px; border-radius: 8px; margin: 8px 0;">
            <div class="hitl-header font-bold text-yellow-400 mb-1" style="font-weight: bold; color: #FACC15; margin-bottom: 4px;">
                ⚠️ CONFIRMAÇÃO DE TRANSAÇÃO (HITL)
            </div>
            <div class="hitl-body text-sm mb-3" style="font-size: 0.85rem; margin-bottom: 12px; color: #E2E8F0;">
                <p><strong>Destinatário:</strong> ${recipient || 'Estabelecimento Comercial'}</p>
                <p><strong>Valor:</strong> R$ ${(amount / 100).toFixed(2)}</p>
                <p class="text-xs text-gray-400 mt-1" style="font-size: 0.75rem; color: #94A3B8; margin-top: 4px;">Configuração do atendimento digital PME.</p>
            </div>
            <div class="hitl-actions flex gap-2" style="display: flex; gap: 8px;">
                <button id="btnConfirmPix" class="btn-hitl-confirm" style="background: #16A34A; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">
                    ✅ Aprovar & Pagar
                </button>
                <button id="btnCancelPix" class="btn-hitl-cancel" style="background: #DC2626; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; cursor: pointer; font-weight: 600;">
                    ❌ Cancelar
                </button>
            </div>
        </div>
    `;

    if (typeof container === 'string') {
        container = document.getElementById(container);
    }
    if (!container) container = document.getElementById('chatMessagesDash');

    if (container) {
        container.insertAdjacentHTML('beforeend', cardHtml);

        const confirmBtn = container.querySelector('#btnConfirmPix');
        const cancelBtn = container.querySelector('#btnCancelPix');
        const cardBox = container.querySelector('.hitl-card-box');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (cardBox) cardBox.remove();
                if (typeof onConfirm === 'function') onConfirm();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (cardBox) cardBox.remove();
                alert('Operação financeira cancelada pelo usuário.');
            });
        }
    }
}


function openRaioXModal() {
    switchMainView('SETTINGS');
    const acc = document.getElementById('accRaioX');
    if (acc) acc.classList.add('open');
    fetchRaioXStatus();
}
function closeRaioXModal() {
    const modal = document.getElementById('raioXModal');
    if (modal) modal.style.display = 'none';
}
function openMerchantUpgradeModal() {
    const modal = document.getElementById('merchantModal');
    if (modal) modal.style.display = 'block';
}
function closeMerchantModal() {
    const modal = document.getElementById('merchantModal');
    if (modal) modal.style.display = 'none';
}

let isPmeAuthenticated = false;
let waPollInterval = null;

async function refreshWhatsAppQr(forceReset = false) {
    const qrContainer = document.getElementById('qrcode-container');
    const qrImg = document.getElementById('waQrImage');
    const skeleton = document.getElementById('qrSkeletonLoader');
    const badge = document.getElementById('waStatusBadge');
    const kWaStatus = document.getElementById('kWaStatus');

    const showSkeleton = () => {
        if (skeleton) skeleton.style.display = 'flex';
        if (qrContainer) qrContainer.style.display = 'none';
        if (qrImg) qrImg.style.display = 'none';
    };

    const showQr = () => {
        if (skeleton) skeleton.style.display = 'none';
    };

    // Ao forçar reset, mostra skeleton imediatamente e reinicia o polling
    // para que a UI continue verificando até o novo QR chegar do Baileys
    if (forceReset) {
        showSkeleton();
        if (badge) badge.innerText = '⏳ Gerando novo QR Code...';
        // Reinicia o polling (pode ter sido parado quando estava CONNECTED)
        if (waPollInterval) clearInterval(waPollInterval);
        waPollInterval = setInterval(() => refreshWhatsAppQr(false), 3000);
    }

    // Agora modo é apenas "business" / "pme"
    const modeToUse = 'business';
    const qs = forceReset ? `?mode=${modeToUse}&force=true` : `?mode=${modeToUse}`;

    try {
        const res = await fetch(`/api/v1/whatsapp/qrcode${qs}`);
        const data = await res.json();
        
        const qrPayload = data.qrBase64 || data.qrCodeBase64 || data.payload || null;

        if (qrPayload && qrPayload.startsWith('data:image') && qrImg) {
            // ✅ Base64 PNG retornado pelo backend
            showQr();
            qrImg.src = qrPayload;
            qrImg.style.display = 'block';
            if (qrContainer) qrContainer.style.display = 'none';
        } else {
            // ⏳ Backend ainda gerando — manter skeleton
            showSkeleton();
        }

        if (data && data.connectionState) {
            if (data.connectionState === 'CONNECTED') {
                const modeLabel = 'Atendente da Empresa';
                if (badge) badge.innerText = `🟢 Status: Conectado (${modeLabel})`;
                if (kWaStatus) kWaStatus.innerText = `Conectado (${modeLabel})`;
                if (waPollInterval) {
                    clearInterval(waPollInterval);
                    waPollInterval = null;
                }
            } else if (data.connectionState === 'PAIRING_READY') {
                if (badge) badge.innerText = '🟡 Escaneie o QR Code com a câmera do WhatsApp';
            } else {
                if (badge) badge.innerText = '⏳ Sincronizando credenciais Baileys...';
            }
        }
    } catch (err) {
        console.warn('[WHATSAPP_QR_UI] Erro ao buscar QR:', err);
        showSkeleton();
        if (badge) badge.innerText = '⏳ Aguardando conexão com o servidor...';
    }
}

async function openWhatsAppModal() {
    const modal = document.getElementById('waModal');
    const badge = document.getElementById('waStatusBadge');
    const targetMode = 'business';

    // 1. Checar status centralizado no backend antes de abrir/gerar QR
    try {
        const checkRes = await fetch('/api/v1/whatsapp/status');
        if (checkRes.ok) {
            const statusData = await checkRes.json();
            if (statusData.connectionState === 'CONNECTED') {
                // Já está conectado, não precisa fazer nada
            }
        }
    } catch (err) {
        console.warn('[WHATSAPP_STATUS_CHECK] Erro na checagem:', err);
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }

    if (badge) badge.innerText = '⏳ Gerando credenciais de conexão...';
    
    // false = não forçar reset na abertura normal
    await refreshWhatsAppQr(false);

    if (waPollInterval) clearInterval(waPollInterval);
    waPollInterval = setInterval(() => refreshWhatsAppQr(false), 3000);
}

function closeWhatsAppModal() {
    if (waPollInterval) clearInterval(waPollInterval);
    const modal = document.getElementById('waModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Sprint 8 & Resiliência F5: Validação do Token no Boot
    const token = localStorage.getItem('x-session-token');
    let sessionValid = false;

    if (token) {
        console.log('[AUTH_PERSIST] Verificando token salvo no localStorage...');
        try {
            const res = await fetch('/api/v1/auth/session', {
                headers: { 'Authorization': `Bearer ${token}`, 'x-session-token': token }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.user) {
                    console.log(`[AUTH_PERSIST] Sessão restaurada com sucesso para o usuário: ${data.user.email}`);
                    userAccount = data.user;
                    sessionValid = true;
                    window.sessionToken = token;
                    
                    UI_STATE.showMainApp();
                    const lock = document.getElementById('googleLockscreen');
                    if (lock) lock.style.display = 'none';

                    // Se for PME logado
                    if (userAccount.is_partner) {
                        isPmeAuthenticated = true;
                        currentMode = 'partner';
                        applyModeUI();
                        if (typeof switchMainView === 'function') switchMainView('ATTENDANT');
                        if (typeof fetchPmeConfigOnBoot === 'function') fetchPmeConfigOnBoot();
                    } else {
                        currentMode = 'consumer';
                        applyModeUI();
                        if (typeof switchMainView === 'function') switchMainView('CHAT');
                    }
                } else {
                    console.log('[AUTH_PERSIST] Token inválido ou expirado. Redirecionando para login.');
                    localStorage.removeItem('x-session-token');
                    UI_STATE.showOnboarding();
                }
            } else {
                console.log('[AUTH_PERSIST] Token inválido ou expirado. Redirecionando para login.');
                localStorage.removeItem('x-session-token');
                UI_STATE.showOnboarding();
            }
        } catch (_) {
            console.warn('[AUTH_PERSIST] Falha na validação do token (Network).');
            UI_STATE.showOnboarding();
        }
    } else {
        UI_STATE.showOnboarding();
    }

    if (!sessionValid) {
        userAccount = null;
        window.userAccount = null;
        UI_STATE.showOnboarding();
    }

    if (window.lucide) lucide.createIcons();
});

function openPartnerAuthModal() {
    const modal = document.getElementById('partnerAuthModal');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closePartnerAuthModal() {
    const modal = document.getElementById('partnerAuthModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    if (!isPmeAuthenticated) {
        currentMode = 'consumer';
        applyModeUI();
    }
}

async function submitPartnerAuthRegistration() {
    const storeName = document.getElementById('partnerStoreName')?.value.trim();
    if (!storeName) {
        return alert('Por favor, informe o nome da sua empresa/loja.');
    }

    const sessionToken = localStorage.getItem('x-session-token');

    try {
        const res = await fetch('/api/v1/partner/upgrade', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-session-token': sessionToken || ''
            },
            body: JSON.stringify({ storeName })
        });

        const data = await res.json();

        if (!res.ok) {
            return alert(data?.message || 'Não foi possível ativar o modo Empresa.');
        }

        // CRÍTICO: Se o servidor retornou um novo token de sessão elevado, salva no localStorage
        if (data.token) {
            localStorage.setItem('x-session-token', data.token);
        }

        // Atualiza o estado da sessão local
        isPmeAuthenticated = true;
        currentMode = 'partner';
        if (typeof userAccount !== 'undefined' && userAccount) {
            userAccount.is_partner = true;
            userAccount.store_name = storeName;
        }

        // Transição e carregamento
        if (typeof closePartnerAuthModal === 'function') closePartnerAuthModal();
        if (typeof applyModeUI === 'function') applyModeUI();
        if (typeof switchMainView === 'function') switchMainView('ATTENDANT');
        
        // Re-valida a sessão com o novo token antes de buscar as configs PME
        if (typeof checkSavedAuth === 'function') {
            await checkSavedAuth();
        }
        if (typeof fetchPmeConfigOnBoot === 'function') {
            fetchPmeConfigOnBoot();
        }

    } catch (err) {
        console.error('[PME_UPGRADE_ERROR]', err);
        alert('Erro ao conectar com o servidor para ativar o modo Empresa.');
    }
}

window.submitPartnerAuthRegistration = submitPartnerAuthRegistration;

function toggleMode(targetMode) {
    if (targetMode) {
        currentMode = targetMode;
    } else {
        currentMode = (currentMode === 'consumer') ? 'partner' : 'consumer';
    }

    if (currentMode === 'partner' && !isPmeAuthenticated) {
        openPartnerAuthModal();
        return;
    }

    applyModeUI();
}

function applyModeUI() {
    const label = document.getElementById('headerModeLabel');
    const toggleBtn = document.getElementById('headerModeToggleBtn');
    const pmeItems = document.querySelectorAll('.pme-only-item');
    const statusText = document.getElementById('statusText');
    const userNameText = document.getElementById('userNameText');

    if (currentMode === 'partner') {
        if (label) label.innerText = 'Modo Parceiro PME';
        if (toggleBtn) toggleBtn.classList.add('partner');
        pmeItems.forEach(el => el.style.display = (el.tagName === 'BUTTON' || el.tagName === 'NAV') ? 'flex' : 'block');
        if (statusText) statusText.innerText = '';
        
        if (userNameText) {
            const savedName = localStorage.getItem('autonmax_company_name');
            userNameText.innerText = savedName || 'Insira o nome da sua empresa';
        }
    } else {
        if (label) label.innerText = 'Consumidor';
        if (toggleBtn) toggleBtn.classList.remove('partner');
        pmeItems.forEach(el => el.style.display = 'none');
        if (statusText) statusText.innerText = 'Online';
        
        if (userNameText) {
            const savedName = localStorage.getItem('autonmax_user_name');
            userNameText.innerText = savedName || 'Insira seu nome';
        }
    }
}

window.editUserName = function() {
    const isPartner = currentMode === 'partner';
    const storageKey = isPartner ? 'autonmax_company_name' : 'autonmax_user_name';
    const currentName = localStorage.getItem(storageKey) || '';
    
    const promptText = isPartner ? 'Digite o nome da sua empresa:' : 'Digite seu nome:';
    const newName = prompt(promptText, currentName);
    
    if (newName !== null && newName.trim() !== '') {
        localStorage.setItem(storageKey, newName.trim());
        applyModeUI();
    }
};


function toggleVisibility() {
    isVisible = !isVisible;
    
}


function openMerchantUpgradeModal() {
    const modal = document.getElementById('merchantModal');
    if (modal) modal.style.display = 'flex';
}

function closeMerchantModal() {
    const modal = document.getElementById('merchantModal');
    if (modal) modal.style.display = 'none';
}

function closeRaioXModal() {
    const modal = document.getElementById('raioXModal');
    if (modal) modal.style.display = 'none';
}

// closePartnerAuthModal & submitPartnerAuthRegistration defined above (canonical versions)

async function downloadDailyPdfReport() {
    try {
        const res = await fetch('/api/v1/merchant/generate-daily-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId: 'usr_google_demo_100' })
        });
        const data = await res.json();
        if (data.status === 'SUCCESS' && data.pdfUrl) {
            window.open(data.pdfUrl, '_blank');
        } else {
            alert('Relatório Diário do Atendente Max gerado com sucesso em PDF!');
        }
    } catch (_) {
        alert('Relatório executivo diário compilado e disponível para download.');
    }
}


function startOnboardingSetup(isEdit = false) {
    switchMainView('ATTENDANT');
    const onboardingState = document.getElementById('attendantOnboardingState');
    const configuredState = document.getElementById('attendantConfiguredState');

    if (onboardingState && configuredState) {
        onboardingState.style.display = 'block';
        configuredState.style.display = 'none';
    }
}


// ══════════════════════════════════════════════════════════════════════════
// ISOLAMENTO ABSOLUTO DE ESCOPO: NAMESPACE WINDOW.AUTONAPP
// ══════════════════════════════════════════════════════════════════════════
window.AutonApp = window.AutonApp || {};

// Métodos Principais no Namespace AutonApp
window.AutonApp.switchMainView = switchMainView;
window.AutonApp.toggleMode = toggleMode;
window.AutonApp.openWhatsAppModal = openWhatsAppModal;
window.AutonApp.closeWhatsAppModal = closeWhatsAppModal;
window.openWhatsAppModal = openWhatsAppModal;
window.closeWhatsAppModal = closeWhatsAppModal;
window.refreshWhatsAppQr = refreshWhatsAppQr;
window.AutonApp.openMerchantUpgradeModal = openMerchantUpgradeModal;
window.AutonApp.closeMerchantModal = closeMerchantModal;
window.AutonApp.submitMerchantUpgrade = submitMerchantUpgrade;
window.AutonApp.closeRaioXModal = closeRaioXModal;
window.AutonApp.closePartnerAuthModal = closePartnerAuthModal;
window.AutonApp.submitPartnerAuthRegistration = submitPartnerAuthRegistration;
window.AutonApp.downloadDailyPdfReport = downloadDailyPdfReport;
window.AutonApp.startOnboardingSetup = startOnboardingSetup;
window.AutonApp.toggleAttendantStatus = toggleAttendantStatus;
window.AutonApp.handleOnboardingFileUpload = handleOnboardingFileUpload;
window.AutonApp.handleOnboardingAnswer = handleOnboardingAnswer;
window.AutonApp.selectOnboardingPill = selectOnboardingPill;
window.AutonApp.finishOnboardingActivation = finishOnboardingActivation;
window.AutonApp.startAppJourney = startAppJourney;
window.AutonApp.skipSplashIntro = skipSplashIntro;

// Alias Globais Diretos para Handlers Inline no HTML
window.switchMainView = switchMainView;
window.toggleMode = toggleMode;
window.openWhatsAppModal = openWhatsAppModal;
window.closeWhatsAppModal = closeWhatsAppModal;
window.toggleVisibility = toggleVisibility;
window.openMerchantUpgradeModal = openMerchantUpgradeModal;
window.closeMerchantModal = closeMerchantModal;
window.submitMerchantUpgrade = submitMerchantUpgrade;
window.closeRaioXModal = closeRaioXModal;
window.AutonApp.openPartnerAuthModal = openPartnerAuthModal;
window.AutonApp.closePartnerAuthModal = closePartnerAuthModal;
window.AutonApp.submitPartnerAuthRegistration = submitPartnerAuthRegistration;

window.openPartnerAuthModal = openPartnerAuthModal;
window.closePartnerAuthModal = closePartnerAuthModal;
window.submitPartnerAuthRegistration = submitPartnerAuthRegistration;
window.downloadDailyPdfReport = downloadDailyPdfReport;
window.startOnboardingSetup = startOnboardingSetup;
window.toggleAttendantStatus = toggleAttendantStatus;
window.startAppJourney = startAppJourney;
window.skipSplashIntro = skipSplashIntro;



// FIx explícito para os botões da tela de boas vindas
document.addEventListener('DOMContentLoaded', () => {
    // 1. Limpar flags de cache local para o vídeo
    localStorage.removeItem('intro_seen');
    localStorage.removeItem('onboarding_completed');

    // 2. Forçar a transição de tela de forma síncrona
    function forceShowMainApp() {
        console.log('[UI_DEBUG] Destruindo overlay de welcome e exibindo MainApp');
        const welcomeTargets = document.querySelectorAll('#welcomeScreen, .welcome-screen, .welcome-overlay, #splashScreen, #modalProfile');
        welcomeTargets.forEach(el => {
            el.style.setProperty('display', 'none', 'important');
            // Se necessário, el.remove();
        });
        
        const mainApp = document.getElementById('mainApp') || document.querySelector('.main-app') || document.querySelector('.app-container');
        if (mainApp) {
            mainApp.style.setProperty('display', 'flex', 'important');
            mainApp.style.setProperty('visibility', 'visible', 'important');
            mainApp.style.setProperty('opacity', '1', 'important');
        }
    }
    
    window.forceAppStart = forceShowMainApp;

    const bindWelcomeButton = (btnId, clickHandler) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            // Remove antigos se houver e aplica novo com Z-Index forçado
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
            clone.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`[UI_DEBUG] Clique forçado detectado no botão: ${btnId}`);
                forceShowMainApp();
                clickHandler();
            });
        }
    };

    document.addEventListener('click', function(e) {


      // Clique em Login Google Negócio -> Simula/Executa o Login e entra no App
      const btnBusiness = e.target.closest('#btnAuthBusiness') || e.target.closest('#btnAuthPersonal');
      
      if (btnBusiness) {
        console.log('[UX_EVENT] Disparando Google Login para o modo PME/Business');
        
        localStorage.setItem('auton_user_mode', 'business');
        if (typeof selectedAccountType !== 'undefined') {
          selectedAccountType = 'BUSINESS';
        }
        
        // Dispara o login e redireciona a view APÓS o login concluir
        if (typeof executeGoogleLogin === 'function') {
          executeGoogleLogin().then(() => {
            const token = localStorage.getItem('x-session-token') || window.sessionToken;
            if (token && userAccount) {
              UI_STATE.showMainApp();
              if (typeof switchMainView === 'function') switchMainView('ATTENDANT');
            } else {
              UI_STATE.showOnboarding();
            }
          });
        }
        return;
      }
    });
});

window.executeLogout = function() {
    console.log('[AUTH_SECURITY] Executando expurgo total de sessão e memória.');
    
    // 1. Limpeza de Storages
    localStorage.removeItem('x-session-token');
    localStorage.removeItem('auton_user_mode');
    localStorage.removeItem('userAccount');
    localStorage.removeItem('auton_user');
    sessionStorage.clear();

    // 2. Reset de Variáveis de Estado Global em Memória
    window.sessionToken = null;
    userAccount = null;
    window.userAccount = null;
    isPmeAuthenticated = false;
    currentMode = 'consumer';
subscriptionStatus = null;

    // 3. Reset do Estado Interno de Engines (V2)
    if (window.PmeEngineV2) {
        window.PmeEngineV2._isLoaded = false;
        window.PmeEngineV2.state = { store_name: '', pdfs: [], images: [] };
        if (typeof window.PmeEngineV2.renderFiles === 'function') {
            window.PmeEngineV2.renderFiles();
        }
    }

    // 4. Transição Forçada para Tela de Login/Onboarding
    UI_STATE.showOnboarding();
};

// O listener DOMContentLoaded assíncrono acima já centraliza o boot e valida a sessão
window.addEventListener('DOMContentLoaded', () => {
    console.log('[BOOT] Listener síncrono secundário iniciado (UI logic delegate)');
    
    // O splash de vídeo foi removido, a inicialização ocorre sem mídia inicial.
});


// ============================================================================
// PME ENGINE V2 (Strangler Fig Refactor)
// ============================================================================
window.PmeEngineV2 = {
    _isLoaded: false,
    state: {
        store_name: '',
        logo: '',
        pdfs: [],
        images: []
    },

    renderFiles() {
        // 0. Atualizar elementos do Header e Identidade Visual (V2)
        const storeName = this.state.store_name || document.getElementById('pmeDisplayNameInput')?.value || (typeof userAccount !== 'undefined' && userAccount?.store_name) || '';
        
        const headerStore = document.getElementById('header_store_name');
        if (headerStore) headerStore.textContent = storeName || 'Minha Empresa';

        const userNameEl = document.getElementById('userNameText');
        if (userNameEl && storeName) userNameEl.textContent = storeName;

        const pmeDisplayName = document.getElementById('pmeDisplayNameInput');
        if (pmeDisplayName && storeName && !pmeDisplayName.value) pmeDisplayName.value = storeName;

        const logoSrc = this.state.logo || 'assets/img/logo-autonmax.jpg';

        const headerLogo = document.getElementById('header_logo');
        if (headerLogo) headerLogo.src = logoSrc;

        const pmeLogoPreview = document.getElementById('pmeLogoPreview');
        if (pmeLogoPreview) pmeLogoPreview.src = logoSrc;

        const userAvatar = document.getElementById('userAvatarImg');
        if (userAvatar && this.state.logo) userAvatar.src = this.state.logo;

        // 1. Renderizar PDFs
        const pdfContainer = document.getElementById('v2_pdf_list');
        if (pdfContainer) {
            const pdfs = this.state.pdfs || [];
            if (pdfs.length === 0) {
                pdfContainer.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted); padding: 0.25rem 0;">Nenhum PDF cadastrado ainda.</div>';
            } else {
                pdfContainer.innerHTML = pdfs.map((f, idx) => {
                    const kb = f.size ? (f.size / 1024).toFixed(1) + ' KB' : (f.sizeBytes ? (f.sizeBytes / 1024).toFixed(1) + ' KB' : '');
                    const name = f.name || 'Documento PDF';
                    return `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,163,255,0.08); border: 1px solid rgba(0,163,255,0.2); border-radius: 8px; padding: 0.5rem 0.75rem; gap: 0.5rem;">
                            <div style="display: flex; align-items: center; gap: 0.5rem; overflow: hidden;">
                                <i data-lucide="file-text" style="width: 16px; height: 16px; color: var(--accent-neon); flex-shrink: 0;"></i>
                                <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                                ${kb ? `<span style="font-size: 0.72rem; color: var(--text-muted); flex-shrink: 0;">(${kb})</span>` : ''}
                            </div>
                            <button type="button" onclick="window.PmeEngineV2.removeFile('pdf', ${idx})" title="Remover PDF" style="background: rgba(255,50,80,0.15); border: 1px solid rgba(255,50,80,0.3); border-radius: 6px; color: #ff3250; padding: 2px 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }

        // 2. Renderizar Imagens
        const imgContainer = document.getElementById('v2_image_list');
        if (imgContainer) {
            const images = this.state.images || [];
            if (images.length === 0) {
                imgContainer.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted); padding: 0.25rem 0; grid-column: 1/-1;">Nenhuma imagem cadastrada ainda.</div>';
            } else {
                imgContainer.innerHTML = images.map((f, idx) => {
                    const src = f.url || f.dataUrl || '';
                    const name = f.name || 'Imagem';
                    return `
                        <div style="position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: rgba(0,163,255,0.08); border: 1px solid rgba(0,163,255,0.2);">
                            ${src ? `<img src="${src}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;" />` : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1rem; color: var(--accent-neon);"><i data-lucide="image"></i></div>`}
                            <button type="button" onclick="window.PmeEngineV2.removeFile('image', ${idx})" title="Remover imagem" style="position: absolute; top: 3px; right: 3px; background: rgba(0,0,0,0.7); border: none; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; color: #fff; cursor: pointer;">
                                <i data-lucide="x" style="width: 10px; height: 10px;"></i>
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }

        if (window.lucide) lucide.createIcons();
    },

    removeFile(type, index) {
        if (type === 'pdf' && this.state.pdfs) {
            this.state.pdfs.splice(index, 1);
        } else if (type === 'image' && this.state.images) {
            this.state.images.splice(index, 1);
        }
        this.renderFiles();
    },

    getPartnerId() {
        if (typeof userAccount !== 'undefined' && userAccount && userAccount.id) {
            return userAccount.id;
        }
        if (typeof window !== 'undefined' && window.userAccount && window.userAccount.id) {
            return window.userAccount.id;
        }
        try {
            const stored = localStorage.getItem('userAccount') || localStorage.getItem('auton_user');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && parsed.id) return parsed.id;
            }
        } catch (_) {}
        return 'usr_google_demo_100';
    },

    async load(force = false) {
        if (this._isLoaded && !force) {
            console.log('[PME V2] Ignorando recarregamento via flag (apenas boot).');
            return;
        }

        try {
            const token = window.sessionToken || localStorage.getItem('x-session-token') || '';
            const partnerId = this.getPartnerId();
            
            const res = await fetch(`/api/v1/pme/v2/config?partnerId=${encodeURIComponent(partnerId)}`, {
                headers: { 'x-session-token': token }
            });

            if (!res.ok) return;
            const data = await res.json();
            
            if (data.status === 'success' && data.config) {
                const config = data.config;
                this._isLoaded = true;
                console.log('[PME V2] Configuração carregada:', config);
                
                let rules = {};
                try { rules = typeof config.business_rules === 'string' ? JSON.parse(config.business_rules || '{}') : (config.business_rules || {}); } catch(e) {}
                
                this.state.store_name = rules.store_name || rules.storeName || '';
                this.state.logo = rules.logo || '';
                this.state.pdfs = Array.isArray(config.pdf_files) ? config.pdf_files : [];
                this.state.images = Array.isArray(config.image_files) ? config.image_files : [];

                const elPrompt = document.getElementById('v2_system_prompt');
                if (elPrompt) elPrompt.value = config.prompt_instructions || '';

                const elDisplayName = document.getElementById('pmeDisplayNameInput');
                if (elDisplayName && this.state.store_name) elDisplayName.value = this.state.store_name;
                
                const elCatalog = document.getElementById('v2_catalog');
                if (elCatalog) elCatalog.value = rules.catalog || '';

                const elProducts = document.getElementById('v2_products');
                if (elProducts) elProducts.value = rules.products || '';
                
                const elSchedules = document.getElementById('v2_schedules');
                if (elSchedules) elSchedules.value = rules.schedules || '';
                
                const elPolicies = document.getElementById('v2_policies');
                if (elPolicies) elPolicies.value = rules.policies || '';

                if (config.isActive !== undefined) {
                    const toggle = document.getElementById('attendantTabToggle');
                    const pill = document.getElementById('attendantStatusPill');
                    const statusText = document.getElementById('attendantStatusText');
                    const caption = document.getElementById('attendantToggleCaption');
                    if (toggle) toggle.checked = config.isActive;
                    if (config.isActive) {
                        if (pill) { pill.className = 'status-indicator-pill active'; }
                        if (statusText) statusText.innerText = 'ATIVO E ATENDENDO';
                        if (caption) caption.innerText = 'Max Online';
                    } else {
                        if (pill) { pill.className = 'status-indicator-pill paused'; }
                        if (statusText) statusText.innerText = 'PAUSADO';
                        if (caption) caption.innerText = 'Pausado — WhatsApp conectado';
                    }
                }

                this.renderFiles();
                this.checkGoogleCalendarStatus();
            } else {
                this.renderFiles();
                this.checkGoogleCalendarStatus();
            }
        } catch (err) {
            console.error('[PME V2] Erro no load isolado:', err);
        }
    },

    async checkGoogleCalendarStatus() {
        return; // PROVISÓRIO DISABLE_GOOGLE_AUTH: bypass
        try {
            const partnerId = this.getPartnerId();
            const res = await fetch(`/api/v1/pme/${encodeURIComponent(partnerId)}/google-calendar/status`);
            if (!res.ok) return;
            const data = await res.json();
            
            const badge = document.getElementById('pme_google_badge');
            const desc = document.getElementById('pme_google_desc');
            const actions = document.getElementById('pme_google_actions');

            if (!badge || !desc || !actions) return;

            if (data.connected) {
                badge.className = 'badge';
                badge.style.cssText = 'font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(22,163,74,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3);';
                badge.innerText = 'Conectado';

                const emailText = data.email ? ` (${data.email})` : '';
                desc.innerText = `Agenda sincronizada com sucesso${emailText}. Novos agendamentos confirmados serão criados automaticamente.`;

                actions.innerHTML = `
                    <button type="button" class="exec-action-btn" style="padding: 0.5rem 1rem; font-size: 0.85rem; background: rgba(255,50,80,0.12); border: 1px solid rgba(255,50,80,0.25); color: #ff4d6d; display: flex; align-items: center; gap: 0.4rem;" onclick="window.PmeEngineV2.disconnectGoogleCalendar()">
                        <i data-lucide="unlink"></i> Desconectar
                    </button>
                `;
            } else if (data.reason === 'EXPIRED') {
                badge.className = 'badge';
                badge.style.cssText = 'font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.3);';
                badge.innerText = 'Expirado';

                desc.innerText = 'Sua conexão com o Google Calendar expirou. Clique em Reconectar para renovar a autorização.';

                actions.innerHTML = `
                    <button type="button" class="exec-action-btn primary" style="padding: 0.5rem 1.2rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;" onclick="window.PmeEngineV2.connectGoogleCalendar()">
                        <i data-lucide="refresh-cw"></i> Reconectar Google Calendar
                    </button>
                `;
            } else {
                badge.className = 'badge';
                badge.style.cssText = 'font-size: 0.72rem; padding: 2px 8px; border-radius: 12px; background: rgba(255,255,255,0.08); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.15);';
                badge.innerText = 'Desconectado';

                desc.innerText = 'Conecte sua conta Google para criar agendamentos reais do WhatsApp na sua agenda.';

                actions.innerHTML = `
                    <button type="button" class="exec-action-btn primary" style="padding: 0.5rem 1.2rem; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;" onclick="window.PmeEngineV2.connectGoogleCalendar()">
                        <i data-lucide="link"></i> Conectar Google Calendar
                    </button>
                `;
            }

            if (window.lucide) lucide.createIcons();
        } catch (e) {
            console.warn('[PME V2] Erro ao checar status do Google Calendar:', e);
        }
    },

    async connectGoogleCalendar() {
        return; // PROVISÓRIO DISABLE_GOOGLE_AUTH: bypass
        try {
            const partnerId = this.getPartnerId();
            const res = await fetch(`/api/v1/pme/${encodeURIComponent(partnerId)}/google-calendar/connect?format=json`);
            if (res.ok) {
                const data = await res.json();
                if (data.authUrl) {
                    window.location.href = data.authUrl;
                    return;
                }
            }
            window.location.href = `/api/v1/pme/${encodeURIComponent(partnerId)}/google-calendar/connect`;
        } catch (err) {
            console.error('[PME V2] Erro ao iniciar conexão OAuth:', err);
            alert('Falha ao iniciar autenticação com o Google.');
        }
    },

    async disconnectGoogleCalendar() {
        return; // PROVISÓRIO DISABLE_GOOGLE_AUTH: bypass
        if (!confirm('Tem certeza que deseja desconectar a agenda? O Max não conseguirá mais criar agendamentos reais.')) return;
        try {
            const partnerId = this.getPartnerId();
            const res = await fetch(`/api/v1/pme/${encodeURIComponent(partnerId)}/google-calendar/disconnect`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.status === 'SUCCESS' || data.success) {
                this.checkGoogleCalendarStatus();
                const toast = document.createElement('div');
                toast.innerHTML = 'Google Calendar desconectado.';
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#334155;color:#fff;padding:12px 20px;border-radius:8px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            }
        } catch (err) {
            console.error('[PME V2] Erro ao desconectar Google Calendar:', err);
            alert('Erro ao desconectar.');
        }
    },

    async save(event) {
        if (event && event.preventDefault) event.preventDefault();

        try {
            const partnerId = this.getPartnerId();
            const token = window.sessionToken || localStorage.getItem('x-session-token') || '';

            const storeName = document.getElementById('pmeDisplayNameInput')?.value.trim() || this.state.store_name || '';
            const prompt_instructions = document.getElementById('v2_system_prompt')?.value || '';
            const catalog = document.getElementById('v2_catalog')?.value || '';
            const products = document.getElementById('v2_products')?.value || '';
            const schedules = document.getElementById('v2_schedules')?.value || '';
            const policies = document.getElementById('v2_policies')?.value || '';

            this.state.store_name = storeName;
            if (typeof userAccount !== 'undefined' && userAccount) {
                userAccount.store_name = storeName;
            }

            const payload = {
                partnerId: partnerId,
                prompt_instructions: prompt_instructions,
                business_rules: JSON.stringify({ 
                    store_name: storeName,
                    storeName: storeName,
                    catalog, 
                    products,
                    schedules, 
                    policies,
                    logo: this.state.logo || ''
                }),
                pdf_files: this.state.pdfs,
                image_files: this.state.images
            };

            const res = await fetch('/api/v1/pme/v2/config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-session-token': token
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            
            if (data.status === 'success') {
                console.log('[PME V2] Configuração salva silenciosamente.');
                this.renderFiles();
                
                const toast = document.createElement('div');
                toast.innerHTML = '✅ Configurações do Max salvas com sucesso!';
                toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
            } else {
                alert('❌ Falha ao salvar (V2): ' + data.message);
            }
        } catch (err) {
            console.error('[PME V2] Erro ao salvar:', err);
            alert('❌ Erro de conexão ao salvar V2.');
        }
    }
};

// Trata retorno do OAuth Google se presente no URL
(function() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('google') === 'connected') {
            const toast = document.createElement('div');
            toast.innerHTML = '🎉 Google Calendar conectado com sucesso!';
            toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { if (window.PmeEngineV2) window.PmeEngineV2.checkGoogleCalendarStatus(); }, 500);
        } else if (urlParams.get('google') === 'error') {
            const reason = urlParams.get('reason') || 'desconhecido';
            alert(`❌ Falha na conexão com o Google Calendar: ${reason}`);
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    } catch (_) {}
})();

window.savePmeConfigV2 = (event) => window.PmeEngineV2.save(event);

window.handlePmeLogoUpload = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        window.PmeEngineV2.state.logo = e.target.result;
        window.PmeEngineV2.renderFiles();
    };
    reader.readAsDataURL(file);
    event.target.value = '';
};

window.handlePmePdfUpload = function(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (!window.PmeEngineV2.state.pdfs) window.PmeEngineV2.state.pdfs = [];
    
    for (const file of files) {
        if (window.PmeEngineV2.state.pdfs.length >= 5) {
            alert('Limite máximo de 5 PDFs atingido.');
            break;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            window.PmeEngineV2.state.pdfs.push({
                name: file.name,
                size: file.size,
                type: file.type,
                url: e.target.result
            });
            window.PmeEngineV2.renderFiles();
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
};

window.handlePmeImageUpload = function(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    if (!window.PmeEngineV2.state.images) window.PmeEngineV2.state.images = [];

    for (const file of files) {
        if (window.PmeEngineV2.state.images.length >= 10) {
            alert('Limite máximo de 10 imagens atingido.');
            break;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            window.PmeEngineV2.state.images.push({
                name: file.name,
                size: file.size,
                type: file.type,
                url: e.target.result
            });
            window.PmeEngineV2.renderFiles();
        };
        reader.readAsDataURL(file);
    }
    event.target.value = '';
};

window.savePmeProfile = (event) => { if (window.PmeEngineV2) window.PmeEngineV2.save(event); };
window.savePmePrompt = (event) => { if (window.PmeEngineV2) window.PmeEngineV2.save(event); };

window.downloadLocalAppointmentsPdf = async () => {
    try {
        if (!window.PmeEngineV2) return;
        const partnerId = window.PmeEngineV2.getPartnerId();
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Gerando...';
        btn.disabled = true;

        const res = await fetch(`/api/v1/pme/${encodeURIComponent(partnerId)}/appointments/pdf`);
        const data = await res.json();
        if (res.ok && data.status === 'SUCCESS') {
            window.open(data.downloadUrl, '_blank');
        } else {
            alert('❌ Erro ao gerar PDF: ' + (data.error || 'Desconhecido'));
        }
    } catch (e) {
        alert('❌ Erro de conexão ao solicitar PDF.');
    } finally {
        if (event && event.currentTarget) {
            event.currentTarget.innerHTML = '<i data-lucide="file-text"></i> Baixar PDF';
            event.currentTarget.disabled = false;
        }
    }
};
// --- ATENDIMENTOS DASHBOARD JS ---
let chatPollInterval = null;
let alertedChats = new Set();

window.goToChatsMode = function() {
    document.querySelectorAll('.tab-section, .attendant-view-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById('viewChats').style.display = 'block';
    document.getElementById('tabBtnChats').classList.add('active');
    
    fetchActiveChats();
    if (!chatPollInterval) {
        chatPollInterval = setInterval(fetchActiveChats, 5000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.currentTarget.id !== 'tabBtnChats') {
                if (chatPollInterval) {
                    clearInterval(chatPollInterval);
                    chatPollInterval = null;
                }
            }
        });
    });
});

async function fetchActiveChats() {
    try {
        const partnerId = window._session ? window._session.partnerId : 'default';
        const res = await fetch('/api/v1/pme/' + partnerId + '/active-chats');
        const data = await res.json();
        if (data.status === 'SUCCESS') {
            renderChats(data.activeChats || []);
        }
    } catch (e) {
        console.error('Error fetching chats:', e);
    }
}

function renderChats(chats) {
    const grid = document.getElementById('chatsGrid');
    if (!grid) return;
    
    if (chats.length === 0) {
        grid.innerHTML = '<div style="color: #aaa; text-align: center; grid-column: 1 / -1; padding: 40px;">Nenhuma conversa ativa no momento.</div>';
        return;
    }
    
    grid.innerHTML = '';
    
    let shouldPlaySound = false;
    
    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-card';
        
        let dotClass = chat.isPaused ? (chat.humanRequested ? 'red-pulsing' : 'yellow') : 'green';
        
        if (chat.humanRequested && !alertedChats.has(chat.userKey)) {
            shouldPlaySound = true;
            alertedChats.add(chat.userKey);
        } else if (!chat.humanRequested) {
            alertedChats.delete(chat.userKey);
        }
        
        const timeStr = new Date(chat.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const cleanMsg = (chat.lastMessage || '').replace(/"/g, '&quot;');
        
        let resolveBtn = '';
        if (chat.humanRequested) {
            resolveBtn = '<button class="btn-resolve" onclick="resolveChatAlert(\'' + chat.userKey + '\')">Concluir Alerta</button>';
        }
        
        div.innerHTML = `
            <div class="chat-header">
                <div class="chat-dot ${dotClass}"></div>
                <span class="chat-name">${chat.clientName}</span>
                <span class="chat-time">${timeStr}</span>
            </div>
            <div class="chat-last-msg" title="${cleanMsg}">${cleanMsg}</div>
            <div class="chat-actions">
                <button class="${chat.isPaused ? 'btn-resume' : 'btn-pause'}" onclick="togglePauseChat('${chat.userKey}', ${!chat.isPaused})">
                    ${chat.isPaused ? '▶ Retomar IA' : '⏸ Pausar IA'}
                </button>
                ${resolveBtn}
            </div>
        `;
        grid.appendChild(div);
    });
    
    if (shouldPlaySound) {
        const audio = document.getElementById('alertSound');
        if (audio) {
            audio.play().catch(e => console.log('Audio autoplay prevented'));
        }
    }
}

window.togglePauseChat = async function(userKey, isPaused) {
    try {
        const partnerId = window._session ? window._session.partnerId : 'default';
        await fetch('/api/v1/pme/' + partnerId + '/active-chats/pause', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userKey, isPaused })
        });
        fetchActiveChats(); 
    } catch (e) {
        console.error(e);
    }
}

window.resolveChatAlert = async function(userKey) {
    try {
        const partnerId = window._session ? window._session.partnerId : 'default';
        await fetch('/api/v1/pme/' + partnerId + '/active-chats/resolve', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userKey })
        });
        alertedChats.delete(userKey);
        fetchActiveChats();
    } catch (e) {
        console.error(e);
    }
}
