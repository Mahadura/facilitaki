// script.js - FACILITAKI (VERSÃO COMPATÍVEL COM DEPLOY)
// ============================================
// FACILITAKI - SCRIPT COMPLETO V2.0
// ============================================

var usuarioLogado = null;
var carrinho = {
    plano: null,
    nomePlano: '',
    preco: 0,
    metodoPagamento: null
};
var pedidosOriginais = [];
var uploadArquivoSelecionado = null;
var uploadMetodoSelecionado = null;

var API_URL = '';

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Facilitaki inicializado');
    
    var usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    var tokenSalvo = localStorage.getItem('token_facilitaki');
    
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
    var mobileBtn = document.getElementById('mobileMenuBtn');
    var navMenu = document.getElementById('navMenu');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }
    
    // Animações
    var observerOptions = { threshold: 0.1 };
    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);
    document.querySelectorAll('.reveal').forEach(function(el) {
        observer.observe(el);
    });
    
    // Header scroll
    window.addEventListener('scroll', function() {
        var header = document.getElementById('mainHeader');
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    // Estatísticas animadas
    var statNumbers = document.querySelectorAll('.stat-number');
    statNumbers.forEach(function(stat) {
        var target = parseInt(stat.dataset.target);
        if (target) {
            var current = 0;
            var increment = target / 50;
            var timer = setInterval(function() {
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
    document.querySelectorAll('.tab-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.remove('active');
            });
            var targetTab = document.getElementById('tab-' + tabId);
            if (targetTab) targetTab.classList.add('active');
            
            if (tabId === 'pedidos') carregarPedidos();
            if (tabId === 'financeiro') carregarDadosFinanceiros();
            if (tabId === 'perfil') carregarPerfilUsuario();
        });
    });
    
    // Filtros
    var searchInput = document.getElementById('searchPedido');
    var statusFilter = document.getElementById('filtroStatus');
    if (searchInput) searchInput.addEventListener('input', function() { aplicarFiltros(); });
    if (statusFilter) statusFilter.addEventListener('change', function() { aplicarFiltros(); });
    
    // Upload
    var uploadDescricao = document.getElementById('uploadDescricao');
    var uploadTermos = document.getElementById('uploadTermos');
    if (uploadDescricao) uploadDescricao.addEventListener('input', verificarHabilitarBotaoUpload);
    if (uploadTermos) uploadTermos.addEventListener('change', verificarHabilitarBotaoUpload);
});

