// script.js - Facilitaki - Sistema Completo com Upload Real (VERSÃO SEM TEMA/DISCIPLINA)

// ===== VARIÁVEIS GLOBAIS =====
let usuarioLogado = null;
let carrinho = {
    plano: null,
    preco: 0,
    metodoPagamento: null
};
let arquivoSelecionado = null;

// ===== URL DO SERVIDOR =====
const API_URL = 'https://facilitaki.onrender.com';

// ===== FUNÇÃO PARA TESTAR CONEXÃO =====
async function testarConexaoAPI() {
    console.log('🔍 Testando conexão com a API...');
    try {
        const response = await fetch(`${API_URL}/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Conexão com API OK:', data);
            return true;
        } else {
            console.error('❌ API respondeu com erro:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Falha na conexão com API:', error);
        mostrarMensagemGlobal('Não foi possível conectar ao servidor', 'error');
        return false;
    }
}

// ===== NAVEGAÇÃO =====
function navegarPara(sectionId) {
    console.log('📍 Navegando para:', sectionId);
    
    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remover classe active de todos os links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Mostrar a seção solicitada
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        
        // Atualizar link ativo na navegação
        const navLink = document.querySelector(`[onclick*="${sectionId}"]`);
        if (navLink && navLink.classList.contains('nav-link')) {
            navLink.classList.add('active');
        }
        
        // Ações específicas para cada seção
        switch(sectionId) {
            case 'dashboard':
                if (usuarioLogado) {
                    atualizarDashboard();
                } else {
                    navegarPara('login');
                }
                break;
            case 'pagamento-sucesso':
                if (carrinho.plano) {
                    mostrarInstrucoesPagamento();
                }
                break;
            case 'planos':
                // Limpar seleção
                sessionStorage.removeItem('servico_selecionado');
                sessionStorage.removeItem('preco_selecionado');
                break;
            case 'checkout':
                atualizarResumoPedido();
                break;
        }
    }
    
    // Scroll para o topo
    window.scrollTo(0, 0);
}

// ===== FUNÇÃO NOVA: Verificar e Logar =====
function verificarELogar(tipo, preco) {
    console.log('🔐 Verificando login para:', tipo, preco);
    
    if (!usuarioLogado) {
        // Armazenar seleção para depois do login
        sessionStorage.setItem('servico_selecionado', tipo);
        sessionStorage.setItem('preco_selecionado', preco);
        
        mostrarMensagemGlobal('Faça login para continuar com a solicitação', 'info');
        navegarPara('login');
    } else {
        selecionarPlano(tipo, preco);
    }
}

// ===== GERENCIAMENTO DE USUÁRIOS =====
async function fazerLogin() {
    const telefone = document.getElementById('loginTelefone').value.trim();
    const senha = document.getElementById('loginSenha').value;
    const mensagem = document.getElementById('mensagemLogin');
    
    if (!telefone || !senha) {
        mostrarMensagem(mensagem, 'Preencha todos os campos', 'error');
        return;
    }
    
    // Mostrar loading
    const btnLogin = document.querySelector('#formLogin button');
    const originalText = btnLogin ? btnLogin.innerHTML : 'Entrar';
    if (btnLogin) {
        btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        btnLogin.disabled = true;
    }
    
    try {
        console.log('🔐 Tentando login para:', telefone);
        
        // Testa a conexão
        const conexaoOk = await testarConexaoAPI();
        if (!conexaoOk) {
            mostrarMensagem(mensagem, 'Servidor não disponível', 'error');
            return;
        }
        
        // Faz o login
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ telefone, senha }),
            mode: 'cors'
        });
        
        console.log('📤 Resposta do login:', response.status);
        
        if (!response.ok) {
            // Tenta ler a resposta de erro
            let errorMessage = 'Erro no servidor';
            try {
                const errorData = await response.json();
                errorMessage = errorData.erro || errorData.message || `Erro ${response.status}`;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            
            console.error('❌ Erro no login:', errorMessage);
            mostrarMensagem(mensagem, errorMessage, 'error');
            return;
        }
        
        const data = await response.json();
        console.log('✅ Login bem-sucedido:', data);
        
        if (data.success) {
            // Guardar a sessão
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            mostrarMensagem(mensagem, data.mensagem || 'Login realizado com sucesso!', 'success');
            
            // Atualiza a interface
            const btnHeader = document.getElementById('btnLoginHeader');
            if(btnHeader) {
                btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
                btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
            }
            
            // Verificar se há serviço selecionado
            const servicoSelecionado = sessionStorage.getItem('servico_selecionado');
            const precoSelecionado = sessionStorage.getItem('preco_selecionado');
            
            if (servicoSelecionado && precoSelecionado) {
                // Redirecionar para checkout com o serviço selecionado
                setTimeout(() => {
                    selecionarPlano(servicoSelecionado, parseFloat(precoSelecionado));
                    sessionStorage.removeItem('servico_selecionado');
                    sessionStorage.removeItem('preco_selecionado');
                }, 1500);
            } else {
                setTimeout(() => navegarPara('dashboard'), 1500);
            }
        } else {
            mostrarMensagem(mensagem, data.erro || 'Credenciais inválidas', 'error');
        }
        
    } catch (error) {
        console.error("❌ Erro na requisição de login:", error);
        mostrarMensagem(mensagem, 'Erro de conexão com o servidor', 'error');
        
    } finally {
        // Restaurar botão
        if (btnLogin) {
            btnLogin.innerHTML = originalText;
            btnLogin.disabled = false;
        }
    }
}

async function fazerCadastro() {
    const nome = document.getElementById('cadastroNome').value.trim();
    const telefone = document.getElementById('cadastroTelefone').value.trim();
    const senha = document.getElementById('cadastroSenha').value;
    const confirmarSenha = document.getElementById('cadastroSenhaConfirm').value;
    const mensagem = document.getElementById('mensagemLogin');
    
    if (!nome || !telefone || !senha || !confirmarSenha) {
        mostrarMensagem(mensagem, 'Preencha todos os campos', 'error');
        return;
    }
    
    if (senha !== confirmarSenha) {
        mostrarMensagem(mensagem, 'As senhas não coincidem', 'error');
        return;
    }

    if (senha.length < 6) {
        mostrarMensagem(mensagem, 'A senha deve ter pelo menos 6 caracteres', 'error');
        return;
    }

    // Mostrar loading
    const btnCadastro = document.querySelector('#formCadastro button');
    const originalText = btnCadastro ? btnCadastro.innerHTML : 'Cadastrar';
    if (btnCadastro) {
        btnCadastro.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';
        btnCadastro.disabled = true;
    }

    try {
        console.log('📝 Tentando cadastro para:', telefone);
        
        // Testa conexão primeiro
        const conexaoOk = await testarConexaoAPI();
        if (!conexaoOk) {
            mostrarMensagem(mensagem, 'Servidor não disponível', 'error');
            return;
        }
        
        // Envia o novo usuário para o servidor
        const response = await fetch(`${API_URL}/api/cadastrar`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ nome, telefone, senha }),
            mode: 'cors'
        });
        
        console.log('📤 Resposta do cadastro:', response.status);
        
        const data = await response.json();

        if (response.ok && data.success) {
            mostrarMensagem(mensagem, data.mensagem || 'Cadastro realizado com sucesso!', 'success');
            
            // Login automático
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            console.log('✅ Cadastro e login automático bem-sucedido');
            
            // Atualiza a interface
            const btnHeader = document.getElementById('btnLoginHeader');
            if(btnHeader) {
                btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
                btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
            }
            
            setTimeout(() => {
                mostrarLogin();
                navegarPara('dashboard');
            }, 2000);
        } else {
            mostrarMensagem(mensagem, data.erro || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        console.error("❌ Erro no cadastro:", error);
        mostrarMensagem(mensagem, 'Erro de conexão com o servidor', 'error');
    } finally {
        // Restaurar botão
        if (btnCadastro) {
            btnCadastro.innerHTML = originalText;
            btnCadastro.disabled = false;
        }
    }
}

async function fazerLogout() {
    try {
        // Chamar endpoint de logout no servidor
        const token = localStorage.getItem('token_facilitaki');
        if (token) {
            await fetch(`${API_URL}/api/logout`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
        }
    } catch (error) {
        console.error("❌ Erro ao fazer logout no servidor:", error);
    }
    
    // Limpar dados locais
    usuarioLogado = null;
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    
    console.log('👋 Usuário deslogado');
    
    // Atualizar cabeçalho
    const btnHeader = document.getElementById('btnLoginHeader');
    if(btnHeader) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Área do Cliente';
        btnHeader.setAttribute('onclick', 'navegarPara(\'login\')');
    }
    
    // Limpar carrinho e sessões
    carrinho = { plano: null, preco: 0, metodoPagamento: null };
    arquivoSelecionado = null;
    sessionStorage.clear();
    
    navegarPara('home');
}

function mostrarCadastro() {
    document.getElementById('formLogin').style.display = 'none';
    document.getElementById('formCadastro').style.display = 'block';
    document.getElementById('mensagemLogin').innerHTML = '';
}

function mostrarLogin() {
    document.getElementById('formCadastro').style.display = 'none';
    document.getElementById('formLogin').style.display = 'block';
    document.getElementById('mensagemLogin').innerHTML = '';
}

// ===== FUNÇÕES PARA GESTÃO DE PEDIDOS =====
async function criarPedido(pedidoData) {
    console.log('🛒 Tentando criar pedido:', pedidoData);
    
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) {
            console.error('❌ Token não encontrado');
            return { success: false, error: 'Usuário não autenticado. Faça login novamente.' };
        }
        
        console.log('🔑 Token encontrado, enviando para API...');
        
        // Limpar telefone no pedidoData
        if (pedidoData.telefone) {
            pedidoData.telefone = pedidoData.telefone.replace(/\D/g, '');
        }
        
        // Converter preço para número
        if (pedidoData.preco) {
            pedidoData.preco = parseFloat(pedidoData.preco);
        }
        
        const response = await fetch(`${API_URL}/api/pedidos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(pedidoData),
            mode: 'cors'
        });
        
        console.log('📤 Resposta do servidor:', response.status, response.statusText);
        
        if (!response.ok) {
            // Tentar ler o erro do servidor
            let errorMessage = 'Erro ao criar pedido';
            try {
                const errorData = await response.json();
                console.error('❌ Erro do servidor:', errorData);
                errorMessage = errorData.erro || errorData.message || `Erro ${response.status}`;
            } catch (e) {
                console.error('❌ Não foi possível ler resposta de erro:', e);
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            return { success: false, error: errorMessage };
        }
        
        const data = await response.json();
        console.log('✅ Resposta do servidor:', data);
        
        if (data.success) {
            console.log('🎉 Pedido criado com sucesso! ID:', data.pedido?.id);
            return { success: true, pedido: data.pedido };
        } else {
            console.error('❌ Servidor retornou success: false:', data);
            return { success: false, error: data.erro || 'Erro ao criar pedido' };
        }
        
    } catch (error) {
        console.error("🔥 Erro fatal ao criar pedido:", error);
        
        let errorMsg = 'Erro de conexão com o servidor';
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            errorMsg = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.';
        } else if (error.name === 'SyntaxError') {
            errorMsg = 'Resposta inválida do servidor.';
        }
        
        return { success: false, error: errorMsg };
    }
}

