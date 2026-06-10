// script.js - Facilitaki Sistema Completo
// Versão corrigida com suporte a admin e usuários comuns

// ===== VARIÁVEIS GLOBAIS =====
let usuarioLogado = null;
let carrinho = {
    plano: null,
    nomePlano: '',
    preco: 0,
    metodoPagamento: null
};
let arquivoSelecionado = null;

// ===== URL DO SERVIDOR =====
const API_URL = window.location.origin;

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
    
    // Remover classe ativa de todos os links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Mostrar a seção selecionada
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        
        // Ativar link de navegação correspondente
        const navLink = document.querySelector(`[onclick*="${sectionId}"]`);
        if (navLink && navLink.classList.contains('nav-link')) {
            navLink.classList.add('active');
        }
        
        // Executar ações específicas para cada seção
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
            case 'checkout':
                atualizarResumoPedido();
                break;
            case 'login':
                mostrarLogin();
                break;
        }
    }
    
    // Scroll para o topo
    window.scrollTo(0, 0);
}

// ===== VERIFICAR E LOGAR =====
function verificarELogar(tipo, preco) {
    console.log('🔐 Verificando login para:', tipo, preco);
    
    // Mapear tipo para os valores corretos
    const valoresCorretos = {
        'formatacao': 100,
        'basico': 100,
        'trabalho-campo': 350,
        'avancado': 350,
        'monografia': 10000,
        'premium': 10000
    };
    
    const valorCorreto = valoresCorretos[tipo] || parseFloat(preco);
    
    if (!usuarioLogado) {
        // Salvar seleção para continuar após login
        sessionStorage.setItem('servico_selecionado', tipo);
        sessionStorage.setItem('preco_selecionado', valorCorreto);
        
        mostrarMensagemGlobal('Faça login para continuar com a solicitação', 'info');
        navegarPara('login');
    } else {
        selecionarPlano(tipo, valorCorreto);
    }
}

// ===== GERENCIAMENTO DE USUÁRIOS =====
async function fazerLogin() {
    const telefone = document.getElementById('loginTelefone')?.value.trim();
    const senha = document.getElementById('loginSenha')?.value;
    const mensagem = document.getElementById('mensagemLogin');
    
    if (!telefone || !senha) {
        mostrarMensagem(mensagem, 'Preencha todos os campos', 'error');
        return;
    }
    
    const btnLogin = document.querySelector('#formLogin button');
    const originalText = btnLogin ? btnLogin.innerHTML : 'Entrar';
    if (btnLogin) {
        btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
        btnLogin.disabled = true;
    }
    
    try {
        console.log('🔐 Tentando login para:', telefone);
        
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, senha })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            mostrarMensagem(mensagem, data.mensagem || 'Login realizado com sucesso!', 'success');
            
            // Atualizar botão do header
            const btnHeader = document.getElementById('btnLoginHeader');
            if(btnHeader) {
                btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
                btnHeader.setAttribute('onclick', "navegarPara('dashboard')");
            }
            
            // Verificar se há serviço selecionado antes do login
            const servicoSelecionado = sessionStorage.getItem('servico_selecionado');
            const precoSelecionado = sessionStorage.getItem('preco_selecionado');
            
            if (servicoSelecionado && precoSelecionado) {
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
        if (btnLogin) {
            btnLogin.innerHTML = originalText;
            btnLogin.disabled = false;
        }
    }
}