// ============================================
// NAVEGAÇÃO
// ============================================
function navegarPara(sectionId) {
    document.querySelectorAll('.section').forEach(function(section) {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(function(link) {
        link.classList.remove('active');
    });
    
    var section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        
        var navLink = document.querySelector('[onclick*="' + sectionId + '"]');
        if (navLink && navLink.classList.contains('nav-link')) {
            navLink.classList.add('active');
        }
        
        if (sectionId === 'dashboard' && usuarioLogado) {
            carregarPedidos();
            carregarDadosFinanceiros();
            carregarPerfilUsuario();
            // Garantir que a aba "Novo Pedido" seja a padrão quando vier dos serviços
            var tabUpload = document.querySelector('.tab-btn[data-tab="upload"]');
            if (tabUpload && sessionStorage.getItem('servico_selecionado')) {
                setTimeout(function() {
                    tabUpload.click();
                    sessionStorage.removeItem('servico_selecionado');
                }, 300);
            }
        }
        if (sectionId === 'checkout') atualizarResumoPedido();
        if (sectionId === 'pagamento-sucesso' && carrinho.plano) mostrarInstrucoesPagamento();
    }
    
    var navMenu = document.getElementById('navMenu');
    if (navMenu && navMenu.classList.contains('active')) {
        navMenu.classList.remove('active');
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// AUTENTICAÇÃO
// ============================================
function atualizarHeaderLogado() {
    var btnHeader = document.getElementById('btnLoginHeader');
    if (btnHeader && usuarioLogado) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
        btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
    }
}

function mostrarToast(mensagem, tipo) {
    if (tipo === undefined) tipo = 'info';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    
    var toast = document.createElement('div');
    toast.className = 'toast ' + tipo;
    var icon = tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = '<i class="fas ' + icon + '"></i><span class="toast-message">' + mensagem + '</span><button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>';
    container.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 5000);
}

function mostrarLoading(mensagem) {
    if (mensagem === undefined) mensagem = 'Carregando...';
    var loading = document.getElementById('globalLoading');
    if (loading) loading.remove();
    
    loading = document.createElement('div');
    loading.id = 'globalLoading';
    loading.className = 'global-loading';
    loading.innerHTML = '<div class="loading-content"><div class="spinner"></div><p>' + mensagem + '</p></div>';
    document.body.appendChild(loading);
}

function fecharLoading() {
    var loading = document.getElementById('globalLoading');
    if (loading) loading.remove();
}

// ============================================
// LOGIN E CADASTRO - CORRIGIDO
// ============================================
function fazerLogin() {
    var telefone = document.getElementById('loginTelefone')?.value.trim();
    var senha = document.getElementById('loginSenha')?.value;
    
    if (!telefone || !senha) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    mostrarLoading('Entrando...');
    
    fetch(API_URL + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: telefone, senha: senha })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        fecharLoading();
        if (data.success) {
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.accessToken);
            atualizarHeaderLogado();
            mostrarToast('Login realizado com sucesso!', 'success');
            
            // Verificar se veio de um serviço
            var servicoSelecionado = sessionStorage.getItem('servico_selecionado');
            var precoSelecionado = sessionStorage.getItem('preco_selecionado');
            
            if (servicoSelecionado && precoSelecionado) {
                sessionStorage.removeItem('servico_selecionado');
                sessionStorage.removeItem('preco_selecionado');
                setTimeout(function() {
                    navegarPara('dashboard');
                    setTimeout(function() {
                        var tabUpload = document.querySelector('.tab-btn[data-tab="upload"]');
                        if (tabUpload) tabUpload.click();
                    }, 500);
                }, 1000);
            } else {
                setTimeout(function() { navegarPara('dashboard'); }, 1000);
            }
        } else {
            mostrarToast(data.erro || 'Credenciais inválidas', 'error');
        }
    })
    .catch(function(error) {
        fecharLoading();
        console.error('Erro no login:', error);
        mostrarToast('Erro de conexão', 'error');
    });
}

function fazerCadastro() {
    var nome = document.getElementById('cadastroNome')?.value.trim();
    var telefone = document.getElementById('cadastroTelefone')?.value.trim();
    var senha = document.getElementById('cadastroSenha')?.value;
    var confirmar = document.getElementById('cadastroSenhaConfirm')?.value;
    
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
    
    fetch(API_URL + '/api/cadastrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome, telefone: telefone, senha: senha })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        fecharLoading();
        if (data.success) {
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.accessToken);
            atualizarHeaderLogado();
            mostrarToast('Cadastro realizado com sucesso!', 'success');
            
            var servicoSelecionado = sessionStorage.getItem('servico_selecionado');
            var precoSelecionado = sessionStorage.getItem('preco_selecionado');
            
            if (servicoSelecionado && precoSelecionado) {
                sessionStorage.removeItem('servico_selecionado');
                sessionStorage.removeItem('preco_selecionado');
                setTimeout(function() {
                    navegarPara('dashboard');
                    setTimeout(function() {
                        var tabUpload = document.querySelector('.tab-btn[data-tab="upload"]');
                        if (tabUpload) tabUpload.click();
                    }, 500);
                }, 1000);
            } else {
                setTimeout(function() { navegarPara('dashboard'); }, 1000);
            }
        } else {
            mostrarToast(data.erro || 'Erro ao cadastrar', 'error');
        }
    })
    .catch(function(error) {
        fecharLoading();
        console.error('Erro no cadastro:', error);
        mostrarToast('Erro de conexão', 'error');
    });
}

