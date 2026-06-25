// ============================================
// FACILITAKI - SCRIPT COMPLETO V2.0
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

const API_URL = '';

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
            carregarPerfilUsuario();
            carregarPedidos();
            carregarDadosFinanceiros();
        } catch (e) {
            console.error('Erro ao parsear usuário:', e);
        }
    }
    
    // Menu mobile
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
    
    // Animações
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
    
    // Estatísticas animadas
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
            
            if (tabId === 'pedidos') carregarPedidos();
            if (tabId === 'financeiro') carregarDadosFinanceiros();
            if (tabId === 'perfil') carregarPerfilUsuario();
        });
    });
    
    // Filtros
    const searchInput = document.getElementById('searchPedido');
    const statusFilter = document.getElementById('filtroStatus');
    if (searchInput) searchInput.addEventListener('input', () => aplicarFiltros());
    if (statusFilter) statusFilter.addEventListener('change', () => aplicarFiltros());
    
    // Upload
    const uploadDescricao = document.getElementById('uploadDescricao');
    const uploadTermos = document.getElementById('uploadTermos');
    if (uploadDescricao) uploadDescricao.addEventListener('input', verificarHabilitarBotaoUpload);
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
            carregarPerfilUsuario();
        }
        if (sectionId === 'checkout') atualizarResumoPedido();
        if (sectionId === 'pagamento-sucesso' && carrinho.plano) mostrarInstrucoesPagamento();
    }
    
    const navMenu = document.getElementById('navMenu');
    if (navMenu && navMenu.classList.contains('active')) {
        navMenu.classList.remove('active');
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// TOGGLE ENTRE LOGIN E CADASTRO (CORRIGIDO)
// ============================================
function mostrarCadastro() {
    console.log('📝 Mostrando formulário de cadastro');
    const formLogin = document.getElementById('formLogin');
    const formCadastro = document.getElementById('formCadastro');
    
    if (formLogin) {
        formLogin.style.display = 'none';
    }
    if (formCadastro) {
        formCadastro.style.display = 'block';
    }
    
    // Limpar mensagens anteriores
    const msgDiv = document.getElementById('mensagemLogin');
    if (msgDiv) {
        msgDiv.innerHTML = '';
        msgDiv.className = 'message';
    }
}

function mostrarLogin() {
    console.log('📝 Mostrando formulário de login');
    const formLogin = document.getElementById('formLogin');
    const formCadastro = document.getElementById('formCadastro');
    
    if (formCadastro) {
        formCadastro.style.display = 'none';
    }
    if (formLogin) {
        formLogin.style.display = 'block';
    }
    
    // Limpar mensagens anteriores
    const msgDiv = document.getElementById('mensagemLogin');
    if (msgDiv) {
        msgDiv.innerHTML = '';
        msgDiv.className = 'message';
    }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        // Fallback: alert se o container não existir
        alert(mensagem);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icon = tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span class="toast-message">${mensagem}</span><button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function mostrarLoading(mensagem = 'Carregando...') {
    let loading = document.getElementById('globalLoading');
    if (loading) loading.remove();
    
    loading = document.createElement('div');
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
// AUTENTICAÇÃO
// ============================================
function atualizarHeaderLogado() {
    const btnHeader = document.getElementById('btnLoginHeader');
    if (btnHeader && usuarioLogado) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
        btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
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
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.accessToken);
            atualizarHeaderLogado();
            mostrarToast('Login realizado com sucesso!', 'success');
            setTimeout(() => navegarPara('dashboard'), 1000);
        } else {
            mostrarToast(data.erro || 'Credenciais inválidas', 'error');
        }
    } catch (error) {
        console.error('Erro no login:', error);
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
            atualizarHeaderLogado();
            mostrarToast('Cadastro realizado com sucesso!', 'success');
            setTimeout(() => navegarPara('dashboard'), 1000);
        } else {
            mostrarToast(data.erro || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        console.error('Erro no cadastro:', error);
        mostrarToast('Erro de conexão', 'error');
    }
    
    fecharLoading();
}

function fazerLogout() {
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    usuarioLogado = null;
    atualizarHeaderLogado();
    mostrarToast('Logout realizado com sucesso!', 'success');
    navegarPara('home');
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
    const btnFinalizar = document.getElementById('btnFinalizarCompra');
    if (btnFinalizar) btnFinalizar.disabled = false;
}

function atualizarResumoPedido() {
    const resumoDiv = document.getElementById('resumoPedido');
    if (!resumoDiv) return;
    
    if (carrinho.plano && carrinho.preco > 0) {
        resumoDiv.innerHTML = `<div class="servico-resumo">
            <div class="resumo-item"><span>Serviço:</span><strong>${carrinho.nomePlano}</strong></div>
            <div class="resumo-item"><span>Valor Total:</span><strong>${carrinho.preco.toLocaleString('pt-MZ')} MT</strong></div>
            <div class="resumo-item"><span>Entrada (50%):</span><strong>${Math.ceil(carrinho.preco * 0.5).toLocaleString('pt-MZ')} MT</strong></div>
        </div>`;
    } else {
        resumoDiv.innerHTML = `<div class="empty-state">
            <i class="fas fa-shopping-cart"></i>
            <p>Nenhum serviço selecionado</p>
            <button class="btn-link" onclick="navegarPara('planos')">Escolher Serviço</button>
        </div>`;
    }
}

function finalizarCompra() {
    if (!carrinho.plano) {
        mostrarToast('Selecione um serviço', 'error');
        return;
    }
    if (!carrinho.metodoPagamento) {
        mostrarToast('Selecione um método de pagamento', 'error');
        return;
    }
    if (!usuarioLogado) {
        mostrarToast('Faça login para continuar', 'info');
        navegarPara('login');
        return;
    }
    navegarPara('pagamento-sucesso');
}

function mostrarInstrucoesPagamento() {
    const valorTotal = carrinho.preco;
    const valorEntrada = Math.ceil(valorTotal * 0.5);
    let instrucoes = '';
    
    switch(carrinho.metodoPagamento) {
        case 'mpesa':
            instrucoes = `<div class="instrucoes-pagamento-box">
                <h4><i class="fab fa-m-pesa"></i> M-Pesa</h4>
                <ol>
                    <li>Acesse M-Pesa</li>
                    <li>Selecione "Transferir Dinheiro"</li>
                    <li>Digite o número: <strong>84 728 6665</strong></li>
                    <li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong></li>
                    <li>Nome: <strong>Aguinaldo Anli</strong></li>
                </ol>
                <div class="alerta">
                    <i class="fas fa-info-circle"></i>
                    Envie o comprovativo para WhatsApp: <strong>86 728 6665</strong>
                </div>
            </div>`;
            break;
        case 'emola':
            instrucoes = `<div class="instrucoes-pagamento-box">
                <h4><i class="fas fa-wallet"></i> e-Mola</h4>
                <ol>
                    <li>Acesse e-Mola</li>
                    <li>Selecione "Transferir"</li>
                    <li>Digite o número: <strong>86 728 6665</strong></li>
                    <li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong></li>
                    <li>Nome: <strong>Aguinaldo Anli Mahadura</strong></li>
                </ol>
            </div>`;
            break;
        case 'deposito':
            instrucoes = `<div class="instrucoes-pagamento-box">
                <h4><i class="fas fa-university"></i> Depósito Bancário</h4>
                <p><strong>Banco:</strong> MOZABANCO</p>
                <p><strong>NIB:</strong> 00340000358480311018</p>
                <p><strong>Nome:</strong> Aguinaldo Anli Mahadura</p>
                <p><strong>Valor:</strong> ${valorEntrada.toLocaleString('pt-MZ')} MT</p>
            </div>`;
            break;
    }
    
    const instrucoesDiv = document.getElementById('instrucoesDetalhadas');
    const resumoDiv = document.getElementById('resumoPagamento');
    
    if (instrucoesDiv) instrucoesDiv.innerHTML = instrucoes;
    if (resumoDiv) {
        resumoDiv.innerHTML = `<div class="servico-resumo">
            <div class="resumo-item"><span>Serviço:</span><strong>${carrinho.nomePlano}</strong></div>
            <div class="resumo-item"><span>Valor Total:</span><strong>${valorTotal.toLocaleString('pt-MZ')} MT</strong></div>
            <div class="resumo-item"><span>Entrada (50%):</span><strong style="color:var(--success-600);">${valorEntrada.toLocaleString('pt-MZ')} MT</strong></div>
            <div class="resumo-item"><span>Método:</span><strong>${carrinho.metodoPagamento.toUpperCase()}</strong></div>
        </div>`;
    }
}

// ============================================
// DASHBOARD - PERFIL
// ============================================
async function carregarPerfilUsuario() {
    const token = localStorage.getItem('token_facilitaki');
    if (!token) return;
    
    try {
        const response = await fetch('/api/perfil', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.usuario) {
                const welcomeName = document.getElementById('welcomeUserName');
                if (welcomeName) {
                    welcomeName.innerHTML = `Olá, ${data.usuario.nome.split(' ')[0]}! 👋`;
                }
                
                const perfilNome = document.getElementById('perfilNome');
                const perfilNomeCompleto = document.getElementById('perfilNomeCompleto');
                const perfilTelefone = document.getElementById('perfilTelefone');
                const perfilEmail = document.getElementById('perfilEmail');
                
                if (perfilNome) perfilNome.textContent = data.usuario.nome;
                if (perfilNomeCompleto) perfilNomeCompleto.value = data.usuario.nome;
                if (perfilTelefone) perfilTelefone.value = data.usuario.telefone;
                if (perfilEmail) perfilEmail.value = data.usuario.email || '';
                
                const avatarImg = document.querySelector('.user-avatar img');
                if (avatarImg) {
                    avatarImg.src = `https://ui-avatars.com/api/?background=2563eb&color=fff&name=${encodeURIComponent(data.usuario.nome)}`;
                }
                
                const usuarioSalvo = JSON.parse(localStorage.getItem('usuarioLogado_facilitaki') || '{}');
                usuarioSalvo.nome = data.usuario.nome;
                localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(usuarioSalvo));
            }
        }
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
    }
}