async function buscarPedidosUsuario() {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) {
            return { success: false, error: 'Usuário não autenticado' };
        }
        
        console.log('📋 Buscando pedidos do usuário...');
        
        const response = await fetch(`${API_URL}/api/meus-pedidos`, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            mode: 'cors'
        });
        
        console.log('📤 Resposta dos pedidos:', response.status);

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('✅ Pedidos encontrados:', data.pedidos.length);
                return { success: true, pedidos: data.pedidos };
            } else {
                return { success: false, error: data.erro || 'Erro ao buscar pedidos' };
            }
        } else {
            let errorMessage = 'Erro na requisição';
            try {
                const errorData = await response.json();
                errorMessage = errorData.erro || errorMessage;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            return { success: false, error: errorMessage };
        }
    } catch (error) {
        console.error("❌ Erro ao buscar pedidos:", error);
        return { success: false, error: 'Erro de conexão com o servidor' };
    }
}

// ===== UPLOAD DE ARQUIVOS =====
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validar tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Arquivo muito grande. O tamanho máximo é 10MB.');
        return;
    }
    
    // Validar tipo
    const validTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(fileExt)) {
        alert('Formato de arquivo não suportado. Use PDF, DOC ou DOCX.');
        return;
    }
    
    arquivoSelecionado = file;
    
    // Mostrar preview
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    
    if (filePreview && fileName && fileSize) {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        filePreview.style.display = 'block';
    }
    
    // Ativar botão de submeter
    const btnSolicitar = document.getElementById('btnSolicitarServico');
    if (btnSolicitar) {
        btnSolicitar.disabled = false;
    }
}