async function fazerCadastro() {
    const nome = document.getElementById('cadastroNome')?.value.trim();
    const telefone = document.getElementById('cadastroTelefone')?.value.trim();
    const senha = document.getElementById('cadastroSenha')?.value;
    const confirmarSenha = document.getElementById('cadastroSenhaConfirm')?.value;
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

    const btnCadastro = document.querySelector('#formCadastro button');
    const originalText = btnCadastro ? btnCadastro.innerHTML : 'Cadastrar';
    if (btnCadastro) {
        btnCadastro.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';
        btnCadastro.disabled = true;
    }

    try {
        console.log('📝 Tentando cadastro para:', telefone);
        
        const response = await fetch(`${API_URL}/api/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            mostrarMensagem(mensagem, data.mensagem || 'Cadastro realizado com sucesso!', 'success');
            
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            console.log('✅ Cadastro e login automático bem-sucedido');
            
            // Atualizar botão do header
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
        if (btnCadastro) {
            btnCadastro.innerHTML = originalText;
            btnCadastro.disabled = false;
        }
    }
}

async function fazerLogout() {
    const token = localStorage.getItem('token_facilitaki');
    if (token) {
        try {
            await fetch(`${API_URL}/api/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.error("❌ Erro ao fazer logout:", error);
        }
    }
    
    usuarioLogado = null;
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    
    console.log('👋 Usuário deslogado');
    
    const btnHeader = document.getElementById('btnLoginHeader');
    if(btnHeader) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Área do Cliente';
        btnHeader.setAttribute('onclick', 'navegarPara(\'login\')');
    }
    
    carrinho = { plano: null, nomePlano: '', preco: 0, metodoPagamento: null };
    arquivoSelecionado = null;
    sessionStorage.clear();
    
    navegarPara('home');
}

function mostrarCadastro() {
    const formLogin = document.getElementById('formLogin');
    const formCadastro = document.getElementById('formCadastro');
    if (formLogin) formLogin.style.display = 'none';
    if (formCadastro) formCadastro.style.display = 'block';
    const mensagem = document.getElementById('mensagemLogin');
    if (mensagem) mensagem.innerHTML = '';
}

function mostrarLogin() {
    const formLogin = document.getElementById('formLogin');
    const formCadastro = document.getElementById('formCadastro');
    if (formCadastro) formCadastro.style.display = 'none';
    if (formLogin) formLogin.style.display = 'block';
    const mensagem = document.getElementById('mensagemLogin');
    if (mensagem) mensagem.innerHTML = '';
}

// ===== UPLOAD DE ARQUIVOS =====
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validações básicas
    if (file.size > 10 * 1024 * 1024) {
        alert('Arquivo muito grande. O tamanho máximo é 10MB.');
        event.target.value = '';
        return;
    }
    
    const validTypes = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    if (!validTypes.includes(fileExt)) {
        alert('Formato de arquivo não suportado. Use PDF, DOC, DOCX, TXT, JPG, PNG.');
        event.target.value = '';
        return;
    }
    
    arquivoSelecionado = file;
    
    // Mostrar pré-visualização do arquivo
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    
    if (filePreview && fileName && fileSize) {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        filePreview.style.display = 'block';
    }
    
    // Habilitar botão de submeter
    const btnSolicitar = document.getElementById('btnSolicitarServico');
    if (btnSolicitar) {
        btnSolicitar.disabled = false;
        btnSolicitar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Arquivo';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        btnSolicitar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Arquivo';
    }
}

// ===== PLANOS E CHECKOUT =====
function selecionarPlano(tipo, preco) {
    console.log('📦 Selecionando plano:', tipo, preco);
    
    const planosInfo = {
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 },
        'basico': { nome: 'Serviços Avulsos', preco: 100 },
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 },
        'avancado': { nome: 'Trabalho de campo', preco: 350 },
        'monografia': { nome: 'Monografia/TCC', preco: 10000 },
        'premium': { nome: 'Monografia/TCC', preco: 10000 }
    };
    
    const plano = planosInfo[tipo] || { nome: 'Serviço', preco: parseFloat(preco) };
    
    carrinho = {
        plano: tipo,
        nomePlano: plano.nome,
        preco: plano.preco,
        metodoPagamento: null
    };
    
    console.log('🛒 Carrinho atualizado:', carrinho);
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
    
    carrinho.metodoPagamento = metodo;
    
    // Habilitar botão de finalizar compra
    const btnFinalizar = document.querySelector('#checkout button[onclick="finalizarCompra()"]');
    if (btnFinalizar) {
        btnFinalizar.disabled = false;
        btnFinalizar.innerHTML = '<i class="fas fa-check"></i> Finalizar Compra';
    }
}

