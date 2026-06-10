// ============================================
// FACILITAKI - SCRIPT COMPLETO ATUALIZADO
// Com barra de progresso, logout limpo e validações
// ============================================

let usuarioLogado = null;
let carrinho = {
    plano: null,
    nomePlano: '',
    preco: 0,
    metodoPagamento: null
};
let pedidosOriginais = [];
let uploadArquivoSelecionado = null;
let uploadMetodoSelecionado = null;
let uploadXHR = null; // Para cancelar upload

const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://facilitaki.onrender.com';

// ============================================
// LIMPAR ESTADO GLOBAL (LOGOUT)
// ============================================
function limparEstadoGlobal() {
    // Limpar carrinho
    carrinho = {
        plano: null,
        nomePlano: '',
        preco: 0,
        metodoPagamento: null
    };
    
    // Limpar dados de upload
    uploadArquivoSelecionado = null;
    uploadMetodoSelecionado = null;
    
    // Cancelar upload em andamento se existir
    if (uploadXHR) {
        uploadXHR.abort();
        uploadXHR = null;
    }
    
    // Limpar pedidos
    pedidosOriginais = [];
    
    // Limpar campos de formulário
    const uploadServico = document.getElementById('uploadServico');
    const uploadDescricao = document.getElementById('uploadDescricao');
    const uploadPrazo = document.getElementById('uploadPrazo');
    const uploadTermos = document.getElementById('uploadTermos');
    const uploadFileInput = document.getElementById('uploadFileInput');
    const uploadFilePreview = document.getElementById('uploadFilePreview');
    const uploadResumo = document.getElementById('uploadResumo');
    
    if (uploadServico) uploadServico.value = '';
    if (uploadDescricao) uploadDescricao.value = '';
    if (uploadPrazo) uploadPrazo.value = '';
    if (uploadTermos) uploadTermos.checked = false;
    if (uploadFileInput) uploadFileInput.value = '';
    if (uploadFilePreview) uploadFilePreview.style.display = 'none';
    if (uploadResumo) uploadResumo.style.display = 'none';
    
    // Remover seleção de métodos de pagamento
    document.querySelectorAll('.metodo-radio').forEach(el => {
        el.classList.remove('active');
        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
    });
    
    // Remover seleção de métodos no checkout
    document.querySelectorAll('.metodo-pagamento').forEach(el => {
        el.classList.remove('ativo');
    });
    
    // Desabilitar botão de upload
    const btnEnviar = document.getElementById('btnEnviarUpload');
    if (btnEnviar) btnEnviar.disabled = true;
    
    // Desabilitar botão de finalizar compra
    const btnFinalizar = document.getElementById('btnFinalizarCompra');
    if (btnFinalizar) btnFinalizar.disabled = true;
    
    // Fechar modal de progresso se existir
    fecharProgressModal();
    
    console.log('🧹 Estado global limpo');
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Facilitaki inicializado');
    
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    const tokenSalvo = localStorage.getItem('token_facilitaki');
    
    if (usuarioSalvo && tokenSalvo) {
        try {
            usuarioLogado = JSON.parse(usuarioSalvo);
            atualizarHeaderLogado();
        } catch (e) {
            console.error('Erro ao parsear usuário:', e);
        }
    }
    
    // Mobile menu
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
    
    // Scroll reveal
    const observerOptions = { threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    
    // Header scroll
    window.addEventListener('scroll', () => {
        const header = document.getElementById('mainHeader');
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    // Animar stats
    const statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(stat => {
        const target = parseInt(stat.dataset.target);
        if (target) {
            let current = 0;
            const increment = target / 50;
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    stat.textContent = target;
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(current);
                }
            }, 30);
        }
    });
    
    // Tabs do dashboard
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) targetTab.classList.add('active');
        });
    });
    
    // Event listeners para filtros
    const searchInput = document.getElementById('searchPedido');
    const statusFilter = document.getElementById('filtroStatus');
    if (searchInput) searchInput.addEventListener('input', () => aplicarFiltros());
    if (statusFilter) statusFilter.addEventListener('change', () => aplicarFiltros());
    
    const uploadDescricao = document.getElementById('uploadDescricao');
    if (uploadDescricao) uploadDescricao.addEventListener('input', verificarHabilitarBotaoUpload);
    const uploadTermos = document.getElementById('uploadTermos');
    if (uploadTermos) uploadTermos.addEventListener('change', verificarHabilitarBotaoUpload);
});