function fazerLogout() {
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    usuarioLogado = null;
    atualizarHeaderLogado();
    mostrarToast('Logout realizado com sucesso!', 'success');
    navegarPara('home');
}

function mostrarCadastro() {
    var formLogin = document.getElementById('formLogin');
    var formCadastro = document.getElementById('formCadastro');
    if (formLogin) formLogin.style.display = 'none';
    if (formCadastro) formCadastro.style.display = 'block';
}

function mostrarLogin() {
    var formLogin = document.getElementById('formLogin');
    var formCadastro = document.getElementById('formCadastro');
    if (formCadastro) formCadastro.style.display = 'none';
    if (formLogin) formLogin.style.display = 'block';
}

// ============================================
// BOTÕES DE SERVIÇO - CORRIGIDO
// ============================================
function verificarELogar(tipo, preco) {
    var tokenSalvo = localStorage.getItem('token_facilitaki');
    var usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    
    if (tokenSalvo && usuarioSalvo) {
        try {
            usuarioLogado = JSON.parse(usuarioSalvo);
            selecionarPlano(tipo, preco);
        } catch (e) {
            sessionStorage.setItem('servico_selecionado', tipo);
            sessionStorage.setItem('preco_selecionado', preco);
            mostrarToast('Faça login para continuar', 'info');
            navegarPara('login');
        }
    } else {
        sessionStorage.setItem('servico_selecionado', tipo);
        sessionStorage.setItem('preco_selecionado', preco);
        mostrarToast('Faça login ou cadastre-se para continuar', 'info');
        navegarPara('login');
    }
}

function selecionarPlano(tipo, preco) {
    var planos = {
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 },
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 },
        'monografia': { nome: 'Monografia/TCC', preco: 10000 }
    };
    var plano = planos[tipo] || { nome: 'Serviço', preco: parseFloat(preco) };
    carrinho = { plano: tipo, nomePlano: plano.nome, preco: plano.preco, metodoPagamento: null };
    
    navegarPara('dashboard');
    
    setTimeout(function() {
        var tabUpload = document.querySelector('.tab-btn[data-tab="upload"]');
        if (tabUpload) {
            tabUpload.click();
            var selectServico = document.getElementById('uploadServico');
            if (selectServico) {
                selectServico.value = tipo;
                atualizarPrecoUpload();
            }
            mostrarToast('Serviço selecionado: ' + plano.nome, 'success');
        }
    }, 500);
}

// ============================================
// CHECKOUT
// ============================================
function selecionarMetodo(metodo) {
    document.querySelectorAll('.metodo-pagamento').forEach(function(btn) {
        btn.classList.remove('ativo');
    });
    var btnSelecionado = document.querySelector('[data-metodo="' + metodo + '"]');
    if (btnSelecionado) btnSelecionado.classList.add('ativo');
    carrinho.metodoPagamento = metodo;
    var btnFinalizar = document.getElementById('btnFinalizarCompra');
    if (btnFinalizar) btnFinalizar.disabled = false;
}