function salvarPerfil() {
    const nome = document.getElementById('perfilNomeCompleto')?.value;
    const email = document.getElementById('perfilEmail')?.value;
    
    if (usuarioLogado && nome) {
        usuarioLogado.nome = nome;
        localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(usuarioLogado));
        carregarPerfilUsuario();
        mostrarToast('Perfil atualizado com sucesso!', 'success');
    } else {
        mostrarToast('Preencha o nome corretamente', 'error');
    }
}

function alterarSenha() {
    mostrarToast('Funcionalidade em desenvolvimento. Contate o suporte.', 'info');
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
        const matchSearch = (pedido.nome_plano || '').toLowerCase().includes(searchTerm) || 
                           (pedido.descricao || '').toLowerCase().includes(searchTerm) ||
                           (pedido.tema || '').toLowerCase().includes(searchTerm);
        const matchStatus = statusFilter === 'todos' || pedido.status === statusFilter;
        return matchSearch && matchStatus;
    });
    
    renderizarPedidos(filtrados);
}

function renderizarPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) return;
    
    if (pedidos.length === 0) {
        container.innerHTML = `<div class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>Nenhum pedido encontrado</p>
            <button class="btn-primary" onclick="document.querySelector('.tab-btn[data-tab=\\"upload\\"]').click()">
                Solicitar Serviço
            </button>
        </div>`;
        return;
    }
    
    container.innerHTML = pedidos.map(pedido => {
        let statusClass = 'pendente';
        let statusText = 'Pendente';
        
        switch(pedido.status) {
            case 'pendente': statusClass = 'pendente'; statusText = 'Pendente'; break;
            case 'pago': statusClass = 'pago'; statusText = 'Pago'; break;
            case 'em_andamento': statusClass = 'em_andamento'; statusText = 'Em andamento'; break;
            case 'concluido': statusClass = 'concluido'; statusText = 'Concluído'; break;
            default: statusClass = 'pendente'; statusText = pedido.status;
        }
        
        return `<div class="pedido-card">
            <div class="pedido-header">
                <h4 class="pedido-titulo">${pedido.nome_plano || 'Serviço'}</h4>
                <span class="pedido-status ${statusClass}">${statusText}</span>
            </div>
            <div class="pedido-body">
                <div class="pedido-detalhes">
                    <p><i class="far fa-calendar"></i> ${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</p>
                    ${pedido.tema ? `<p><i class="fas fa-tag"></i> ${pedido.tema.substring(0, 50)}</p>` : ''}
                </div>
                <div class="pedido-valor">${(parseFloat(pedido.preco) || 0).toLocaleString('pt-MZ')} MT</div>
            </div>
        </div>`;
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
// DASHBOARD - UPLOAD
// ============================================
function atualizarPrecoUpload() {
    const servico = document.getElementById('uploadServico').value;
    const resumoDiv = document.getElementById('uploadResumo');
    const precos = { 
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 
        'monografia': { nome: 'Monografia/TCC', preco: 10000 } 
    };
    
    if (servico && precos[servico]) {
        const valorTotal = precos[servico].preco;
        const resumoServico = document.getElementById('resumoServico');
        const resumoValorTotal = document.getElementById('resumoValorTotal');
        const resumoEntrada = document.getElementById('resumoEntrada');
        
        if (resumoServico) resumoServico.textContent = precos[servico].nome;
        if (resumoValorTotal) resumoValorTotal.textContent = valorTotal.toLocaleString('pt-MZ') + ' MT';
        if (resumoEntrada) resumoEntrada.textContent = Math.ceil(valorTotal * 0.5).toLocaleString('pt-MZ') + ' MT';
        if (resumoDiv) resumoDiv.style.display = 'block';
        verificarHabilitarBotaoUpload();
    } else {
        if (resumoDiv) resumoDiv.style.display = 'none';
        const btnEnviar = document.getElementById('btnEnviarUpload');
        if (btnEnviar) btnEnviar.disabled = true;
    }
}

function selecionarMetodoUpload(metodo) {
    uploadMetodoSelecionado = metodo;
    document.querySelectorAll('.metodo-radio').forEach(el => el.classList.remove('active'));
    const target = document.querySelector(`.metodo-radio[onclick*="${metodo}"]`);
    if (target) target.classList.add('active');
    
    const resumoMetodo = document.getElementById('resumoMetodo');
    if (resumoMetodo) {
        resumoMetodo.textContent = metodo === 'mpesa' ? 'M-Pesa' : metodo === 'emola' ? 'e-Mola' : 'Depósito Bancário';
    }
    verificarHabilitarBotaoUpload();
}

function handleUploadFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) {
        mostrarToast('Arquivo muito grande (máximo 50MB)', 'error');
        return;
    }
    
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
    const fileInput = document.getElementById('uploadFileInput');
    const preview = document.getElementById('uploadFilePreview');
    
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    verificarHabilitarBotaoUpload();
}

