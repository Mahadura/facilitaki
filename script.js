// script.js - JavaScript completo para o Facilitaki

// ===== VARIÁVEIS GLOBAIS =====
let usuarioLogado = null;
let carrinho = {
    plano: null,
    preco: 0,
    metodoPagamento: null
};
let pedidos = JSON.parse(localStorage.getItem('pedidos_facilitaki')) || [];
let usuarios = JSON.parse(localStorage.getItem('usuarios_facilitaki')) || [];

// ===== URL DO SERVIDOR =====
const API_URL = 'https://facilitaki.onrender.com';

// ===== NAVEGAÇÃO =====
function navegarPara(sectionId) {
    // Esconder todas as seções
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Remover classe active de todos os links de navegação
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
        if (sectionId === 'dashboard' && usuarioLogado) {
            atualizarDashboard();
        } else if (sectionId === 'pagamento-sucesso' && carrinho.plano) {
            mostrarInstrucoesPagamento();
        }
    }
    
    // Scroll para o topo
    window.scrollTo(0, 0);
}

// ===== FUNÇÃO NOVA: Verificar e Logar =====
function verificarELogar(tipo, preco) {
    if (!usuarioLogado) {
        mostrarMensagemGlobal('Faça login ou cadastre-se para solicitar serviços', 'info');
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
    
    try {
        // Envia os dados para a API no servidor
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, senha })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // Se o servidor aceitar, guardamos a sessão
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
            
            setTimeout(() => navegarPara('dashboard'), 1500);
        } else {
            mostrarMensagem(mensagem, data.erro || 'Telefone ou senha incorretos', 'error');
        }
    } catch (error) {
        console.error("Erro no fetch:", error);
        mostrarMensagem(mensagem, 'O servidor não respondeu. Tente novamente.', 'error');
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

    try {
        // Envia o novo usuário para o servidor
        const response = await fetch(`${API_URL}/api/cadastrar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarMensagem(mensagem, data.mensagem || 'Cadastro realizado com sucesso!', 'success');
            
            // Tentar login automático
            const loginResponse = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefone, senha })
            });

            const loginData = await loginResponse.json();

            if (loginResponse.ok && loginData.success) {
                usuarioLogado = loginData.usuario;
                localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(loginData.usuario));
                localStorage.setItem('token_facilitaki', loginData.token);
                
                mostrarMensagem(mensagem, 'Login automático realizado!', 'success');
                
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
                mostrarMensagem(mensagem, 'Cadastro realizado! Faça login manualmente.', 'success');
                mostrarLogin();
            }
        } else {
            mostrarMensagem(mensagem, data.erro || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        console.error("Erro no fetch:", error);
        mostrarMensagem(mensagem, 'Erro de conexão com o servidor.', 'error');
    }
}

async function fazerLogout() {
    try {
        // Opcional: Chamar endpoint de logout no servidor
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
        console.error("Erro ao fazer logout no servidor:", error);
    }
    
    // Limpar dados locais
    usuarioLogado = null;
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    
    // Atualizar cabeçalho
    const btnHeader = document.getElementById('btnLoginHeader');
    if(btnHeader) {
        btnHeader.innerHTML = '<i class="fas fa-user"></i> Área do Cliente';
        btnHeader.setAttribute('onclick', 'navegarPara(\'login\')');
    }
    
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

// ===== FUNÇÕES PARA GESTÃO DE PEDIDOS =====
async function criarPedido(pedidoData) {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) {
            return { success: false, error: 'Usuário não autenticado. Faça login novamente.' };
        }
        
        const response = await fetch(`${API_URL}/api/pedidos`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(pedidoData)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                return { success: true, pedido: data.pedido };
            } else {
                return { success: false, error: data.erro || 'Erro ao criar pedido' };
            }
        } else {
            const error = await response.json();
            return { success: false, error: error.erro || 'Erro na requisição' };
        }
    } catch (error) {
        console.error("Erro ao criar pedido:", error);
        return { success: false, error: 'Erro de conexão com o servidor' };
    }
}

async function buscarPedidosUsuario() {
    try {
        const token = localStorage.getItem('token_facilitaki');
        if (!token) {
            return { success: false, error: 'Usuário não autenticado. Faça login novamente.' };
        }
        
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
                return { success: true, pedidos: data.pedidos };
            } else {
                return { success: false, error: data.erro || 'Erro ao buscar pedidos' };
            }
        } else {
            const error = await response.json();
            return { success: false, error: error.erro || 'Erro na requisição' };
        }
    } catch (error) {
        console.error("Erro ao buscar pedidos:", error);
        return { success: false, error: 'Erro de conexão com o servidor' };
    }
}

// ===== PLANOS E CHECKOUT =====
function selecionarPlano(tipo, preco) {
    // Verificar se usuário está logado
    if (!usuarioLogado) {
        mostrarMensagemGlobal('Faça login ou cadastre-se para continuar', 'info');
        navegarPara('login');
        return;
    }
    
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
        preco: preco,
        metodoPagamento: null
    };
    
    // Atualizar resumo no checkout
    atualizarResumoPedido();
    
    // Ir para checkout
    navegarPara('checkout');
}

function selecionarMetodo(metodo) {
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
    
    // Mostrar instruções de pagamento
    mostrarInstrucoesMetodo(metodo);
}

function mostrarInstrucoesMetodo(metodo) {
    const instrucoesDiv = document.getElementById('instrucoesPagamento');
    const textoInstrucoes = document.getElementById('textoInstrucoes');
    
    let instrucoes = '';
    
    switch(metodo) {
        case 'mpesa':
            instrucoes = `
                <strong>Instruções M-Pesa:</strong><br>
                1. Acesse M-Pesa no seu celular<br>
                2. Selecione "Transferir Dinheiro"<br>
                3. Digite o número: <strong>84 718 6665</strong><br>
                4. Valor: <strong>${carrinho.preco} MT</strong><br>
                5. Nome: Aguinaldo Anli<br>
                6. Confirme a transação
            `;
            break;
        case 'emola':
            instrucoes = `
                <strong>Instruções e-Mola:</strong><br>
                1. Acesse e-Mola no seu celular<br>
                2. Selecione "Transferir Dinheiro"<br>
                3. Digite o número: <strong>86 728 6665</strong><br>
                4. Valor: <strong>${carrinho.preco} MT</strong><br>
                5. Nome: Aguinaldo Anli<br>
                6. Confirme a transação
            `;
            break;
        case 'deposito':
            instrucoes = `
                <strong>Instruções Depósito Bancário:</strong><br>
                Banco: BCI<br>
                Conta: 1234567890<br>
                Nome: Facilitaki Lda<br>
                Valor: <strong>${carrinho.preco} MT</strong><br>
                <br>
                Envie o comprovativo para: 84 123 4567
            `;
            break;
        default:
            instrucoes = `<strong>Método:</strong> ${metodo}<br>Complete o pagamento conforme instruções.`;
    }
    
    textoInstrucoes.innerHTML = instrucoes;
    instrucoesDiv.style.display = 'block';
}

function atualizarResumoPedido() {
    const resumoDiv = document.getElementById('resumoPedido');
    
    if (carrinho.plano) {
        resumoDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${carrinho.nomePlano}</strong><br>
                    <small>Serviço selecionado</small>
                </div>
                <div style="font-size: 1.2rem; font-weight: bold; color: #1e40af;">
                    ${carrinho.preco.toLocaleString('pt-MZ')} MT
                </div>
            </div>
        `;
    } else {
        resumoDiv.innerHTML = '<p>Selecione um serviço primeiro</p>';
    }
}

async function finalizarCompra() {
    const nomeCliente = document.getElementById('nomeCliente')?.value.trim() || usuarioLogado?.nome || '';
    const telefoneCliente = document.getElementById('telefoneCliente')?.value.trim() || usuarioLogado?.telefone || '';
    const instituicao = document.getElementById('instituicao')?.value.trim() || '';
    const curso = document.getElementById('curso')?.value.trim() || '';
    const cadeira = document.getElementById('cadeira')?.value.trim() || '';
    const descricao = document.getElementById('descricao')?.value.trim() || '';
    
    // Validações
    if (!nomeCliente || !telefoneCliente) {
        mostrarMensagem(document.getElementById('mensagemCheckout'), 'Nome e telefone são obrigatórios', 'error');
        return;
    }
    
    if (!carrinho.plano) {
        mostrarMensagem(document.getElementById('mensagemCheckout'), 'Selecione um serviço primeiro', 'error');
        return;
    }
    
    if (!carrinho.metodoPagamento) {
        mostrarMensagem(document.getElementById('mensagemCheckout'), 'Selecione um método de pagamento', 'error');
        return;
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
    
    // Enviar para o servidor
    const resultado = await criarPedido(pedidoData);
    
    if (resultado.success) {
        // Mostrar mensagem de sucesso
        mostrarMensagem(document.getElementById('mensagemCheckout'), 'Pedido registrado com sucesso! Redirecionando...', 'success');
        
        // Limpar formulário se existir
        if (document.getElementById('nomeCliente')) document.getElementById('nomeCliente').value = '';
        if (document.getElementById('telefoneCliente')) document.getElementById('telefoneCliente').value = '';
        if (document.getElementById('instituicao')) document.getElementById('instituicao').value = '';
        if (document.getElementById('curso')) document.getElementById('curso').value = '';
        if (document.getElementById('cadeira')) document.getElementById('cadeira').value = '';
        if (document.getElementById('descricao')) document.getElementById('descricao').value = '';
        
        // Atualizar pedidos locais
        pedidos.push(resultado.pedido);
        localStorage.setItem('pedidos_facilitaki', JSON.stringify(pedidos));
        
        // Mostrar instruções de pagamento
        setTimeout(() => {
            navegarPara('pagamento-sucesso');
        }, 2000);
    } else {
        mostrarMensagem(document.getElementById('mensagemCheckout'), resultado.error, 'error');
    }
}

function mostrarInstrucoesPagamento() {
    const instrucoesDiv = document.getElementById('instrucoesDetalhadas');
    const resumoDiv = document.getElementById('resumoPagamento');
    
    if (!carrinho.plano) return;
    
    // Instruções de pagamento
    let instrucoes = '';
    switch(carrinho.metodoPagamento) {
        case 'mpesa':
            instrucoes = `
                <h4>Pagamento via M-Pesa</h4>
                <ol>
                    <li>Acesse M-Pesa no seu celular</li>
                    <li>Selecione "Transferir Dinheiro"</li>
                    <li>Digite o número: <strong>84 728 6665</strong></li>
                    <li>Valor: <strong>${carrinho.preco.toLocaleString('pt-MZ')} MT</strong></li>
                    <li>Nome: <strong>Aguinaldo Anli</strong></li>
                    <li>Confirme a transação</li>
                    <li>Guarde o comprovativo</li>
                </ol>
                <p style="margin-top: 1rem; padding: 0.5rem; background: white; border-radius: 5px;">
                    <strong>Nota:</strong> Entraremos em contacto após confirmação do pagamento.
                </p>
            `;
            break;
        case 'emola':
            instrucoes = `
                <h4>Pagamento via e-Mola</h4>
                <ol>
                    <li>Acesse e-Mola no seu celular</li>
                    <li>Selecione "Transferir Dinheiro"</li>
                    <li>Digite o número: <strong>86 728 6665</strong></li>
                    <li>Valor: <strong>${carrinho.preco.toLocaleString('pt-MZ')} MT</strong></li>
                    <li>Nome: <strong>Aguinaldo Anli</strong></li>
                    <li>Confirme a transação</li>
                    <li>Guarde o comprovativo</li>
                </ol>
            `;
            break;
        case 'deposito':
            instrucoes = `
                <h4>Depósito Bancário</h4>
                <div style="background: white; padding: 1rem; border-radius: 5px; margin-top: 1rem;">
                    <p><strong>Banco:</strong> BCI</p>
                    <p><strong>Conta:</strong> 1234567890</p>
                    <p><strong>Nome:</strong> Facilitaki Lda</p>
                    <p><strong>Valor:</strong> ${carrinho.preco.toLocaleString('pt-MZ')} MT</p>
                </div>
                <p style="margin-top: 1rem;">
                    <strong>Importante:</strong> Envie o comprovativo para WhatsApp: 84 123 4567
                </p>
            `;
            break;
        default:
            instrucoes = `<h4>Pagamento via ${carrinho.metodoPagamento.toUpperCase()}</h4>
                <p>Complete o pagamento conforme o método selecionado.</p>`;
    }
    
    if (instrucoesDiv) instrucoesDiv.innerHTML = instrucoes;
    
    // Relatório do pagamento
    if (resumoDiv) {
        resumoDiv.innerHTML = `
            <p><strong>Serviço:</strong> ${carrinho.nomePlano}</p>
            <p><strong>Valor:</strong> ${carrinho.preco.toLocaleString('pt-MZ')} MT</p>
            <p><strong>Método de Pagamento:</strong> ${carrinho.metodoPagamento ? carrinho.metodoPagamento.toUpperCase() : 'Não selecionado'}</p>
            <p><strong>Status:</strong> <span style="color: #f59e0b; font-weight: bold;">Aguardando Pagamento</span></p>
        `;
    }
}

// ===== MODAL DESCRIÇÃO TRABALHO =====
function abrirDescricaoTrabalho() {
    const selectServico = document.getElementById('selectServicoDashboard');
    const servicoSelecionado = selectServico ? selectServico.value : null;
    
    if (!servicoSelecionado) {
        mostrarMensagemGlobal('Selecione um serviço primeiro', 'error');
        return;
    }
    
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
    
    // Armazenar dados do serviço em atributos do modal
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.dataset.servicoTipo = servicoSelecionado;
        modal.dataset.servicoNome = servico.nome;
        modal.dataset.servicoPreco = servico.preco;
        
        // Limpar campos anteriores
        const temaTrabalho = document.getElementById('temaTrabalho');
        const disciplinaTrabalho = document.getElementById('disciplinaTrabalho');
        const descricaoDetalhada = document.getElementById('descricaoDetalhada');
        const prazoTrabalhoDetalhe = document.getElementById('prazoTrabalhoDetalhe');
        const metodoPagamentoModal = document.getElementById('metodoPagamentoModal');
        
        if (temaTrabalho) temaTrabalho.value = '';
        if (disciplinaTrabalho) disciplinaTrabalho.value = '';
        if (descricaoDetalhada) descricaoDetalhada.value = '';
        if (prazoTrabalhoDetalhe) prazoTrabalhoDetalhe.value = '';
        if (metodoPagamentoModal) metodoPagamentoModal.selectedIndex = 0;
        
        // Mostrar modal com rolagem suave
        modal.style.display = 'flex';
        
        // Focar no primeiro campo
        setTimeout(() => {
            if (temaTrabalho) temaTrabalho.focus();
        }, 100);
    }
}

function fecharModalDescricao() {
    const modal = document.getElementById('modalDescricaoTrabalho');
    if (modal) {
        modal.style.display = 'none';
        
        // Limpar campos
        const temaTrabalho = document.getElementById('temaTrabalho');
        const disciplinaTrabalho = document.getElementById('disciplinaTrabalho');
        const descricaoDetalhada = document.getElementById('descricaoDetalhada');
        const prazoTrabalhoDetalhe = document.getElementById('prazoTrabalhoDetalhe');
        const metodoPagamentoModal = document.getElementById('metodoPagamentoModal');
        
        if (temaTrabalho) temaTrabalho.value = '';
        if (disciplinaTrabalho) disciplinaTrabalho.value = '';
        if (descricaoDetalhada) descricaoDetalhada.value = '';
        if (prazoTrabalhoDetalhe) prazoTrabalhoDetalhe.value = '';
        if (metodoPagamentoModal) metodoPagamentoModal.selectedIndex = 0;
    }
}

async function solicitarServicoComDescricao() {
    // Coletar dados do modal
    const tema = document.getElementById('temaTrabalho')?.value.trim() || '';
    const disciplina = document.getElementById('disciplinaTrabalho')?.value.trim() || '';
    const descricao = document.getElementById('descricaoDetalhada')?.value.trim() || '';
    const prazo = document.getElementById('prazoTrabalhoDetalhe')?.value || '';
    const metodoPagamentoSelect = document.getElementById('metodoPagamentoModal');
    const metodoPagamento = metodoPagamentoSelect ? metodoPagamentoSelect.value : '';
    
    // Validar campos obrigatórios
    if (!tema || !disciplina || !metodoPagamento) {
        mostrarMensagemGlobal('Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    // Obter dados do serviço do modal
    const modal = document.getElementById('modalDescricaoTrabalho');
    const servicoTipo = modal ? modal.dataset.servicoTipo : 'basico';
    const servicoNome = modal ? modal.dataset.servicoNome : 'Serviço';
    const servicoPreco = modal ? parseInt(modal.dataset.servicoPreco) || 0 : 0;
    
    // Criar pedido para enviar ao servidor
    const pedidoData = {
        cliente: usuarioLogado ? usuarioLogado.nome : 'Cliente',
        telefone: usuarioLogado ? usuarioLogado.telefone : '',
        instituicao: 'Não informada',
        curso: 'Não informado',
        cadeira: disciplina,
        tema: tema,
        descricao: descricao,
        prazo: prazo,
        plano: servicoTipo,
        nomePlano: servicoNome,
        preco: servicoPreco,
        metodoPagamento: metodoPagamento,
        status: 'pendente'
    };
    
    // Enviar para o servidor
    const resultado = await criarPedido(pedidoData);
    
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
        
        // Atualizar pedidos locais
        pedidos.push(resultado.pedido);
        localStorage.setItem('pedidos_facilitaki', JSON.stringify(pedidos));
        
        // Mostrar mensagem de sucesso
        mostrarMensagemGlobal('Serviço solicitado com sucesso!', 'success');
        
        // Ir para instruções de pagamento
        setTimeout(() => navegarPara('pagamento-sucesso'), 1500);
    } else {
        mostrarMensagemGlobal(resultado.error, 'error');
    }
}

// ===== DASHBOARD =====
async function atualizarDashboard() {
    if (!usuarioLogado) {
        console.log("Usuário não logado, redirecionando para login");
        navegarPara('login');
        return;
    }
    
    // Buscar pedidos do servidor
    const resultado = await buscarPedidosUsuario();
    
    if (resultado.success) {
        usuarioLogado.pedidos = resultado.pedidos || [];
        localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(usuarioLogado));
        
        // Calcular valor total por pagar
        const pedidosPendentes = (usuarioLogado.pedidos || []).filter(p => p.status === 'pendente');
        const valorTotal = pedidosPendentes.reduce((total, pedido) => total + pedido.preco, 0);
        
        // Atualizar valor total
        const valorTotalPagar = document.getElementById('valorTotalPagar');
        if (valorTotalPagar) {
            valorTotalPagar.textContent = valorTotal.toLocaleString('pt-MZ') + ' MT';
        }
        
        // Atualizar lista de pedidos
        const listaPedidosDiv = document.getElementById('listaPedidos');
        const pedidosUsuario = usuarioLogado.pedidos || [];
        
        if (listaPedidosDiv) {
            if (pedidosUsuario.length === 0) {
                listaPedidosDiv.innerHTML = '<p style="text-align: center; color: #6b7280;">Nenhum pedido encontrado</p>';
            } else {
                listaPedidosDiv.innerHTML = pedidosUsuario.map(pedido => `
                    <div style="background: #f9fafb; padding: 1rem; border-radius: 5px; margin-bottom: 1rem; border-left: 4px solid ${getStatusColor(pedido.status)};">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div>
                                <strong>${pedido.nome_plano || pedido.nomePlano || 'Serviço'}</strong>
                                <div style="font-size: 0.9rem; color: #6b7280;">
                                    ${pedido.cadeira || pedido.tema || 'Serviço'}
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: #1e40af;">
                                    ${pedido.preco ? pedido.preco.toLocaleString('pt-MZ') : '0'} MT
                                </div>
                                <span style="font-size: 0.8rem; padding: 0.2rem 0.5rem; border-radius: 3px; background: ${getStatusBackground(pedido.status)}; color: ${getStatusTextColor(pedido.status)};">
                                    ${pedido.status || 'pendente'}
                                </span>
                            </div>
                        </div>
                        <div style="font-size: 0.8rem; color: #9ca3af; margin-top: 0.5rem;">
                            ${pedido.data_pedido ? new Date(pedido.data_pedido).toLocaleDateString('pt-MZ') : 'Data não disponível'}
                        </div>
                    </div>
                `).join('');
            }
        }
    } else {
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

function getStatusBackground(status) {
    switch(status) {
        case 'pendente': return '#fef3c7';
        case 'pago': return '#d1fae5';
        case 'em_andamento': return '#dbeafe';
        case 'concluido': return '#ede9fe';
        case 'cancelado': return '#fee2e2';
        default: return '#f3f4f6';
    }
}

function getStatusTextColor(status) {
    switch(status) {
        case 'pendente': return '#92400e';
        case 'pago': return '#065f46';
        case 'em_andamento': return '#1e40af';
        case 'concluido': return '#5b21b6';
        case 'cancelado': return '#991b1b';
        default: return '#4b5563';
    }
}

// ===== CONTATO =====
async function enviarContato() {
    const nome = document.getElementById('contatoNome')?.value.trim() || '';
    const telefone = document.getElementById('contatoTelefone')?.value.trim() || '';
    const email = document.getElementById('contatoEmail')?.value.trim() || '';
    const mensagemTexto = document.getElementById('contatoMensagem')?.value.trim() || '';
    const mensagemDiv = document.getElementById('mensagemContato');
    
    if (!nome || !telefone || !mensagemTexto) {
        mostrarMensagem(mensagemDiv, 'Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    try {
        // Enviar mensagem para o servidor
        const response = await fetch(`${API_URL}/api/contato`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, email, mensagem: mensagemTexto })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarMensagem(mensagemDiv, data.mensagem || 'Mensagem enviada com sucesso! Entraremos em contacto em breve.', 'success');
            
            // Limpar formulário
            if (document.getElementById('contatoNome')) document.getElementById('contatoNome').value = '';
            if (document.getElementById('contatoTelefone')) document.getElementById('contatoTelefone').value = '';
            if (document.getElementById('contatoEmail')) document.getElementById('contatoEmail').value = '';
            if (document.getElementById('contatoMensagem')) document.getElementById('contatoMensagem').value = '';
        } else {
            mostrarMensagem(mensagemDiv, data.erro || 'Erro ao enviar mensagem. Tente novamente.', 'error');
        }
    } catch (error) {
        console.error("Erro ao enviar contato:", error);
        mostrarMensagem(mensagemDiv, 'Erro de conexão. Tente novamente.', 'error');
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
    } else if (tipo === 'error') {
        mensagemDiv.style.background = '#ef4444';
        mensagemDiv.style.color = 'white';
    } else if (tipo === 'info') {
        mensagemDiv.style.background = '#3b82f6';
        mensagemDiv.style.color = 'white';
    } else {
        mensagemDiv.style.background = '#6b7280';
        mensagemDiv.style.color = 'white';
    }
    
    mensagemDiv.textContent = texto;
    
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
        console.error("Erro ao verificar token:", error);
        return false;
    }
}

function inicializarApp() {
    // Verificar se há usuário logado
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    const tokenSalvo = localStorage.getItem('token_facilitaki');
    
    if (usuarioSalvo && tokenSalvo) {
        usuarioLogado = JSON.parse(usuarioSalvo);
        const btnHeader = document.getElementById('btnLoginHeader');
        if(btnHeader) {
            btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
            btnHeader.setAttribute('onclick', 'navegarPara(\'dashboard\')');
        }
        
        // Verificar se o token ainda é válido
        verificarToken().then(valido => {
            if (!valido) {
                fazerLogout();
            }
        });
    }
    
    // Carregar dados do localStorage (fallback)
    const pedidosSalvos = localStorage.getItem('pedidos_facilitaki');
    if (pedidosSalvos) {
        pedidos = JSON.parse(pedidosSalvos);
    }
    
    const usuariosSalvos = localStorage.getItem('usuarios_facilitaki');
    if (usuariosSalvos) {
        usuarios = JSON.parse(usuariosSalvos);
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
        .message {
            display: none;
            padding: 12px;
            margin: 10px 0;
            border-radius: 5px;
            font-size: 14px;
        }
        .message.success {
            background-color: #d1fae5;
            color: #065f46;
            border: 1px solid #10b981;
        }
        .message.error {
            background-color: #fee2e2;
            color: #991b1b;
            border: 1px solid #ef4444;
        }
        .message.info {
            background-color: #dbeafe;
            color: #1e40af;
            border: 1px solid #3b82f6;
        }
    `;
    document.head.appendChild(style);
}

// ===== INICIALIZAR QUANDO O DOCUMENTO CARREGAR =====
document.addEventListener('DOMContentLoaded', function() {
    inicializarApp();
    
    // Adicionar evento de envio para formulários
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
        });
    });
});

// ===== FUNÇÕES ADICIONAIS PARA MODAIS =====
function mostrarTermos() {
    alert('Termos de Serviço:\n\n1. O serviço só será iniciado após confirmação do pagamento.\n2. O prazo começa a contar após envio de todos os materiais necessários.\n3. Garantimos 99,9% de taxa de aprovação.\n4. Sua privacidade é respeitada conforme a lei.');
}

function mostrarPrivacidade() {
    alert('Política de Privacidade:\n\n1. Seus dados são usados apenas para processar seu pedido.\n2. Não compartilhamos suas informações com terceiros.\n3. Você pode solicitar exclusão de seus dados a qualquer momento.\n4. Usamos criptografia para proteger suas informações.');
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

// Exportar funções para uso global (se necessário)
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
window.solicitarServicoComDescricao = solicitarServicoComDescricao;
window.atualizarDashboard = atualizarDashboard;
window.enviarContato = enviarContato;
window.mostrarTermos = mostrarTermos;
window.mostrarPrivacidade = mostrarPrivacidade;
window.fecharRecarga = fecharRecarga;
window.processarRecarga = processarRecarga;