// ============================================
// NAVEGAÇÃO
// ============================================
function navegarPara(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        
        const navLink = document.querySelector(`[onclick*="${sectionId}"]`);
        if (navLink && navLink.classList.contains('nav-link')) {
            navLink.classList.add('active');
        }
        
        if (sectionId === 'dashboard' && usuarioLogado) {
            carregarPedidos();
            carregarDadosFinanceiros();
        }
        if (sectionId === 'checkout') atualizarResumoPedido();
        if (sectionId === 'pagamento-sucesso' && carrinho.plano) mostrarInstrucoesPagamento();
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// AUTENTICAÇÃO
// ============================================
function atualizarHeaderLogado() {
    const btnHeader = document.getElementById('btnLoginHeader');
    if (btnHeader && usuarioLogado) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
        btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
    }
}

function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icon = tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span class="toast-message">${mensagem}</span><button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function mostrarLoading(mensagem = 'Carregando...') {
    const loading = document.createElement('div');
    loading.id = 'globalLoading';
    loading.className = 'global-loading';
    loading.innerHTML = `<div class="loading-content"><div class="spinner"></div><p>${mensagem}</p></div>`;
    document.body.appendChild(loading);
}

function fecharLoading() {
    const loading = document.getElementById('globalLoading');
    if (loading) loading.remove();
}

// ============================================
// MODAL DE PROGRESSO PARA UPLOAD
// ============================================
function mostrarProgressModal(mensagem) {
    fecharProgressModal();
    
    const modal = document.createElement('div');
    modal.className = 'progress-modal';
    modal.id = 'progressModal';
    modal.innerHTML = `
        <div class="progress-modal-content">
            <div class="progress-modal-icon">
                <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <h3 class="progress-modal-title">Enviando arquivo...</h3>
            <p class="progress-modal-message">${mensagem}</p>
            <div class="progress-modal-bar">
                <div class="progress-modal-fill" id="progressModalFill"></div>
            </div>
            <div>
                <span class="progress-modal-percent" id="progressModalPercent">0%</span>
            </div>
            <button class="progress-modal-cancel" onclick="cancelarUpload()">
                <i class="fas fa-times"></i> Cancelar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

function atualizarProgressModal(percent) {
    const fill = document.getElementById('progressModalFill');
    const percentSpan = document.getElementById('progressModalPercent');
    if (fill) fill.style.width = `${percent}%`;
    if (percentSpan) percentSpan.textContent = `${Math.round(percent)}%`;
}

function fecharProgressModal() {
    const modal = document.getElementById('progressModal');
    if (modal) modal.remove();
}

function cancelarUpload() {
    if (uploadXHR) {
        uploadXHR.abort();
        uploadXHR = null;
        fecharProgressModal();
        mostrarToast('Upload cancelado pelo usuário', 'info');
    }
}

// ============================================
// LOGIN E CADASTRO
// ============================================
async function fazerLogin() {
    const telefone = document.getElementById('loginTelefone')?.value.trim();
    const senha = document.getElementById('loginSenha')?.value;
    
    if (!telefone || !senha) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    mostrarLoading('Entrando...');
    
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, senha })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Limpar estado anterior antes de logar novo usuário
            limparEstadoGlobal();
            
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.accessToken);
            localStorage.setItem('refreshToken_facilitaki', data.refreshToken);
            atualizarHeaderLogado();
            mostrarToast('Login realizado com sucesso!', 'success');
            setTimeout(() => navegarPara('dashboard'), 1000);
        } else {
            mostrarToast(data.erro || 'Credenciais inválidas', 'error');
        }
    } catch (error) {
        mostrarToast('Erro de conexão', 'error');
    }
    
    fecharLoading();
}

async function fazerCadastro() {
    const nome = document.getElementById('cadastroNome')?.value.trim();
    const telefone = document.getElementById('cadastroTelefone')?.value.trim();
    const senha = document.getElementById('cadastroSenha')?.value;
    const confirmar = document.getElementById('cadastroSenhaConfirm')?.value;
    
    if (!nome || !telefone || !senha || !confirmar) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    if (senha !== confirmar) {
        mostrarToast('As senhas não coincidem', 'error');
        return;
    }
    
    if (senha.length < 6) {
        mostrarToast('A senha deve ter pelo menos 6 caracteres', 'error');
        return;
    }
    
    mostrarLoading('Cadastrando...');
    
    try {
        const response = await fetch(`${API_URL}/api/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });
        
        const data = await response.json();
        
        if (data.success) {
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.accessToken);
            localStorage.setItem('refreshToken_facilitaki', data.refreshToken);
            atualizarHeaderLogado();
            mostrarToast('Cadastro realizado com sucesso!', 'success');
            setTimeout(() => navegarPara('dashboard'), 1000);
        } else {
            mostrarToast(data.erro || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        mostrarToast('Erro de conexão', 'error');
    }
    
    fecharLoading();
}

