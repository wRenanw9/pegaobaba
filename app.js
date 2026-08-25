// --- FUNÇÃO DE TRADUÇÃO SEGURA DE DADOS ---
function safeParse(data) {
    if (typeof data === 'string') {
        try { return JSON.parse(data); } catch(e) { return data; }
    }
    return data;
}

// --- FUNÇÕES DE ALERTA PROFISSIONAIS (MODAIS) ---
function customConfirm(title, text, primaryText, secondaryText, primaryColor = 'var(--primary)') {
    return new Promise((resolve) => {
        let elTitle = document.getElementById('modal-confirm-title');
        let elText = document.getElementById('modal-confirm-text');
        let modal = document.getElementById('modal-confirm-custom');
        
        if (!modal || !elTitle || !elText) {
            resolve(confirm(text.replace(/<[^>]*>?/gm, '')));
            return;
        }

        elTitle.innerText = title;
        elTitle.style.color = primaryColor;
        elText.innerHTML = text;
        
        let btnP = document.getElementById('modal-confirm-btn-primary');
        btnP.innerText = primaryText;
        btnP.style.background = primaryColor;
        btnP.onclick = () => { modal.style.display = 'none'; resolve(true); };
        
        let btnS = document.getElementById('modal-confirm-btn-secondary');
        btnS.innerText = secondaryText;
        btnS.style.color = 'var(--dark)';
        btnS.style.border = '1px solid var(--border)';
        btnS.style.display = 'block';
        btnS.onclick = () => { modal.style.display = 'none'; resolve(false); };
        
        modal.style.display = 'flex';
    });
}

function customAlert(title, text, btnText="Entendi", primaryColor='var(--primary)') {
    return new Promise((resolve) => {
        let elTitle = document.getElementById('modal-confirm-title');
        let elText = document.getElementById('modal-confirm-text');
        let modal = document.getElementById('modal-confirm-custom');
        
        if (!modal || !elTitle || !elText) {
            alert(text.replace(/<[^>]*>?/gm, ''));
            resolve(true);
            return;
        }

        elTitle.innerText = title;
        elTitle.style.color = primaryColor;
        elText.innerHTML = text;
        
        let btnP = document.getElementById('modal-confirm-btn-primary');
        btnP.innerText = btnText;
        btnP.style.background = primaryColor;
        btnP.onclick = () => { modal.style.display = 'none'; resolve(true); };
        
        let btnS = document.getElementById('modal-confirm-btn-secondary');
        if(btnS) btnS.style.display = 'none'; 
        
        modal.style.display = 'flex';
    });
}

let db; let jogadores = []; let jogadorEdicaoId = null; let currentProfile = null; let currentUser = null; let supabaseChannel = null;
let publicSyncInterval = null;
const coresTimes = ["Vermelho", "Azul", "Amarelo", "Verde", "Branco", "Preto", "Roxo", "Laranja"];
const emojisTimes = ["🔴", "🔵", "🟡", "🟢", "⚪", "⚫", "🟣", "🟠"];
const posMap = { "Atacante": "ATA", "Meia": "MEI", "Lateral": "LAT", "Zagueiro": "ZAG", "Goleiro": "GOL", "Linha": "LIN" };

function getCorHex(corBase) {
    const map = { "Vermelho": "#ef4444", "Azul": "#3b82f6", "Amarelo": "#d97706", "Verde": "#10b981", "Branco": "#64748b", "Preto": "#0f172a", "Roxo": "#8b5cf6", "Laranja": "#f97316" };
    return map[corBase] || "#4f46e5";
}

window.timesSorteadosObjs = []; window.reservasSorteados = []; window.partidaSalva = true; window.jogosDaRodada = []; window.filaEquipes = []; window.custosDaRodada = []; window.despesasMensaisGlobais = [];
window.isModoPublico = false; window.dataPartidaAtual = null; window.partidaAtualId = null; window.codigoAcessoAtual = null; window.golsTempA = []; window.golsTempB = [];
window.coringasAtivos = {}; 

window.onload = async function() {
    try {
        if(typeof supabaseUrl === 'undefined' || typeof supabaseKey === 'undefined') { alert("Erro crítico: config.js ausente."); return; }
        db = window.supabase.createClient(supabaseUrl, supabaseKey);
        const code = new URLSearchParams(window.location.search).get('code');
        if(code) { document.getElementById('codigo-baba-input').value = code; acessarModoPublico(); } 
        else { carregarEstadoCompleto(); if(checarReset24h()) limparEstadoRodada(); verificarSessao(); }
    } catch(e) { console.error("Falha ao iniciar app:", e); }
};

function iniciarOuvinteRealtime(partidaId) {
    if (!partidaId) return;
    if (supabaseChannel) db.removeChannel(supabaseChannel);
    
    supabaseChannel = db.channel('partida_' + partidaId).on('postgres_changes', { event: '*', schema: 'public', table: 'partidas', filter: `id=eq.${partidaId}` }, payload => {
        const novaPartida = payload.new;
        if (novaPartida) {
            processarDadosRecebidosNuvem(novaPartida);
        }
    }).subscribe();

    if (window.isModoPublico && !publicSyncInterval) {
        publicSyncInterval = setInterval(async () => {
            if (!window.partidaAtualId) return;
            try {
                const { data: p } = await db.from('partidas').select('*').eq('id', window.partidaAtualId).single();
                if (p) processarDadosRecebidosNuvem(p);
            } catch(e) {}
        }, 4000);
    }
}

function processarDadosRecebidosNuvem(novaPartida) {
    if (window.isModoPublico && !novaPartida.codigo_acesso) { 
        customAlert("Fim de Jogo", "O organizador encerrou a rodada.", "Sair", "var(--text-muted)").then(() => sairModoPublico()); 
        return; 
    }
    if (novaPartida.jogos_json) window.jogosDaRodada = safeParse(novaPartida.jogos_json);
    if (novaPartida.artilheiros_json) window.artilheirosPub = safeParse(novaPartida.artilheiros_json);
    window.filaEquipes = safeParse(novaPartida.fila_json) || [];
    window.partidaSalva = (window.filaEquipes.length === 0 && window.jogosDaRodada.length > 0);
    
    if (novaPartida.times_json) {
        window.timesSorteadosObjs = safeParse(novaPartida.times_json) || [];
        window.coringasAtivos = {}; 
        window.timesSorteadosObjs.forEach(t => { 
            if (t.coringas && t.coringas.length > 0) {
                window.coringasAtivos[t.id] = t.coringas; 
            }
        });
    }

    atualizarFilaUI();
    renderizarSumula();
    let vEst = document.getElementById('view-estatisticas');
    if (vEst && vEst.classList.contains('active')) renderizarPainelDoDia();
    let vFin = document.getElementById('view-financeiro');
    if (vFin && vFin.classList.contains('active')) gerarRelatorioMensal();
}

function salvarEstadoCompleto() {
    if(window.isModoPublico) return;
    try {
        localStorage.setItem('baba_full_state', JSON.stringify({
            timesSorteadosObjs: window.timesSorteadosObjs, reservasSorteados: window.reservasSorteados, jogosDaRodada: window.jogosDaRodada, filaEquipes: window.filaEquipes, partidaSalva: window.partidaSalva,
            custosDaRodada: window.custosDaRodada, despesasMensaisGlobais: window.despesasMensaisGlobais, dataPartidaAtual: window.dataPartidaAtual, partidaAtualId: window.partidaAtualId,
            codigoAcessoAtual: window.codigoAcessoAtual, valorMensalistaAtual: document.getElementById('valor-mensalista').value, valorConvidadoAtual: document.getElementById('valor-convidado').value,
            golsTempA: window.golsTempA, golsTempB: window.golsTempB, coringasAtivos: window.coringasAtivos
        }));
    } catch(e) {}
}

function carregarEstadoCompleto() {
    const saved = localStorage.getItem('baba_full_state');
    if(saved) {
        try {
            const state = JSON.parse(saved);
            window.timesSorteadosObjs = state.timesSorteadosObjs || []; window.reservasSorteados = state.reservasSorteados || []; window.jogosDaRodada = state.jogosDaRodada || []; window.filaEquipes = state.filaEquipes || [];
            window.partidaSalva = state.partidaSalva !== undefined ? state.partidaSalva : true; window.custosDaRodada = state.custosDaRodada || []; window.despesasMensaisGlobais = state.despesasMensaisGlobais || [];
            window.dataPartidaAtual = state.dataPartidaAtual || null; window.partidaAtualId = state.partidaAtualId || null; window.codigoAcessoAtual = state.codigoAcessoAtual || null;
            
            window.golsTempA = state.golsTempA || []; window.golsTempB = state.golsTempB || []; window.coringasAtivos = state.coringasAtivos || {};

            let valMens = document.getElementById('valor-mensalista'); if(valMens && state.valorMensalistaAtual) valMens.value = state.valorMensalistaAtual;
            let valConv = document.getElementById('valor-convidado'); if(valConv && state.valorConvidadoAtual) valConv.value = state.valorConvidadoAtual;
            
            if(window.timesSorteadosObjs.length > 0) {
                if(window.codigoAcessoAtual) {
                    exibirBoxCodigoSorteio(window.codigoAcessoAtual);
                    let btnSum = document.getElementById('btn-ir-placares'); if(btnSum) { btnSum.style.display = 'block'; btnSum.innerText = window.partidaSalva ? "📝 Ver Súmula Anterior" : "📝 Preencher Súmula"; }
                    iniciarOuvinteRealtime(window.partidaAtualId);
                }
                setTimeout(() => renderizarSumula(), 50);
            }
        } catch(e) { limparEstadoRodada(); }
    }
}

function limparEstadoRodada() {
    window.timesSorteadosObjs = []; window.reservasSorteados = []; window.jogosDaRodada = []; window.filaEquipes = []; window.custosDaRodada = []; window.golsTempA = []; window.golsTempB = []; window.coringasAtivos = {};
    window.dataPartidaAtual = null; window.partidaAtualId = null; window.codigoAcessoAtual = null; window.partidaSalva = true;
    localStorage.removeItem('baba_full_state');
}

function checarReset24h() {
    let ultimoReset = localStorage.getItem('baba_last_reset'); let agora = Date.now();
    if(!ultimoReset || (agora - parseInt(ultimoReset)) > 518400000) { localStorage.removeItem('baba_presencas_temp'); localStorage.setItem('baba_last_reset', agora); return true; } return false;
}

function mudarAba(viewId) {
    document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    let vId = document.getElementById(viewId); if(vId) vId.classList.add('active');
    let navId = viewId.replace('view-', 'nav-'); if(viewId === 'view-admin') navId = 'nav-admin'; if(viewId === 'view-conta') navId = 'nav-conta';
    let navEl = document.getElementById(navId); if(navEl) navEl.classList.add('active');
    window.scrollTo(0, 0);
    if(viewId === 'view-estatisticas') carregarEstatisticasGerais(); if(viewId === 'view-placares') renderizarSumula();
    if(viewId === 'view-financeiro') atualizarFinanceiro(); if(viewId === 'view-admin') carregarPainelAdmin();
}

async function verificarSessao() { 
    try {
        const { data: { session } } = await db.auth.getSession();
        if (session) { currentUser = session.user; await checarPerfilEValidade(session.user); } else mostrarLogin();
    } catch(e) { mostrarLogin(); }
}

async function criarConta() { 
    const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value; const msg = document.getElementById('auth-msg');
    if(password.length < 6) return msg.innerText = "A senha deve ter 6+ caracteres.";
    msg.innerText = "Processando...";
    const { error } = await db.auth.signUp({ email, password });
    if (error) { msg.style.color = "var(--danger)"; msg.innerText = error.message; } else { msg.style.color = "var(--primary)"; msg.innerHTML = "✅ Conta criada! Aguarde a liberação do acesso."; }
}

async function fazerLogin() { 
    const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value; const msg = document.getElementById('auth-msg');
    msg.innerText = "Conectando...";
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) { msg.style.color = "var(--danger)"; msg.innerText = "Credenciais inválidas."; return; }
    currentUser = data.user; await checarPerfilEValidade(data.user);
}

async function checarPerfilEValidade(user) {
    let { data: profile, error } = await db.from('profiles').select('*').eq('id', user.id).single();
    if (error || !profile) {
        const { data: newProfile, error: insertError } = await db.from('profiles').insert([{ id: user.id, email: user.email, is_authorized: false, is_admin: false, nome_baba: "", jogadores_por_time: 7, despesas_mensais_json: [] }]).select().single();
        if (insertError || !newProfile) { await db.auth.signOut(); alert("Erro ao carregar ou criar perfil."); mostrarLogin(); return; }
        profile = newProfile;
    }
    if (!profile.is_authorized) { await db.auth.signOut(); alert("Conta não autorizada."); mostrarLogin(); return; }
    if (!profile.is_admin && profile.subscription_expires_at) {
        if (profile.subscription_expires_at < new Date().toISOString().substring(0, 10)) {
            await db.auth.signOut(); alert(`Assinatura venceu em ${profile.subscription_expires_at.split('-').reverse().join('/')}.`); mostrarLogin(); return;
        }
    }
    currentProfile = profile; window.despesasMensaisGlobais = safeParse(profile.despesas_mensais_json) || []; mostrarApp();
}

async function fazerLogout() { 
    await db.auth.signOut(); currentProfile = null; currentUser = null; 
    if (supabaseChannel) db.removeChannel(supabaseChannel);
    if (publicSyncInterval) clearInterval(publicSyncInterval);
    localStorage.removeItem('baba_full_state'); localStorage.removeItem('baba_presencas_temp'); localStorage.removeItem('baba_last_reset');
    limparEstadoRodada(); mostrarLogin();
}

function mostrarApp() { 
    window.isModoPublico = false; 
    let authC = document.getElementById('auth-container'); if(authC) authC.style.display = 'none'; 
    let appC = document.getElementById('app-container'); if(appC) { appC.style.display = 'block'; appC.classList.remove('public-mode'); }
    let btnSairP = document.getElementById('btn-sair-publico'); if(btnSairP) btnSairP.style.display = 'none';
    
    if (currentProfile && currentProfile.is_admin) { 
        document.body.classList.add('is-master-admin'); 
        let title = document.getElementById('top-bar-title'); if(title) title.innerText = "Painel Master"; 
        mudarAba('view-admin'); 
    } else {
        document.body.classList.remove('is-master-admin'); 
        let title = document.getElementById('top-bar-title'); if(title) title.innerText = currentProfile.nome_baba || "Pega o Baba";
        
        let nomeBaba = document.getElementById('nome-baba-input'); if(nomeBaba) nomeBaba.value = currentProfile.nome_baba || "";
        let jogTime = document.getElementById('jogadores-por-time-input'); if(jogTime) jogTime.value = currentProfile.jogadores_por_time || 7;
        
        if (currentProfile.escudo_url) { 
            let tEsc = document.getElementById('top-bar-escudo'); if(tEsc) { tEsc.src = currentProfile.escudo_url; tEsc.style.display = 'block'; }
            let pEsc = document.getElementById('preview-escudo'); if(pEsc) { pEsc.src = currentProfile.escudo_url; pEsc.style.display = 'block'; }
        } else { 
            let tEsc = document.getElementById('top-bar-escudo'); if(tEsc) tEsc.style.display = 'none'; 
            let pEsc = document.getElementById('preview-escudo'); if(pEsc) pEsc.style.display = 'none'; 
        }
        
        let orgEmail = document.getElementById('organizer-email-label'); 
        if(orgEmail && currentUser) orgEmail.innerText = currentUser.email; 
        
        carregarElencoDaNuvem(); mudarAba('view-sorteio');
    }
}

