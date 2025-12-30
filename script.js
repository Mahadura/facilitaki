// script.js - Versão Integrada e Funcional

// ===== VARIÁVEIS GLOBAIS =====
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado_facilitaki')) || null;
let carrinho = { plano: null, preco: 0, metodoPagamento: null };

// ===== NAVEGAÇÃO =====
function navegarPara(sectionId) {
    // Remove a classe active de todas as seções e links
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    
    const target = document.getElementById(sectionId);
    if (target) {
        target.classList.add('active');
        
        // Atualiza o link na navegação
        const navLink = document.querySelector(`[onclick*="${sectionId}"]`);
        if (navLink) navLink.classList.add('active');
        
        if (sectionId === 'dashboard') atualizarDashboard();
    }
    window.scrollTo(0, 0);
}

// ===== FUNÇÕES DE SERVIÇO (BOTÕES DOS CARDS) =====
function selecionarPlano(nome, preco) {
    console.log("Selecionado:", nome, preco);
    carrinho.plano = nome;
    carrinho.preco = preco;
    
    const resumo = document.getElementById('resumoPedido');
    if (resumo) {
        resumo.innerHTML = `
            <div style="background:#f1f5f9; padding:1rem; border-radius:8px; border-left:4px solid #1e40af;">
                <strong>Plano:</strong> ${nome}<br>
                <strong>Preço:</strong> ${preco} MT
            </div>`;
    }
    navegarPara('pagamento');
}

// ===== AUTENTICAÇÃO (API POSTGRESQL RENDER) =====
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
            location.reload(); // Recarrega para atualizar o header
        } else {
            alert(data.error || "Telefone ou senha incorretos");
        }
    } catch (error) {
        alert("Erro ao conectar com o servidor.");
    }
}

async function fazerCadastro() {
    const nome = document.getElementById('cadastroNome').value.trim();
    const telefone = document.getElementById('cadastroTelefone').value.trim();
    const senha = document.getElementById('cadastroSenha').value;
    
    if (senha !== document.getElementById('cadastroSenhaConfirm').value) {
        alert("As senhas não coincidem!");
        return;
    }

    try {
        const response = await fetch('/api/cadastrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, telefone, senha })
        });

        if (response.ok) {
            alert("Cadastro realizado com sucesso! Faça login.");
            mostrarLogin();
        } else {
            const data = await response.json();
            alert(data.erro || "Erro ao cadastrar");
        }
    } catch (error) {
        alert("Erro de conexão.");
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
    if (usuarioLogado) {
        document.getElementById('nomeUsuarioDashboard').textContent = usuarioLogado.nome;
    }
}

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
    if (usuarioLogado) {
        const btnHeader = document.getElementById('btnLoginHeader');
        if (btnHeader) {
            btnHeader.innerHTML = '<i class="fas fa-user"></i> Minha Conta';
            btnHeader.onclick = () => navegarPara('dashboard');
        }
    }

    // Previne recarregamento de página em formulários
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', e => e.preventDefault());
    });
});
