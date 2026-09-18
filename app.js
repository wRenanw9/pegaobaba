function removerGolTemp(lado, index) { if(lado === 'A') window.golsTempA.splice(index, 1); else window.golsTempB.splice(index, 1); atualizarPlacarTempUI(); salvarEstadoCompleto(); }

function atualizarPlacarTempUI() {
    let placA = document.getElementById('placar-num-a'); if(placA) placA.innerText = window.golsTempA.length; 
    let placB = document.getElementById('placar-num-b'); if(placB) placB.innerText = window.golsTempB.length;
    let htmlA = ''; window.golsTempA.forEach((nome, i) => htmlA += `<div class="item-gol-arena">${escapeHTML(nome)} <span class="remover-gol-btn-arena" onclick="removerGolTemp('A', ${i})">x</span></div>`); 
    let listA = document.getElementById('lista-gols-a'); if(listA) listA.innerHTML = htmlA || '<span style="opacity:0.5;">Nenhum gol</span>';
    let htmlB = ''; window.golsTempB.forEach((nome, i) => htmlB += `<div class="item-gol-arena">${escapeHTML(nome)} <span class="remover-gol-btn-arena" onclick="removerGolTemp('B', ${i})">x</span></div>`); 
    let listB = document.getElementById('lista-gols-b'); if(listB) listB.innerHTML = htmlB || '<span style="opacity:0.5;">Nenhum gol</span>';
}
function formatarGolsResumo(golsArray) { if(!golsArray || golsArray.length === 0) return ''; let contagem = {}; golsArray.forEach(g => { contagem[g] = (contagem[g] || 0) + 1; }); return Object.entries(contagem).map(([nome, qtd]) => qtd > 1 ? `${escapeHTML(nome)} (${qtd})` : escapeHTML(nome)).join(', '); }

async function adicionarJogoNaSumula() {
    if (!(await checarTimesCompletosParaJogo())) return; 
    
    let selA = document.getElementById('sumula_equipe_a'); let selB = document.getElementById('sumula_equipe_b'); if(!selA || !selB) return;
    let idA = parseInt(selA.value); let idB = parseInt(selB.value); if(idA === idB) return alert("As equipes devem ser diferentes!");
    let gaList = [...window.golsTempA]; let gbList = [...window.golsTempB]; let ga = gaList.length; let gb = gbList.length;
    let nomeA = window.timesSorteadosObjs.find(t=>t.id === idA).nome; let nomeB = window.timesSorteadosObjs.find(t=>t.id === idB).nome;

    let msgConf = `Confirmar o encerramento da partida?<br><br><span style="font-size:18px; font-weight:900; color:var(--dark);">${escapeHTML(nomeA)} ${ga} x ${gb} ${escapeHTML(nomeB)}</span>`;
    let querConfirmar = await customConfirm("⚽ Fim de Jogo", msgConf, "✔️ Confirmar Placar", "Cancelar", "var(--supabase)");
    if (!querConfirmar) return;

    let btnConfirmar = document.querySelector('button[onclick="adicionarJogoNaSumula()"]'); let textoOriginal = "";
    if(btnConfirmar) { textoOriginal = btnConfirmar.innerText; btnConfirmar.innerText = "⏳ Salvando..."; btnConfirmar.disabled = true; btnConfirmar.style.opacity = "0.6"; }

    try {
        let isEmpate = (ga === gb); let vencedorPenaltisId = null;
        let validMatchesCount = window.jogosDaRodada.filter(j => j.tipo !== 'ajuste' && j.tipo !== 'modo').length;
        let isKnockout = (window.modoCompeticaoAtual === 'torneio' && validMatchesCount >= 6);

        if (isEmpate && isKnockout) {
            vencedorPenaltisId = await perguntarVencedorPenaltis(idA, nomeA, idB, nomeB);
            isEmpate = false; 