function mostrarLogin() { 
    document.body.classList.remove('is-master-admin'); 
    let authC = document.getElementById('auth-container'); if(authC) authC.style.display = 'block'; 
    let appC = document.getElementById('app-container'); if(appC) appC.style.display = 'none'; 
}

async function salvarNomeBaba() {
    if (!currentUser) return;
    let novoNome = document.getElementById('nome-baba-input').value.trim();
    const { error } = await db.from('profiles').update({ nome_baba: novoNome }).eq('id', currentUser.id);
    if (error) alert("Erro ao salvar nome: " + error.message); 
    else { alert("✅ Nome do Baba atualizado com sucesso!"); let title = document.getElementById('top-bar-title'); if(title) title.innerText = novoNome || "Pega o Baba"; if(currentProfile) currentProfile.nome_baba = novoNome; }
}

async function salvarJogadoresPorTime() {
    if (!currentUser) return;
    let qtd = parseInt(document.getElementById('jogadores-por-time-input').value) || 7;
    if (qtd < 3 || qtd > 15) return alert("Insira um número válido entre 3 e 15.");
    const { error } = await db.from('profiles').update({ jogadores_por_time: qtd }).eq('id', currentUser.id);
    if (error) alert("Erro ao salvar tamanho das equipes: " + error.message); else { alert("✅ Tamanho das equipes atualizado!"); if(currentProfile) currentProfile.jogadores_por_time = qtd; }
}

async function salvarEscudoBaba() {
    if (!currentUser) return;
    const fileInput = document.getElementById('input-escudo-baba'); const file = fileInput.files[0];
    if(!file) return alert("Por favor, selecione uma imagem no seu celular/computador.");
    const btn = document.getElementById('btn-salvar-escudo'); btn.innerText = "Enviando... Aguarde"; btn.disabled = true;
    
    if (currentProfile && currentProfile.escudo_url) {
        try { let urlAntiga = currentProfile.escudo_url; let partes = urlAntiga.split('/escudos/'); if (partes.length > 1) await db.storage.from('escudos').remove([partes[1]]); } 
        catch (err) { console.error("Aviso:", err); }
    }

    const fileExt = file.name.split('.').pop(); const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
    const { data, error } = await db.storage.from('escudos').upload(fileName, file, { upsert: true });
    
    if (error) { alert("Erro ao enviar imagem: " + error.message); btn.innerText = "Fazer Upload da Imagem"; btn.disabled = false; return; }
    
    const escudoUrl = db.storage.from('escudos').getPublicUrl(fileName).data.publicUrl;
    const { error: errP } = await db.from('profiles').update({ escudo_url: escudoUrl }).eq('id', currentUser.id);
    
    if (errP) alert("Erro ao vincular escudo: " + errP.message); 
    else { 
        alert("✅ Escudo atualizado!"); if(currentProfile) currentProfile.escudo_url = escudoUrl; 
        let tEsc = document.getElementById('top-bar-escudo'); if(tEsc) { tEsc.src = escudoUrl; tEsc.style.display = 'block'; } 
        let pEsc = document.getElementById('preview-escudo'); if(pEsc) { pEsc.src = escudoUrl; pEsc.style.display = 'block'; }
    }
    btn.innerText = "Fazer Upload da Imagem"; btn.disabled = false; fileInput.value = ""; 
}

async function alterarSenhaOrganizador() {
    const novaSenha = document.getElementById('nova-senha-organizador').value;
    if(!novaSenha || novaSenha.length < 6) return alert("A senha deve ter pelo menos 6 caracteres.");
    const { error } = await db.auth.updateUser({ password: novaSenha });
    if(error) alert("Erro ao alterar senha: " + error.message); else { alert("✅ Senha alterada!"); document.getElementById('nova-senha-organizador').value = ''; }
}

async function zerarHistoricoAdmin() {
    if(!currentUser) return;
    let querZerar = await customConfirm("⚠️ Nova Temporada", "Isso vai apagar <strong>TODAS</strong> as partidas, súmulas, caixa e estatísticas.<br><br>O seu Elenco de jogadores será mantido.<br><br>Deseja continuar?", "Apagar Tudo", "Cancelar", "var(--danger)");
    if(!querZerar) return;

    try {
        let dbStatus = document.getElementById('status-db'); if(dbStatus) dbStatus.innerText = "Limpando...";
        const { data: partidas } = await db.from('partidas').select('id').eq('user_id', currentUser.id);
        if (partidas && partidas.length > 0) { const idsPartidas = partidas.map(p => p.id); await db.from('presencas').delete().in('partida_id', idsPartidas); await db.from('partidas').delete().in('id', idsPartidas); }
        
        let querZerarPagamentos = await customConfirm("💰 Zerar Pagamentos?", "Deseja zerar também a contabilidade mensal (Pendente/Pago) dos Mensalistas?", "Sim, zerar tudo", "Não, manter como está", "var(--supabase)");
        if(querZerarPagamentos) await db.from('jogadores').update({ pagamentos_json: {} }).eq('user_id', currentUser.id);
        
        localStorage.removeItem('baba_full_state'); localStorage.removeItem('baba_presencas_temp'); localStorage.removeItem('baba_last_reset'); window.despesasMensaisGlobais = [];
        await db.from('profiles').update({ despesas_mensais_json: [] }).eq('id', currentUser.id);
        
        await customAlert("✅ Concluído", "O histórico foi apagado com sucesso. O sistema será reiniciado.", "OK", "var(--primary)");
        window.location.reload();
    } catch (err) { alert("Erro ao limpar histórico: " + err.message); let dbStatus = document.getElementById('status-db'); if(dbStatus) dbStatus.innerText = "Online"; }
}

async function carregarPainelAdmin() {
    if (!currentProfile || !currentProfile.is_admin) return;
    const container = document.getElementById('lista-organizadores-admin'); if(!container) return;
    container.innerHTML = "Carregando usuários...";
    const { data: users, error } = await db.from('profiles').select('*').order('email');
    if (error) { container.innerHTML = "Erro ao carregar usuários."; return; }
    if (!users || users.length === 0) { container.innerHTML = "Nenhum usuário cadastrado."; return; }

    container.innerHTML = "";
    users.forEach(u => {
        let expDate = u.subscription_expires_at || '';
        container.innerHTML += `<div style="background: var(--light); padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 10px; font-size: 13px;"><div style="font-weight: 700; margin-bottom: 5px;">${u.email} ${u.is_admin ? '(Master Admin)' : ''}</div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><label style="font-size: 11px;">Autorizado: <input type="checkbox" id="auth-${u.id}" ${u.is_authorized ? 'checked' : ''} onchange="atualizarAdminUser('${u.id}')"></label><label style="font-size: 11px;">Vencimento: <input type="date" id="date-${u.id}" value="${expDate}" style="width: auto; padding: 6px; margin: 0;" onchange="atualizarAdminUser('${u.id}')"></label><span id="msg-${u.id}" style="font-size: 11px; color: var(--supabase); font-weight: bold;"></span></div></div>`;
    });
}

async function atualizarAdminUser(uid) {
    let isAuth = document.getElementById(`auth-${uid}`).checked; let expDate = document.getElementById(`date-${uid}`).value || null; let msgSpan = document.getElementById(`msg-${uid}`);
    const { error } = await db.from('profiles').update({ is_authorized: isAuth, subscription_expires_at: expDate }).eq('id', uid);
    if (error) alert("Erro ao atualizar: " + error.message); else { if(msgSpan) msgSpan.innerText = "Salvo!"; setTimeout(() => { if(msgSpan) msgSpan.innerText = ""; }, 2000); }
}

async function acessarModoPublico() {
    const codigoInput = document.getElementById('codigo-baba-input'); const codigo = codigoInput ? codigoInput.value.trim().toUpperCase() : "";
    if(!codigo) return alert("Digite um código válido.");
    
    let authC = document.getElementById('auth-container'); if(authC) authC.style.display = 'none'; 
    let appC = document.getElementById('app-container'); if(appC) { appC.style.display = 'block'; appC.classList.add('public-mode'); }
    let btnSairP = document.getElementById('btn-sair-publico'); if(btnSairP) btnSairP.style.display = 'block'; 
    window.isModoPublico = true;
    
    let dbStatus = document.getElementById('status-db'); if(dbStatus) dbStatus.innerText = "Buscando Baba...";
    const { data: partida, error } = await db.from('partidas').select('*').eq('codigo_acesso', codigo).single();
    if(error || !partida) { alert("Baba não encontrado ou código inválido."); sairModoPublico(); return; }

    if (partida.user_id) {
        const { data: prof } = await db.from('profiles').select('despesas_mensais_json').eq('id', partida.user_id).single();
        window.despesasMensaisGlobais = prof ? (safeParse(prof.despesas_mensais_json) || []) : [];
    }
    if (partida.created_at) { if (new Date().getTime() - new Date(partida.created_at).getTime() > 518400000) { await customAlert("⚠️ Rodada Expirada", "Este jogo já foi encerrado pelo organizador há muito tempo.", "Sair", "var(--text-muted)"); sairModoPublico(); return; } }
    
    let topTitle = document.getElementById('top-bar-title'); if(topTitle) topTitle.innerText = partida.nome_baba || "Pega o Baba";
    if (partida.escudo_url) { 
        let tEsc = document.getElementById('top-bar-escudo'); if(tEsc) { tEsc.src = partida.escudo_url; tEsc.style.display = 'block'; } 
    } else { 
        let tEsc = document.getElementById('top-bar-escudo'); if(tEsc) tEsc.style.display = 'none'; 
    }

    window.partidaAtualId = partida.id; 
    if(dbStatus) dbStatus.innerText = `Visualizando: ${codigo}`;
    window.custosDaRodada = safeParse(partida.custos_json) || [];
    
    let vConv = document.getElementById('valor-convidado'); if(vConv && partida.valor_por_convidado) vConv.value = partida.valor_por_convidado;
    let vMens = document.getElementById('valor-mensalista'); if(vMens && partida.valor_por_mensalista) vMens.value = partida.valor_por_mensalista;
    
    if(partida.data_sorteio) { let d = new Date(partida.data_sorteio); window.dataPartidaAtual = !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) : partida.data_sorteio; }
    
    processarDadosRecebidosNuvem(partida);
    iniciarOuvinteRealtime(window.partidaAtualId);
    
    atualizarListaJogosDaRodada(); mudarAba('view-placares'); 
    window.artilheirosPub = safeParse(partida.artilheiros_json) || {}; renderizarPainelDoDia(); 
    window.history.pushState({}, '', `?code=${codigo}`);
}

function sairModoPublico() { 
    if (supabaseChannel) db.removeChannel(supabaseChannel); 
    if (publicSyncInterval) clearInterval(publicSyncInterval);
    window.history.pushState({}, '', window.location.pathname); 
    window.location.reload(); 
}

async function carregarElencoDaNuvem() {
    if (!currentUser) return;
    let dbStatus = document.getElementById('status-db');
    if(dbStatus) { dbStatus.innerText = "Sincronizando..."; dbStatus.style.backgroundColor = "var(--warning)"; }
    
    try {
        const { data, error } = await db.from('jogadores').select('*').eq('user_id', currentUser.id).order('nome', { ascending: true });
        if (error) throw error;
        
        let estadoLocal = {};
        try { estadoLocal = JSON.parse(localStorage.getItem('baba_presencas_temp')) || {}; } catch(e) { localStorage.removeItem('baba_presencas_temp'); }
        
        jogadores = data.map(j => ({ ...j, presente: estadoLocal[j.id]?.presente || false, ordemChegada: estadoLocal[j.id]?.ordemChegada || 0, pagou: estadoLocal[j.id]?.pagou || false, pagamentos_json: safeParse(j.pagamentos_json) || {} }));
        if(dbStatus) { dbStatus.innerText = "Online"; dbStatus.style.backgroundColor = "var(--supabase)"; }
        atualizarListas(); atualizarFinanceiro(); await checarPartidaAtivaAdmin();
    } catch(err) {
        if(dbStatus) { dbStatus.innerText = "Off-line"; dbStatus.style.backgroundColor = "var(--danger)"; }
    }
}

async function checarPartidaAtivaAdmin() {
    if (!currentUser || window.isModoPublico) return;
    try {
        const { data: partidas, error } = await db.from('partidas').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1);
        
        if (!error && partidas && partidas.length > 0) {
            let p = partidas[0];
            if (p.created_at && (Date.now() - new Date(p.created_at).getTime()) <= 518400000) { 
                
                if (window.partidaAtualId === p.id && window.timesSorteadosObjs.length > 0) {
                    let vPlac = document.getElementById('view-placares'); if(vPlac && vPlac.classList.contains('active')) renderizarSumula();
                    let vEst = document.getElementById('view-estatisticas'); if(vEst && vEst.classList.contains('active')) renderizarPainelDoDia();
                    let vFin = document.getElementById('view-financeiro'); if(vFin && vFin.classList.contains('active')) atualizarFinanceiro();
                    return;
                }

                window.partidaAtualId = p.id; window.codigoAcessoAtual = p.codigo_acesso;
                window.jogosDaRodada = safeParse(p.jogos_json) || []; window.custosDaRodada = safeParse(p.custos_json) || [];
                window.filaEquipes = safeParse(p.fila_json) || [];
                window.golsTempA = []; window.golsTempB = [];
                
                if (p.times_json) {
                    window.timesSorteadosObjs = safeParse(p.times_json) || [];
                    window.coringasAtivos = {}; 
                    window.timesSorteadosObjs.forEach(t => { if(t.coringas && t.coringas.length > 0) window.coringasAtivos[t.id] = t.coringas; });
                }
                
                window.partidaSalva = (window.timesSorteadosObjs.length > 0 && window.filaEquipes.length === 0 && window.jogosDaRodada.length > 0);
                
                if (p.data_sorteio) { let d = new Date(p.data_sorteio); window.dataPartidaAtual = !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) : p.data_sorteio; }
                if (window.timesSorteadosObjs.length > 0) {
                    if(window.codigoAcessoAtual) exibirBoxCodigoSorteio(window.codigoAcessoAtual);
                    let btnSum = document.getElementById('btn-ir-placares');
                    if(btnSum) { btnSum.style.display = 'block'; btnSum.innerText = window.partidaSalva ? "📝 Ver Súmula Anterior" : "📝 Preencher Súmula"; }
                }
                iniciarOuvinteRealtime(window.partidaAtualId);
                renderizarSumula(); renderizarPainelDoDia(); atualizarFinanceiro();
            }
        }
    } catch(e) { console.error("Erro checando partida ativa", e); }
}