function atualizarResumoPedido() {
    const resumoDiv = document.getElementById('resumoPedido');
    
    if (carrinho.plano && carrinho.preco > 0 && resumoDiv) {
        resumoDiv.innerHTML = `
            <div style="background: #f9fafb; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
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
                        <i class="fas fa-info-circle"></i> Após o login, você poderá enviar o arquivo
                    </p>
                </div>
            </div>
        `;
    } else if (resumoDiv) {
        resumoDiv.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6b7280;">
                <i class="fas fa-shopping-cart" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Nenhum serviço selecionado</p>
                <button onclick="navegarPara('planos')" style="background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; margin-top: 1rem; cursor: pointer;">
                    Escolher Serviço
                </button>
            </div>
        `;
    }
}

function finalizarCompra() {
    console.log('💰 Finalizando compra...');
    
    if (!carrinho.plano) {
        mostrarMensagemGlobal('Selecione um serviço primeiro', 'error');
        return;
    }
    
    if (!carrinho.metodoPagamento) {
        mostrarMensagemGlobal('Selecione um método de pagamento', 'error');
        return;
    }
    
    // Verificar se o usuário está logado
    if (!usuarioLogado) {
        mostrarMensagemGlobal('Faça login para enviar o arquivo e completar a solicitação', 'info');
        navegarPara('login');
        return;
    }
    
    // Se estiver logado, redirecionar para pagamento-sucesso
    navegarPara('pagamento-sucesso');
}

function mostrarInstrucoesPagamento() {
    console.log('📄 Mostrando instruções de pagamento...');
    
    const instrucoesDiv = document.getElementById('instrucoesDetalhadas');
    const resumoDiv = document.getElementById('resumoPagamento');
    
    if (!carrinho.plano || !instrucoesDiv || !resumoDiv) {
        console.error('❌ Dados do carrinho incompletos:', carrinho);
        return;
    }
    
    let instrucoes = '';
    const valorTotal = carrinho.preco || 0;
    const valorEntrada = Math.ceil(valorTotal * 0.5);
    
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
                    </ol>
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
                        <p><strong>Banco:</strong> MOZABANCO</p>
                        <p><strong>NIB:</strong> 00340000358480311018</p>
                        <p><strong>Nome:</strong> Aguinaldo Anli Mahadura</p>
                        <p><strong>Valor:</strong> <strong>${valorEntrada.toLocaleString('pt-MZ')} MT</strong> (entrada de 50%)</p>
                    </div>
                </div>
            `;
            break;
        default:
            instrucoes = '<p>Selecione um método de pagamento</p>';
    }
    
    instrucoesDiv.innerHTML = instrucoes;
    
    resumoDiv.innerHTML = `
        <div style="background: #f9fafb; padding: 1.5rem; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h5 style="margin-top: 0; color: #1e40af;">Detalhes</h5>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Serviço:</span>
                <strong>${carrinho.nomePlano || carrinho.plano}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Valor Total:</span>
                <strong>${valorTotal.toLocaleString('pt-MZ')} MT</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <span>Entrada (50%):</span>
                <strong style="color: #10b981;">${valorEntrada.toLocaleString('pt-MZ')} MT</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                <span>Saldo Restante:</span>
                <strong>${(valorTotal - valorEntrada).toLocaleString('pt-MZ')} MT</strong>
            </div>
            <hr style="border-color: #e5e7eb; margin: 1rem 0;">
            <div style="display: flex; justify-content: space-between;">
                <span>Método de Pagamento:</span>
                <strong>${carrinho.metodoPagamento ? carrinho.metodoPagamento.toUpperCase() : 'Não selecionado'}</strong>
            </div>
        </div>
    `;
}