function atualizarResumoPedido() {
    var resumoDiv = document.getElementById('resumoPedido');
    if (!resumoDiv) return;
    
    if (carrinho.plano && carrinho.preco > 0) {
        resumoDiv.innerHTML = '<div class="servico-resumo">' +
            '<div class="resumo-item"><span>Serviço:</span><strong>' + carrinho.nomePlano + '</strong></div>' +
            '<div class="resumo-item"><span>Valor Total:</span><strong>' + carrinho.preco.toLocaleString('pt-MZ') + ' MT</strong></div>' +
            '<div class="resumo-item"><span>Entrada (50%):</span><strong>' + Math.ceil(carrinho.preco * 0.5).toLocaleString('pt-MZ') + ' MT</strong></div>' +
        '</div>';
    } else {
        resumoDiv.innerHTML = '<div class="empty-state">' +
            '<i class="fas fa-shopping-cart"></i>' +
            '<p>Nenhum serviço selecionado</p>' +
            '<button class="btn-link" onclick="navegarPara(\'planos\')">Escolher Serviço</button>' +
        '</div>';
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
    var valorTotal = carrinho.preco;
    var valorEntrada = Math.ceil(valorTotal * 0.5);
    var instrucoes = '';
    
    switch(carrinho.metodoPagamento) {
        case 'mpesa':
            instrucoes = '<div class="instrucoes-pagamento-box">' +
                '<h4><i class="fab fa-m-pesa"></i> M-Pesa</h4>' +
                '<ol>' +
                    '<li>Acesse M-Pesa</li>' +
                    '<li>Selecione "Transferir Dinheiro"</li>' +
                    '<li>Digite o número: <strong>84 728 6665</strong></li>' +
                    '<li>Valor: <strong>' + valorEntrada.toLocaleString('pt-MZ') + ' MT</strong></li>' +
                    '<li>Nome: <strong>Aguinaldo Anli</strong></li>' +
                '</ol>' +
                '<div class="alerta">' +
                    '<i class="fas fa-info-circle"></i>' +
                    'Envie o comprovativo para WhatsApp: <strong>86 728 6665</strong>' +
                '</div>' +
            '</div>';
            break;
        case 'emola':
            instrucoes = '<div class="instrucoes-pagamento-box">' +
                '<h4><i class="fas fa-wallet"></i> e-Mola</h4>' +
                '<ol>' +
                    '<li>Acesse e-Mola</li>' +
                    '<li>Selecione "Transferir"</li>' +
                    '<li>Digite o número: <strong>86 728 6665</strong></li>' +
                    '<li>Valor: <strong>' + valorEntrada.toLocaleString('pt-MZ') + ' MT</strong></li>' +
                    '<li>Nome: <strong>Aguinaldo Anli Mahadura</strong></li>' +
                '</ol>' +
            '</div>';
            break;
        case 'deposito':
            instrucoes = '<div class="instrucoes-pagamento-box">' +
                '<h4><i class="fas fa-university"></i> Depósito Bancário</h4>' +
                '<p><strong>Banco:</strong> MOZABANCO</p>' +
                '<p><strong>NIB:</strong> 00340000358480311018</p>' +
                '<p><strong>Nome:</strong> Aguinaldo Anli Mahadura</p>' +
                '<p><strong>Valor:</strong> ' + valorEntrada.toLocaleString('pt-MZ') + ' MT</p>' +
            '</div>';
            break;
    }
    
    var instrucoesDiv = document.getElementById('instrucoesDetalhadas');
    var resumoDiv = document.getElementById('resumoPagamento');
    
    if (instrucoesDiv) instrucoesDiv.innerHTML = instrucoes;
    if (resumoDiv) {
        resumoDiv.innerHTML = '<div class="servico-resumo">' +
            '<div class="resumo-item"><span>Serviço:</span><strong>' + carrinho.nomePlano + '</strong></div>' +
            '<div class="resumo-item"><span>Valor Total:</span><strong>' + valorTotal.toLocaleString('pt-MZ') + ' MT</strong></div>' +
            '<div class="resumo-item"><span>Entrada (50%):</span><strong style="color:var(--success-600);">' + valorEntrada.toLocaleString('pt-MZ') + ' MT</strong></div>' +
            '<div class="resumo-item"><span>Método:</span><strong>' + carrinho.metodoPagamento.toUpperCase() + '</strong></div>' +
        '</div>';
    }
}

// ============================================
// DASHBOARD - PERFIL
// ============================================
function carregarPerfilUsuario() {
    var token = localStorage.getItem('token_facilitaki');
    if (!token) return;
    
    fetch('/api/perfil', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(response) {
        if (response.ok) {
            return response.json();
        }
        return null;
    })
    .then(function(data) {
        if (data && data.success && data.usuario) {
            var welcomeName = document.getElementById('welcomeUserName');
            if (welcomeName) {
                var nomeParts = data.usuario.nome.split(' ');
                welcomeName.innerHTML = 'Olá, ' + nomeParts[0] + '! 👋';
            }
            
            var perfilNome = document.getElementById('perfilNome');
            var perfilNomeCompleto = document.getElementById('perfilNomeCompleto');
            var perfilTelefone = document.getElementById('perfilTelefone');
            var perfilEmail = document.getElementById('perfilEmail');
            
            if (perfilNome) perfilNome.textContent = data.usuario.nome;
            if (perfilNomeCompleto) perfilNomeCompleto.value = data.usuario.nome;
            if (perfilTelefone) perfilTelefone.value = data.usuario.telefone;
            if (perfilEmail) perfilEmail.value = data.usuario.email || '';
            
            var avatarImg = document.querySelector('.user-avatar img');
            if (avatarImg) {
                avatarImg.src = 'https://ui-avatars.com/api/?background=2563eb&color=fff&name=' + encodeURIComponent(data.usuario.nome);
            }
            
            var usuarioSalvo = JSON.parse(localStorage.getItem('usuarioLogado_facilitaki') || '{}');
            usuarioSalvo.nome = data.usuario.nome;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(usuarioSalvo));
        }
    })
    .catch(function(error) {
        console.error('Erro ao carregar perfil:', error);
    });
}