function prepararEdicao(indexArray) {
    const j = jogadores[indexArray];
    let nomeInp = document.getElementById('nome'); if(nomeInp) nomeInp.value = j.nome; 
    let tipoInp = document.getElementById('tipo'); if(tipoInp) tipoInp.value = j.tipo; 
    let posInp = document.getElementById('posicao'); if(posInp) posInp.value = j.posicao; 
    let nivInp = document.getElementById('nivel'); if(nivInp) nivInp.value = j.nivel;
    jogadorEdicaoId = j.id; 
    let titForm = document.getElementById('titulo-form'); if(titForm) titForm.innerText = "Editando Jogador"; 
    let cardForm = document.getElementById('card-formulario'); if(cardForm) cardForm.classList.add("editando");
    let btnAd = document.getElementById('btn-adicionar'); if(btnAd) btnAd.innerText = "Salvar Alterações"; 
    let btnCanc = document.getElementById('btn-cancelar-edicao'); if(btnCanc) btnCanc.style.display = "block"; 
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelarEdicao() {
    jogadorEdicaoId = null; 
    let nomeInp = document.getElementById('nome'); if(nomeInp) nomeInp.value = ""; 
    let tipoInp = document.getElementById('tipo'); if(tipoInp) tipoInp.value = "Mensalista"; 
    let posInp = document.getElementById('posicao'); if(posInp) posInp.value = "Meia"; 
    let nivInp = document.getElementById('nivel'); if(nivInp) nivInp.value = "3";
    let titForm = document.getElementById('titulo-form'); if(titForm) titForm.innerText = "Adicionar ao Elenco"; 
    let cardForm = document.getElementById('card-formulario'); if(cardForm) cardForm.classList.remove("editando");
    let btnAd = document.getElementById('btn-adicionar'); if(btnAd) btnAd.innerText = "Incluir Jogador"; 
    let btnCanc = document.getElementById('btn-cancelar-edicao'); if(btnCanc) btnCanc.style.display = "none";
}

async function adicionarJogador() {
    if (!currentUser) return;
    const nomeInput = document.getElementById('nome'); const tipoInp = document.getElementById('tipo'); const posicaoInp = document.getElementById('posicao'); const nivelInp = document.getElementById('nivel');
    if(!nomeInput || !tipoInp || !posicaoInp || !nivelInp) return;
    
    const tipo = tipoInp.value; const posicao = posicaoInp.value; const nivel = parseInt(nivelInp.value); 
    const nome = nomeInput.value.trim().replace(/\s+/g, ' '); if (nome === "") return alert("Preencha o nome.");
    const nomeExiste = jogadores.some(j => { let nomeCadastrado = (j.nome || "").trim().toLowerCase(); return nomeCadastrado === nome.toLowerCase() && j.id !== jogadorEdicaoId; });
    if (nomeExiste) return await customAlert("Aviso", "Já existe um jogador cadastrado com este nome!", "OK", "var(--warning)");

    const btn = document.getElementById('btn-adicionar'); if(btn) { btn.innerText = "Processando..."; btn.disabled = true; }

    if (jogadorEdicaoId) {
        const { error } = await db.from('jogadores').update({ nome, tipo, posicao, nivel }).eq('id', jogadorEdicaoId);
        if (!error) { 
            let jIndex = jogadores.findIndex(j => j.id === jogadorEdicaoId);
            if (jIndex !== -1) { jogadores[jIndex].nome = nome; jogadores[jIndex].tipo = tipo; jogadores[jIndex].posicao = posicao; jogadores[jIndex].nivel = nivel; } 
            cancelarEdicao(); atualizarListas(); 
        } else alert("Erro: " + error.message);
    } else {
        const { data, error } = await db.from('jogadores').insert([{ nome, tipo, posicao, nivel, pagamentos_json: {}, user_id: currentUser.id }]).select();
        if (!error) { nomeInput.value = ""; nomeInput.focus(); jogadores.push({ ...data[0], presente: false, ordemChegada: 0, pagou: false }); atualizarListas(); } 
        else alert("Erro: " + error.message);
    }
    if(btn) { btn.innerText = "Incluir Jogador"; btn.disabled = false; }
}

async function removerJogador(idNuvem, indexArray) { 
    let conf = await customConfirm("Excluir Jogador", `Tem certeza que deseja remover <strong>${jogadores[indexArray].nome}</strong> do elenco permanentemente?`, "Sim, remover", "Cancelar", "var(--danger)");
    if(conf) { 
        const { error } = await db.from('jogadores').delete().eq('id', idNuvem);
        if (!error) { jogadores.splice(indexArray, 1); salvarEstadoLocal(); atualizarListas(); atualizarFinanceiro(); } else alert("Erro ao remover: " + error.message);
    } 
}

function salvarEstadoLocal() { 
    let estado = {}; jogadores.forEach(j => { if (j.presente || j.pagou) estado[j.id] = { presente: j.presente, ordemChegada: j.ordemChegada, pagou: j.pagou }; }); 
    localStorage.setItem('baba_presencas_temp', JSON.stringify(estado));
}

async function marcarPresenca(indexArray) { 
    if (jogadores[indexArray].tipo === 'Convidado' && !jogadores[indexArray].pagou) return await customAlert("Pagamento Pendente", "O convidado precisa efetuar o pagamento da diária antes de entrar na lista de sorteio.", "Entendi", "var(--warning)");
    jogadores[indexArray].presente = true; jogadores[indexArray].ordemChegada = Date.now(); salvarEstadoLocal(); atualizarListas(); 
}

async function marcarTodosPresentes() {
    let convidadosPendentes = 0; let countAdicionados = 0; let agora = Date.now();
    jogadores.forEach((j) => {
        if (!j.presente) {
            if (j.tipo === 'Convidado' && !j.pagou) convidadosPendentes++; else { j.presente = true; j.ordemChegada = agora++; countAdicionados++; }
        }
    });
    if (countAdicionados > 0) { salvarEstadoLocal(); atualizarListas(); }
    if (convidadosPendentes > 0) await customAlert("Aviso", `<strong>${convidadosPendentes} convidado(s)</strong> não adicionados pois precisam pagar a diária primeiro.`, "Entendi", "var(--warning)");
    else if (countAdicionados === 0) await customAlert("Elenco Completo", "Todos os jogadores do elenco já estão prontos pro jogo!", "OK", "var(--primary)");
}

function desmarcarPresenca(indexArray) { 
    jogadores[indexArray].presente = false; jogadores[indexArray].ordemChegada = 0; jogadores[indexArray].pagou = false; salvarEstadoLocal(); atualizarListas(); atualizarFinanceiro(); 
}

async function alternarMensalidade(idNuvem, indexArray) {
    const j = jogadores[indexArray]; const mesKey = new Date().toISOString().substring(0, 7); 
    if (!j.pagamentos_json) j.pagamentos_json = {};
    if(j.pagamentos_json[mesKey] === true) delete j.pagamentos_json[mesKey]; else j.pagamentos_json[mesKey] = true;
    atualizarListas(); atualizarFinanceiro(); await db.from('jogadores').update({ pagamentos_json: j.pagamentos_json }).eq('id', idNuvem);
}

function alternarPagamentoDiaria(indexArray) { 
    jogadores[indexArray].pagou = !jogadores[indexArray].pagou;
    if (jogadores[indexArray].tipo === 'Convidado' && !jogadores[indexArray].pagou && jogadores[indexArray].presente) { jogadores[indexArray].presente = false; jogadores[indexArray].ordemChegada = 0; }
    salvarEstadoLocal(); atualizarListas(); atualizarFinanceiro();
}

async function zerarPresencas() { 
    let conf = await customConfirm("Iniciar Nova Rodada", "Deseja preparar o aplicativo para um <strong>NOVO BABA</strong>?<br><br>Isso vai retirar todos da quadra e zerar as diárias.<br>(A Súmula atual continuará salva até você sortear).", "Sim, Iniciar Novo Baba", "Cancelar", "var(--primary)");
    if(conf) { 
        jogadores.forEach(j => { j.presente = false; j.ordemChegada = 0; j.pagou = false; }); salvarEstadoLocal(); atualizarListas(); atualizarFinanceiro(); 
        let res = document.getElementById('resultado'); if(res) res.innerHTML = ""; 
    } 
}

function filtrarElencoAdmin() {
    let inp = document.getElementById('busca-jogador-elenco'); if(!inp) return;
    let termo = inp.value.toLowerCase();
    document.querySelectorAll('#lista-elenco-admin .linha-jogador').forEach(linha => { linha.style.display = linha.getAttribute('data-nome').toLowerCase().includes(termo) ? 'grid' : 'none'; });
}

function filtrarSorteioAusentes() {
    let inp = document.getElementById('busca-jogador-sorteio'); if(!inp) return;
    let termo = inp.value.toLowerCase();
    document.querySelectorAll('#lista-aguardando .linha-jogador').forEach(linha => { linha.style.display = linha.getAttribute('data-nome').toLowerCase().includes(termo) ? 'grid' : 'none'; });
}

function atualizarListas() {
    const listaElenco = document.getElementById('lista-elenco-admin'); const listaAguardando = document.getElementById('lista-aguardando'); const listaPresentes = document.getElementById('lista-presentes');
    if(listaElenco) listaElenco.innerHTML = ""; if(listaAguardando) listaAguardando.innerHTML = ""; if(listaPresentes) listaPresentes.innerHTML = "";
    let presentes = []; const mesKey = new Date().toISOString().substring(0, 7);
    
    let todosOrdenados = [...jogadores].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
    
    todosOrdenados.forEach((j) => {
        let indexArray = jogadores.findIndex(jog => jog.id === j.id);
        let isPago = j.tipo === 'Mensalista' ? (j.pagamentos_json && j.pagamentos_json[mesKey] === true) : j.pagou;
        let colorStyle = isPago ? 'color: inherit;' : 'color: var(--danger); font-weight: 700;';
        let clickAction = j.tipo === 'Mensalista' ? `onclick="alternarMensalidade('${j.id}', ${indexArray})"` : `onclick="alternarPagamentoDiaria(${indexArray})"`;
        let publicDisabled = window.isModoPublico ? "" : clickAction; let cursorStyle = window.isModoPublico ? "" : "cursor: pointer;";
        let tagConvidado = j.tipo === 'Convidado' ? '<span class="badge badge-convidado">C</span>' : '';
        let posAbbr = posMap[j.posicao] || j.posicao; let tagPosicao = (j.posicao !== 'Goleiro' && j.posicao !== 'Linha') ? `<span class="badge badge-posicao" style="display: inline-block; min-width: 28px; text-align: center;">${posAbbr}</span>` : '';
        let nomeSeguro = j.nome || "Sem Nome";

        if(listaElenco) {
            let btnEdicao = `<button class="btn-small btn-acao-outline" onclick="prepararEdicao(${indexArray})">✏️</button>`;
            let btnExcluir = `<button class="btn-small btn-acao-outline" style="color:var(--danger); border-color:var(--danger);" onclick="removerJogador('${j.id}', ${indexArray})">X</button>`;
            let btnMensal = j.tipo === 'Mensalista' ? (isPago ? `<button class="btn-small btn-pagou" onclick="alternarMensalidade('${j.id}', ${indexArray})">Pago</button>` : `<button class="btn-small btn-devendo" onclick="alternarMensalidade('${j.id}', ${indexArray})">Pendente</button>`) : `<span>Diária local</span>`;
            listaElenco.innerHTML += `<div class="linha-jogador grid-elenco" data-nome="${nomeSeguro}"><div class="col-nome">${tagConvidado} <span style="margin-left: 4px;">${nomeSeguro}</span></div><div class="col-status">${btnMensal}</div><div class="col-acoes">${btnEdicao} ${btnExcluir}</div></div>`;
        }
        if(j.presente) presentes.push({ ...j, indexArray: indexArray, nome: nomeSeguro });
        else if(listaAguardando) {
            let btnAcoesAguardando = '';
            if (j.tipo === 'Convidado') btnAcoesAguardando += isPago ? `<button class="btn-small btn-pagou" onclick="alternarPagamentoDiaria(${indexArray})">Pago</button>` : `<button class="btn-small btn-devendo" onclick="alternarPagamentoDiaria(${indexArray})">Pendente</button>`;
            listaAguardando.innerHTML += `<div class="linha-jogador grid-aguardando" data-nome="${nomeSeguro}"><div class="col-nome" style="justify-content: space-between; width: 100%;"><div style="display:flex; align-items:center; gap:5px; overflow:hidden; flex: 1; min-width: 0; ${colorStyle} ${cursorStyle}" ${publicDisabled} title="${isPago ? 'Pago' : 'Pendente - Clique para pagar'}">${tagConvidado} <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${nomeSeguro}</span></div>${tagPosicao ? `<div style="flex-shrink:0; margin-left: 5px;">${tagPosicao}</div>` : ''}</div><div class="col-status">${btnAcoesAguardando}</div><div class="col-acoes"><button class="btn-small btn-presente" onclick="marcarPresenca(${indexArray})">Chegou</button></div></div>`;
        }
    });
    
    presentes.sort((a, b) => { if (a.tipo === 'Mensalista' && b.tipo !== 'Mensalista') return -1; if (a.tipo !== 'Mensalista' && b.tipo === 'Mensalista') return 1; return a.ordemChegada - b.ordemChegada; });
    
    presentes.forEach((j, pos) => {
        let tagConvidado = j.tipo === 'Convidado' ? '<span class="badge badge-convidado">C</span>' : '';
        let isPago = j.tipo === 'Mensalista' ? (j.pagamentos_json && j.pagamentos_json[mesKey] === true) : j.pagou;
        let colorStyle = isPago ? 'color: inherit;' : 'color: var(--danger); font-weight: 700;';
        let clickAction = j.tipo === 'Mensalista' ? `onclick="alternarMensalidade('${j.id}', ${j.indexArray})"` : `onclick="alternarPagamentoDiaria(${j.indexArray})"`;
        let publicDisabled = window.isModoPublico ? "" : clickAction; let cursorStyle = window.isModoPublico ? "" : "cursor: pointer;";
        let posAbbr = posMap[j.posicao] || j.posicao; let tagPosicao = (j.posicao !== 'Goleiro' && j.posicao !== 'Linha') ? `<span class="badge badge-posicao" style="display: inline-block; min-width: 28px; text-align: center;">${posAbbr}</span>` : '';
        if(listaPresentes) listaPresentes.innerHTML += `<div class="linha-jogador grid-prontos"><div class="col-nome" style="justify-content: space-between; width: 100%;"><div style="display:flex; align-items:center; gap:5px; overflow:hidden; flex: 1; min-width: 0; ${colorStyle} ${cursorStyle}" ${publicDisabled} title="${isPago ? 'Pago' : 'Pendente - Clique para pagar'}"><span class="badge" style="background:var(--dark); color:white; flex-shrink:0;">${pos + 1}º</span> ${tagConvidado} <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${j.nome}</span></div>${tagPosicao ? `<div style="flex-shrink:0; margin-left: 5px;">${tagPosicao}</div>` : ''}</div><div class="col-acoes"><button class="btn-small btn-acao-outline hidden-public" style="color:var(--danger); border-color:var(--danger);" onclick="desmarcarPresenca(${j.indexArray})">Retirar</button></div></div>`;
    });
    
    let elTotalPres = document.getElementById('total-presentes'); if(elTotalPres) elTotalPres.innerText = presentes.length; 
    let elTotalElenco = document.getElementById('total-elenco'); if(elTotalElenco) elTotalElenco.innerText = jogadores.length;
    let btnZerar = document.getElementById('btn-zerar'); if(btnZerar) btnZerar.style.display = "block";
    filtrarElencoAdmin(); filtrarSorteioAusentes();
}

function embaralhar(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; }

async function iniciarSorteioComSuspense() {
    let presentes = jogadores.filter(j => j.presente).sort((a, b) => { if (a.tipo === 'Mensalista' && b.tipo !== 'Mensalista') return -1; if (a.tipo !== 'Mensalista' && b.tipo === 'Mensalista') return 1; return a.ordemChegada - b.ordemChegada; });
    if (presentes.length < 2) return await customAlert("Aviso", "Adicione pelo menos 2 atletas na lista de Prontos.", "OK", "var(--warning)");
    
    let isAppend = false;
    if (window.timesSorteadosObjs.length > 0 && !window.partidaSalva) {
        // CORREÇÃO: Filtra apenas quem está presente, NÃO está em nenhum time e NÃO está na lista de reservas (DM)
        let jogadoresSemTime = presentes.filter(p => 
            !window.timesSorteadosObjs.some(t => t.jogadores.some(tj => tj.id === p.id)) &&
            !window.reservasSorteados.some(r => r.id === p.id)
        );

        if (jogadoresSemTime.length === 0) {
            let conf = await customConfirm("Times Completos", "Todos os presentes já estão em quadra ou no banco.<br><br>Deseja APAGAR TUDO e refazer o sorteio do zero?", "Apagar e Refazer", "Cancelar", "var(--danger)");
            if(!conf) return;
        } else {
            let acao = await customConfirm("Jogadores Extras", `Você tem <strong>${jogadoresSemTime.length} jogador(es)</strong> recém-chegados.<br><br>O que deseja fazer?`, "➕ Preencher os times", "🔄 Apagar tudo e misturar", "var(--primary)");
            if(acao) {
                isAppend = true; presentes = jogadoresSemTime; 
                if(presentes.length === 0) return; 
            } else { 
                let confM = await customConfirm("Atenção", "Tem certeza que deseja APAGAR os times atuais e misturar todo mundo de novo? (Não apaga os jogos de hoje).", "Sim, Misturar", "Cancelar", "var(--danger)");
                if(!confM) return; 
            }
        }
    }

    let btnP = document.getElementById('btn-ir-placares'); if(btnP) btnP.style.display = 'none';
    let boxSorteio = document.getElementById('box-codigo-gerado-sorteio'); if(boxSorteio) { boxSorteio.style.display = 'none'; boxSorteio.innerHTML = ''; }
    let res = document.getElementById('resultado'); if(res) res.innerHTML = `<div style="text-align:center; padding:40px; font-weight:bold; color:var(--primary);">Processando Algoritmo...</div>`;
    setTimeout(() => { sortearTimes(presentes, isAppend); }, 1500);
}

async function sortearTimes(presentesBrutos, isAppend) {
    try {
        if (!isAppend && supabaseChannel) { db.removeChannel(supabaseChannel); supabaseChannel = null; }
        
        let modoSel = document.getElementById('modo-sorteio'); let modo = modoSel ? modoSel.value : 'todos'; 
        let prioCb = document.getElementById('priorizar-ordem'); let priorizarOrdem = prioCb ? prioCb.checked : false;
        let incluiGoleiros = (modo === '14' || modo === 'todos');
        window.dataPartidaAtual = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});

        let jogadoresLivres = [...presentesBrutos]; 
        let reservasNovas = [];
        
        if (!incluiGoleiros) { 
            reservasNovas.push(...jogadoresLivres.filter(j => j.posicao === 'Goleiro')); 
            jogadoresLivres = jogadoresLivres.filter(j => j.posicao !== 'Goleiro'); 
        }

        let tamanhoIdeal = currentProfile && currentProfile.jogadores_por_time ? parseInt(currentProfile.jogadores_por_time) : 7;
        
        if (isAppend) {
            jogadoresLivres.sort((a, b) => (Number(b.nivel) || 3) - (Number(a.nivel) || 3));
            let incompletos = window.timesSorteadosObjs.filter(t => t.jogadores.length < tamanhoIdeal);
            
            while (jogadoresLivres.length > 0 && incompletos.length > 0) {
                incompletos.sort((a, b) => {
                    if (a.jogadores.length !== b.jogadores.length) return a.jogadores.length - b.jogadores.length;
                    let scoreA = a.jogadores.reduce((acc, j) => acc + (Number(j.nivel) || 3), 0);
                    let scoreB = b.jogadores.reduce((acc, j) => acc + (Number(j.nivel) || 3), 0);
                    return scoreA - scoreB;
                });
                
                let timeAlvo = incompletos[0];
                let jogador = jogadoresLivres.shift();
                timeAlvo.jogadores.push(jogador);
                incompletos = window.timesSorteadosObjs.filter(t => t.jogadores.length < tamanhoIdeal);
            }
        }

        let titulares = [];
        let maxTitulares = jogadoresLivres.length;
        if (modo === '12') maxTitulares = 12; else if (modo === '14') maxTitulares = 14;

        if (isAppend && (modo === '12' || modo === '14')) {
            reservasNovas.push(...jogadoresLivres);
        } else if (!isAppend) {
            titulares = jogadoresLivres.slice(0, maxTitulares); 
            reservasNovas.push(...jogadoresLivres.slice(maxTitulares));
        } else {
            titulares = jogadoresLivres;
        }

        let timesNovos = []; 
        
        if (titulares.length > 0) {
            let tamanhoPartida;
            if (priorizarOrdem) {
                tamanhoPartida = tamanhoIdeal;
            } else {
                tamanhoPartida = (modo === '12' || modo === '14') ? maxTitulares : titulares.length;
            }

            const getSomaNotas = (time) => time.reduce((acc, j) => acc + (Number(j.nivel) || 3), 0);
            const getQtdPosicao = (time, pos) => time.filter(j => j.posicao === pos).length;
            
            for (let i = 0; i < titulares.length; i += tamanhoPartida) {
                let chunk = titulares.slice(i, i + tamanhoPartida); 
                let numTimesNoChunk;
                
                if (priorizarOrdem || isAppend) {
                    numTimesNoChunk = Math.max(1, Math.ceil(chunk.length / tamanhoIdeal));
                } else if (modo === '12' || modo === '14') {
                    numTimesNoChunk = 2; 
                } else { 
                    numTimesNoChunk = Math.ceil(chunk.length / tamanhoIdeal); 
                    if (numTimesNoChunk < 2 && titulares.length >= 2) numTimesNoChunk = 2; 
                }
                
                if (numTimesNoChunk === 0) continue;

                let capacities = [];
                let remaining = chunk.length;
                if (!priorizarOrdem && (modo === '12' || modo === '14')) {
                    let half = Math.ceil(chunk.length / 2); capacities = [half, chunk.length - half];
                } else {
                    for (let k = 0; k < numTimesNoChunk; k++) {
                        if (remaining >= tamanhoIdeal) { capacities.push(tamanhoIdeal); remaining -= tamanhoIdeal; } 
                        else if (remaining > 0) { capacities.push(remaining); remaining = 0; } 
                        else { capacities.push(0); }
                    }
                }
                
                let goleirosChunk = embaralhar(chunk.filter(j => j.posicao === 'Goleiro')); 
                let linhaChunk = embaralhar(chunk.filter(j => j.posicao !== 'Goleiro'));
                let timesLocais = Array.from({ length: numTimesNoChunk }, () => []);
                
                if (incluiGoleiros) { 
                    for (let t = 0; t < numTimesNoChunk; t++) { 
                        if (goleirosChunk.length > 0 && timesLocais[t].length < capacities[t]) { timesLocais[t].push(goleirosChunk.shift()); } 
                    } 
                    reservasNovas.push(...goleirosChunk); 
                }

                const posicoes = ["Zagueiro", "Lateral", "Meia", "Atacante", "Linha"]; const grupos = {}; posicoes.forEach(p => grupos[p] = []);
                linhaChunk.forEach(j => { if (grupos[j.posicao]) grupos[j.posicao].push(j); else grupos["Linha"].push(j); });
                
                posicoes.forEach(p => grupos[p].sort((a, b) => {
                    if (a.tipo === 'Mensalista' && b.tipo !== 'Mensalista') return -1;
                    if (a.tipo !== 'Mensalista' && b.tipo === 'Mensalista') return 1;
                    return (Number(b.nivel) || 3) - (Number(a.nivel) || 3);
                }));
                
                posicoes.forEach(pos => {
                    grupos[pos].forEach(jogador => {
                        let elegiveisParaReceber = timesLocais.filter((t, index) => t.length < capacities[index]);
                        if (elegiveisParaReceber.length === 0) { timesLocais[timesLocais.length - 1].push(jogador); return; }

                        let minTam = Math.min(...elegiveisParaReceber.map(t => t.length)); 
                        let elegiveis = elegiveisParaReceber.filter(t => t.length === minTam);
                        let minPos = Math.min(...elegiveis.map(t => getQtdPosicao(t, pos))); 
                        let menosPos = elegiveis.filter(t => getQtdPosicao(t, pos) === minPos);
                        
                        menosPos.sort((a, b) => {
                            let scoreA = getSomaNotas(a); let scoreB = getSomaNotas(b);
                            if (scoreA !== scoreB) return scoreA - scoreB;
                            let indexA = timesLocais.indexOf(a); let indexB = timesLocais.indexOf(b);
                            if (jogador.tipo === 'Convidado') { return indexB - indexA; } else { return indexA - indexB; }
                        }); 
                        
                        menosPos[0].push(jogador);
                    });
                });
                
                timesLocais = timesLocais.filter(t => t.length > 0);
                timesNovos.push(...timesLocais);
            }
        }

        if (!isAppend) {
            window.timesSorteadosObjs = []; window.reservasSorteados = []; window.partidaSalva = false; window.partidaSalvaManual = false; 
            window.jogosDaRodada = []; window.filaEquipes = []; window.golsTempA = []; window.golsTempB = []; window.partidaAtualId = null; window.codigoAcessoAtual = null; window.coringasAtivos = {};
        }

        let offsetId = isAppend ? window.timesSorteadosObjs.length : 0;
        timesNovos.forEach((timeArr, idx) => {
            let globalIdx = idx + offsetId; let cor = coresTimes[globalIdx % coresTimes.length];
            window.timesSorteadosObjs.push({ id: globalIdx, corBase: cor, nome: cor, jogadores: timeArr, coringas: [] });
            if(isAppend) window.filaEquipes.push(globalIdx); 
        });
        
        if (!isAppend) window.filaEquipes = window.timesSorteadosObjs.map(t => t.id);
        window.reservasSorteados.push(...reservasNovas);

        try { atualizarFinanceiro(); } catch(e) {}
        
        if (isAppend) {
            let qJogadores = 0; window.timesSorteadosObjs.forEach(t => qJogadores += t.jogadores.length); if (window.reservasSorteados) qJogadores += window.reservasSorteados.length;
            await db.from('partidas').update({ times_json: window.timesSorteadosObjs, fila_json: window.filaEquipes, quantidade_jogadores: qJogadores }).eq('id', window.partidaAtualId);
        } else {
            await criarPartidaInicialNoBanco(); 
        }
        
        try { salvarEstadoCompleto(); } catch(e) {}
        
        let resDiv = document.getElementById('resultado');
        if(resDiv) {
            let coringasEmprestadosIds = [];
            for(let key in window.coringasAtivos) { window.coringasAtivos[key].forEach(c => coringasEmprestadosIds.push(c.jogador.id)); }
            
            resDiv.innerHTML = ""; 
            window.timesSorteadosObjs.forEach((t) => {
                let emoji = emojisTimes[coresTimes.indexOf(t.corBase)] || '⚽'; let corHex = getCorHex(t.corBase);
                let html = `<div class="team" style="border-top-color: ${corHex};"><div style="display:flex; align-items:center; gap:5px; margin-bottom:10px;"><span style="font-size:18px;">${emoji}</span><input type="text" value="${t.nome}" onchange="atualizarNomeTime(${t.id}, this.value)" class="input-nome-time" placeholder="Nome do Time" style="color: ${corHex};" ${window.isModoPublico ? 'disabled' : ''}></div><ul>`;
                
                t.jogadores.forEach(j => { 
                    if(coringasEmprestadosIds.includes(j.id)) return;
                    let posAbbr = posMap[j.posicao] || j.posicao; html += `<li><strong>${j.nome}</strong> ${j.posicao!=='Linha'?`<span class="badge badge-posicao" style="display:inline-block; min-width:32px; text-align:center; font-size:9px;">${posAbbr}</span>`:''}</li>`; 
                }); 
                
                let coringasTime = (t.coringas && t.coringas.length > 0) ? t.coringas : ((window.coringasAtivos && window.coringasAtivos[t.id]) ? window.coringasAtivos[t.id] : []);
                coringasTime.forEach(c => {
                    let posAbbr = posMap[c.jogador.posicao] || c.jogador.posicao;
                    html += `<li><strong>${c.jogador.nome}</strong> <span style="font-size:11px; color:var(--primary); font-weight:600;">(Coringa - ${c.timeOriginalNome})</span> ${c.jogador.posicao!=='Linha'?`<span class="badge badge-posicao" style="display:inline-block; min-width:32px; text-align:center; font-size:9px;">${posAbbr}</span>`:''}</li>`;
                });

                resDiv.innerHTML += html + `</ul></div>`;
            });
            if (window.reservasSorteados && window.reservasSorteados.length > 0) {
                let html = `<div class="team team-reservas"><h3 style="padding:5px; font-size:15px;">Reservas (Inativos)</h3><ul>`;
                window.reservasSorteados.forEach(j => html += `<li><strong>${j.nome}</strong> ${j.isDM ? '<span style="color:var(--danger); font-size:11px; font-weight:bold;">[DM]</span>' : ''}</li>`); resDiv.innerHTML += html + `</ul></div>`;
            }
        }

        let btnSum = document.getElementById('btn-ir-placares'); 
        if(btnSum) { btnSum.style.display = 'block'; btnSum.innerText = "📝 Preencher Súmula"; }
        
        if (isAppend) renderizarSumula();
        
    } catch (e) {
        console.error("Erro no sorteio:", e);
        customAlert("Erro", "Ocorreu um erro ao gerar os times. Verifique sua conexão e tente novamente.", "OK", "var(--danger)");
        let res = document.getElementById('resultado'); if(res) res.innerHTML = ""; 
    }
}