// ===== MODAL PARA ENVIO DE ARQUIVO =====
function abrirDescricaoTrabalho() {
    const selectServico = document.getElementById('selectServicoDashboard');
    const servicoSelecionado = selectServico ? selectServico.value : null;
    
    if (!servicoSelecionado) {
        mostrarMensagemGlobal('Selecione um serviço primeiro', 'error');
        return;
    }
    
    console.log('📝 Abrindo descrição para serviço:', servicoSelecionado);
    
    const servicos = {
        'formatacao': { nome: 'Formatação de trabalhos', preco: 100 },
        'basico': { nome: 'Serviços Avulsos', preco: 100 },
        'trabalho-campo': { nome: 'Trabalho de campo (pesquisa)', preco: 350 },
        'avancado': { nome: 'Trabalho de campo', preco: 350 },
        'monografia': { nome: 'Monografia/TCC', preco: 10000 },
        'premium': { nome: 'Monografia/TCC', preco: 10000 }
    };
    
    const servico = servicos[servicoSelecionado] || { nome: 'Serviço', preco: 0 };
    
    const nomeServicoModal = document.getElementById('nomeServicoModal');
    const valorServicoModal = document.getElementById('valorServicoModal');
    
    if (nomeServicoModal) nomeServicoModal.textContent = servico.nome;
    if (valorServicoModal) valorServicoModal.textContent = servico.preco.toLocaleString('pt-MZ') + ' MT';
    
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.dataset.servicoTipo = servicoSelecionado;
        modal.dataset.servicoNome = servico.nome;
        modal.dataset.servicoPreco = servico.preco;
        
        // Resetar campos do modal
        const descricaoDetalhada = document.getElementById('descricaoDetalhada');
        const prazoTrabalhoDetalhe = document.getElementById('prazoTrabalhoDetalhe');
        const metodoPagamentoModal = document.getElementById('metodoPagamentoModal');
        const aceitarTermos = document.getElementById('aceitarTermos');
        
        if (descricaoDetalhada) descricaoDetalhada.value = '';
        if (prazoTrabalhoDetalhe) prazoTrabalhoDetalhe.value = '';
        if (metodoPagamentoModal) metodoPagamentoModal.selectedIndex = 0;
        if (aceitarTermos) aceitarTermos.checked = false;
        
        removerArquivo();
        
        modal.style.display = 'flex';
    }
}

function fecharModalDescricao() {
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.style.display = 'none';
    }
    
    arquivoSelecionado = null;
    removerArquivo();
}