function fazerLogout() {
    // Limpar estado global completamente
    limparEstadoGlobal();
    
    // Limpar localStorage
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    localStorage.removeItem('refreshToken_facilitaki');
    
    // Limpar variável global
    usuarioLogado = null;
    
    // Atualizar header
    atualizarHeaderLogado();
    
    // Mostrar mensagem
    mostrarToast('Logout realizado com sucesso!', 'success');
    
    // Navegar para home
    navegarPara('home');
}

function mostrarCadastro() {
    document.getElementById('formLogin').style.display = 'none';
    document.getElementById('formCadastro').style.display = 'block';
}

function mostrarLogin() {
    document.getElementById('formCadastro').style.display = 'none';
    document.getElementById('formLogin').style.display = 'block';
}

// ============================================
// CHECKOUT
// ============================================
function verificarELogar(tipo, preco) {
    if (!usuarioLogado) {
        sessionStorage.setItem('servico_selecionado', tipo);
        sessionStorage.setItem('preco_selecionado', preco);
        mostrarToast('Faça login para continuar', 'info');
        navegarPara('login');
    } else {
        selecionarPlano(tipo, preco);
    }
}

function selecionarPlano(tipo, preco) {
    const planos = {
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 },
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 },
        'monografia': { nome: 'Monografia/TCC', preco: 10000 }
    };
    const plano = planos[tipo] || { nome: 'Serviço', preco: parseFloat(preco) };
    carrinho = { plano: tipo, nomePlano: plano.nome, preco: plano.preco, metodoPagamento: null };
    navegarPara('checkout');
}

function selecionarMetodo(metodo) {
    document.querySelectorAll('.metodo-pagamento').forEach(btn => btn.classList.remove('ativo'));
    const btnSelecionado = document.querySelector(`[data-metodo="${metodo}"]`);
    if (btnSelecionado) btnSelecionado.classList.add('ativo');
    carrinho.metodoPagamento = metodo;
    document.getElementById('btnFinalizarCompra').disabled = false;
}

function atualizarResumoPedido() {
    const resumoDiv = document.getElementById('resumoPedido');
    if (carrinho.plano && carrinho.preco > 0) {
        resumoDiv.innerHTML = `<div class="servico-resumo"><div class="resumo-item"><span>Serviço:</span><strong>${carrinho.nomePlano}</strong></div><div class="resumo-item"><span>Valor:</span><strong>${carrinho.preco.toLocaleString('pt-MZ')} MT</strong></div><div class="resumo-item"><span>Entrada (50%):</span><strong>${Math.ceil(carrinho.preco * 0.5).toLocaleString('pt-MZ')} MT</strong></div></div>`;
    } else {
        resumoDiv.innerHTML = `<div class="empty-state"><i class="fas fa-shopping-cart"></i><p>Nenhum serviço selecionado</p><button class="btn-link" onclick="navegarPara('planos')">Escolher Serviço</button></div>`;
    }
}

function finalizarCompra() {
    if (!carrinho.plano) return mostrarToast('Selecione um serviço', 'error');
    if (!carrinho.metodoPagamento) return mostrarToast('Selecione um método', 'error');
    if (!usuarioLogado) return mostrarToast('Faça login', 'info');
    navegarPara('pagamento-sucesso');
}