async function criarPartidaInicialNoBanco() {
    try {
        if (currentUser) await db.from('partidas').update({ codigo_acesso: null }).eq('user_id', currentUser.id);
        let codigoAleatorio = Math.random().toString(36).substring(2, 8).toUpperCase();
        let valC = document.getElementById('valor-convidado'); let valorConv = valC ? parseFloat(valC.value) || 0 : 0; 
        let valM = document.getElementById('valor-mensalista'); let valorMens = valM ? parseFloat(valM.value) || 0 : 0;
        
        let qJogadoresEmQuadra = 0; window.timesSorteadosObjs.forEach(t => qJogadoresEmQuadra += t.jogadores.length); if (window.reservasSorteados) qJogadoresEmQuadra += window.reservasSorteados.length;
        
        const { data: pData, error: errP } = await db.from('partidas').insert([{ 
            quantidade_jogadores: qJogadoresEmQuadra, renda_convidados: 0, valor_por_convidado: valorConv, valor_por_mensalista: valorMens,
            custos_json: window.custosDaRodada, artilheiros_json: {}, jogos_json: [], times_json: window.timesSorteadosObjs, fila_json: window.filaEquipes,
            codigo_acesso: codigoAleatorio, nome_baba: currentProfile ? currentProfile.nome_baba : "", escudo_url: currentProfile ? currentProfile.escudo_url : "", user_id: currentUser.id
        }]).select();

        if (errP) {
            console.error(errP); alert(`Erro de Conexão com o Banco de Dados: Não foi possível criar a partida no servidor. (${errP.message})`); return;
        }
        
        if (pData && pData.length > 0) {
            window.partidaAtualId = pData[0].id; window.codigoAcessoAtual = codigoAleatorio;
        } else {
            const { data: pFetch } = await db.from('partidas').select('id').eq('codigo_acesso', codigoAleatorio).single();
            if (pFetch) { window.partidaAtualId = pFetch.id; window.codigoAcessoAtual = codigoAleatorio; }
        }
        
        iniciarOuvinteRealtime(window.partidaAtualId); exibirBoxCodigoSorteio(window.codigoAcessoAtual);
    } catch(err) { console.error("Erro ao gerar partida:", err.message); alert(`Falha crítica ao tentar salvar a partida.`); }
}