async function solicitarServicoComArquivo() {
    console.log('🚀 Solicitando serviço com arquivo...');
    
    if (!arquivoSelecionado) {
        mostrarMensagemGlobal('Selecione um arquivo para enviar', 'error');
        return;
    }
    
    const token = localStorage.getItem('token_facilitaki');
    if (!token) {
        mostrarMensagemGlobal('Faça login novamente', 'error');
        navegarPara('login');
        return;
    }
    
    const descricao = document.getElementById('descricaoDetalhada')?.value.trim() || '';
    const prazo = document.getElementById('prazoTrabalhoDetalhe')?.value || '';
    const metodoPagamentoSelect = document.getElementById('metodoPagamentoModal');
    const metodoPagamento = metodoPagamentoSelect ? metodoPagamentoSelect.value : '';
    const aceitarTermos = document.getElementById('aceitarTermos')?.checked || false;
    
    const modal = document.getElementById('modalDescricaoTrabalho');
    const servicoTipo = modal ? modal.dataset.servicoTipo : 'basico';
    const servicoNome = modal ? modal.dataset.servicoNome : 'Serviço';
    const servicoPreco = modal ? parseInt(modal.dataset.servicoPreco) || 0 : 0;
    
    if (!metodoPagamento) {
        mostrarMensagemGlobal('Selecione um método de pagamento', 'error');
        return;
    }
    
    if (!aceitarTermos) {
        mostrarMensagemGlobal('Você precisa aceitar os termos de serviço', 'error');
        return;
    }
    
    // Atualizar carrinho com os dados do pedido
    carrinho = {
        plano: servicoTipo,
        nomePlano: servicoNome,
        preco: servicoPreco,
        metodoPagamento: metodoPagamento
    };
    
    const btnSolicitar = document.getElementById('btnSolicitarServico');
    const originalText = btnSolicitar ? btnSolicitar.innerHTML : 'Enviar Arquivo';
    if (btnSolicitar) {
        btnSolicitar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btnSolicitar.disabled = true;
    }
    
    try {
        const formData = new FormData();
        formData.append('arquivo', arquivoSelecionado);
        formData.append('cliente', usuarioLogado?.nome || 'Cliente');
        formData.append('telefone', usuarioLogado?.telefone || '');
        formData.append('descricao', descricao);
        formData.append('prazo', prazo);
        formData.append('plano', servicoTipo);
        formData.append('nomePlano', servicoNome);
        formData.append('preco', servicoPreco.toString());
        formData.append('metodoPagamento', metodoPagamento);
        
        const response = await fetch(`${API_URL}/api/pedidos/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            fecharModalDescricao();
            mostrarMensagemGlobal('Arquivo enviado com sucesso!', 'success');
            
            setTimeout(() => {
                atualizarDashboard();
                navegarPara('pagamento-sucesso');
            }, 1500);
        } else {
            throw new Error(data.erro || 'Erro ao enviar arquivo');
        }
    } catch (error) {
        console.error('❌ Erro ao enviar arquivo:', error);
        mostrarMensagemGlobal('Erro: ' + error.message, 'error');
    } finally {
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
    
    const token = localStorage.getItem('token_facilitaki');
    if (!token) {
        console.log('❌ Token não encontrado');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/meus-pedidos`, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                const pedidosUsuario = data.pedidos || [];
                
                // Calcular valor total por pagar
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
                                <button onclick="navegarPara('planos')" style="background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; margin-top: 1rem; cursor: pointer;">
                                    Solicitar Serviço
                                </button>
                            </div>
                        `;
                    } else {
                        listaPedidosDiv.innerHTML = pedidosUsuario.map(pedido => {
                            const dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido) : new Date();
                            const statusColor = getStatusColor(pedido.status);
                            const statusText = pedido.status ? pedido.status.replace('_', ' ') : 'pendente';
                            const temArquivo = pedido.arquivo_path;
                            
                            return `
                                <div style="background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid ${statusColor};">
                                    <div style="display: flex; justify-content: space-between; align-items: start;">
                                        <div>
                                            <strong style="color: #1e40af;">${pedido.nome_plano || 'Serviço'}</strong>
                                            <div style="font-size: 0.9rem; color: #6b7280; margin-top: 0.25rem;">
                                                ${pedido.descricao || 'Sem descrição'}
                                                ${temArquivo ? `<br><small><i class="fas fa-file"></i> Arquivo anexado</small>` : ''}
                                            </div>
                                        </div>
                                        <div style="text-align: right;">
                                            <div style="font-weight: bold; color: #1e40af; font-size: 1.1rem;">
                                                ${(parseFloat(pedido.preco) || 0).toLocaleString('pt-MZ')} MT
                                            </div>
                                            <span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 3px; background: ${statusColor}20; color: ${statusColor};">
                                                ${statusText}
                                            </span>
                                        </div>
                                    </div>
                                    <div style="font-size: 0.8rem; color: #9ca3af; margin-top: 0.5rem;">
                                        <i class="far fa-calendar"></i> ${dataPedido.toLocaleDateString('pt-MZ')}
                                        ${pedido.metodo_pagamento ? ` • <i class="fas fa-credit-card"></i> ${pedido.metodo_pagamento.toUpperCase()}` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }
            }
        } else {
            console.error('❌ Erro ao carregar pedidos:', response.status);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar pedidos:', error);
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
    
    const btnEnviar = document.querySelector('#contato button');
    const originalText = btnEnviar ? btnEnviar.innerHTML : 'Enviar Mensagem';
    if (btnEnviar) {
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btnEnviar.disabled = true;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/contato`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, mensagem: mensagemTexto })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensagem(mensagemDiv, 'Mensagem enviada com sucesso!', 'success');
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
    
    setTimeout(() => {
        elemento.style.display = 'none';
    }, 5000);
}

function mostrarMensagemGlobal(texto, tipo) {
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
    
    setTimeout(() => {
        mensagemDiv.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (mensagemDiv.parentNode) {
                mensagemDiv.parentNode.removeChild(mensagemDiv);
            }
        }, 300);
    }, 5000);
}

function mostrarTermos() {
    alert('TERMOS DE SERVIÇO\n\n1. O serviço será iniciado após confirmação do pagamento de 50%.\n2. O prazo começa a contar após pagamento e envio de materiais.\n3. Garantimos 99,9% de taxa de aprovação.\n4. Sua privacidade é respeitada conforme a lei.\n5. O cliente é responsável pelo conteúdo enviado.');
}

function mostrarPrivacidade() {
    alert('POLÍTICA DE PRIVACIDADE\n\n1. Seus dados são usados apenas para processar seu pedido.\n2. Não compartilhamos suas informações com terceiros.\n3. Você pode solicitar exclusão de seus dados a qualquer momento.\n4. Usamos criptografia para proteger suas informações.\n5. Arquivos são armazenados com segurança e excluídos após 90 dias.');
}

function fecharRecarga() {
    const modal = document.getElementById('modalRecarga');
    if (modal) modal.style.display = 'none';
}

function processarRecarga() {
    const valorInput = document.getElementById('valorRecarga');
    const metodoSelect = document.getElementById('metodoRecarga');
    const valor = valorInput ? parseInt(valorInput.value) || 0 : 0;
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

// ===== INICIALIZAÇÃO =====
function inicializarApp() {
    console.log('🚀 Inicializando Facilitaki...');
    
    // Verificar se há usuário logado
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    const tokenSalvo = localStorage.getItem('token_facilitaki');
    
    if (usuarioSalvo && tokenSalvo) {
        try {
            usuarioLogado = JSON.parse(usuarioSalvo);
            console.log('👤 Usuário recuperado:', usuarioLogado);
            
            const btnHeader = document.getElementById('btnLoginHeader');
            if(btnHeader) {
                btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
                btnHeader.setAttribute('onclick', 'navegarPara(\'dashboard\')');
            }
        } catch (e) {
            console.error('❌ Erro ao recuperar usuário:', e);
            localStorage.removeItem('usuarioLogado_facilitaki');
            localStorage.removeItem('token_facilitaki');
        }
    }
    
    // Configurar data mínima para campos de data
    const hoje = new Date().toISOString().split('T')[0];
    const campoPrazo = document.getElementById('prazoTrabalhoDetalhe');
    if (campoPrazo) campoPrazo.min = hoje;
    
    // Configurar modais
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    });
    
    // Testar conexão
    setTimeout(() => testarConexaoAPI(), 2000);
    
    console.log('✅ Facilitaki inicializado!');
}

// ===== EVENTOS =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM carregado');
    inicializarApp();
    
    // Prevenir submit padrão de formulários
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
        });
    });
    
    // Configurar drag and drop para upload
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
    
    // Formatar campos de telefone
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
});

// ===== EXPORTAR FUNÇÕES PARA O ESCOPO GLOBAL =====
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
window.handleFileSelect = handleFileSelect;
window.removerArquivo = removerArquivo;

console.log('🎯 Facilitaki carregado com sucesso!');