function salvarPerfil() {
    var nome = document.getElementById('perfilNomeCompleto')?.value;
    var email = document.getElementById('perfilEmail')?.value;
    
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
    var perfilTab = document.querySelector('.tab-btn[data-tab="perfil"]');
    if (perfilTab) perfilTab.click();
}

// ============================================
// DASHBOARD - PEDIDOS
// ============================================
function carregarPedidos() {
    var token = localStorage.getItem('token_facilitaki');
    if (!token) return;
    
    fetch(API_URL + '/api/meus-pedidos', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(response) {
        if (response.ok) {
            return response.json();
        }
        return null;
    })
    .then(function(data) {
        if (data) {
            pedidosOriginais = data.pedidos || [];
            aplicarFiltros();
            atualizarMetricas();
        }
    })
    .catch(function(error) {
        console.error('Erro ao carregar pedidos:', error);
    });
}

function aplicarFiltros() {
    var searchTerm = document.getElementById('searchPedido')?.value.toLowerCase() || '';
    var statusFilter = document.getElementById('filtroStatus')?.value || 'todos';
    
    var filtrados = pedidosOriginais.filter(function(pedido) {
        var matchSearch = (pedido.nome_plano || '').toLowerCase().includes(searchTerm) || 
                           (pedido.descricao || '').toLowerCase().includes(searchTerm) ||
                           (pedido.tema || '').toLowerCase().includes(searchTerm);
        var matchStatus = statusFilter === 'todos' || pedido.status === statusFilter;
        return matchSearch && matchStatus;
    });
    
    renderizarPedidos(filtrados);
}