function mostrarInstrucoesPagamento() {
    const valorTotal = carrinho.preco;
    const valorEntrada = Math.ceil(valorTotal * 0.5);
    let instrucoes = '';
    
    switch(carrinho.metodoPagamento) {
        case 'mpesa':
            instrucoes = `<div class="instrucoes-pagamento-box"><h4><i class="fab fa-m-pesa"></i> M-Pesa</h4><ol><li>Acesse M-Pesa</li><li>Selecione "Transferir Dinheiro"</li><li>Digite: <strong>84 728 6665</strong></li><li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong></li><li>Nome: <strong>Aguinaldo Anli</strong></li></ol><div class="alerta"><i class="fas fa-info-circle"></i>Envie comprovativo para WhatsApp: <strong>86 728 6665</strong></div></div>`;
            break;
        case 'emola':
            instrucoes = `<div class="instrucoes-pagamento-box"><h4><i class="fas fa-wallet"></i> e-Mola</h4><ol><li>Acesse e-Mola</li><li>Selecione "Transferir"</li><li>Digite: <strong>86 728 6665</strong></li><li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong></li><li>Nome: <strong>Aguinaldo Anli Mahadura</strong></li></ol></div>`;
            break;
        case 'deposito':
            instrucoes = `<div class="instrucoes-pagamento-box"><h4><i class="fas fa-university"></i> Depósito</h4><p><strong>Banco:</strong> MOZABANCO</p><p><strong>NIB:</strong> 00340000358480311018</p><p><strong>Nome:</strong> Aguinaldo Anli Mahadura</p><p><strong>Valor:</strong> ${valorEntrada.toLocaleString('pt-MZ')} MT</p></div>`;
            break;
    }
    
    document.getElementById('instrucoesDetalhadas').innerHTML = instrucoes;
    document.getElementById('resumoPagamento').innerHTML = `<div class="servico-resumo"><div class="resumo-item"><span>Serviço:</span><strong>${carrinho.nomePlano}</strong></div><div class="resumo-item"><span>Valor Total:</span><strong>${valorTotal.toLocaleString('pt-MZ')} MT</strong></div><div class="resumo-item"><span>Entrada (50%):</span><strong style="color:var(--success-600);">${valorEntrada.toLocaleString('pt-MZ')} MT</strong></div><div class="resumo-item"><span>Método:</span><strong>${carrinho.metodoPagamento.toUpperCase()}</strong></div></div>`;
}

// ============================================
// DASHBOARD - PEDIDOS
// ============================================
async function carregarPedidos() {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) return;
        
        const response = await fetch(`${API_URL}/api/meus-pedidos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            pedidosOriginais = data.pedidos || [];
            aplicarFiltros();
            atualizarMetricas();
        }
    } catch (error) {
        console.error('Erro ao carregar pedidos:', error);
    }
}

function aplicarFiltros() {
    const searchTerm = document.getElementById('searchPedido')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('filtroStatus')?.value || 'todos';
    
    const filtrados = pedidosOriginais.filter(pedido => {
        const matchSearch = (pedido.nome_plano || '').toLowerCase().includes(searchTerm) || (pedido.descricao || '').toLowerCase().includes(searchTerm);
        const matchStatus = statusFilter === 'todos' || pedido.status === statusFilter;
        return matchSearch && matchStatus;
    });
    
    renderizarPedidos(filtrados);
}

function renderizarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    
    if (pedidos.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>Nenhum pedido encontrado</p><button class="btn-primary" onclick="document.querySelector('.tab-btn[data-tab=\"upload\"]').click()">Solicitar Serviço</button></div>`;
        return;
    }
    
    container.innerHTML = pedidos.map(pedido => {
        const statusClass = pedido.status === 'pendente' ? 'pendente' : pedido.status === 'pago' ? 'pago' : pedido.status === 'em_andamento' ? 'em_andamento' : 'concluido';
        const statusText = pedido.status === 'pendente' ? 'Pendente' : pedido.status === 'pago' ? 'Pago' : pedido.status === 'em_andamento' ? 'Em andamento' : 'Concluído';
        return `<div class="pedido-card"><div class="pedido-header"><h4 class="pedido-titulo">${pedido.nome_plano || 'Serviço'}</h4><span class="pedido-status ${statusClass}">${statusText}</span></div><div class="pedido-body"><div class="pedido-detalhes"><p><i class="far fa-calendar"></i> ${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</p>${pedido.tema ? `<p><i class="fas fa-tag"></i> ${pedido.tema.substring(0, 50)}</p>` : ''}</div><div class="pedido-valor">${(parseFloat(pedido.preco) || 0).toLocaleString('pt-MZ')} MT</div></div></div>`;
    }).join('');
}

