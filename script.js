// script.js - Backend Integrado com PostgreSQL no Render

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
        } else if (sectionId === 'pagamento-sucesso' && carrinho.plano) {
            mostrarInstrucoesPagamento();
        }
    }
    window.scrollTo(0, 0);
}

// ===== GERENCIAMENTO DE USUÁRIOS (VIA API POSTGRESQL) =====

async function fazerLogin() {
    const telefone = document.getElementById('loginTelefone').value.trim();
    const senha = document.getElementById('loginSenha').value;
    const mensagem = document.getElementById('mensagemLogin');
    
    if (!telefone || !senha) {
        mostrarMensagem(mensagem, 'Preencha todos os campos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telefone, senha })
        });

        const data = await response.json();

        if (response.ok) {
            usuarioLogado = data.usuario;
            // Salva apenas o token e dados básicos para persistir a sessão localmente
            localStorage.setItem('usuarioLogado_facilitaki', JSON.stringify(data.usuario));
            localStorage.setItem('token_facilitaki', data.token);
            
            mostrarMensagem(mensagem, 'Login realizado com sucesso!', 'success');
            
            // Atualizar cabeçalho
            document.getElementById('btnLoginHeader').innerHTML = '<i class="fas fa-user"></i> Minha Conta';
            document.getElementById('btnLoginHeader').setAttribute('onclick', "navegarPara('dashboard')");
            
            setTimeout(() => navegarPara('dashboard'), 1500);
        } else {
            mostrarMensagem(mensagem, data.erro || 'Telefone ou senha incorretos', 'error');
        }
    } catch (error) {
        mostrarMensagem(mensagem, 'Erro ao conectar com o servidor', 'error');
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
        const response = await fetch('/api/cadastrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(mensagem, 'Cadastro realizado! Faça login para entrar.', 'success');
            setTimeout(() => mostrarLogin(), 2000);
        } else {
            mostrarMensagem(mensagem, data.erro || 'Erro ao cadastrar', 'error');
        }
    } catch (error) {
        mostrarMensagem(mensagem, 'Erro ao conectar com o servidor', 'error');
    }
}

function mostrarCadastro() {
    document.getElementById('formLogin').style.display = 'none';
    document.getElementById('formCadastro').style.display = 'block';
}

function mostrarLogin() {
    document.getElementById('formCadastro').style.display = 'none';
    document.getElementById('formLogin').style.display = 'block';
}

function fazerLogout() {
    usuarioLogado = null;
    localStorage.removeItem('usuarioLogado_facilitaki');
    localStorage.removeItem('token_facilitaki');
    
    document.getElementById('btnLoginHeader').innerHTML = '<i class="fas fa-user"></i> Área do Cliente';
    document.getElementById('btnLoginHeader').setAttribute('onclick', "navegarPara('login')");
    
    navegarPara('home');
}

// ===== DASHBOARD E PEDIDOS =====

function atualizarDashboard() {
    if (!usuarioLogado) return;
    
    const nomeDisplay = document.getElementById('nomeUsuarioDashboard');
    if(nomeDisplay) nomeDisplay.textContent = usuarioLogado.nome;

    // Nota: Em um sistema real, aqui você faria um fetch('/api/meus-pedidos')
    // Por enquanto, mostraremos os pedidos que estão no objeto usuarioLogado
    const listaPedidosDiv = document.getElementById('listaPedidos');
    const pedidos = usuarioLogado.pedidos || [];
    
    if (pedidos.length === 0) {
        listaPedidosDiv.innerHTML = '<p style="text-align: center; color: #6b7280;">Ainda não tens pedidos.</p>';
    } else {
        // Renderiza pedidos (lógica de cores mantida)
        listaPedidosDiv.innerHTML = pedidos.map(p => `
            <div style="background: #fff; padding: 1rem; border-radius: 8px; margin-bottom: 10px; border-left: 5px solid #1e40af;">
                <strong>${p.nomePlano}</strong> - ${p.preco} MT<br>
                <small>Status: ${p.status}</small>
            </div>
        `).join('');
    }
}

// ===== MENSAGENS E AUXILIARES =====

function mostrarMensagem(elemento, texto, tipo) {
    if(!elemento) return;
    elemento.textContent = texto;
    elemento.className = `message ${tipo}`;
    elemento.style.display = 'block';
    setTimeout(() => { elemento.style.display = 'none'; }, 5000);
}

function mostrarMensagemGlobal(texto, tipo) {
    const div = document.createElement('div');
    div.className = `message ${tipo}`;
    div.style.cssText = "position:fixed; top:20px; right:20px; z-index:9999; padding:15px; border-radius:5px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,0.2);";
    div.textContent = texto;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// ===== INICIALIZAÇÃO =====

function inicializarApp() {
    const usuarioSalvo = localStorage.getItem('usuarioLogado_facilitaki');
    if (usuarioSalvo) {
        usuarioLogado = JSON.parse(usuarioSalvo);
        document.getElementById('btnLoginHeader').innerHTML = '<i class="fas fa-user"></i> Minha Conta';
        document.getElementById('btnLoginHeader').setAttribute('onclick', "navegarPara('dashboard')");
    }

    // Configura máscaras e eventos de formulário
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (e) => e.preventDefault());
    });
}

document.addEventListener('DOMContentLoaded', inicializarApp);