function renderizarPedidos(pedidos) {
    var container = document.getElementById('listaPedidos');
    if (!container) return;
    
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="empty-state">' +
            '<i class="fas fa-inbox"></i>' +
            '<p>Nenhum pedido encontrado</p>' +
            '<button class="btn-primary" onclick="document.querySelector(\'.tab-btn[data-tab=\\"upload\\"]\').click()">' +
                'Solicitar Serviço' +
            '</button>' +
        '</div>';
        return;
    }
    
    var html = '';
    pedidos.forEach(function(pedido) {
        var statusClass = 'pendente';
        var statusText = 'Pendente';
        
        switch(pedido.status) {
            case 'pendente': statusClass = 'pendente'; statusText = 'Pendente'; break;
            case 'pago': statusClass = 'pago'; statusText = 'Pago'; break;
            case 'em_andamento': statusClass = 'em_andamento'; statusText = 'Em andamento'; break;
            case 'concluido': statusClass = 'concluido'; statusText = 'Concluído'; break;
            default: statusClass = 'pendente'; statusText = pedido.status;
        }
        
        html += '<div class="pedido-card">' +
            '<div class="pedido-header">' +
                '<h4 class="pedido-titulo">' + (pedido.nome_plano || 'Serviço') + '</h4>' +
                '<span class="pedido-status ' + statusClass + '">' + statusText + '</span>' +
            '</div>' +
            '<div class="pedido-body">' +
                '<div class="pedido-detalhes">' +
                    '<p><i class="far fa-calendar"></i> ' + new Date(pedido.data_pedido).toLocaleDateString('pt-MZ') + '</p>' +
                    (pedido.tema ? '<p><i class="fas fa-tag"></i> ' + pedido.tema.substring(0, 50) + '</p>' : '') +
                '</div>' +
                '<div class="pedido-valor">' + (parseFloat(pedido.preco) || 0).toLocaleString('pt-MZ') + ' MT</div>' +
            '</div>' +
        '</div>';
    });
    
    container.innerHTML = html;
}

function atualizarMetricas() {
    var total = pedidosOriginais.length;
    var pendentes = pedidosOriginais.filter(function(p) { return p.status === 'pendente' || p.status === 'pago'; }).length;
    var concluidos = pedidosOriginais.filter(function(p) { return p.status === 'concluido'; }).length;
    var totalGasto = pedidosOriginais.reduce(function(sum, p) { return sum + (parseFloat(p.preco) || 0); }, 0);
    
    var totalEl = document.getElementById('totalPedidos');
    var pendentesEl = document.getElementById('pedidosPendentes');
    var concluidosEl = document.getElementById('pedidosConcluidos');
    var totalGastoEl = document.getElementById('totalGasto');
    
    if (totalEl) totalEl.textContent = total;
    if (pendentesEl) pendentesEl.textContent = pendentes;
    if (concluidosEl) concluidosEl.textContent = concluidos;
    if (totalGastoEl) totalGastoEl.textContent = totalGasto.toLocaleString('pt-MZ') + ' MT';
}

// ============================================
// DASHBOARD - UPLOAD
// ============================================
function atualizarPrecoUpload() {
    var servico = document.getElementById('uploadServico').value;
    var resumoDiv = document.getElementById('uploadResumo');
    var precos = { 
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 
        'monografia': { nome: 'Monografia/TCC', preco: 10000 } 
    };
    
    if (servico && precos[servico]) {
        var valorTotal = precos[servico].preco;
        var resumoServico = document.getElementById('resumoServico');
        var resumoValorTotal = document.getElementById('resumoValorTotal');
        var resumoEntrada = document.getElementById('resumoEntrada');
        
        if (resumoServico) resumoServico.textContent = precos[servico].nome;
        if (resumoValorTotal) resumoValorTotal.textContent = valorTotal.toLocaleString('pt-MZ') + ' MT';
        if (resumoEntrada) resumoEntrada.textContent = Math.ceil(valorTotal * 0.5).toLocaleString('pt-MZ') + ' MT';
        if (resumoDiv) resumoDiv.style.display = 'block';
        verificarHabilitarBotaoUpload();
    } else {
        if (resumoDiv) resumoDiv.style.display = 'none';
        var btnEnviar = document.getElementById('btnEnviarUpload');
        if (btnEnviar) btnEnviar.disabled = true;
    }
}

function selecionarMetodoUpload(metodo) {
    uploadMetodoSelecionado = metodo;
    document.querySelectorAll('.metodo-radio').forEach(function(el) {
        el.classList.remove('active');
    });
    var target = document.querySelector('.metodo-radio[onclick*="' + metodo + '"]');
    if (target) target.classList.add('active');
    
    var resumoMetodo = document.getElementById('resumoMetodo');
    if (resumoMetodo) {
        resumoMetodo.textContent = metodo === 'mpesa' ? 'M-Pesa' : metodo === 'emola' ? 'e-Mola' : 'Depósito Bancário';
    }
    verificarHabilitarBotaoUpload();
}