function removerArquivo() {
    arquivoSelecionado = null;
    const fileInput = document.getElementById('fileInput');
    const filePreview = document.getElementById('filePreview');
    
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.style.display = 'none';
    
    const btnSolicitar = document.getElementById('btnSolicitarServico');
    if (btnSolicitar) {
        btnSolicitar.disabled = true;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function criarPedidoComArquivo(formData) {
    console.log('📤 Enviando pedido com arquivo...');
    
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) {
            return { success: false, error: 'Usuário não autenticado' };
        }
        
        // Enviar para endpoint de upload
        const response = await fetch(`${API_URL}/api/pedidos/upload`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        console.log('📤 Resposta do servidor (upload):', response.status);
        
        if (!response.ok) {
            let errorMessage = 'Erro ao enviar arquivo';
            try {
                const errorData = await response.json();
                errorMessage = errorData.erro || errorData.message || `Erro ${response.status}`;
            } catch (e) {
                errorMessage = `Erro ${response.status}: ${response.statusText}`;
            }
            return { success: false, error: errorMessage };
        }
        
        const data = await response.json();
        
        if (data.success) {
            return { success: true, pedido: data.pedido };
        } else {
            return { success: false, error: data.erro || 'Erro ao criar pedido' };
        }
        
    } catch (error) {
        console.error("🔥 Erro ao enviar arquivo:", error);
        return { success: false, error: 'Erro de conexão com o servidor' };
    }
}

// ===== PLANOS E CHECKOUT =====
function selecionarPlano(tipo, preco) {
    console.log('📦 Selecionando plano:', tipo, preco);
    
    // Mapear nomes dos planos
    const nomesPlanos = {
        'basico': 'Serviços Avulsos',
        'avancado': 'Trabalho de campo',
        'premium': 'Monografia/TCC'
    };
    
    // Atualizar carrinho
    carrinho = {
        plano: tipo,
        nomePlano: nomesPlanos[tipo] || tipo,
        preco: parseFloat(preco),
        metodoPagamento: null
    };
    
    console.log('🛒 Carrinho atualizado:', carrinho);
    
    // Navegar para checkout
    navegarPara('checkout');
}

function selecionarMetodo(metodo) {
    console.log('💳 Selecionando método de pagamento:', metodo);
    
    // Remover classe ativa de todos os métodos
    document.querySelectorAll('.metodo-pagamento').forEach(btn => {
        btn.classList.remove('ativo');
    });
    
    // Adicionar classe ativa ao método selecionado
    const btnSelecionado = document.querySelector(`[data-metodo="${metodo}"]`);
    if (btnSelecionado) {
        btnSelecionado.classList.add('ativo');
    }
    
    // Atualizar carrinho
    carrinho.metodoPagamento = metodo;
    
    // Habilitar botão de finalizar
    const btnFinalizar = document.querySelector('#checkout button[onclick="finalizarCompra()"]');
    if (btnFinalizar) {
        btnFinalizar.disabled = false;
        btnFinalizar.innerHTML = '<i class="fas fa-check"></i> Finalizar Compra';
    }
}

function atualizarResumoPedido() {
    const resumoDiv = document.getElementById('resumoPedido');
    const nomeCliente = document.getElementById('nomeCliente');
    const telefoneCliente = document.getElementById('telefoneCliente');
    
    if (carrinho.plano) {
        // Preencher dados do usuário se estiver logado
        if (usuarioLogado) {
            if (nomeCliente) nomeCliente.value = usuarioLogado.nome || '';
            if (telefoneCliente) telefoneCliente.value = usuarioLogado.telefone || '';
        }
        
        if (resumoDiv) {
            resumoDiv.innerHTML = `
                <div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <div>
                            <h4 style="margin: 0; color: #1e40af;">${carrinho.nomePlano}</h4>
                            <p style="margin: 0.25rem 0 0 0; color: #6b7280; font-size: 0.9rem;">Serviço selecionado</p>
                        </div>
                        <div style="font-size: 1.5rem; font-weight: bold; color: #1e40af;">
                            ${carrinho.preco.toLocaleString('pt-MZ')} MT
                        </div>
                    </div>
                    <div style="padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.9rem; color: #6b7280;">
                        <p style="margin: 0.5rem 0;">
                            <i class="fas fa-info-circle"></i> O trabalho será iniciado após confirmação do pagamento.
                        </p>
                    </div>
                </div>
            `;
        }
    } else {
        if (resumoDiv) {
            resumoDiv.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: #6b7280;">
                    <i class="fas fa-shopping-cart" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Nenhum serviço selecionado</p>
                    <button onclick="navegarPara('planos')" style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; margin-top: 1rem;">
                        Escolher Serviço
                    </button>
                </div>
            `;
        }
    }
}

async function finalizarCompra() {
    console.log('💰 Iniciando finalização de compra...');
    
    const nomeCliente = document.getElementById('nomeCliente')?.value.trim() || usuarioLogado?.nome || '';
    const telefoneCliente = document.getElementById('telefoneCliente')?.value.trim() || usuarioLogado?.telefone || '';
    const instituicao = document.getElementById('instituicao')?.value.trim() || '';
    const curso = document.getElementById('curso')?.value.trim() || '';
    const cadeira = document.getElementById('cadeira')?.value.trim() || '';
    const descricao = document.getElementById('descricao')?.value.trim() || '';
    const mensagemDiv = document.getElementById('mensagemCheckout');
    
    // Validações
    if (!nomeCliente || !telefoneCliente) {
        mostrarMensagem(mensagemDiv, 'Nome e telefone são obrigatórios', 'error');
        return;
    }
    
    if (!carrinho.plano) {
        mostrarMensagem(mensagemDiv, 'Selecione um serviço primeiro', 'error');
        return;
    }
    
    if (!carrinho.metodoPagamento) {
        mostrarMensagem(mensagemDiv, 'Selecione um método de pagamento', 'error');
        return;
    }
    
    // Mostrar loading
    const btnFinalizar = document.querySelector('#checkout button[onclick="finalizarCompra()"]');
    const originalText = btnFinalizar ? btnFinalizar.innerHTML : 'Finalizar Compra';
    if (btnFinalizar) {
        btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btnFinalizar.disabled = true;
    }
    
    // Criar pedido para enviar ao servidor
    const pedidoData = {
        cliente: nomeCliente,
        telefone: telefoneCliente,
        instituicao: instituicao,
        curso: curso,
        cadeira: cadeira,
        descricao: descricao,
        plano: carrinho.plano,
        nomePlano: carrinho.nomePlano,
        preco: carrinho.preco,
        metodoPagamento: carrinho.metodoPagamento,
        status: 'pendente'
    };
    
    console.log('📤 Enviando dados do pedido:', pedidoData);
    
    // Enviar para o servidor
    const resultado = await criarPedido(pedidoData);
    
    // Restaurar botão
    if (btnFinalizar) {
        btnFinalizar.innerHTML = originalText;
        btnFinalizar.disabled = false;
    }
    
    if (resultado.success) {
        console.log('✅ Pedido criado com sucesso!');
        mostrarMensagem(mensagemDiv, 'Pedido registrado com sucesso! Redirecionando...', 'success');
        
        // Limpar formulário
        const campos = ['instituicao', 'curso', 'cadeira', 'descricao'];
        campos.forEach(campo => {
            const el = document.getElementById(campo);
            if (el) el.value = '';
        });
        
        // Mostrar instruções de pagamento
        setTimeout(() => {
            navegarPara('pagamento-sucesso');
        }, 2000);
    } else {
        console.error('❌ Erro ao criar pedido:', resultado.error);
        mostrarMensagem(mensagemDiv, `Erro: ${resultado.error}`, 'error');
    }
}

function mostrarInstrucoesPagamento() {
    console.log('📄 Mostrando instruções de pagamento...');
    
    const instrucoesDiv = document.getElementById('instrucoesDetalhadas');
    const resumoDiv = document.getElementById('resumoPagamento');
    
    if (!carrinho.plano || !instrucoesDiv || !resumoDiv) return;
    
    // Instruções de pagamento
    let instrucoes = '';
    const valorEntrada = Math.ceil(carrinho.preco * 0.5);
    
    switch(carrinho.metodoPagamento) {
        case 'mpesa':
            instrucoes = `
                <h4 style="color: #1e40af; margin-bottom: 1rem;">
                    <i class="fas fa-mobile-alt"></i> Pagamento via M-Pesa
                </h4>
                <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e5e7eb;">
                    <p><strong>Passo a passo:</strong></p>
                    <ol style="margin-left: 1.5rem; margin-bottom: 1rem;">
                        <li>Acesse M-Pesa no seu celular</li>
                        <li>Selecione "Transferir Dinheiro"</li>
                        <li>Digite o número: <strong>84 728 6665</strong></li>
                        <li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong> (entrada de 50%)</li>
                        <li>Nome: <strong>Aguinaldo Anli</strong></li>
                        <li>Confirme a transação</li>
                        <li>Guarde o comprovativo</li>
                    </ol>
                    <p style="color: #ef4444; font-weight: bold;">
                        <i class="fas fa-exclamation-circle"></i> O trabalho só será iniciado após confirmação do pagamento.
                    </p>
                </div>
                <div style="background: #d1fae5; padding: 1rem; border-radius: 5px; border: 1px solid #10b981;">
                    <p style="margin: 0; color: #065f46;">
                        <strong>Envie o comprovativo para WhatsApp:</strong> 86 728 6665
                    </p>
                </div>
            `;
            break;
        case 'emola':
            instrucoes = `
                <h4 style="color: #1e40af; margin-bottom: 1rem;">
                    <i class="fas fa-wallet"></i> Pagamento via e-Mola
                </h4>
                <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e5e7eb;">
                    <p><strong>Passo a passo:</strong></p>
                    <ol style="margin-left: 1.5rem; margin-bottom: 1rem;">
                        <li>Acesse e-Mola no seu celular</li>
                        <li>Selecione "Transferir Dinheiro"</li>
                        <li>Digite o número: <strong>86 728 6665</strong></li>
                        <li>Valor: <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong> (entrada de 50%)</li>
                        <li>Nome: <strong>Aguinaldo Anli Mahadura</strong></li>
                        <li>Confirme a transação</li>
                        <li>Guarde o comprovativo</li>
                    </ol>
                </div>
                <div style="background: #d1fae5; padding: 1rem; border-radius: 5px; border: 1px solid #10b981;">
                    <p style="margin: 0; color: #065f46;">
                        <strong>Envie o comprovativo para WhatsApp:</strong> 86 728 6665
                    </p>
                </div>
            `;
            break;
        case 'deposito':
            instrucoes = `
                <h4 style="color: #1e40af; margin-bottom: 1rem;">
                    <i class="fas fa-university"></i> Depósito Bancário
                </h4>
                <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #e5e7eb;">
                    <p><strong>Dados bancários:</strong></p>
                    <div style="margin-bottom: 1rem;">
                        <p><strong>Banco:</strong> BCI</p>
                        <p><strong>Conta:</strong> 00080000790534651019</p>
                        <p><strong>Nome:</strong> Aguinaldo Anli Mahadura</p>
                        <p><strong>Valor:</strong> <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong> (entrada de 50%)</p>
                    </div>
                </div>
                <div style="background: #d1fae5; padding: 1rem; border-radius: 5px; border: 1px solid #10b981;">
                    <p style="margin: 0; color: #065f46;">
                        <strong>Envie o comprovativo para WhatsApp:</strong> 86 728 6665 ou 84 728 6665
                    </p>
                </div>
            `;
            break;
        default:
            instrucoes = `<h4>Pagamento via ${carrinho.metodoPagamento ? carrinho.metodoPagamento.toUpperCase() : 'Não selecionado'}</h4>
                <p>Complete o pagamento conforme o método selecionado.</p>`;
    }
    
    instrucoesDiv.innerHTML = instrucoes;
    
    // Relatório do pagamento
    resumoDiv.innerHTML = `
        <div style="background: #f8fafc; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h5 style="margin-top: 0; color: #1e40af;">Resumo do Pedido</h5>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Serviço:</span>
                <strong>${carrinho.nomePlano}</strong>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Valor Total:</span>
                <strong>${carrinho.preco.toLocaleString('pt-MZ')} MT</strong>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Entrada (50%):</span>
                <strong style="color: #10b981;">${valorEntrada.toLocaleString('pt-MZ')} MT</strong>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                <span>Saldo Restante:</span>
                <strong>${(carrinho.preco - valorEntrada).toLocaleString('pt-MZ')} MT</strong>
            </div>
            
            <hr style="border-color: #e5e7eb; margin: 1rem 0;">
            
            <div style="display: flex; justify-content: space-between;">
                <span>Método de Pagamento:</span>
                <strong>${carrinho.metodoPagamento ? carrinho.metodoPagamento.toUpperCase() : 'Não selecionado'}</strong>
            </div>
            
            <div style="margin-top: 1rem; padding: 0.75rem; background: #fef3c7; border-radius: 5px; border: 1px solid #f59e0b;">
                <p style="margin: 0; color: #92400e; font-size: 0.9rem;">
                    <i class="fas fa-clock"></i> Prazo de entrega começa após confirmação do pagamento.
                </p>
            </div>
        </div>
    `;
}

// ===== MODAL DESCRIÇÃO TRABALHO (SEM TEMA/DISCIPLINA) =====
function abrirDescricaoTrabalho() {
    const selectServico = document.getElementById('selectServicoDashboard');
    const servicoSelecionado = selectServico ? selectServico.value : null;
    
    if (!servicoSelecionado) {
        mostrarMensagemGlobal('Selecione um serviço primeiro', 'error');
        return;
    }
    
    console.log('📝 Abrindo descrição para serviço:', servicoSelecionado);
    
    // Mapear valores dos serviços
    const servicos = {
        'basico': { nome: 'Serviços Avulsos', preco: 100 },
        'avancado': { nome: 'Trabalho de campo', preco: 500 },
        'premium': { nome: 'Monografia/TCC', preco: 15000 }
    };
    
    const servico = servicos[servicoSelecionado] || { nome: 'Serviço', preco: 0 };
    
    // Preencher informações do serviço no modal
    const nomeServicoModal = document.getElementById('nomeServicoModal');
    const valorServicoModal = document.getElementById('valorServicoModal');
    
    if (nomeServicoModal) nomeServicoModal.textContent = servico.nome;
    if (valorServicoModal) valorServicoModal.textContent = servico.preco.toLocaleString('pt-MZ') + ' MT';
    
    // Armazenar dados do serviço
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.dataset.servicoTipo = servicoSelecionado;
        modal.dataset.servicoNome = servico.nome;
        modal.dataset.servicoPreco = servico.preco;
        
        // Limpar campos anteriores
        const descricaoDetalhada = document.getElementById('descricaoDetalhada');
        const prazoTrabalhoDetalhe = document.getElementById('prazoTrabalhoDetalhe');
        const metodoPagamentoModal = document.getElementById('metodoPagamentoModal');
        
        if (descricaoDetalhada) descricaoDetalhada.value = '';
        if (prazoTrabalhoDetalhe) prazoTrabalhoDetalhe.value = '';
        if (metodoPagamentoModal) metodoPagamentoModal.selectedIndex = 0;
        
        // Limpar arquivo
        removerArquivo();
        
        // Mostrar modal
        modal.style.display = 'flex';
        
        // Focar no campo de arquivo
        setTimeout(() => {
            const uploadArea = document.getElementById('uploadArea');
            if (uploadArea) uploadArea.focus();
        }, 100);
    }
}

function fecharModalDescricao() {
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Limpar arquivo selecionado
    arquivoSelecionado = null;
    removerArquivo();
    
    // Limpar outros campos
    const descricaoDetalhada = document.getElementById('descricaoDetalhada');
    const prazoTrabalhoDetalhe = document.getElementById('prazoTrabalhoDetalhe');
    const metodoPagamentoModal = document.getElementById('metodoPagamentoModal');
    
    if (descricaoDetalhada) descricaoDetalhada.value = '';
    if (prazoTrabalhoDetalhe) prazoTrabalhoDetalhe.value = '';
    if (metodoPagamentoModal) metodoPagamentoModal.selectedIndex = 0;
}

async function solicitarServicoComArquivo() {
    console.log('🚀 Solicitando serviço com arquivo...');
    
    // Coletar dados do modal (SEM TEMA E SEM DISCIPLINA)
    const descricao = document.getElementById('descricaoDetalhada')?.value.trim() || '';
    const prazo = document.getElementById('prazoTrabalhoDetalhe')?.value || '';
    const metodoPagamentoSelect = document.getElementById('metodoPagamentoModal');
    const metodoPagamento = metodoPagamentoSelect ? metodoPagamentoSelect.value : '';
    const aceitarTermos = document.getElementById('aceitarTermos')?.checked || false;
    
    // Validar campos obrigatórios (AGORA APENAS ARQUIVO, MÉTODO DE PAGAMENTO E TERMOS)
    if (!arquivoSelecionado) {
        mostrarMensagemGlobal('Selecione um arquivo do trabalho', 'error');
        return;
    }
    
    if (!metodoPagamento) {
        mostrarMensagemGlobal('Selecione um método de pagamento', 'error');
        return;
    }
    
    if (!aceitarTermos) {
        mostrarMensagemGlobal('Você precisa aceitar os termos de serviço', 'error');
        return;
    }
    
    // Obter dados do serviço do modal
    const modal = document.getElementById('modalDescricaoTrabalho');
    const servicoTipo = modal ? modal.dataset.servicoTipo : 'basico';
    const servicoNome = modal ? modal.dataset.servicoNome : 'Serviço';
    const servicoPreco = modal ? parseInt(modal.dataset.servicoPreco) || 0 : 0;
    
    // Mostrar loading
    const btnSolicitar = document.getElementById('btnSolicitarServico');
    const originalText = btnSolicitar ? btnSolicitar.innerHTML : 'Solicitar Serviço';
    if (btnSolicitar) {
        btnSolicitar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando arquivo...';
        btnSolicitar.disabled = true;
    }
    
    try {
        // Criar FormData para enviar arquivo
        const formData = new FormData();
        
        // Adicionar dados do pedido (SEM TEMA E SEM DISCIPLINA)
        formData.append('cliente', usuarioLogado ? usuarioLogado.nome : 'Cliente');
        formData.append('telefone', usuarioLogado ? usuarioLogado.telefone : '');
        formData.append('instituicao', 'Não informada');
        formData.append('curso', 'Não informado');
        formData.append('cadeira', 'Não informada'); // Agora sempre "Não informada"
        formData.append('tema', descricao || 'Arquivo enviado'); // Usa descrição ou texto padrão
        formData.append('descricao', descricao);
        formData.append('prazo', prazo);
        formData.append('plano', servicoTipo);
        formData.append('nomePlano', servicoNome);
        formData.append('preco', servicoPreco.toString());
        formData.append('metodoPagamento', metodoPagamento);
        formData.append('status', 'pendente');
        
        // Adicionar arquivo
        formData.append('arquivo', arquivoSelecionado);
        
        // Enviar para o servidor
        const resultado = await criarPedidoComArquivo(formData);
        
        if (resultado.success) {
            // Fechar modal
            fecharModalDescricao();
            
            // Atualizar carrinho para mostrar instruções de pagamento
            carrinho = {
                plano: servicoTipo,
                nomePlano: servicoNome,
                preco: servicoPreco,
                metodoPagamento: metodoPagamento
            };
            
            // Mostrar mensagem de sucesso
            mostrarMensagemGlobal('Serviço solicitado com sucesso! Arquivo enviado.', 'success');
            
            // Ir para instruções de pagamento
            setTimeout(() => navegarPara('pagamento-sucesso'), 1500);
        } else {
            mostrarMensagemGlobal(resultado.error, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao enviar arquivo:', error);
        mostrarMensagemGlobal('Erro ao enviar arquivo. Tente novamente.', 'error');
    } finally {
        // Restaurar botão
        if (btnSolicitar) {
            btnSolicitar.innerHTML = originalText;
            btnSolicitar.disabled = false;
        }
    }
}

// ===== DASHBOARD =====
async function atualizarDashboard() {
    console.log('📊 Atualizando dashboard...');
    
    if (!usuarioLogado) {
        console.log('❌ Usuário não logado, redirecionando para login');
        navegarPara('login');
        return;
    }
    
    // Buscar pedidos do servidor
    const resultado = await buscarPedidosUsuario();
    
    if (resultado.success) {
        const pedidosUsuario = resultado.pedidos || [];
        
        // Calcular valor total por pagar (pedidos pendentes)
        const pedidosPendentes = pedidosUsuario.filter(p => p.status === 'pendente');
        const valorTotal = pedidosPendentes.reduce((total, pedido) => total + (parseFloat(pedido.preco) || 0), 0);
        
        // Atualizar valor total
        const valorTotalPagar = document.getElementById('valorTotalPagar');
        if (valorTotalPagar) {
            valorTotalPagar.textContent = valorTotal.toLocaleString('pt-MZ') + ' MT';
        }
        
        // Atualizar lista de pedidos
        const listaPedidosDiv = document.getElementById('listaPedidos');
        if (listaPedidosDiv) {
            if (pedidosUsuario.length === 0) {
                listaPedidosDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                        <p>Nenhum pedido encontrado</p>
                        <button onclick="navegarPara('planos')" style="background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; margin-top: 1rem;">
                            Solicitar Serviço
                        </button>
                    </div>
                `;
            } else {
                listaPedidosDiv.innerHTML = pedidosUsuario.map(pedido => {
                    const dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido) : new Date();
                    const statusColor = getStatusColor(pedido.status);
                    const statusText = pedido.status ? pedido.status.replace('_', ' ') : 'pendente';
                    
                    return `
                        <div style="background: #f9fafb; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid ${statusColor};">
                            <div style="display: flex; justify-content: space-between; align-items: start;">
                                <div>
                                    <strong style="color: #1e40af;">${pedido.nome_plano || pedido.nomePlano || 'Serviço'}</strong>
                                    <div style="font-size: 0.9rem; color: #6b7280; margin-top: 0.25rem;">
                                        ${pedido.cadeira || pedido.tema || 'Sem descrição'}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-weight: bold; color: #1e40af; font-size: 1.1rem;">
                                        ${(parseFloat(pedido.preco) || 0).toLocaleString('pt-MZ')} MT
                                    </div>
                                    <span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 3px; background: ${statusColor + '20'}; color: ${statusColor};">
                                        ${statusText}
                                    </span>
                                </div>
                            </div>
                            <div style="font-size: 0.8rem; color: #9ca3af; margin-top: 0.5rem;">
                                <i class="far fa-calendar"></i> ${dataPedido.toLocaleDateString('pt-MZ')}
                                ${pedido.metodo_pagamento ? ` • <i class="fas fa-credit-card"></i> ${pedido.metodo_pagamento.toUpperCase()}` : ''}
                                ${pedido.arquivo_nome ? ` • <i class="fas fa-file"></i> ${pedido.arquivo_nome.substring(0, 20)}...` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    } else {
        console.error('❌ Erro ao carregar pedidos:', resultado.error);
        mostrarMensagemGlobal('Erro ao carregar pedidos: ' + resultado.error, 'error');
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'pendente': return '#f59e0b';
        case 'pago': return '#10b981';
        case 'em_andamento': return '#3b82f6';
        case 'concluido': return '#8b5cf6';
        case 'cancelado': return '#ef4444';
        default: return '#6b7280';
    }
}

// ===== CONTATO =====
async function enviarContato() {
    const nome = document.getElementById('contatoNome')?.value.trim() || '';
    const telefone = document.getElementById('contatoTelefone')?.value.trim() || '';
    const mensagemTexto = document.getElementById('contatoMensagem')?.value.trim() || '';
    const mensagemDiv = document.getElementById('mensagemContato');
    
    if (!nome || !telefone || !mensagemTexto) {
        mostrarMensagem(mensagemDiv, 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    // Mostrar loading
    const btnEnviar = document.querySelector('#contato button');
    const originalText = btnEnviar ? btnEnviar.innerHTML : 'Enviar Mensagem';
    if (btnEnviar) {
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btnEnviar.disabled = true;
    }
    
    try {
        console.log('📨 Enviando mensagem de contato...');
        
        // Testar conexão primeiro
        const conexaoOk = await testarConexaoAPI();
        if (!conexaoOk) {
            mostrarMensagem(mensagemDiv, 'Servidor não disponível', 'error');
            return;
        }
        
        // Enviar mensagem para o servidor
        const response = await fetch(`${API_URL}/api/contato`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ nome, telefone, mensagem: mensagemTexto }),
            mode: 'cors'
        });
        
        console.log('📤 Resposta do contato:', response.status);

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarMensagem(mensagemDiv, data.mensagem || 'Mensagem enviada com sucesso!', 'success');
            
            // Limpar formulário
            if (document.getElementById('contatoNome')) document.getElementById('contatoNome').value = '';
            if (document.getElementById('contatoTelefone')) document.getElementById('contatoTelefone').value = '';
            if (document.getElementById('contatoMensagem')) document.getElementById('contatoMensagem').value = '';
        } else {
            mostrarMensagem(mensagemDiv, data.erro || 'Erro ao enviar mensagem', 'error');
        }
    } catch (error) {
        console.error("❌ Erro ao enviar contato:", error);
        mostrarMensagem(mensagemDiv, 'Erro de conexão', 'error');
    } finally {
        // Restaurar botão
        if (btnEnviar) {
            btnEnviar.innerHTML = originalText;
            btnEnviar.disabled = false;
        }
    }
}

// ===== FUNÇÕES AUXILIARES =====
function mostrarMensagem(elemento, texto, tipo) {
    if (!elemento) return;
    
    elemento.textContent = texto;
    elemento.className = `message ${tipo}`;
    elemento.style.display = 'block';
    
    // Auto-esconder após 5 segundos
    setTimeout(() => {
        elemento.style.display = 'none';
    }, 5000);
}

function mostrarMensagemGlobal(texto, tipo) {
    // Criar elemento de mensagem global
    const mensagemDiv = document.createElement('div');
    mensagemDiv.className = `message ${tipo}`;
    mensagemDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 3000;
        max-width: 300px;
        padding: 15px;
        border-radius: 8px;
        animation: slideInRight 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    `;
    
    // Cores baseadas no tipo
    if (tipo === 'success') {
        mensagemDiv.style.background = '#10b981';
        mensagemDiv.style.color = 'white';
        mensagemDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${texto}`;
    } else if (tipo === 'error') {
        mensagemDiv.style.background = '#ef4444';
        mensagemDiv.style.color = 'white';
        mensagemDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${texto}`;
    } else if (tipo === 'info') {
        mensagemDiv.style.background = '#3b82f6';
        mensagemDiv.style.color = 'white';
        mensagemDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${texto}`;
    }
    
    document.body.appendChild(mensagemDiv);
    
    // Remover após 5 segundos
    setTimeout(() => {
        mensagemDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (mensagemDiv.parentNode) {
                mensagemDiv.parentNode.removeChild(mensagemDiv);
            }
        }, 300);
    }, 5000);
}

// ===== INICIALIZAÇÃO =====
async function verificarToken() {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) return false;
        
        const response = await fetch(`${API_URL}/api/verificar-token`, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.success && data.valido;
        }
        return false;
    } catch (error) {
        console.error("❌ Erro ao verificar token:", error);
        return false;
    }
}

function inicializarApp() {
    console.log('🚀 Inicializando Facilitaki...');
    console.log('🌐 URL da API:', API_URL);
    
    // Verificar se há usuário logado
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    const tokenSalvo = localStorage.getItem('token_facilitaki');
    
    if (usuarioSalvo && tokenSalvo) {
        try {
            usuarioLogado = JSON.parse(usuarioSalvo);
            console.log('👤 Usuário recuperado do localStorage:', usuarioLogado);
            
            const btnHeader = document.getElementById('btnLoginHeader');
            if(btnHeader) {
                btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
                btnHeader.setAttribute('onclick', 'navegarPara(\'dashboard\')');
            }
            
            // Verificar se o token ainda é válido
            setTimeout(async () => {
                const tokenValido = await verificarToken();
                if (!tokenValido) {
                    console.log('❌ Token inválido, fazendo logout...');
                    fazerLogout();
                }
            }, 1000);
        } catch (e) {
            console.error('❌ Erro ao parsear usuário:', e);
            localStorage.removeItem('usuarioLogado_facilitaki');
            localStorage.removeItem('token_facilitaki');
        }
    }
    
    // Configurar data mínima para campos de data
    const hoje = new Date().toISOString().split('T')[0];
    const campoPrazo = document.getElementById('prazoTrabalhoDetalhe');
    if (campoPrazo) {
        campoPrazo.min = hoje;
    }
    
    // Configurar máscara para telefones
    const camposTelefone = document.querySelectorAll('input[type="tel"]');
    camposTelefone.forEach(campo => {
        campo.addEventListener('input', function(e) {
            let valor = e.target.value.replace(/\D/g, '');
            if (valor.length > 0) {
                valor = valor.substring(0, 9);
                valor = valor.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1 $2 $3');
            }
            e.target.value = valor;
        });
    });
    
    // Fechar modais ao clicar fora
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // Adicionar CSS para animação
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // Testar conexão com API
    setTimeout(() => {
        testarConexaoAPI();
    }, 2000);
    
    console.log('✅ Facilitaki inicializado!');
}

// ===== FUNÇÕES DE DEBUG =====
async function testarEndpoint(endpoint, data = null) {
    try {
        const options = {
            method: data ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_URL}${endpoint}`, options);
        console.log(`🔗 ${endpoint}:`, response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log(`✅ ${endpoint} OK:`, result);
            return { success: true, data: result };
        } else {
            console.error(`❌ ${endpoint} ERRO:`, response.status);
            return { success: false, status: response.status };
        }
    } catch (error) {
        console.error(`❌ ${endpoint} FALHA:`, error.message);
        return { success: false, error: error.message };
    }
}

function debugAPI() {
    console.log('🔧 DEBUG DA API:');
    console.log('URL da API:', API_URL);
    console.log('Usuário logado:', usuarioLogado);
    console.log('Token:', localStorage.getItem('token_facilitaki'));
    console.log('Carrinho:', carrinho);
    
    // Testa cada endpoint
    console.log('🧪 Testando endpoints...');
    testarEndpoint('/status');
    
    return 'Debug iniciado! Verifique o console.';
}

async function testarCriarPedido() {
    console.log('🧪 Testando criação de pedido...');
    
    // Dados de teste
    const pedidoTeste = {
        cliente: "João Silva",
        telefone: "841234567",
        instituicao: "Universidade Teste",
        curso: "Engenharia",
        cadeira: "Matemática",
        descricao: "Pedido de teste",
        plano: "basico",
        nomePlano: "Serviços Avulsos",
        preco: 100,
        metodoPagamento: "mpesa",
        status: "pendente"
    };
    
    console.log('📤 Enviando pedido de teste:', pedidoTeste);
    
    const resultado = await criarPedido(pedidoTeste);
    
    if (resultado.success) {
        console.log('✅ Teste PASSADO! Pedido criado com ID:', resultado.pedido?.id);
        mostrarMensagemGlobal('Teste: Pedido criado com sucesso!', 'success');
    } else {
        console.error('❌ Teste FALHOU:', resultado.error);
        mostrarMensagemGlobal(`Teste falhou: ${resultado.error}`, 'error');
    }
    
    return resultado;
}

// ===== INICIALIZAR QUANDO O DOCUMENTO CARREGAR =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM carregado, inicializando app...');
    inicializarApp();
    
    // Adicionar evento de envio para formulários
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('📝 Formulário submetido:', this.id || this.className);
        });
    });
    
    // Adicionar eventos de drag & drop para upload
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#e0f2fe';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '#f8fafc';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#f8fafc';
            
            if (e.dataTransfer.files.length) {
                document.getElementById('fileInput').files = e.dataTransfer.files;
                handleFileSelect({ target: { files: e.dataTransfer.files } });
            }
        });
    }
    
    console.log('✅ Tudo pronto!');
});