function verificarHabilitarBotaoUpload() {
    const servico = document.getElementById('uploadServico')?.value;
    const descricao = document.getElementById('uploadDescricao')?.value.trim();
    const termos = document.getElementById('uploadTermos')?.checked || false;
    const metodoSelecionado = uploadMetodoSelecionado;
    const btn = document.getElementById('btnEnviarUpload');
    
    const podeEnviar = servico && descricao && termos && metodoSelecionado;
    
    if (btn) {
        btn.disabled = !podeEnviar;
    }
}

async function enviarUploadPedido() {
    const servico = document.getElementById('uploadServico').value;
    const descricao = document.getElementById('uploadDescricao').value;
    const prazo = document.getElementById('uploadPrazo').value;
    
    if (!servico) {
        mostrarToast('❌ Selecione um serviço', 'error');
        return;
    }
    
    if (!descricao || descricao.trim() === '') {
        mostrarToast('❌ Descreva o tema do seu trabalho', 'error');
        return;
    }
    
    if (!uploadMetodoSelecionado) {
        mostrarToast('❌ Selecione um método de pagamento', 'error');
        return;
    }
    
    const termosCheck = document.getElementById('uploadTermos');
    if (!termosCheck || !termosCheck.checked) {
        mostrarToast('❌ Aceite os Termos de Serviço', 'error');
        return;
    }
    
    const servicosInfo = { 
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 
        'monografia': { nome: 'Monografia/TCC', preco: 10000 } 
    };
    const info = servicosInfo[servico];
    
    const formData = new FormData();
    if (uploadArquivoSelecionado) {
        formData.append('arquivo', uploadArquivoSelecionado);
    }
    formData.append('cliente', usuarioLogado.nome);
    formData.append('telefone', usuarioLogado.telefone);
    formData.append('tema', descricao);
    formData.append('descricao', descricao);
    formData.append('prazo', prazo || '');
    formData.append('plano', servico);
    formData.append('nomePlano', info.nome);
    formData.append('preco', info.preco.toString());
    formData.append('metodoPagamento', uploadMetodoSelecionado);
    
    mostrarLoading('Enviando solicitação...');
    
    const token = localStorage.getItem('token_facilitaki');
    
    try {
        const response = await fetch('/api/pedidos/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        fecharLoading();
        
        if (data.success) {
            carrinho = { 
                plano: servico, 
                nomePlano: info.nome, 
                preco: info.preco, 
                metodoPagamento: uploadMetodoSelecionado 
            };
            
            mostrarToast('✅ Solicitação enviada com sucesso!', 'success');
            
            document.getElementById('uploadServico').value = '';
            document.getElementById('uploadDescricao').value = '';
            document.getElementById('uploadPrazo').value = '';
            document.getElementById('uploadTermos').checked = false;
            removerUploadFile();
            document.getElementById('uploadResumo').style.display = 'none';
            document.getElementById('btnEnviarUpload').disabled = true;
            
            uploadMetodoSelecionado = null;
            document.querySelectorAll('.metodo-radio').forEach(el => {
                el.classList.remove('active');
            });
            
            setTimeout(() => navegarPara('pagamento-sucesso'), 1500);
            carregarPedidos();
            carregarDadosFinanceiros();
        } else {
            mostrarToast(data.erro || '❌ Erro ao enviar solicitação', 'error');
        }
    } catch (error) {
        fecharLoading();
        console.error('Erro no upload:', error);
        mostrarToast('❌ Erro de conexão: ' + error.message, 'error');
    }
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
            const historico = [];
            
            pedidos.forEach(pedido => {
                const valor = parseFloat(pedido.preco) || 0;
                totalInvestido += valor;
                
                if (pedido.status === 'pago' || pedido.status === 'confirmado' || pedido.status === 'concluido') {
                    totalPago += valor;
                } else if (pedido.status === 'pendente') {
                    saldoPendente += valor;
                }
                
                historico.push({ 
                    data: pedido.data_pedido, 
                    servico: pedido.nome_plano, 
                    valor: valor, 
                    tipo: 'Pedido', 
                    status: pedido.status === 'pago' || pedido.status === 'concluido' ? 'confirmado' : 'pendente', 
                    referencia: `FAC-${pedido.id}` 
                });
            });
            
            const totalInvestidoEl = document.getElementById('financeiroTotalInvestido');
            const totalPagoEl = document.getElementById('financeiroTotalPago');
            const saldoPendenteEl = document.getElementById('financeiroSaldoPendente');
            
            if (totalInvestidoEl) totalInvestidoEl.textContent = totalInvestido.toLocaleString('pt-MZ') + ' MT';
            if (totalPagoEl) totalPagoEl.textContent = totalPago.toLocaleString('pt-MZ') + ' MT';
            if (saldoPendenteEl) saldoPendenteEl.textContent = saldoPendente.toLocaleString('pt-MZ') + ' MT';
            
            const tbody = document.getElementById('historicoPagamentosBody');
            if (tbody) {
                if (historico.length > 0) {
                    tbody.innerHTML = historico.map(t => `
                        <tr>
                            <td>${new Date(t.data).toLocaleDateString('pt-MZ')}</td>
                            <td>${t.servico}</td>
                            <td><strong>${t.valor.toLocaleString('pt-MZ')} MT</strong></td>
                            <td>${t.tipo}</td>
                            <td><span class="status-pagamento ${t.status === 'confirmado' ? 'confirmado' : 'pendente'}">${t.status === 'confirmado' ? 'Confirmado' : 'Pendente'}</span></td>
                            <td><small>${t.referencia}</small></td>
                        </tr>
                    `).join('');
                } else {
                    tbody.innerHTML = `<tr class="empty-row">
                        <td colspan="6">
                            <div class="empty-state">
                                <i class="fas fa-receipt"></i>
                                <p>Nenhum pagamento registrado</p>
                                <button class="btn-primary" onclick="document.querySelector('.tab-btn[data-tab=\\"upload\\"]').click()">
                                    Fazer primeiro pedido
                                </button>
                            </div>
                        </td>
                    </tr>`;
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
        if (cols.length >= 6) {
            csv += `"${cols[0].innerText}","${cols[1].innerText}","${cols[2].innerText.replace(' MT', '')}","${cols[3].innerText}","${cols[4].innerText}","${cols[5].innerText}"\n`;
        }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', `historico_facilitaki_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarToast('Histórico exportado com sucesso!', 'success');
}

// ============================================
// CONTATO
// ============================================
async function enviarContato() {
    const nome = document.getElementById('contatoNome')?.value.trim();
    const telefone = document.getElementById('contatoTelefone')?.value.trim();
    const mensagem = document.getElementById('contatoMensagem')?.value.trim();
    
    if (!nome || !telefone || !mensagem) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    mostrarLoading('Enviando mensagem...');
    
    try {
        const response = await fetch(`${API_URL}/api/contato`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, mensagem })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Mensagem enviada com sucesso!', 'success');
            document.getElementById('contatoNome').value = '';
            document.getElementById('contatoTelefone').value = '';
            document.getElementById('contatoMensagem').value = '';
        } else {
            mostrarToast(data.erro || 'Erro ao enviar mensagem', 'error');
        }
    } catch (error) {
        console.error('Erro no contato:', error);
        mostrarToast('Erro de conexão. Tente novamente.', 'error');
    }
    
    fecharLoading();
}

// ============================================
// DOWNLOAD APK
// ============================================
function registrarDownloadAPK() {
    console.log('📱 Download do APK iniciado');
    // Adicionar analytics ou tracking aqui se necessário
    mostrarToast('📱 Baixando aplicativo Facilitaki...', 'info');
}

// ============================================
// UTILITÁRIOS
// ============================================
function mostrarTermos() {
    alert('TERMOS DE SERVIÇO\n\n' +
        '1. O serviço será iniciado após o recebimento do comprovativo de pagamento da entrada de 50%\n\n' +
        '2. O prazo de entrega começa a contar após o pagamento e recebimento de todos os materiais necessários\n\n' +
        '3. Garantimos 99,9% de taxa de aprovação quando todas as instruções são seguidas\n\n' +
        '4. Sua privacidade é totalmente respeitada. Não compartilhamos seus dados\n\n' +
        '5. O cliente é responsável pelo conteúdo e uso do trabalho entregue');
}

function mostrarPrivacidade() {
    alert('POLÍTICA DE PRIVACIDADE\n\n' +
        '1. Seus dados são usados apenas para processar seus pedidos\n\n' +
        '2. Não compartilhamos suas informações com terceiros\n\n' +
        '3. Você pode solicitar a exclusão de seus dados a qualquer momento\n\n' +
        '4. Utilizamos criptografia para proteger suas informações\n\n' +
        '5. Seus arquivos são armazenados com segurança e excluídos após 90 dias');
}

function mostrarFAQ() {
    alert('PERGUNTAS FREQUENTES\n\n' +
        '❓ Como solicitar um serviço?\n' +
        'R: Acesse sua conta > Dashboard > aba "Novo Pedido"\n\n' +
        '❓ Como pagar?\n' +
        'R: Aceitamos M-Pesa, e-Mola ou depósito bancário\n\n' +
        '❓ Qual o prazo de entrega?\n' +
        'R: Formatação: 24h | Trabalho de campo: 7 dias | Monografia: 3 meses\n\n' +
        '❓ Como entrar em contato?\n' +
        'R: WhatsApp: 86 728 6665 ou 84 728 6665');
}