function gerarTextoWhatsAppEscalacao() {
    let texto = `🏆 *Escalação dos Times - Pega o Baba* ⚽\n\n`;
    window.timesSorteadosObjs.forEach(t => {
        texto += `*${t.nome}*:\n`;
        t.jogadores.forEach(j => { let posAbbr = posMap[j.posicao] || j.posicao; texto += `• ${j.nome} ${j.posicao !== 'Linha' ? '('+posAbbr+')' : ''}\n`; }); texto += `\n`;
    });
    if (window.reservasSorteados && window.reservasSorteados.length > 0) {
        texto += `*Reservas*:\n`; window.reservasSorteados.forEach(j => { texto += `• ${j.nome}\n`; }); texto += `\n`;
    }
    if(window.codigoAcessoAtual) { let link = `https://pegaobaba.vercel.app?code=${window.codigoAcessoAtual}`; texto += `🔗 Acompanhe o placar ao vivo: ${link}`; }
    return encodeURIComponent(texto);
}

async function gerarRelatorioMensal() {
    let filtroInput = document.getElementById('filtro-mes-relatorio'); let mesKey = filtroInput ? filtroInput.value : "";
    if (!mesKey) { let tzoffset = (new Date()).getTimezoneOffset() * 60000; mesKey = (new Date(Date.now() - tzoffset)).toISOString().substring(0, 7); if(filtroInput) filtroInput.value = mesKey; }
    let partes = mesKey.split('-'); 
    let elMens = document.getElementById('valor-mensalista'); let valMens = elMens ? parseFloat(elMens.value) || 70 : 70;
    let elConv = document.getElementById('valor-convidado'); let defConv = elConv ? parseFloat(elConv.value) || 25 : 25;
    
    let partidasDoMes = []; let saldoAnterior = 0; 
    
    if(currentUser) {
        const { data: partidas } = await db.from('partidas').select('*').eq('user_id', currentUser.id);
        if(partidas) {
            partidas.forEach(p => {
                let dataRef = p.data_sorteio || p.created_at; if (!dataRef) return;
                let pMes = dataRef.substring(0, 7);
                if(pMes === mesKey) partidasDoMes.push(p);
                else if (pMes < mesKey) {
                    let vConv = p.valor_por_convidado || defConv; saldoAnterior += ((p.renda_convidados || 0) * vConv);
                    (p.custos_json || []).forEach(c => { saldoAnterior -= c.valor; });
                }
            });
        }
    }

    let mensalistas = jogadores.filter(j => j.tipo === 'Mensalista');
    mensalistas.forEach(j => { if(j.pagamentos_json) { for(let mKey in j.pagamentos_json) { if(mKey < mesKey && j.pagamentos_json[mKey] === true) saldoAnterior += valMens; } } });
    (window.despesasMensaisGlobais || []).forEach(c => { let cMes = c.data ? c.data.substring(0, 7) : ""; if(cMes && cMes < mesKey) { let op = c.operacao || 'saida'; if (op === 'entrada') saldoAnterior += c.valor; else saldoAnterior -= c.valor; } });

    let html = `<table class="relatorio-tabela"><tr><th colspan="2">👥 Mensalidades Pagas no Mês</th></tr>`;
    let totalMensalidades = 0;
    if(mensalistas.length === 0) html += `<tr><td colspan="2" style="color:var(--text-muted);">Nenhum mensalista cadastrado.</td></tr>`;
    else {
        let htmlMensalistas = `<div class="grid-mensalistas">`;
        mensalistas.forEach(j => {
            let pago = j.pagamentos_json && j.pagamentos_json[mesKey] === true; if(pago) totalMensalidades += valMens;
            let statusText = pago ? `<span style="color:var(--supabase); font-weight:bold;">✅ Pago</span>` : `<span style="color:var(--danger); font-weight:bold;">❌ Pendente</span>`;
            htmlMensalistas += `<div class="item-mensalista"><span>${j.nome}</span> <span>${statusText}</span></div>`;
        });
        htmlMensalistas += `</div>`; html += `<tr><td colspan="2" style="padding: 0;">${htmlMensalistas}</td></tr>`;
    }
    html += `<tr><td><strong>Subtotal Mensalidades:</strong></td><td style="text-align:right; font-weight:bold; color:var(--supabase);">R$ ${totalMensalidades.toFixed(2)}</td></tr><tr><th colspan="2" style="padding-top:12px;">🎟️ Arrecadação de Convidados (Por Rodada)</th></tr>`;
    
    let totalConvidados = 0;
    if(partidasDoMes.length > 0) {
        partidasDoMes.forEach((p, idx) => {
            let vConv = p.valor_por_convidado || defConv; let qtdConv = p.renda_convidados || 0; let subConv = qtdConv * vConv; totalConvidados += subConv;
            let dataF = p.data_sorteio ? p.data_sorteio.split('T')[0].split('-').reverse().join('/') : `Rodada ${idx+1}`; if(qtdConv > 0) html += `<tr><td>Rodada (${dataF}): ${qtdConv} convidados</td><td style="text-align:right;">R$ ${subConv.toFixed(2)}</td></tr>`;
        });
    } else html += `<tr><td colspan="2" style="color:var(--text-muted);">Nenhuma rodada finalizada neste mês.</td></tr>`;
    html += `<tr><td><strong>Subtotal Convidados:</strong></td><td style="text-align:right; font-weight:bold; color:var(--supabase);">R$ ${totalConvidados.toFixed(2)}</td></tr>`;

    let totalCustos = 0; let totalEntradasExtras = 0; let htmlCustosDiarios = `<div class="grid-relatorio-custos">`; let htmlEntradasExtras = `<div class="grid-relatorio-custos">`; let temCustos = false; let temEntradaExtra = false;
    (window.despesasMensaisGlobais || []).forEach((c, indexReal) => {
        let dIso = c.data || "";
        if (dIso.substring(0, 7) === mesKey) {
            let dataBr = (c.data && c.tipo !== 'mensal') ? c.data.split('-').reverse().join('/') : ''; let dStr = dataBr ? ` <span style="color:var(--text-muted); font-size:10px;">(${dataBr})</span>` : ''; let idUnico = c.id || indexReal; let op = c.operacao || 'saida';
            if (op === 'entrada') { totalEntradasExtras += c.valor; temEntradaExtra = true; htmlEntradasExtras += `<div class="item-custo-relatorio"><span>${c.desc}${dStr}</span> <span style="display:flex; align-items:center;"><strong class="valor-positivo" style="white-space:nowrap;">+ R$ ${c.valor.toFixed(2)}</strong> <button class="btn-excluir-mini no-print" style="margin-left:8px;" onclick="removerCusto(${idUnico}, ${indexReal})">X</button></span></div>`; } 
            else { totalCustos += c.valor; temCustos = true; htmlCustosDiarios += `<div class="item-custo-relatorio"><span>${c.desc}${dStr}</span> <span style="display:flex; align-items:center;"><strong class="valor-negativo" style="white-space:nowrap;">- R$ ${c.valor.toFixed(2)}</strong> <button class="btn-excluir-mini no-print" style="margin-left:8px;" onclick="removerCusto(${idUnico}, ${indexReal})">X</button></span></div>`; }
        }
    });

    if(partidasDoMes.length > 0) {
        partidasDoMes.forEach(p => {
            let c_json = safeParse(p.custos_json) || []; c_json.forEach(c => { totalCustos += c.valor; temCustos = true; let rawDate = p.data_sorteio || p.created_at || ""; let dData = rawDate ? rawDate.split('T')[0].split('-').reverse().join('/') : "Antigo"; htmlCustosDiarios += `<div class="item-custo-relatorio"><span>${c.desc} <span style="color:var(--text-muted); font-size:10px;">(${dData})</span></span> <strong class="valor-negativo" style="white-space:nowrap;">- R$ ${c.valor.toFixed(2)}</strong></div>`; });
        });
    }
    htmlCustosDiarios += `</div>`; htmlEntradasExtras += `</div>`;

    html += `<tr><th colspan="2" style="padding-top:12px;">📈 Entradas Extras (Manuais)</th></tr>`;
    if(temEntradaExtra) html += `<tr><td colspan="2" style="padding: 0 0 10px 0;">${htmlEntradasExtras}</td></tr>`; else html += `<tr><td colspan="2" style="color:var(--text-muted);">Nenhuma entrada extra neste mês.</td></tr>`;
    html += `<tr><td><strong>Subtotal Extras:</strong></td><td style="text-align:right; font-weight:bold; color:var(--supabase);">R$ ${totalEntradasExtras.toFixed(2)}</td></tr><tr><th colspan="2" style="padding-top:12px;">📉 Detalhamento de Despesas (Saídas)</th></tr>`;
    if(temCustos) html += `<tr><td colspan="2" style="padding: 0 0 10px 0;">${htmlCustosDiarios}</td></tr>`; else html += `<tr><td colspan="2" style="color:var(--text-muted);">Nenhuma despesa registrada no mês selecionado.</td></tr>`;
    html += `</table>`;

    let receitaTotal = totalMensalidades + totalConvidados + totalEntradasExtras; let saldoMensal = receitaTotal - totalCustos; let saldoTotalCaixa = saldoAnterior + saldoMensal;

    html += `<div style="margin-top: 20px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); page-break-inside: avoid;">`;
    html += `<div style="background: var(--dark); color: white; padding: 12px 15px; text-align: center; font-weight: 700; font-size: 14px; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact;">💰 Resumo Financeiro (${partes[1]}/${partes[0]})</div>`;
    html += `<div style="padding: 15px; background: white;"><div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px;"><span style="color: var(--text-muted);">Entradas no Mês:</span><span style="font-weight: bold; color: var(--supabase);">+ R$ ${receitaTotal.toFixed(2)}</span></div>`;
    html += `<div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; border-bottom: 1px dashed var(--border); padding-bottom: 12px;"><span style="color: var(--text-muted);">Saídas no Mês:</span><span style="font-weight: bold; color: var(--danger);">- R$ ${totalCustos.toFixed(2)}</span></div>`;
    html += `<div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold;"><span>Saldo do Mês:</span><span style="color: ${saldoMensal >= 0 ? 'var(--primary)' : 'var(--danger)'};">R$ ${saldoMensal.toFixed(2)}</span></div></div>`;
    html += `<div style="padding: 15px; background: var(--light); border-top: 1px solid var(--border); -webkit-print-color-adjust: exact; print-color-adjust: exact;"><div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 12px; color: var(--text-muted);"><span>⏪ Saldo Anterior Acumulado:</span><span style="font-weight: bold; color: ${saldoAnterior >= 0 ? 'var(--supabase)' : 'var(--danger)'};">R$ ${saldoAnterior.toFixed(2)}</span></div>`;
    html += `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 16px;"><span style="font-weight: 800; color: var(--dark);">🏦 CAIXA TOTAL:</span><span style="font-weight: 900; font-size: 18px; color: ${saldoTotalCaixa >= 0 ? 'var(--supabase)' : 'var(--danger)'};">R$ ${saldoTotalCaixa.toFixed(2)}</span></div></div></div>`;
    let elConteudo = document.getElementById('conteudo-relatorio-mensal'); if(elConteudo) elConteudo.innerHTML = html;
}

function exibirBoxCodigoSorteio(codigo) {
    let linkCompartilhamento = `https://pegaobaba.vercel.app?code=${codigo}`;
    let textoWpp = encodeURIComponent(`🏆 *Acompanhe nosso Baba ao Vivo!*\n\nVeja a súmula, artilharia e classificação da rodada pelo link:\n\n${linkCompartilhamento}\n\n_(Código de acesso direto: ${codigo})_`);
    let textoWppEscalacao = gerarTextoWhatsAppEscalacao();
    let dataBoxStr = window.dataPartidaAtual || new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    let boxCod = document.getElementById('box-codigo-gerado-sorteio');
    if (boxCod) {
        boxCod.innerHTML = `<div style="font-size:13px; color:var(--text-muted); font-weight:700; margin-bottom:5px;">Código do jogo (${dataBoxStr}) para os jogadores</div><div style="color:var(--primary); font-size:28px; line-height:1; margin-bottom:15px;">${codigo}</div><div style="display: flex; flex-direction: column; gap: 8px;"><a href="https://api.whatsapp.com/send?text=${textoWppEscalacao}" target="_blank" class="btn-whatsapp">👥 Compartilhar Escalação no WhatsApp</a><a href="https://api.whatsapp.com/send?text=${textoWpp}" target="_blank" style="display:inline-block; background:var(--dark); color:white; padding:12px 20px; border-radius:8px; text-decoration:none; font-size:14px; font-weight:bold; width:100%; box-sizing:border-box;">📱 Compartilhar Link Geral</a></div>`;
        boxCod.style.display = 'block';
    }
}

function renderizarTimesNaTela() {
    if (window.timesSorteadosObjs && window.timesSorteadosObjs.length > 0) {
        let btnSum = document.getElementById('btn-ir-placares'); if(btnSum) { btnSum.style.display = 'block'; btnSum.innerText = window.partidaSalva ? "📝 Ver Súmula Anterior" : "📝 Preencher Súmula"; }
    }
}

function atualizarNomeTime(id, novoNome) {
    let time = window.timesSorteadosObjs.find(t => t.id === id); if(time) time.nome = novoNome.trim() || time.corBase;
    salvarEstadoCompleto(); let vPlac = document.getElementById('view-placares'); if (vPlac && vPlac.classList.contains('active')) atualizarSelectsEquipes();
}

function renderizarSumula() {
    const container = document.getElementById('container-sumula'); const aviso = document.getElementById('aviso-sem-sorteio'); const dataLabel = document.getElementById('data-rodada-label'); const instrucoes = document.getElementById('texto-instrucoes-sumula');
    if((!window.timesSorteadosObjs || window.timesSorteadosObjs.length === 0) && window.jogosDaRodada.length === 0) {
        if(container) container.style.display = 'none'; if(aviso) aviso.style.display = 'block'; if(dataLabel) dataLabel.innerText = ""; if(instrucoes) instrucoes.style.display = 'none'; return;
    }
    if(aviso) aviso.style.display = 'none'; if(container) container.style.display = 'block';
    if(instrucoes) instrucoes.style.display = window.partidaSalva ? 'none' : 'block';
    if(window.codigoAcessoAtual) exibirBoxCodigoSorteio(window.codigoAcessoAtual);
    if(dataLabel) { let dataExibicao = window.dataPartidaAtual || new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}); dataLabel.innerText = `📅 Data da Rodada: ${dataExibicao}`; }
    if (window.timesSorteadosObjs && window.timesSorteadosObjs.length > 0 && window.filaEquipes.length === 0 && !window.partidaSalva) window.filaEquipes = window.timesSorteadosObjs.map(t => t.id);
    if (window.timesSorteadosObjs && window.timesSorteadosObjs.length > 0) { atualizarSelectsEquipes(); renderizarEscalacaoPublicaSumula(); }
    atualizarFilaUI(); atualizarPlacarTempUI(); atualizarListaJogosDaRodada();
}