// ===== FUNÇÕES ADICIONAIS PARA MODAIS =====
function mostrarTermos() {
    alert('TERMOS DE SERVIÇO\n\n1. O serviço será iniciado após confirmação do pagamento de 50%.\n2. O prazo começa a contar após pagamento e envio de materiais.\n3. Garantimos 99,9% de taxa de aprovação.\n4. Sua privacidade é respeitada conforme a lei.');
}

function mostrarPrivacidade() {
    alert('POLÍTICA DE PRIVACIDADE\n\n1. Seus dados são usados apenas para processar seu pedido.\n2. Não compartilhamos suas informações com terceiros.\n3. Você pode solicitar exclusão de seus dados a qualquer momento.\n4. Usamos criptografia para proteger suas informações.');
}

function fecharRecarga() {
    const modal = document.getElementById('modalRecarga');
    if (modal) {
        modal.style.display = 'none';
    }
}

function processarRecarga() {
    const valorInput = document.getElementById('valorRecarga');
    const metodoSelect = document.getElementById('metodoRecarga');
    
    const valor = valorInput ? valorInput.value : 0;
    const metodo = metodoSelect ? metodoSelect.value : '';
    
    if (valor < 50) {
        mostrarMensagemGlobal('O valor mínimo para recarga é 50 MT', 'error');
        return;
    }
    
    if (!metodo) {
        mostrarMensagemGlobal('Selecione um método de pagamento', 'error');
        return;
    }
    
    mostrarMensagemGlobal(`Recarga de ${valor} MT via ${metodo.toUpperCase()} solicitada!`, 'success');
    fecharRecarga();
}