function atualizarMetricas() {
    const total = pedidosOriginais.length;
    const pendentes = pedidosOriginais.filter(p => p.status === 'pendente' || p.status === 'pago').length;
    const concluidos = pedidosOriginais.filter(p => p.status === 'concluido').length;
    const totalGasto = pedidosOriginais.reduce((sum, p) => sum + (parseFloat(p.preco) || 0), 0);
    
    const totalEl = document.getElementById('totalPedidos');
    const pendentesEl = document.getElementById('pedidosPendentes');
    const concluidosEl = document.getElementById('pedidosConcluidos');
    const totalGastoEl = document.getElementById('totalGasto');
    
    if (totalEl) totalEl.textContent = total;
    if (pendentesEl) pendentesEl.textContent = pendentes;
    if (concluidosEl) concluidosEl.textContent = concluidos;
    if (totalGastoEl) totalGastoEl.textContent = totalGasto.toLocaleString('pt-MZ') + ' MT';
}

// ============================================
// DASHBOARD - UPLOAD COM BARRA DE PROGRESSO
// ============================================
function atualizarPrecoUpload() {
    const servico = document.getElementById('uploadServico').value;
    const resumoDiv = document.getElementById('uploadResumo');
    const precos = { 'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 'monografia': { nome: 'Monografia/TCC', preco: 10000 } };
    
    if (servico && precos[servico]) {
        const valorTotal = precos[servico].preco;
        document.getElementById('resumoServico').textContent = precos[servico].nome;
        document.getElementById('resumoValorTotal').textContent = valorTotal.toLocaleString('pt-MZ') + ' MT';
        document.getElementById('resumoEntrada').textContent = Math.ceil(valorTotal * 0.5).toLocaleString('pt-MZ') + ' MT';
        resumoDiv.style.display = 'block';
        verificarHabilitarBotaoUpload();
    } else {
        resumoDiv.style.display = 'none';
        document.getElementById('btnEnviarUpload').disabled = true;
    }
}

function selecionarMetodoUpload(metodo) {
    uploadMetodoSelecionado = metodo;
    document.querySelectorAll('.metodo-radio').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.metodo-radio[onclick*="${metodo}"]`);
    if (target) target.classList.add('active');
    document.getElementById('resumoMetodo').textContent = metodo === 'mpesa' ? 'M-Pesa' : metodo === 'emola' ? 'e-Mola' : 'Depósito Bancário';
    verificarHabilitarBotaoUpload();
}

function handleUploadFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return mostrarToast('Arquivo muito grande (max 10MB)', 'error');
    uploadArquivoSelecionado = file;
    const preview = document.getElementById('uploadFilePreview');
    const fileName = document.getElementById('uploadFileName');
    if (preview && fileName) {
        fileName.textContent = file.name;
        preview.style.display = 'block';
    }
    verificarHabilitarBotaoUpload();
}

function removerUploadFile() {
    uploadArquivoSelecionado = null;
    document.getElementById('uploadFileInput').value = '';
    document.getElementById('uploadFilePreview').style.display = 'none';
    verificarHabilitarBotaoUpload();
}

function verificarHabilitarBotaoUpload() {
    const servico = document.getElementById('uploadServico').value;
    const descricao = document.getElementById('uploadDescricao').value.trim();
    const termos = document.getElementById('uploadTermos')?.checked || false;
    const btn = document.getElementById('btnEnviarUpload');
    if (btn) btn.disabled = !(servico && descricao && uploadArquivoSelecionado && uploadMetodoSelecionado && termos);
}

async function enviarUploadPedido() {
    const servico = document.getElementById('uploadServico').value;
    const descricao = document.getElementById('uploadDescricao').value;
    const prazo = document.getElementById('uploadPrazo').value;
    
    if (!uploadArquivoSelecionado) {
        mostrarToast('Selecione um arquivo para enviar', 'error');
        return;
    }
    
    const servicosInfo = { 
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 
        'monografia': { nome: 'Monografia/TCC', preco: 10000 } 
    };
    const info = servicosInfo[servico];
    
    const formData = new FormData();
    formData.append('arquivo', uploadArquivoSelecionado);
    formData.append('cliente', usuarioLogado.nome);
    formData.append('telefone', usuarioLogado.telefone);
    formData.append('tema', descricao);
    formData.append('descricao', descricao);
    formData.append('prazo', prazo);
    formData.append('plano', servico);
    formData.append('nomePlano', info.nome);
    formData.append('preco', info.preco);
    formData.append('metodoPagamento', uploadMetodoSelecionado);
    
    // Mostrar modal de progresso
    mostrarProgressModal(`Enviando ${uploadArquivoSelecionado.name}...`);
    
    const token = localStorage.getItem('token_facilitaki');
    
    return new Promise((resolve, reject) => {
        uploadXHR = new XMLHttpRequest();
        
        // Acompanhar progresso do upload
        uploadXHR.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                atualizarProgressModal(percent);
            }
        });
        
        uploadXHR.addEventListener('loadstart', () => {
            console.log('Upload iniciado');
        });
        
        uploadXHR.addEventListener('load', () => {
            uploadXHR = null;
            fecharProgressModal();
            
            if (uploadXHR && uploadXHR.status === 200 || uploadXHR && uploadXHR.status === 201) {
                try {
                    const data = JSON.parse(uploadXHR.responseText);
                    if (data.success) {
                        carrinho = { 
                            plano: servico, 
                            nomePlano: info.nome, 
                            preco: info.preco, 
                            metodoPagamento: uploadMetodoSelecionado 
                        };
                        mostrarToast('Solicitação enviada com sucesso!', 'success');
                        
                        // Limpar formulário
                        document.getElementById('uploadServico').value = '';
                        document.getElementById('uploadDescricao').value = '';
                        removerUploadFile();
                        document.getElementById('uploadResumo').style.display = 'none';
                        document.getElementById('btnEnviarUpload').disabled = true;
                        
                        // Resetar método de pagamento
                        uploadMetodoSelecionado = null;
                        document.querySelectorAll('.metodo-radio').forEach(el => {
                            el.classList.remove('active');
                        });
                        
                        navegarPara('pagamento-sucesso');
                        carregarPedidos();
                        carregarDadosFinanceiros();
                        resolve(data);
                    } else {
                        mostrarToast(data.erro || 'Erro ao enviar', 'error');
                        reject(data);
                    }
                } catch (e) {
                    mostrarToast('Erro ao processar resposta', 'error');
                    reject(e);
                }
            } else {
                mostrarToast('Erro no servidor', 'error');
                reject(new Error('Erro no servidor'));
            }
        });
        
        uploadXHR.addEventListener('error', () => {
            uploadXHR = null;
            fecharProgressModal();
            mostrarToast('Erro de conexão', 'error');
            reject(new Error('Erro de conexão'));
        });
        
        uploadXHR.addEventListener('abort', () => {
            uploadXHR = null;
            fecharProgressModal();
            mostrarToast('Upload cancelado', 'info');
            reject(new Error('Cancelado'));
        });
        
        uploadXHR.open('POST', `${API_URL}/api/pedidos/upload`);
        uploadXHR.setRequestHeader('Authorization', `Bearer ${token}`);
        uploadXHR.send(formData);
    });
}

// ============================================
// DASHBOARD - FINANCEIRO
// ============================================
async function carregarDadosFinanceiros() {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) return;
        
        const response = await fetch(`${API_URL}/api/meus-pedidos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const pedidos = data.pedidos || [];
            
            let totalInvestido = 0, totalPago = 0, saldoPendente = 0;
            let ultimoPagamento = null;
            const historico = [];
            
            pedidos.forEach(pedido => {
                const valor = parseFloat(pedido.preco) || 0;
                totalInvestido += valor;
                if (pedido.status === 'pago' || pedido.status === 'confirmado') totalPago += valor;
                else if (pedido.status === 'pendente') saldoPendente += valor;
                
                if (pedido.status === 'pago') ultimoPagamento = { data: pedido.data_pagamento || pedido.data_pedido, servico: pedido.nome_plano, valor: valor };
                
                historico.push({ data: pedido.data_pedido, servico: pedido.nome_plano, valor: valor, tipo: 'Pedido', status: pedido.status === 'pago' ? 'confirmado' : 'pendente', referencia: `FAC-${pedido.id}` });
            });
            
            const totalInvestidoEl = document.getElementById('financeiroTotalInvestido');
            const totalPagoEl = document.getElementById('financeiroTotalPago');
            const saldoPendenteEl = document.getElementById('financeiroSaldoPendente');
            
            if (totalInvestidoEl) totalInvestidoEl.textContent = totalInvestido.toLocaleString('pt-MZ') + ' MT';
            if (totalPagoEl) totalPagoEl.textContent = totalPago.toLocaleString('pt-MZ') + ' MT';
            if (saldoPendenteEl) saldoPendenteEl.textContent = saldoPendente.toLocaleString('pt-MZ') + ' MT';
            
            const ultimoCard = document.getElementById('ultimoPagamentoCard');
            if (ultimoPagamento && ultimoCard) {
                ultimoCard.style.display = 'block';
                const ultimoValor = document.getElementById('ultimoPagamentoValor');
                const ultimoData = document.getElementById('ultimoPagamentoData');
                const ultimoServico = document.getElementById('ultimoPagamentoServico');
                if (ultimoValor) ultimoValor.textContent = ultimoPagamento.valor.toLocaleString('pt-MZ') + ' MT';
                if (ultimoData) ultimoData.textContent = new Date(ultimoPagamento.data).toLocaleDateString('pt-MZ');
                if (ultimoServico) ultimoServico.textContent = ultimoPagamento.servico;
            } else if (ultimoCard) ultimoCard.style.display = 'none';
            
            const tbody = document.getElementById('historicoPagamentosBody');
            if (tbody) {
                if (historico.length > 0) {
                    tbody.innerHTML = historico.map(t => `<tr><td>${new Date(t.data).toLocaleDateString('pt-MZ')}</td><td>${t.servico}</td><td><strong>${t.valor.toLocaleString('pt-MZ')} MT</strong></td><td>${t.tipo}</td><td><span class="status-pagamento ${t.status === 'confirmado' ? 'confirmado' : 'pendente'}">${t.status === 'confirmado' ? 'Confirmado' : 'Pendente'}</span></td><td><small>${t.referencia}</small></td>`).join('');
                } else {
                    tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state"><i class="fas fa-receipt"></i><p>Nenhum pagamento registrado</p><button class="btn-primary" onclick="document.querySelector('.tab-btn[data-tab=\"upload\"]').click()">Fazer primeiro pagamento</button></div></td></tr>`;
                }
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dados financeiros:', error);
    }
}

function exportarHistorico() {
    const rows = document.querySelectorAll('#historicoPagamentosBody tr:not(.empty-row)');
    let csv = "Data,Serviço,Valor,Tipo,Status,Referência\n";
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 6) csv += `${cols[0].innerText},${cols[1].innerText},${cols[2].innerText.replace(' MT', '')},${cols[3].innerText},${cols[4].innerText},${cols[5].innerText}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historico_facilitaki_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    mostrarToast('Histórico exportado!', 'success');
}

// ============================================
// DASHBOARD - PERFIL
// ============================================
function salvarPerfil() {
    const nome = document.getElementById('perfilNomeCompleto')?.value;
    const telefone = document.getElementById('perfilTelefone')?.value;
    if (usuarioLogado) {
        usuarioLogado.nome = nome || usuarioLogado.nome;
        usuarioLogado.telefone = telefone || usuarioLogado.telefone;
        localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(usuarioLogado));
        const welcomeName = document.getElementById('welcomeUserName');
        const perfilNome = document.getElementById('perfilNome');
        if (welcomeName) welcomeName.innerHTML = `Olá, ${(nome || usuarioLogado.nome).split(' ')[0]}! 👋`;
        if (perfilNome) perfilNome.textContent = nome || usuarioLogado.nome;
    }
    mostrarToast('Perfil atualizado!', 'success');
}

function alterarSenha() {
    const novaSenha = prompt('Digite a nova senha (mínimo 8 caracteres, com maiúscula e número):');
    if (novaSenha && novaSenha.length >= 8 && /[A-Z]/.test(novaSenha) && /[0-9]/.test(novaSenha)) {
        mostrarToast('Funcionalidade em desenvolvimento. Use "Esqueci minha senha" no login.', 'info');
    } else if (novaSenha) {
        mostrarToast('A senha deve ter pelo menos 8 caracteres, uma letra maiúscula e um número', 'error');
    }
}

function mudarAvatar() {
    mostrarToast('Funcionalidade em desenvolvimento', 'info');
}

function abrirNotificacoes() {
    mostrarToast('Nenhuma notificação no momento', 'info');
}

function abrirConfiguracoes() {
    const perfilTab = document.querySelector('.tab-btn[data-tab="perfil"]');
    if (perfilTab) perfilTab.click();
}

// ============================================
// CONTATO
// ============================================
async function enviarContato() {
    const nome = document.getElementById('contatoNome')?.value.trim();
    const telefone = document.getElementById('contatoTelefone')?.value.trim();
    const mensagem = document.getElementById('contatoMensagem')?.value.trim();
    
    if (!nome || !telefone || !mensagem) return mostrarToast('Preencha todos os campos', 'error');
    
    mostrarLoading('Enviando...');
    
    try {
        const response = await fetch(`${API_URL}/api/contato`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, mensagem })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Mensagem enviada!', 'success');
            const contatoNome = document.getElementById('contatoNome');
            const contatoTelefone = document.getElementById('contatoTelefone');
            const contatoMensagem = document.getElementById('contatoMensagem');
            if (contatoNome) contatoNome.value = '';
            if (contatoTelefone) contatoTelefone.value = '';
            if (contatoMensagem) contatoMensagem.value = '';
        } else {
            mostrarToast(data.erro || 'Erro ao enviar', 'error');
        }
    } catch (error) {
        mostrarToast('Erro de conexão', 'error');
    }
    
    fecharLoading();
}

// ============================================
// UTILITÁRIOS
// ============================================
function mostrarTermos() {
    alert('TERMOS DE SERVIÇO\n\n1. Serviço iniciado após 50% de pagamento\n2. Prazo conta após pagamento e materiais\n3. 99,9% de taxa de aprovação garantida\n4. Privacidade respeitada\n5. Cliente responsável pelo conteúdo');
}

function mostrarPrivacidade() {
    alert('POLÍTICA DE PRIVACIDADE\n\n1. Dados usados apenas para processar pedidos\n2. Não compartilhamos com terceiros\n3. Solicite exclusão de dados a qualquer momento\n4. Criptografia para proteger informações\n5. Arquivos excluídos após 90 dias');
}

function mostrarFAQ() {
    alert('FAQ\n\n1. Como solicitar serviço? Acesse "Carregar Ficheiro" no dashboard\n2. Como pagar? M-Pesa, e-Mola ou depósito\n3. Prazo? Formatação 24h, Campo 7 dias, Monografia 3 meses\n4. Suporte? WhatsApp 86 728 6665');
}

// ============================================
// REFRESH TOKEN
// ============================================
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem('refreshToken_facilitaki');
    if (!refreshToken) return false;
    
    try {
        const response = await fetch(`${API_URL}/api/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        
        const data = await response.json();
        if (data.success) {
            localStorage.setItem('token_facilitaki', data.accessToken);
            localStorage.setItem('refreshToken_facilitaki', data.refreshToken);
            return true;
        }
    } catch (error) {
        console.error('Erro ao renovar token:', error);
    }
    return false;
}

async function autenticarRequisicao(url, options = {}) {
    let token = localStorage.getItem('token_facilitaki');
    
    const fazerRequisicao = async (tokenAtual) => {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${tokenAtual}`
            }
        });
    };
    
    let response = await fazerRequisicao(token);
    
    if (response.status === 403 || response.status === 401) {
        const renovado = await refreshAccessToken();
        if (renovado) {
            const novoToken = localStorage.getItem('token_facilitaki');
            response = await fazerRequisicao(novoToken);
        } else {
            localStorage.removeItem('usuarioLogado_facilitaki');
            localStorage.removeItem('token_facilitaki');
            localStorage.removeItem('refreshToken_facilitaki');
            usuarioLogado = null;
            window.location.href = '#login';
            mostrarToast('Sessão expirada. Faça login novamente.', 'error');
            throw new Error('Sessão expirada');
        }
    }
    
    return response;
}