function handleUploadFileSelect(event) {
    var file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) {
        mostrarToast('Arquivo muito grande (máximo 50MB)', 'error');
        return;
    }
    
    uploadArquivoSelecionado = file;
    var preview = document.getElementById('uploadFilePreview');
    var fileName = document.getElementById('uploadFileName');
    
    if (preview && fileName) {
        fileName.textContent = file.name;
        preview.style.display = 'block';
    }
    verificarHabilitarBotaoUpload();
}

function removerUploadFile() {
    uploadArquivoSelecionado = null;
    var fileInput = document.getElementById('uploadFileInput');
    var preview = document.getElementById('uploadFilePreview');
    
    if (fileInput) fileInput.value = '';
    if (preview) preview.style.display = 'none';
    verificarHabilitarBotaoUpload();
}

function verificarHabilitarBotaoUpload() {
    var servico = document.getElementById('uploadServico')?.value;
    var descricao = document.getElementById('uploadDescricao')?.value.trim();
    var termos = document.getElementById('uploadTermos')?.checked || false;
    var metodoSelecionado = uploadMetodoSelecionado;
    var btn = document.getElementById('btnEnviarUpload');
    
    var podeEnviar = servico && descricao && termos && metodoSelecionado;
    
    if (btn) {
        btn.disabled = !podeEnviar;
    }
}

function enviarUploadPedido() {
    var servico = document.getElementById('uploadServico').value;
    var descricao = document.getElementById('uploadDescricao').value;
    var prazo = document.getElementById('uploadPrazo').value;
    
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
    
    var termosCheck = document.getElementById('uploadTermos');
    if (!termosCheck || !termosCheck.checked) {
        mostrarToast('❌ Aceite os Termos de Serviço', 'error');
        return;
    }
    
    var servicosInfo = { 
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 }, 
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 }, 
        'monografia': { nome: 'Monografia/TCC', preco: 10000 } 
    };
    var info = servicosInfo[servico];
    
    var formData = new FormData();
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
    
    var token = localStorage.getItem('token_facilitaki');
    
    fetch('/api/pedidos/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        body: formData
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
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
            document.querySelectorAll('.metodo-radio').forEach(function(el) {
                el.classList.remove('active');
            });
            
            setTimeout(function() { navegarPara('pagamento-sucesso'); }, 1500);
            carregarPedidos();
            carregarDadosFinanceiros();
        } else {
            mostrarToast(data.erro || '❌ Erro ao enviar solicitação', 'error');
        }
    })
    .catch(function(error) {
        fecharLoading();
        console.error('Erro no upload:', error);
        mostrarToast('❌ Erro de conexão: ' + error.message, 'error');
    });
}

