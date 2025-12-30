// script.js - INTEGRADO: Funcionalidades Comerciais + Banco de Dados Render

// ===== VARIÁVEIS GLOBAIS =====
let usuarioLogado = null;
let carrinho = {
    plano: null,
    preco: 0,
    metodoPagamento: null
};

// ===== NAVEGAÇÃO =====
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
            atualizarDashboard();
        }
    }
    window.scrollTo(0, 0);
}

// ===== FUNCIONALIDADES COMERCIAIS (PLANOS E PAGAMENTOS) =====

function selecionarPlano(nome, preco) {
    carrinho.plano = nome;
    carrinho.preco = preco;
    
    const resumo = document.getElementById('resumoPedido');
    if (resumo) {
        resumo.innerHTML = `
            <div style="background: #f1f5f9; padding: 1.5rem; border-radius: 12px; border-left: 5px solid #1e40af;">
                <h4 style="color: #1e40af; margin-bottom: 0.5rem;">Resumo do Pedido</h4>
                <p><strong>Serviço:</strong> ${nome}</p>
                <p><strong>Valor:</strong> ${preco} MT</p>
            </div>
        `;
    }
    navegarPara('pagamento');
}

function selecionarMetodo(metodo) {
    carrinho.metodoPagamento = metodo;
    
    // Visual feedback para os cartões de método
    document.querySelectorAll('.metodo-card').forEach(card => {
        card.style.borderColor = '#e2e8f0';
        card.style.background = 'white';
    });
    
    const cardSelecionado = event.currentTarget;
    cardSelecionado.style.borderColor = '#1e40af';
    cardSelecionado.style.background = '#eff6ff';
    
    document.getElementById('btnFinalizarPagamento').disabled = false;
}

function finalizarPagamento() {
    if (!usuarioLogado) {
        alert("Por favor, faça login ou cadastre-se para finalizar o seu pedido.");
        navegarPara('login');
        return;
    }
    navegarPara('pagamento-sucesso');
}

// ===== GESTÃO DE USUÁRIO (API POSTGRESQL) =====

async function fazerLogin() {
    const telefone = document.getElementById('loginTelefone').value.trim();
    const senha = document.getElementById('loginSenha').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, senha })
        });

        const data = await response.json();

        if (response.ok) {
            usuarioLogado = data.usuario;
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            // Atualizar UI do Header
            document.getElementById('btnLoginHeader').innerHTML = '<i class="fas fa-user"></i> Minha Conta';
            document.getElementById('btnLoginHeader').setAttribute('onclick', "navegarPara('dashboard')");
            
            navegarPara('dashboard');
        } else {
            alert(data.erro || 'Telefone ou senha incorretos');
        }
    } catch (error) {
        alert('Erro ao conectar com o servidor. Verifique sua conexão.');
    }
}

async function fazerCadastro() {
    const nome = document.getElementById('cadastroNome').value.trim();
    const telefone = document.getElementById('cadastroTelefone').value.trim();
    const senha = document.getElementById('cadastroSenha').value;
    const confirmarSenha = document.getElementById('cadastroSenhaConfirm').value;
    
    if (senha !== confirmarSenha) {
        alert('As senhas não coincidem!');
        return;
    }

    try {
        const response = await fetch('/api/cadastrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });

        if (response.ok) {
            alert('Cadastro realizado com sucesso! Agora você pode fazer login.');
            mostrarLogin();
        } else {
            const data = await response.json();
            alert(data.erro || 'Erro ao realizar cadastro.');
        }
    } catch (error) {
        alert('Erro ao conectar com o servidor.');
    }
}

// ===== AUXILIARES DE INTERFACE =====

function mostrarCadastro() {
    document.getElementById('formLogin').style.display = 'none';
    document.getElementById('formCadastro').style.display = 'block';
}

function mostrarLogin() {
    document.getElementById('formCadastro').style.display = 'none';
    document.getElementById('formLogin').style.display = 'block';
}

function atualizarDashboard() {
    if (!usuarioLogado) return;
    document.getElementById('nomeUsuarioDashboard').textContent = usuarioLogado.nome;
}

function inicializarApp() {
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    if (usuarioSalvo) {
        usuarioLogado = JSON.parse(usuarioSalvo);
        document.getElementById('btnLoginHeader').innerHTML = '<i class="fas fa-user"></i> Minha Conta';
        document.getElementById('btnLoginHeader').setAttribute('onclick', "navegarPara('dashboard')");
    }

    // Prevenir recarregamento em todos os forms
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => e.preventDefault());
    });
}

document.addEventListener('DOMContentLoaded', inicializarApp);