function atualizarFilaUI() {
    const containerFila = document.getElementById('container-status-fila'); if(!containerFila) return;
    if(window.partidaSalva === true || !window.timesSorteadosObjs || window.timesSorteadosObjs.length === 0 || window.filaEquipes.length === 0) { containerFila.style.display = 'none'; return; }
    let timeA = window.timesSorteadosObjs.find(t => t.id === window.filaEquipes[0]); let timeB = window.timesSorteadosObjs.find(t => t.id === window.filaEquipes[1]);
    let proximoTime = window.timesSorteadosObjs.find(t => t.id === window.filaEquipes[2]); let restantesFila = window.filaEquipes.slice(3).map(id => window.timesSorteadosObjs.find(t => t.id === id)?.nome).filter(Boolean);
    let html = `<div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">`;
    if (timeA && timeB) { html += `<div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">⚡ Em Quadra Agora</div><div style="font-size: 15px; font-weight: 800; color: var(--dark); margin-bottom: 12px; background: var(--light); padding: 10px; border-radius: 8px; text-align: center;">${timeA.nome} vs ${timeB.nome}</div>`; }
    if (proximoTime) { html += `<div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">⏳ Próxima Equipe a Jogar</div><div style="font-size: 16px; font-weight: 800; color: var(--primary); background: #e0e7ff; padding: 10px; border-radius: 8px; text-align: center; margin-bottom: ${restantesFila.length > 0 ? '12px' : '0'};">🚀 ${proximoTime.nome}</div>`; }
    if (restantesFila.length > 0) { html += `<div style="font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px;">Fila de Espera:</div><div style="font-size: 13px; color: var(--dark); font-weight: 500;">${restantesFila.join(' ➔ ')}</div>`; }
    html += `</div>`; containerFila.innerHTML = html; containerFila.style.display = 'block';
}

function renderizarEscalacaoPublicaSumula() {
    const containerEscalacao = document.getElementById('lista-escalacao-publica'); if(!containerEscalacao) return;
    containerEscalacao.innerHTML = "";
    let tamanhoIdeal = currentProfile && currentProfile.jogadores_por_time ? parseInt(currentProfile.jogadores_por_time) : 7;
    
    let coringasEmprestadosIds = [];
    window.timesSorteadosObjs.forEach(t => {
        let cList = t.coringas || (window.coringasAtivos && window.coringasAtivos[t.id]) || [];
        cList.forEach(c => { if(c.jogador && c.jogador.id) coringasEmprestadosIds.push(c.jogador.id); });
    });
            
    window.timesSorteadosObjs.forEach((t) => {
        let emoji = emojisTimes[coresTimes.indexOf(t.corBase)] || '⚽'; let corHex = getCorHex(t.corBase);
        let coringasTime = (t.coringas && t.coringas.length > 0) ? t.coringas : ((window.coringasAtivos && window.coringasAtivos[t.id]) ? window.coringasAtivos[t.id] : []);
        let qtdAtual = t.jogadores.length + coringasTime.length;
                
        let html = `<div class="team" style="border-top-color: ${corHex}; position:relative;"><div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;"><div style="display:flex; align-items:center; gap:5px;"><span style="font-size:18px;">${emoji}</span><input type="text" value="${t.nome}" onchange="atualizarNomeTime(${t.id}, this.value)" class="input-nome-time" placeholder="Nome do Time" style="color: ${corHex}; width:auto;" ${window.isModoPublico ? 'disabled' : ''}></div>`;
        
        if(!window.isModoPublico && !window.partidaSalva) {
            let btnCoringaHtml = `<button onclick="sortearCoringasFila(${t.id})" class="btn-coringa-fila" style="background:var(--primary); color:white; border:none; padding:6px 10px; border-radius:4px; font-size:11px; cursor:pointer; font-weight:bold;">🎭 Coringa</button>`;
            if(qtdAtual < tamanhoIdeal) {
                html += btnCoringaHtml;
            }
        }
        
        html += `</div><ul>`;
        
        t.jogadores.forEach(j => { 
            if(coringasEmprestadosIds.includes(j.id)) return;
            let posAbbr = posMap[j.posicao] || j.posicao; 
            html += `<li><strong>${j.nome}</strong> ${j.posicao!=='Linha'?`<span class="badge badge-posicao" style="display:inline-block; min-width:32px; text-align:center; font-size:9px;">${posAbbr}</span>`:''}</li>`; 
        }); 
        
        coringasTime.forEach(c => {
            let posAbbr = posMap[c.jogador.posicao] || c.jogador.posicao;
            html += `<li><strong>${c.jogador.nome}</strong> <span style="font-size:11px; color:var(--primary); font-weight:600;">(Coringa - ${c.timeOriginalNome})</span> ${c.jogador.posicao!=='Linha'?`<span class="badge badge-posicao" style="display:inline-block; min-width:32px; text-align:center; font-size:9px;">${posAbbr}</span>`:''}</li>`;
        });

        containerEscalacao.innerHTML += html + `</ul></div>`;
    });
    
    if (window.reservasSorteados && window.reservasSorteados.length > 0) {
        let html = `<div class="team team-reservas"><h3 style="padding:5px; font-size:15px;">Reservas (Inativos)</h3><ul>`; window.reservasSorteados.forEach(j => html += `<li><strong>${j.nome}</strong> ${j.isDM ? '<span style="color:var(--danger); font-size:11px; font-weight:bold;">[DM]</span>' : ''}</li>`); containerEscalacao.innerHTML += html + `</ul></div>`;
    }
}

function atualizarCoringasUI() {
    renderizarEscalacaoPublicaSumula();
}

function atualizarSelectsEquipes() {
    let selA = document.getElementById('sumula_equipe_a'); let selB = document.getElementById('sumula_equipe_b');
    if(!selA || !selB) return;
    let options = ''; window.timesSorteadosObjs.forEach((t) => { options += `<option value="${t.id}">${t.nome}</option>`; });
    selA.innerHTML = options; selB.innerHTML = options;
    if (window.filaEquipes.length >= 2) { selA.value = window.filaEquipes[0]; selB.value = window.filaEquipes[1]; }
    atualizarFilaUI();
}

function limparGolsTemp(lado) { if(lado === 'A') window.golsTempA = []; else window.golsTempB = []; atualizarPlacarTempUI(); salvarEstadoCompleto(); }

async function checarTimesCompletosParaJogo() {
    if(window.filaEquipes.length < 2) return true;
    let idA = window.filaEquipes[0]; let idB = window.filaEquipes[1];
    let tA = window.timesSorteadosObjs.find(t=>t.id===idA);
    let tB = window.timesSorteadosObjs.find(t=>t.id===idB);
    if(!tA || !tB) return true;
    
    let tamanhoIdeal = currentProfile && currentProfile.jogadores_por_time ? parseInt(currentProfile.jogadores_por_time) : 7;
    let qA = tA.jogadores.length + (window.coringasAtivos[idA] ? window.coringasAtivos[idA].length : 0);
    let qB = tB.jogadores.length + (window.coringasAtivos[idB] ? window.coringasAtivos[idB].length : 0);
    
    if (qA < tamanhoIdeal || qB < tamanhoIdeal) {
        let nomes = [];
        if(qA < tamanhoIdeal) nomes.push(tA.nome);
        if(qB < tamanhoIdeal) nomes.push(tB.nome);
        
        let querSortear = await customConfirm(
            "⚠️ Partida Incompleta!",
            `A equipe <strong>${nomes.join(' e ')}</strong> está incompleta.<br><br>Sorteie o Coringa antes da bola rolar.`,
            "🎭 Ir Sortear Coringa",
            "⚠️ Forçar jogo incompleto",
            "var(--warning)"
        );
        
        if (querSortear) {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            return false; 
        }
        return true; 
    }
    return true;
}

async function abrirModalGol(lado) {
    if (!(await checarTimesCompletosParaJogo())) return; 
    
    let selEq = document.getElementById(lado === 'A' ? 'sumula_equipe_a' : 'sumula_equipe_b'); 
    if(!selEq) return alert("Erro: Caixa de equipe não encontrada na tela.");
    const selTimeId = parseInt(selEq.value); 
    if(isNaN(selTimeId)) return alert("Nenhuma equipe em quadra! Gere o sorteio primeiro.");
    const timeObj = window.timesSorteadosObjs.find(t => t.id === selTimeId);
    if(!timeObj) return alert("Erro: Equipe não encontrada na memória do jogo.");
    
    const containerJogadores = document.getElementById('lista-jogadores-gol'); 
    if(!containerJogadores) return alert("Lista de jogadores do modal não encontrada.");
    containerJogadores.innerHTML = ''; 
    
    let titMod = document.getElementById('titulo-modal-gol'); 
    if(titMod) titMod.innerText = `Gol do(a) ${timeObj.nome}`;
    
    let jogadoresTime = [...timeObj.jogadores].sort((a,b) => (a.nome||"").localeCompare(b.nome||""));
    jogadoresTime.forEach(j => { containerJogadores.innerHTML += `<button class="btn-jogador-gol" onclick="registrarGol('${lado}', '${j.nome}')">⚽ ${j.nome}</button>`; });

    let coringasTime = (timeObj.coringas && timeObj.coringas.length > 0) ? timeObj.coringas : ((window.coringasAtivos && window.coringasAtivos[selTimeId]) ? window.coringasAtivos[selTimeId] : []);
    coringasTime.forEach(c => {
        containerJogadores.innerHTML += `<button class="btn-jogador-gol" style="background:#e0e7ff; color:var(--primary); border-color:var(--primary);" onclick="registrarGol('${lado}', '${c.jogador.nome}')">🎭 ${c.jogador.nome} (Coringa)</button>`;
    });

    containerJogadores.innerHTML += `<button class="btn-jogador-gol" style="background:#fee2e2; color:var(--danger); border-color:var(--danger);" onclick="registrarGol('${lado}', 'Gol Contra')">⚠️ Gol Contra</button>`;
    
    let modGol = document.getElementById('modal-gol'); 
    if(modGol) modGol.style.display = 'flex';
    else alert("Janela do Gol não encontrada no HTML!");
}

function fecharModalGol() { let modGol = document.getElementById('modal-gol'); if(modGol) modGol.style.display = 'none'; }
function registrarGol(lado, nomeJogador) { if(lado === 'A') window.golsTempA.push(nomeJogador); else window.golsTempB.push(nomeJogador); fecharModalGol(); atualizarPlacarTempUI(); salvarEstadoCompleto(); }
function removerGolTemp(lado, index) { if(lado === 'A') window.golsTempA.splice(index, 1); else window.golsTempB.splice(index, 1); atualizarPlacarTempUI(); salvarEstadoCompleto(); }

function atualizarPlacarTempUI() {
    let placA = document.getElementById('placar-num-a'); if(placA) placA.innerText = window.golsTempA.length; 
    let placB = document.getElementById('placar-num-b'); if(placB) placB.innerText = window.golsTempB.length;
    let htmlA = ''; window.golsTempA.forEach((nome, i) => htmlA += `<div class="item-gol-arena">${nome} <span class="remover-gol-btn-arena" onclick="removerGolTemp('A', ${i})">x</span></div>`); 
    let listA = document.getElementById('lista-gols-a'); if(listA) listA.innerHTML = htmlA || '<span style="opacity:0.5;">Nenhum gol</span>';
    let htmlB = ''; window.golsTempB.forEach((nome, i) => htmlB += `<div class="item-gol-arena">${nome} <span class="remover-gol-btn-arena" onclick="removerGolTemp('B', ${i})">x</span></div>`); 
    let listB = document.getElementById('lista-gols-b'); if(listB) listB.innerHTML = htmlB || '<span style="opacity:0.5;">Nenhum gol</span>';
}
function formatarGolsResumo(golsArray) { if(!golsArray || golsArray.length === 0) return ''; let contagem = {}; golsArray.forEach(g => { contagem[g] = (contagem[g] || 0) + 1; }); return Object.entries(contagem).map(([nome, qtd]) => qtd > 1 ? `${nome} (${qtd})` : nome).join(', '); }

async function adicionarJogoNaSumula() {
    if (!(await checarTimesCompletosParaJogo())) return; 
    
    let selA = document.getElementById('sumula_equipe_a'); let selB = document.getElementById('sumula_equipe_b');
    if(!selA || !selB) return;
    let idA = parseInt(selA.value); let idB = parseInt(selB.value);
    if(idA === idB) return alert("As equipes devem ser diferentes!");
    let gaList = [...window.golsTempA]; let gbList = [...window.golsTempB]; let ga = gaList.length; let gb = gbList.length;
    let nomeA = window.timesSorteadosObjs.find(t=>t.id === idA).nome; let nomeB = window.timesSorteadosObjs.find(t=>t.id === idB).nome;

    window.jogosDaRodada.push({ equipe_a_id: idA, equipe_a_nome: nomeA, gols_a: gaList, equipe_b_id: idB, equipe_b_nome: nomeB, gols_b: gbList });
    let artilheiros = {};
    window.jogosDaRodada.forEach(jogo => {
        if(jogo.tipo === 'ajuste') { artilheiros[jogo.jogador] = (artilheiros[jogo.jogador] || 0) + jogo.gols; } 
        else {
            jogo.gols_a.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
            jogo.gols_b.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
        }
    });

    window.filaEquipes = window.filaEquipes.filter(id => id !== idA && id !== idB);
    let idWinner = null; let idLoser = null; let isEmpate = false;

    if (ga > gb) { window.filaEquipes.unshift(idA); window.filaEquipes.push(idB); idWinner = idA; idLoser = idB; } 
    else if (gb > ga) { window.filaEquipes.unshift(idB); window.filaEquipes.push(idA); idWinner = idB; idLoser = idA; } 
    else {
        isEmpate = true;
        let caraOuCoroa = Math.random() > 0.5; let pFim = caraOuCoroa ? idA : idB; let sFim = caraOuCoroa ? idB : idA; window.filaEquipes.push(pFim, sFim); 
        let nomePfim = window.timesSorteadosObjs.find(t=>t.id === pFim).nome; let nomeSfim = window.timesSorteadosObjs.find(t=>t.id === sFim).nome;
        
        await customAlert("⚖️ EMPATE!", `As duas equipes saem da quadra.<br><br>Sorteio da fila: o <strong>${nomePfim}</strong> volta para a quadra antes do <strong>${nomeSfim}</strong>.`, "Continuar", "var(--text-muted)");
        
        let nextTeam1 = window.filaEquipes[0]; let nextTeam2 = window.filaEquipes[1];
        if(window.coringasAtivos) {
            [idA, idB].forEach(id => {
                if(window.coringasAtivos[id]) {
                    delete window.coringasAtivos[id];
                }
            });
            
            let conflitosN1 = []; let conflitosN2 = [];
            if(window.coringasAtivos[nextTeam1]) {
                conflitosN1 = window.coringasAtivos[nextTeam1].filter(c => c.timeOriginalId === nextTeam2);
                if(conflitosN1.length > 0) window.coringasAtivos[nextTeam1] = window.coringasAtivos[nextTeam1].filter(c => c.timeOriginalId !== nextTeam2);
            }
            if(window.coringasAtivos[nextTeam2]) {
                conflitosN2 = window.coringasAtivos[nextTeam2].filter(c => c.timeOriginalId === nextTeam1);
                if(conflitosN2.length > 0) window.coringasAtivos[nextTeam2] = window.coringasAtivos[nextTeam2].filter(c => c.timeOriginalId !== nextTeam1);
            }
            if(conflitosN1.length > 0 || conflitosN2.length > 0) {
                let msg = `Os times <strong>${window.timesSorteadosObjs.find(t=>t.id===nextTeam1).nome}</strong> e <strong>${window.timesSorteadosObjs.find(t=>t.id===nextTeam2).nome}</strong> vão se enfrentar agora.<br><br>`;
                if(conflitosN1.length > 0) msg += `Os coringas: <strong>${conflitosN1.map(c=>c.jogador.nome).join(', ')}</strong> retornaram ao ${window.timesSorteadosObjs.find(t=>t.id===nextTeam2).nome}.<br>`;
                if(conflitosN2.length > 0) msg += `Os coringas: <strong>${conflitosN2.map(c=>c.jogador.nome).join(', ')}</strong> retornaram ao ${window.timesSorteadosObjs.find(t=>t.id===nextTeam1).nome}.<br>`;
                
                await customAlert("⚠️ CONFLITO DE CAMISA", msg, "Entendi", "var(--danger)");
            }
        }
    }

    if (!isEmpate && idLoser !== null && window.coringasAtivos) {
        delete window.coringasAtivos[idLoser]; 
        
        if (window.coringasAtivos[idWinner] && window.coringasAtivos[idWinner].length > 0) {
            let nextAdversarioId = window.filaEquipes[1]; 
            let coringasWin = window.coringasAtivos[idWinner];
            let conflitos = coringasWin.filter(c => c.timeOriginalId === nextAdversarioId);

            if(conflitos.length > 0) {
                let nomes = conflitos.map(c => c.jogador.nome).join(', ');
                await customAlert("⚠️ CONFLITO DE CAMISA", `Os coringas: <strong>${nomes}</strong> precisaram voltar para o adversário (<strong>${window.timesSorteadosObjs.find(t=>t.id===nextAdversarioId).nome}</strong>) pois vão se enfrentar agora!<br><br>Eles foram removidos do time vencedor.`, "Entendi", "var(--danger)");
                window.coringasAtivos[idWinner] = coringasWin.filter(c => c.timeOriginalId !== nextAdversarioId);
            }

            if(window.coringasAtivos[idWinner] && window.coringasAtivos[idWinner].length > 0) {
                let querRodizio = await customConfirm("🔄 Rodízio de Coringas", `O <strong>${window.timesSorteadosObjs.find(t=>t.id===idWinner).nome}</strong> continuará em quadra.<br><br>Deseja remover os coringas atuais para dar chance a outros da fila?`, "✅ Remover e Rodar", "Manter os mesmos", "var(--supabase)");
                if(querRodizio) {
                    delete window.coringasAtivos[idWinner];
                }
            }
        }
    }

    window.timesSorteadosObjs.forEach(t => { t.coringas = window.coringasAtivos[t.id] || []; });

    if(window.partidaAtualId) await db.from('partidas').update({ jogos_json: window.jogosDaRodada, artilheiros_json: artilheiros, fila_json: window.filaEquipes, times_json: window.timesSorteadosObjs }).eq('id', window.partidaAtualId);
    
    limparGolsTemp('A'); limparGolsTemp('B'); atualizarSelectsEquipes(); atualizarFilaUI(); atualizarListaJogosDaRodada(); renderizarEscalacaoPublicaSumula(); salvarEstadoCompleto();
}