// ============================================
// DASHBOARD - FINANCEIRO
// ============================================
function carregarDadosFinanceiros() {
    var token = localStorage.getItem('token_facilitaki');
    if (!token) return;
    
    fetch(API_URL + '/api/meus-pedidos', {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(response) {
        if (response.ok) {
            return response.json();
        }
        return null;
    })
    .then(function(data) {
        if (data) {
            var pedidos = data.pedidos || [];
            
            var totalInvestido = 0, totalPago = 0, saldoPendente = 0;
            var historico = [];
            
            pedidos.forEach(function(pedido) {
                var valor = parseFloat(pedido.preco) || 0;
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
                    referencia: 'FAC-' + pedido.id 
                });
            });
            
            var totalInvestidoEl = document.getElementById('financeiroTotalInvestido');
            var totalPagoEl = document.getElementById('financeiroTotalPago');
            var saldoPendenteEl = document.getElementById('financeiroSaldoPendente');
            
            if (totalInvestidoEl) totalInvestidoEl.textContent = totalInvestido.toLocaleString('pt-MZ') + ' MT';
            if (totalPagoEl) totalPagoEl.textContent = totalPago.toLocaleString('pt-MZ') + ' MT';
            if (saldoPendenteEl) saldoPendenteEl.textContent = saldoPendente.toLocaleString('pt-MZ') + ' MT';
            
            var tbody = document.getElementById('historicoPagamentosBody');
            if (tbody) {
                if (historico.length > 0) {
                    var html = '';
                    historico.forEach(function(t) {
                        html += '<tr>' +
                            '<td>' + new Date(t.data).toLocaleDateString('pt-MZ') + '</td>' +
                            '<td>' + t.servico + '</td>' +
                            '<td><strong>' + t.valor.toLocaleString('pt-MZ') + ' MT</strong></td>' +
                            '<td>' + t.tipo + '</td>' +
                            '<td><span class="status-pagamento ' + (t.status === 'confirmado' ? 'confirmado' : 'pendente') + '">' + (t.status === 'confirmado' ? 'Confirmado' : 'Pendente') + '</span></td>' +
                            '<td><small>' + t.referencia + '</small></td>' +
                        '</tr>';
                    });
                    tbody.innerHTML = html;
                } else {
                    tbody.innerHTML = '<tr class="empty-row">' +
                        '<td colspan="6">' +
                            '<div class="empty-state">' +
                                '<i class="fas fa-receipt"></i>' +
                                '<p>Nenhum pagamento registrado</p>' +
                                '<button class="btn-primary" onclick="document.querySelector(\'.tab-btn[data-tab=\\"upload\\"]\').click()">' +
                                    'Fazer primeiro pedido' +
                                '</button>' +
                            '</div>' +
                        '</td>' +
                    '</tr>';
                }
            }
        }
    })
    .catch(function(error) {
        console.error('Erro ao carregar dados financeiros:', error);
    });
}

function exportarHistorico() {
    var rows = document.querySelectorAll('#historicoPagamentosBody tr:not(.empty-row)');
    var csv = "Data,Serviço,Valor,Tipo,Status,Referência\n";
    rows.forEach(function(row) {
        var cols = row.querySelectorAll('td');
        if (cols.length >= 6) {
            csv += '"' + cols[0].innerText + '","' + cols[1].innerText + '","' + cols[2].innerText.replace(' MT', '') + '","' + cols[3].innerText + '","' + cols[4].innerText + '","' + cols[5].innerText + '"\n';
        }
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', 'historico_facilitaki_' + new Date().toISOString().split('T')[0] + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    mostrarToast('Histórico exportado com sucesso!', 'success');
}

// ============================================
// CONTATO
// ============================================
function enviarContato() {
    var nome = document.getElementById('contatoNome')?.value.trim();
    var telefone = document.getElementById('contatoTelefone')?.value.trim();
    var mensagem = document.getElementById('contatoMensagem')?.value.trim();
    
    if (!nome || !telefone || !mensagem) {
        mostrarToast('Preencha todos os campos', 'error');
        return;
    }
    
    mostrarLoading('Enviando mensagem...');
    
    fetch(API_URL + '/api/contato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome, telefone: telefone, mensagem: mensagem })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
        fecharLoading();
        if (data.success) {
            mostrarToast('Mensagem enviada com sucesso!', 'success');
            document.getElementById('contatoNome').value = '';
            document.getElementById('contatoTelefone').value = '';
            document.getElementById('contatoMensagem').value = '';
        } else {
            mostrarToast(data.erro || 'Erro ao enviar mensagem', 'error');
        }
    })
    .catch(function(error) {
        fecharLoading();
        console.error('Erro no contato:', error);
        mostrarToast('Erro de conexão. Tente novamente.', 'error');
    });
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

// ============================================
// DOWNLOAD APK
// ============================================
function registrarDownloadAPK() {
    console.log('📱 Download APK iniciado');
    mostrarToast('Baixando aplicativo Facilitaki...', 'success');
    setTimeout(function() {
        mostrarToast('📱 Aplicativo baixado com sucesso!', 'success');
    }, 2000);
}