// ===== EXPORTAR FUNÇÕES PARA USO GLOBAL =====
window.fazerLogin = fazerLogin;
window.fazerCadastro = fazerCadastro;
window.fazerLogout = fazerLogout;
window.mostrarCadastro = mostrarCadastro;
window.mostrarLogin = mostrarLogin;
window.navegarPara = navegarPara;
window.verificarELogar = verificarELogar;
window.selecionarPlano = selecionarPlano;
window.selecionarMetodo = selecionarMetodo;
window.finalizarCompra = finalizarCompra;
window.abrirDescricaoTrabalho = abrirDescricaoTrabalho;
window.fecharModalDescricao = fecharModalDescricao;
window.solicitarServicoComArquivo = solicitarServicoComArquivo;
window.atualizarDashboard = atualizarDashboard;
window.enviarContato = enviarContato;
window.mostrarTermos = mostrarTermos;
window.mostrarPrivacidade = mostrarPrivacidade;
window.fecharRecarga = fecharRecarga;
window.processarRecarga = processarRecarga;
window.debugAPI = debugAPI;
window.testarConexaoAPI = testarConexaoAPI;
window.testarCriarPedido = testarCriarPedido;
window.handleFileSelect = handleFileSelect;
window.removerArquivo = removerArquivo;

console.log('🎯 Facilitaki carregado! API_URL:', API_URL);
console.log('🛠️  Comandos disponíveis no console:');
console.log('   • debugAPI() - Testar endpoints');
console.log('   • testarCriarPedido() - Testar criação de pedido');