function removerJogo(index) { 
    if(window.partidaSalva || window.isModoPublico) return;
    window.jogosDaRodada.splice(index, 1); atualizarListaJogosDaRodada(); salvarEstadoCompleto();
}

function abrirModalLesao() {
    const sel = document.getElementById('select-jogador-lesao'); 
    if(!sel) return alert("Erro de HTML: Caixa de seleção não encontrada.");
    sel.innerHTML = '<option value="">Selecione o Jogador</option>';
    window.timesSorteadosObjs.forEach(t => {
        let optgroup = document.createElement('optgroup');
        optgroup.label = `Time ${t.nome}`;
        t.jogadores.forEach(j => { let option = document.createElement('option'); option.value = JSON.stringify({timeId: t.id, jogadorId: j.id}); option.innerText = j.nome; optgroup.appendChild(option); });
        sel.appendChild(optgroup);
    });
    let modLesao = document.getElementById('modal-lesao'); 
    if(modLesao) modLesao.style.display = 'flex';
    else alert("Janela de Lesão não encontrada no HTML.");
}
function fecharModalLesao() { let modLesao = document.getElementById('modal-lesao'); if(modLesao) modLesao.style.display = 'none'; }

async function salvarLesao() {
    let selLesao = document.getElementById('select-jogador-lesao'); if(!selLesao) return;
    let val = selLesao.value;
    if(!val) return alert("Selecione um jogador.");
    let data = JSON.parse(val);
    let time = window.timesSorteadosObjs.find(t => t.id === data.timeId);
    let jIndex = time.jogadores.findIndex(j => j.id === data.jogadorId);
    let jogador = time.jogadores.splice(jIndex, 1)[0];

    jogador.isDM = true; window.reservasSorteados.push(jogador);

    await customAlert("🚑 Departamento Médico", `<strong>${jogador.nome}</strong> foi movido para os Reservas e não será sorteado como Coringa.`, "OK", "var(--danger)");
    
    if(window.coringasAtivos) {
        for(let key in window.coringasAtivos) {
            window.coringasAtivos[key] = window.coringasAtivos[key].filter(c => c.jogador.id !== jogador.id);
        }
    }
    
    window.timesSorteadosObjs.forEach(t => { t.coringas = window.coringasAtivos[t.id] || []; });
    if(window.partidaAtualId) await db.from('partidas').update({ times_json: window.timesSorteadosObjs }).eq('id', window.partidaAtualId);
    
    fecharModalLesao(); salvarEstadoCompleto(); renderizarEscalacaoPublicaSumula();
}

async function sortearCoringasFila(idTimeIncompleto) {
    let timeInc = window.timesSorteadosObjs.find(t => t.id === idTimeIncompleto);
    let tamanhoIdeal = currentProfile && currentProfile.jogadores_por_time ? parseInt(currentProfile.jogadores_por_time) : 7;

    if(!window.coringasAtivos) window.coringasAtivos = {};
    let coringasAtuaisInc = window.coringasAtivos[idTimeIncompleto] || [];
    let faltam = tamanhoIdeal - (timeInc.jogadores.length + coringasAtuaisInc.length);

    if(faltam <= 0) return await customAlert("Time Completo", "Esta equipe já está com a quantidade ideal de jogadores.", "OK", "var(--primary)");

    let somaNotasTimesCompletos = 0;
    let qtdTimesCompletos = 0;
    
    window.timesSorteadosObjs.forEach(t => {
        if(t.id !== idTimeIncompleto && t.jogadores.length === tamanhoIdeal) {
            somaNotasTimesCompletos += t.jogadores.reduce((acc, j) => acc + (Number(j.nivel)||3), 0);
            qtdTimesCompletos++;
        }
    });

    let notaMediaBaba = qtdTimesCompletos > 0 ? (somaNotasTimesCompletos / qtdTimesCompletos) : (tamanhoIdeal * 3);
    
    let notaIncAtual = timeInc.jogadores.reduce((acc, j) => acc + (Number(j.nivel)||3), 0) + coringasAtuaisInc.reduce((acc, c) => acc + (Number(c.jogador.nivel)||3), 0);
    let alvo = notaMediaBaba - notaIncAtual;

    let emQuadraIds = window.filaEquipes.slice(0, 2);
    
    let elegiveis = [];
    window.filaEquipes.forEach(tId => {
        if(!emQuadraIds.includes(tId) && tId !== idTimeIncompleto) {
            let t = window.timesSorteadosObjs.find(x => x.id === tId);
            if(t) t.jogadores.forEach(j => elegiveis.push({ jogador: j, timeOriginalId: tId, timeOriginalNome: t.nome }));
        }
    });
    
    window.reservasSorteados.forEach(j => { if(!j.isDM) elegiveis.push({ jogador: j, timeOriginalId: -1, timeOriginalNome: "Reserva" }); });

    let todosCoringasEmUso = [];
    for(let key in window.coringasAtivos) { window.coringasAtivos[key].forEach(c => todosCoringasEmUso.push(c.jogador.id)); }
    elegiveis = elegiveis.filter(e => !todosCoringasEmUso.includes(e.jogador.id));

    if(elegiveis.length < faltam) return await customAlert("Banco Vazio", "Não há jogadores suficientes descansando no banco para completar o time agora.<br><br>Aguarde o jogo atual acabar.", "Entendi", "var(--warning)");

    elegiveis = embaralhar(elegiveis); elegiveis.sort((a, b) => (Number(b.jogador.nivel)||3) - (Number(a.jogador.nivel)||3));

    let escolhidos = []; let somaEscolhidos = 0;
    for(let i=0; i<faltam; i++) {
        let mediaFaltante = (alvo - somaEscolhidos) / (faltam - i);
        let closestIdx = 0; let minDiff = 999;
        for(let k=0; k<elegiveis.length; k++) {
            let diff = Math.abs((Number(elegiveis[k].jogador.nivel)||3) - mediaFaltante);
            if(diff < minDiff) { minDiff = diff; closestIdx = k; }
        }
        let best = elegiveis.splice(closestIdx, 1)[0]; escolhidos.push(best); somaEscolhidos += (Number(best.jogador.nivel)||3);
    }

    if(!window.coringasAtivos[idTimeIncompleto]) window.coringasAtivos[idTimeIncompleto] = [];
    window.coringasAtivos[idTimeIncompleto].push(...escolhidos);

    window.timesSorteadosObjs.forEach(t => { t.coringas = window.coringasAtivos[t.id] || []; });
    if(window.partidaAtualId) await db.from('partidas').update({ times_json: window.timesSorteadosObjs }).eq('id', window.partidaAtualId);

    let msg = ``; escolhidos.forEach(c => msg += `<strong>${c.jogador.nome}</strong> (do ${c.timeOriginalNome})<br>`); 
    await customAlert("🎭 Coringas Sorteados", msg, "Continuar", "var(--primary)");

    salvarEstadoCompleto(); renderizarEscalacaoPublicaSumula();
}

function abrirModalAjuste() {
    const sel = document.getElementById('select-jogador-ajuste'); 
    if(!sel) return alert("Erro de HTML: Caixa de seleção não encontrada.");
    sel.innerHTML = '<option value="">Selecione o Jogador</option>';
    let todosOrdem = [...jogadores].sort((a,b) => (a.nome||"").localeCompare(b.nome||""));
    todosOrdem.forEach(j => { sel.innerHTML += `<option value="${j.nome}">${j.nome}</option>`; });
    let inpG = document.getElementById('input-gols-ajuste'); if(inpG) inpG.value = "1";
    let modAj = document.getElementById('modal-ajuste-manual'); 
    if(modAj) modAj.style.display = 'flex';
    else alert("Janela de Ajuste de Gols não encontrada no HTML!");
}

function fecharModalAjuste() { let modAj = document.getElementById('modal-ajuste-manual'); if(modAj) modAj.style.display = 'none'; }

async function salvarAjusteManual() {
    let selAj = document.getElementById('select-jogador-ajuste'); let nome = selAj ? selAj.value : "";
    let inpG = document.getElementById('input-gols-ajuste'); let gols = inpG ? parseInt(inpG.value) : 0;
    if(!nome || isNaN(gols)) return alert("Preencha o jogador e a quantidade.");
    
    window.jogosDaRodada.push({ tipo: 'ajuste', jogador: nome, gols: gols });
    
    let artilheiros = {};
    window.jogosDaRodada.forEach(jogo => {
        if(jogo.tipo === 'ajuste') { artilheiros[jogo.jogador] = (artilheiros[jogo.jogador] || 0) + jogo.gols; } 
        else {
            jogo.gols_a.forEach(n => { if(n !== 'Gol Contra') artilheiros[n] = (artilheiros[n] || 0) + 1; });
            jogo.gols_b.forEach(n => { if(n !== 'Gol Contra') artilheiros[n] = (artilheiros[n] || 0) + 1; });
        }
    });

    if(window.partidaAtualId) await db.from('partidas').update({ jogos_json: window.jogosDaRodada, artilheiros_json: artilheiros }).eq('id', window.partidaAtualId);
    
    fecharModalAjuste(); atualizarListaJogosDaRodada(); salvarEstadoCompleto();
}

function atualizarListaJogosDaRodada() {
    const painelArena = document.getElementById('painel-placar-arena'); if(painelArena) painelArena.style.display = window.partidaSalva ? 'none' : 'block';
    const btnEncerrar = document.getElementById('btn-encerrar-baba'); if(btnEncerrar) btnEncerrar.style.display = window.partidaSalva ? 'none' : 'block';
    const lista = document.getElementById('lista-jogos-registrados'); if(!lista) return;
    let qtdReg = document.getElementById('qtd-jogos-reg'); if(qtdReg) qtdReg.innerText = window.jogosDaRodada.length;
    
    if(window.jogosDaRodada.length === 0) { lista.innerHTML = '<p style="color:var(--text-muted); font-size:13px; text-align:center;">Nenhum jogo confirmado</p>'; return; }
    
    let htmlCompleto = '';
    window.jogosDaRodada.forEach((j, originalIndex) => {
        let numJogo = originalIndex + 1;
        let btnExcluirHtml = (window.partidaSalva || window.isModoPublico) ? '' : `<button class="btn-excluir-mini" onclick="removerJogo(${originalIndex})">X</button>`;
        
        if (j.tipo === 'ajuste') {
            let sinal = j.gols > 0 ? '+' : '';
            let cardHtml = `<div style="background: white; padding: 12px; border-radius: 8px; border: 1px dashed var(--border); margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <div><span style="font-size:10px; color:var(--text-muted); font-weight:bold; display:block; text-transform:uppercase;">Ajuste Manual</span><strong>${j.jogador}</strong></div>
                <div style="font-size:15px; font-weight:bold; color:${j.gols > 0 ? 'var(--supabase)' : 'var(--danger)'};">${sinal}${j.gols} gols</div>${btnExcluirHtml}</div>`;
            htmlCompleto = cardHtml + htmlCompleto;
        } else {
            let autoresA = formatarGolsResumo(j.gols_a); let autoresB = formatarGolsResumo(j.gols_b);
            let detalhesGolsHtml = '';
            if (autoresA || autoresB) detalhesGolsHtml = `<div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border);"><span style="flex: 1; text-align: right; padding-right: 10px;">${autoresA ? '⚽ ' + autoresA : ''}</span><span style="flex: 1; text-align: left; padding-left: 10px;">${autoresB ? '⚽ ' + autoresB : ''}</span></div>`;
            let cardHtml = `<div style="background: white; padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px;"><div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 8px; display: flex; justify-content: space-between;"><span>Partida ${numJogo}</span>${btnExcluirHtml}</div><div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 600;"><div style="flex:1; text-align:right;">${j.equipe_a_nome}</div><div class="placar-box" style="margin: 0 10px;">${j.gols_a.length} x ${j.gols_b.length}</div><div style="flex:1; text-align:left;">${j.equipe_b_nome}</div></div>${detalhesGolsHtml}</div>`;
            htmlCompleto = cardHtml + htmlCompleto;
        }
    });
    lista.innerHTML = htmlCompleto;
}

function renderizarPainelDoDiaComJogos(jogosArr, dataStr) {
    let timesStats = {}; let artilheiros = {};
    jogosArr.forEach(j => {
        if(j.tipo === 'ajuste') { artilheiros[j.jogador] = (artilheiros[j.jogador] || 0) + j.gols; return; }
        
        if(!timesStats[j.equipe_a_nome]) timesStats[j.equipe_a_nome] = { j:0, v:0, e:0, d:0, gp:0, gc:0, pts:0 };
        if(!timesStats[j.equipe_b_nome]) timesStats[j.equipe_b_nome] = { j:0, v:0, e:0, d:0, gp:0, gc:0, pts:0 };
        let ga = j.gols_a.length; let gb = j.gols_b.length; let a = timesStats[j.equipe_a_nome]; let b = timesStats[j.equipe_b_nome];
        a.j++; b.j++; a.gp += ga; a.gc += gb; b.gp += gb; b.gc += ga;
        if(ga > gb) { a.v++; a.pts+=3; b.d++; } else if(gb > ga) { b.v++; b.pts+=3; a.d++; } else { a.e++; b.e++; a.pts+=1; b.pts+=1; }
        j.gols_a.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
        j.gols_b.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
    });
    let rankTimes = Object.entries(timesStats).sort((a, b) => {
        if(b[1].pts !== a[1].pts) return b[1].pts - a[1].pts; let sgA = a[1].gp - a[1].gc; let sgB = b[1].gp - b[1].gc;
        if(sgA !== sgB) return sgB - sgA; return b[1].gp - a[1].gp; 
    });

    let dataExibicao = window.dataPartidaAtual || new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'});
    if (dataStr) { let d = new Date(dataStr); dataExibicao = !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) : dataStr; }
    let tituloClass = document.getElementById('titulo-classificacao-dia'); if(tituloClass) tituloClass.innerText = `🏆 Classificação do dia (${dataExibicao})`; 
    let tituloArts = document.getElementById('titulo-artilheiros-dia'); if (tituloArts) tituloArts.innerText = `⚽ Artilheiros do dia (${dataExibicao})`;

    const bodyClass = document.getElementById('body-classificacao');
    if(bodyClass) {
        if(rankTimes.length === 0) { bodyClass.innerHTML = '<tr><td colspan="7" style="color:var(--text-muted);">Sem jogos hoje.</td></tr>'; } 
        else {
            bodyClass.innerHTML = '';
            rankTimes.forEach((r, i) => {
                let t = r[1]; let sg = t.gp - t.gc; let ic = i===0?'🏆 ':'';
                bodyClass.innerHTML += `<tr><td style="font-weight:700;">${ic}${r[0]}</td><td style="font-weight:700; color:var(--primary);">${t.pts}</td><td>${t.j}</td><td>${t.v}</td><td>${t.e}</td><td>${t.d}</td><td>${sg > 0 ? '+'+sg : sg}</td></tr>`;
            });
        }
    }

    const bodyArts = document.getElementById('body-artilheiros-painel');
    if(bodyArts) {
        let arts = Object.entries(artilheiros).sort((a,b) => b[1] - a[1]);
        if(arts.length === 0) { bodyArts.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);">Nenhum gol lançado.</td></tr>'; }
        else {
            bodyArts.innerHTML = '';
            arts.forEach((a, i) => { let ic = i===0?'🥇':(i===1?'🥈':(i===2?'🥉':'⚽')); bodyArts.innerHTML += `<tr><td>${ic} <strong>${a[0]}</strong></td><td>${a[1]}</td></tr>`; });
        }
    }
}

async function renderizarPainelDoDia() {
    if (window.jogosDaRodada && window.jogosDaRodada.length > 0) { renderizarPainelDoDiaComJogos(window.jogosDaRodada, window.dataPartidaAtual); return; }
    if (currentUser && !window.isModoPublico) {
        try {
            const { data: partidas, error } = await db.from('partidas').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false }).limit(1);
            if (!error && partidas && partidas.length > 0) {
                let ultimaPartida = partidas[0];
                if (ultimaPartida.created_at) {
                    let diffMs = new Date().getTime() - new Date(ultimaPartida.created_at).getTime();
                    if (diffMs <= 518400000 && !window.partidaSalvaManual) {
                        window.jogosDaRodada = safeParse(ultimaPartida.jogos_json) || [];
                        if (ultimaPartida.data_sorteio) {
                            let d = new Date(ultimaPartida.data_sorteio); window.dataPartidaAtual = !isNaN(d.getTime()) ? d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', year: 'numeric'}) : ultimaPartida.data_sorteio;
                        }
                        renderizarPainelDoDiaComJogos(window.jogosDaRodada, ultimaPartida.data_sorteio); return;
                    }
                }
            }
        } catch(e) {}
    }
    renderizarPainelDoDiaComJogos([], null);
}

async function carregarEstatisticasGerais() {
    await renderizarPainelDoDia(); if(window.isModoPublico) return;
    try {
        let hoje = new Date(); let mesAtual = hoje.getMonth(); let anoAtual = hoje.getFullYear();
        const startOfYear = new Date(anoAtual, 0, 1).toISOString();
        let lMes = document.getElementById('label-mes-atual'); if(lMes) lMes.innerText = hoje.toLocaleString('pt-BR', { month: 'long' }); 
        let lAno = document.getElementById('label-ano-atual'); if(lAno) lAno.innerText = anoAtual;
        
        const { data: partidas } = await db.from('partidas').select('id, data_sorteio, artilheiros_json').gte('data_sorteio', startOfYear).eq('user_id', currentUser.id);
        const { data: presencas } = await db.from('presencas').select('partida_id, jogadores(nome, tipo, user_id)');

        let mensalistasPorPartida = {};
        if(presencas) {
            presencas.forEach(p => {
                if (p.jogadores && p.jogadores.user_id === currentUser.id && p.jogadores.tipo === 'Mensalista') {
                    if(!mensalistasPorPartida[p.partida_id]) mensalistasPorPartida[p.partida_id] = new Set();
                    mensalistasPorPartida[p.partida_id].add(p.jogadores.nome);
                }
            });
        }

        let artilhariaMes = {}; let rankingAnual = {};
        if(presencas && partidas) {
            presencas.forEach(p => {
                if (p.jogadores && p.jogadores.user_id === currentUser.id && p.jogadores.tipo === 'Mensalista') {
                    let nome = p.jogadores.nome; if(!rankingAnual[nome]) rankingAnual[nome] = { gols: 0, presencas: 0 };
                    if(partidas.find(x => x.id === p.partida_id)) rankingAnual[nome].presencas++;
                }
            });
        }

        if(partidas) {
            partidas.forEach(p => {
                let isEsteMes = new Date(p.data_sorteio).getMonth() === mesAtual; let arts = safeParse(p.artilheiros_json) || {}; let mensalistasNesta = mensalistasPorPartida[p.id] || new Set();
                for(let nome in arts) {
                    if(!(mensalistasNesta.has(nome) || jogadores.some(j => j.nome === nome && j.tipo === 'Mensalista'))) continue; 
                    let gols = arts[nome]; if(!rankingAnual[nome]) rankingAnual[nome] = { gols: 0, presencas: 0 };
                    rankingAnual[nome].gols += gols; if(isEsteMes) artilhariaMes[nome] = (artilhariaMes[nome] || 0) + gols;
                }
            });
        }

        const bodyArtsMes = document.getElementById('body-artilharia-mes'); 
        if(bodyArtsMes) {
            let artsMesArr = Object.entries(artilhariaMes).sort((a,b) => b[1] - a[1]);
            if(artsMesArr.length === 0) bodyArtsMes.innerHTML = '<tr><td colspan="2" style="color:var(--text-muted);">Sem histórico neste mês.</td></tr>';
            else { bodyArtsMes.innerHTML = ''; artsMesArr.forEach((a, i) => { let ic = i===0?'🔥':'⚽'; bodyArtsMes.innerHTML += `<tr><td>${ic} <strong>${a[0]}</strong></td><td>${a[1]}</td></tr>`; }); }
        }

        const bodyRanking = document.getElementById('body-ranking-anual'); 
        if(bodyRanking) {
            let rankArr = Object.entries(rankingAnual).sort((a,b) => { if(b[1].gols !== a[1].gols) return b[1].gols - a[1].gols; return b[1].presencas - a[1].presencas; });
            if(rankArr.length === 0) bodyRanking.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted);">Sem histórico no ano.</td></tr>';
            else { bodyRanking.innerHTML = ''; rankArr.forEach((r, i) => { let ic = i===0?'🌟':'👤'; bodyRanking.innerHTML += `<tr><td>${ic} <strong>${r[0]}</strong></td><td style="font-weight:700; color:var(--primary);">${r[1].gols}</td><td style="color:var(--text-muted);">${r[1].presencas}</td></tr>`; }); }
        }
    } catch(e) {}
}

function atualizarFinanceiro() {
    if(window.isModoPublico) return;
    gerarRelatorioMensal(); salvarEstadoCompleto();
}

async function adicionarCusto() {
    let elDesc = document.getElementById('desc-custo'); let desc = elDesc ? elDesc.value : ""; 
    let elVal = document.getElementById('valor-custo'); let val = elVal ? parseFloat(elVal.value) || 0 : 0;
    let elTipo = document.getElementById('tipo-custo'); let tipo = elTipo ? elTipo.value : "diario"; 
    let elOp = document.getElementById('operacao-movimentacao'); let operacao = elOp ? elOp.value : "saida"; 
    let elData = document.getElementById('data-custo'); let dataInput = elData ? elData.value : "";

    if(!desc || val <= 0) return alert("Preencha descrição e valor válido.");

    if(!dataInput) { let tzoffset = (new Date()).getTimezoneOffset() * 60000; dataInput = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0]; }

    let novaDespesa = { id: Date.now(), desc: desc, valor: val, tipo: tipo, operacao: operacao, data: tipo === 'mensal' ? dataInput.substring(0, 7) : dataInput };

    window.despesasMensaisGlobais.push(novaDespesa);

    if(currentUser) {
        try {
            const btn = document.querySelector('button[onclick="adicionarCusto()"]'); let txtOrigin = ""; if(btn) { txtOrigin = btn.innerText; btn.innerText = "Salvando..."; btn.disabled = true; }
            const { error } = await db.from('profiles').update({ despesas_mensais_json: window.despesasMensaisGlobais }).eq('id', currentUser.id);
            if(btn) { btn.innerText = txtOrigin; btn.disabled = false; }
            if (error) { alert("Erro ao salvar movimentação: " + error.message); window.despesasMensaisGlobais.pop(); } 
            else { if(elDesc) elDesc.value = ''; if(elVal) elVal.value = ''; if(elData) elData.value = ''; gerarRelatorioMensal(); }
        } catch(e) {}
    }
}
        
async function removerCusto(idUnico, indexArrayFallback) { 
    let conf = await customConfirm("Excluir Movimentação", "Deseja realmente apagar esta movimentação do Livro Caixa?", "Sim, apagar", "Cancelar", "var(--danger)");
    if(!conf) return;
    
    let indexReal = window.despesasMensaisGlobais.findIndex(c => c.id === idUnico);
    if (indexReal === -1) indexReal = indexArrayFallback;
    if (indexReal === -1 || indexReal === undefined) return alert("Erro: Movimentação não encontrada.");

    let removido = window.despesasMensaisGlobais.splice(indexReal, 1)[0];

    if(currentUser) {
        try {
            const { error } = await db.from('profiles').update({ despesas_mensais_json: window.despesasMensaisGlobais }).eq('id', currentUser.id);
            if(error) { alert("Erro ao remover do banco: " + error.message); window.despesasMensaisGlobais.splice(indexReal, 0, removido); } 
            else { gerarRelatorioMensal(); }
        } catch(e) {}
    }
}

async function salvarPartidaComPlacares() {
    if(!window.partidaAtualId) return alert("Erro: Nenhuma partida ativa encontrada no banco de dados. Por favor, volte em 'Sorteio' e gere as equipes novamente.");
    let conf = await customConfirm("Finalizar Baba", "Deseja encerrar o baba de hoje e computar a presença de todos os jogadores no banco de dados?", "Sim, Finalizar", "Cancelar", "var(--supabase)");
    if(!conf) return;
    
    const btn = document.getElementById('btn-encerrar-baba'); if(btn) { btn.innerText = "Sincronizando Servidor..."; btn.disabled = true; }
    try {
        let artilheiros = {};
        window.jogosDaRodada.forEach(jogo => {
            if(jogo.tipo === 'ajuste') { artilheiros[jogo.jogador] = (artilheiros[jogo.jogador] || 0) + jogo.gols; } 
            else {
                jogo.gols_a.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
                jogo.gols_b.forEach(nome => { if(nome !== 'Gol Contra') artilheiros[nome] = (artilheiros[nome] || 0) + 1; });
            }
        });
        let presentesPagantes = jogadores.filter(j => j.presente && j.pagou && j.tipo === 'Convidado'); let convidadosPagantes = presentesPagantes.length;
        let vConv = document.getElementById('valor-convidado'); let valorConv = vConv ? parseFloat(vConv.value) || 0 : 0; 
        let vMens = document.getElementById('valor-mensalista'); let valorMens = vMens ? parseFloat(vMens.value) || 0 : 0;

        window.filaEquipes = [];
        const { error: errP } = await db.from('partidas').update({ 
            renda_convidados: convidadosPagantes, valor_por_convidado: valorConv, valor_por_mensalista: valorMens, custos_json: window.custosDaRodada,
            artilheiros_json: artilheiros, jogos_json: window.jogosDaRodada, times_json: window.timesSorteadosObjs, fila_json: window.filaEquipes
        }).eq('id', window.partidaAtualId);
        
        if(errP) throw errP;

        await db.from('presencas').delete().eq('partida_id', window.partidaAtualId);
        let presencasToInsert = [];
        window.timesSorteadosObjs.forEach((t) => { t.jogadores.forEach(j => presencasToInsert.push({ partida_id: window.partidaAtualId, jogador_id: j.id, pagou: j.pagou || false, equipe: t.nome })); });
        if (window.reservasSorteados) window.reservasSorteados.forEach(j => presencasToInsert.push({ partida_id: window.partidaAtualId, jogador_id: j.id, pagou: j.pagou || false, equipe: "Reserva" }));
        if(presencasToInsert.length > 0) await db.from('presencas').insert(presencasToInsert);

        await db.from('jogadores').delete().eq('tipo', 'Convidado').eq('user_id', currentUser.id);
        window.partidaSalva = true; window.partidaSalvaManual = true; 
        
        jogadores.forEach(j => { j.presente = false; j.ordemChegada = 0; j.pagou = false; });
        salvarEstadoLocal(); atualizarListas(); atualizarFilaUI(); atualizarListaJogosDaRodada(); salvarEstadoCompleto();
        
        const instrucoes = document.getElementById('texto-instrucoes-sumula'); if(instrucoes) instrucoes.style.display = 'none';
        let btnSum = document.getElementById('btn-ir-placares'); if(btnSum) btnSum.innerText = "📝 Ver Súmula Anterior";

        carregarElencoDaNuvem(); gerarRelatorioMensal();

        if(btn) btn.innerText = "✅ Baba Encerrado e Salvo com Sucesso!"; 
        await customAlert("Sucesso", "O Baba de hoje foi finalizado e os dados salvos com sucesso!", "OK", "var(--supabase)");
    } catch(err) { alert("Erro de comunicação com o banco: " + err.message); if(btn) { btn.innerText = "Tentar Novamente"; btn.disabled = false; } }
}
