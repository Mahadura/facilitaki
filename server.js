// server.js - Backend completo para Facilitaki com autenticação admin segura
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configurações do servidor
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2025';

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db',
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Configurar CORS
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
};

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado'));
        }
    }
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// Middleware para log
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// Middleware de autenticação JWT para usuários comuns
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware de autenticação ADMIN
const authenticateAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        if (req.accepts('html')) {
            return res.redirect('/admin/login');
        }
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            if (req.accepts('html')) {
                return res.redirect('/admin/login');
            }
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        
        if (!decoded.isAdmin) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        
        req.admin = decoded;
        next();
    });
};

// Testar conexão com banco
async function testarConexaoBD() {
    try {
        console.log('🔍 Testando conexão com banco...');
        const client = await pool.connect();
        console.log('✅ Conexão com banco OK');
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Erro no banco:', error.message);
        return false;
    }
}

// Inicializar banco
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                admin_created_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela usuarios OK');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                instituicao VARCHAR(100),
                curso VARCHAR(100),
                cadeira VARCHAR(100),
                tema TEXT,
                descricao TEXT,
                prazo DATE,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela pedidos OK');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela contatos OK');

        return true;
    } catch (error) {
        console.error('❌ Erro no banco:', error.message);
        return false;
    }
}

function validarData(dataString) {
    if (!dataString || dataString.trim() === '') return null;
    try {
        const data = new Date(dataString);
        return isNaN(data.getTime()) ? null : data.toISOString().split('T')[0];
    } catch {
        return null;
    }
}

// ===== ROTAS DE STATUS =====
app.get('/status', (req, res) => {
    res.json({ status: 'online', message: 'API funcionando', timestamp: new Date().toISOString() });
});

app.get('/api/teste-banco', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as hora');
        res.json({ success: true, hora: result.rows[0].hora });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTAS ADMIN AUTH =====
app.get('/api/admin/check', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        res.json({ success: true, existeAdmin: parseInt(result.rows[0].count) > 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/setup', async (req, res) => {
    try {
        const { usuario, senha, codigo } = req.body;
        
        if (codigo !== 'FACILITAKI_ADMIN_2025') {
            return res.status(401).json({ success: false, error: 'Código inválido' });
        }
        
        const adminExistente = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminExistente.rows[0].count) > 0) {
            return res.status(400).json({ success: false, error: 'Admin já existe' });
        }
        
        const usuarioExistente = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Usuário já existe' });
        }
        
        const senhaHash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin, admin_created_at) VALUES ($1, $2, $3, true, NOW()) RETURNING id, nome',
            [usuario, 'admin@facilitaki.com', senhaHash]
        );
        
        res.json({ success: true, message: 'Admin criado!', admin: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const admin = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, admin.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const token = jwt.sign(
            { id: admin.id, nome: admin.nome, isAdmin: true },
            SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        res.json({ success: true, token, admin: { id: admin.id, nome: admin.nome } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/verificar', authenticateAdminToken, (req, res) => {
    res.json({ valid: true, admin: req.admin });
});

app.post('/api/admin/logout', authenticateAdminToken, (req, res) => {
    res.json({ success: true });
});

// ===== PÁGINAS ADMIN =====

// Rota principal de login admin - CORRIGIDA
app.get('/admin/login', (req, res) => {
    console.log('🎯 Acessando página de login admin');
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login Admin - Facilitaki</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .login-container {
                    background: white;
                    border-radius: 20px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                    width: 100%;
                    max-width: 450px;
                    padding: 40px;
                    animation: fadeInUp 0.6s ease-out;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .login-header { text-align: center; margin-bottom: 30px; }
                .login-header i { font-size: 60px; color: #667eea; margin-bottom: 15px; }
                .login-header h1 { color: #333; font-size: 28px; margin-bottom: 10px; }
                .login-header p { color: #666; font-size: 14px; }
                .form-group { margin-bottom: 20px; }
                .form-group label { display: block; margin-bottom: 8px; color: #555; font-weight: 600; }
                .form-group input {
                    width: 100%;
                    padding: 12px 15px;
                    border: 2px solid #e1e5e9;
                    border-radius: 10px;
                    font-size: 16px;
                    transition: all 0.3s ease;
                }
                .form-group input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
                }
                .btn-login {
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-top: 10px;
                }
                .btn-login:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102,126,234,0.3); }
                .message {
                    margin-top: 20px;
                    padding: 12px;
                    border-radius: 8px;
                    text-align: center;
                    font-size: 14px;
                    display: none;
                }
                .message.error { display: block; background: #fee; color: #c33; border: 1px solid #fcc; }
                .message.success { display: block; background: #efe; color: #3c3; border: 1px solid #cfc; }
                .setup-info {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e1e5e9;
                    text-align: center;
                    font-size: 12px;
                    color: #999;
                }
                .setup-info a { color: #667eea; text-decoration: none; cursor: pointer; }
                .setup-info a:hover { text-decoration: underline; }
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                }
                .modal-container {
                    background: white;
                    border-radius: 20px;
                    max-width: 450px;
                    width: 90%;
                    padding: 30px;
                }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-header">
                    <i class="fas fa-shield-alt"></i>
                    <h1>Painel Administrativo</h1>
                    <p>Facilitaki - Área Restrita</p>
                </div>
                <form id="loginForm" onsubmit="event.preventDefault(); fazerLogin();">
                    <div class="form-group">
                        <label><i class="fas fa-user"></i> Usuário</label>
                        <input type="text" id="usuario" placeholder="Digite seu usuário" required>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-lock"></i> Senha</label>
                        <input type="password" id="senha" placeholder="Digite sua senha" required>
                    </div>
                    <button type="submit" class="btn-login" id="btnLogin">
                        <i class="fas fa-sign-in-alt"></i> Entrar
                    </button>
                </form>
                <div id="message" class="message"></div>
                <div class="setup-info">
                    <i class="fas fa-info-circle"></i> 
                    <a onclick="mostrarSetup()">Criar primeiro administrador</a>
                </div>
            </div>

            <script>
                const API_URL = window.location.origin;
                
                async function fazerLogin() {
                    const usuario = document.getElementById('usuario').value.trim();
                    const senha = document.getElementById('senha').value;
                    const btnLogin = document.getElementById('btnLogin');
                    const messageDiv = document.getElementById('message');
                    
                    if (!usuario || !senha) {
                        showMessage('Preencha usuário e senha', 'error');
                        return;
                    }
                    
                    btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
                    btnLogin.disabled = true;
                    
                    try {
                        const response = await fetch(API_URL + '/api/admin/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usuario, senha })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            localStorage.setItem('admin_token_facilitaki', data.token);
                            localStorage.setItem('admin_dados', JSON.stringify(data.admin));
                            showMessage('Login realizado! Redirecionando...', 'success');
                            setTimeout(() => { window.location.href = '/admin/painel'; }, 1500);
                        } else {
                            showMessage(data.error || 'Erro ao fazer login', 'error');
                            btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
                            btnLogin.disabled = false;
                        }
                    } catch (error) {
                        showMessage('Erro de conexão', 'error');
                        btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
                        btnLogin.disabled = false;
                    }
                }
                
                function showMessage(text, type) {
                    const messageDiv = document.getElementById('message');
                    messageDiv.textContent = text;
                    messageDiv.className = 'message ' + type;
                    setTimeout(() => { messageDiv.style.display = 'none'; }, 5000);
                }
                
                function mostrarSetup() {
                    const modalHtml = \`
                        <div id="setupModal" class="modal-overlay">
                            <div class="modal-container">
                                <h3 style="margin-bottom: 20px;"><i class="fas fa-user-shield"></i> Criar Administrador</h3>
                                <p style="margin-bottom: 20px; color: #666; font-size: 14px;">Crie o primeiro acesso administrativo (apenas uma vez).</p>
                                <div class="form-group">
                                    <label>Usuário</label>
                                    <input type="text" id="setupUsuario" placeholder="Ex: admin">
                                </div>
                                <div class="form-group">
                                    <label>Senha</label>
                                    <input type="password" id="setupSenha" placeholder="Mínimo 6 caracteres">
                                </div>
                                <div class="form-group">
                                    <label>Confirmar Senha</label>
                                    <input type="password" id="setupSenhaConfirm" placeholder="Repita a senha">
                                </div>
                                <div class="form-group">
                                    <label>Código de Segurança</label>
                                    <input type="password" id="setupCodigo" placeholder="Código de segurança">
                                    <small style="color: #999; font-size: 11px;">Código: FACILITAKI_ADMIN_2025</small>
                                </div>
                                <button onclick="criarAdmin()" class="btn-login" style="margin-top: 10px;">
                                    <i class="fas fa-check"></i> Criar Admin
                                </button>
                                <button onclick="fecharModal()" style="margin-top: 10px; width: 100%; padding: 12px; background: #f5f5f5; border: none; border-radius: 10px; cursor: pointer;">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    \`;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                }
                
                async function criarAdmin() {
                    const usuario = document.getElementById('setupUsuario').value.trim();
                    const senha = document.getElementById('setupSenha').value;
                    const senhaConfirm = document.getElementById('setupSenhaConfirm').value;
                    const codigo = document.getElementById('setupCodigo').value;
                    
                    if (!usuario || !senha || !senhaConfirm || !codigo) {
                        alert('Preencha todos os campos');
                        return;
                    }
                    if (senha !== senhaConfirm) {
                        alert('As senhas não coincidem');
                        return;
                    }
                    if (senha.length < 6) {
                        alert('A senha deve ter pelo menos 6 caracteres');
                        return;
                    }
                    
                    try {
                        const response = await fetch(API_URL + '/api/admin/setup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usuario, senha, codigo })
                        });
                        const data = await response.json();
                        if (data.success) {
                            alert('Admin criado com sucesso! Agora faça login.');
                            fecharModal();
                        } else {
                            alert(data.error || 'Erro ao criar admin');
                        }
                    } catch (error) {
                        alert('Erro de conexão');
                    }
                }
                
                function fecharModal() {
                    const modal = document.getElementById('setupModal');
                    if (modal) modal.remove();
                }
                
                // Verificar token existente
                const token = localStorage.getItem('admin_token_facilitaki');
                if (token) {
                    fetch(API_URL + '/api/admin/verificar', {
                        headers: { 'Authorization': 'Bearer ' + token }
                    }).then(r => r.json()).then(data => {
                        if (data.valid) window.location.href = '/admin/painel';
                    });
                }
            </script>
        </body>
        </html>
    `);
});

// Rota admin painel (protegida)
app.get('/admin/painel', authenticateAdminToken, async (req, res) => {
    try {
        const pedidosResult = await pool.query(`
            SELECT p.*, u.nome as usuario_nome 
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);
        
        const contatosResult = await pool.query(`SELECT * FROM contatos ORDER BY data_envio DESC`);
        const usuariosResult = await pool.query(`
            SELECT id, nome, telefone, created_at, is_admin,
                   (SELECT COUNT(*) FROM pedidos WHERE usuario_id = usuarios.id) as total_pedidos
            FROM usuarios ORDER BY created_at DESC
        `);
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Painel Admin - Facilitaki</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; }
                    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
                    header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
                    .stat-card { background: white; padding: 20px; border-radius: 10px; flex: 1; min-width: 200px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
                    .tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                    .tab { padding: 12px 24px; background: #e0e0e0; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
                    .tab.active { background: #667eea; color: white; }
                    .tab-content { display: none; background: white; padding: 20px; border-radius: 10px; overflow-x: auto; }
                    .tab-content.active { display: block; }
                    table { width: 100%; border-collapse: collapse; min-width: 600px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #f8f9fa; }
                    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
                    .status-pendente { background: #fef3c7; color: #92400e; }
                    .status-pago { background: #d1fae5; color: #065f46; }
                    .btn { padding: 6px 12px; border: none; border-radius: 5px; cursor: pointer; margin: 2px; }
                    .btn-view { background: #3498db; color: white; }
                    .btn-delete { background: #e74c3c; color: white; }
                    .btn-update { background: #2ecc71; color: white; }
                    .btn-logout { background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; }
                    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
                    .modal-content { background: white; padding: 20px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; }
                </style>
            </head>
            <body>
                <div class="container">
                    <header>
                        <div><h1><i class="fas fa-shield-alt"></i> Painel Administrativo</h1><p>Bem-vindo, ${req.admin.nome}</p></div>
                        <button class="btn-logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Sair</button>
                    </header>
                    <div class="stats">
                        <div class="stat-card"><div class="stat-number">${pedidosResult.rows.length}</div><div>Total Pedidos</div></div>
                        <div class="stat-card"><div class="stat-number">${pedidosResult.rows.filter(p => p.status === 'pendente').length}</div><div>Pendentes</div></div>
                        <div class="stat-card"><div class="stat-number">${usuariosResult.rows.length}</div><div>Usuários</div></div>
                        <div class="stat-card"><div class="stat-number">${contatosResult.rows.length}</div><div>Contatos</div></div>
                    </div>
                    <div class="tabs">
                        <button class="tab active" onclick="showTab('pedidos')">📋 Pedidos</button>
                        <button class="tab" onclick="showTab('usuarios')">👥 Usuários</button>
                        <button class="tab" onclick="showTab('contatos')">💬 Contatos</button>
                    </div>
                    <div id="tab-pedidos" class="tab-content active">
                        <table><thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                        <tbody>${pedidosResult.rows.map(p => `
                            <tr>
                                <td>${p.id}</td>
                                <td>${p.cliente}<br><small>${p.telefone}</small></td>
                                <td>${p.nome_plano}</td>
                                <td>${parseFloat(p.preco).toLocaleString('pt-MZ')} MT</td>
                                <td><span class="status status-${p.status}">${p.status}</span></td>
                                <td>${new Date(p.data_pedido).toLocaleDateString('pt-MZ')}</td>
                                <td>
                                    <button class="btn btn-view" onclick="viewPedido(${p.id})">👁️</button>
                                    <button class="btn btn-update" onclick="updateStatus(${p.id})">✏️</button>
                                    <button class="btn btn-delete" onclick="deletePedido(${p.id})">🗑️</button>
                                </td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <div id="tab-usuarios" class="tab-content">
                        <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Admin</th><th>Cadastro</th><th>Pedidos</th><th>Ações</th></tr></thead>
                        <tbody>${usuariosResult.rows.map(u => `
                            <tr>
                                <td>${u.id}</td>
                                <td>${u.nome}${u.is_admin ? ' ⭐' : ''}</td>
                                <td>${u.telefone}</td>
                                <td>${u.is_admin ? 'Sim' : 'Não'}</td>
                                <td>${new Date(u.created_at).toLocaleDateString('pt-MZ')}</td>
                                <td>${u.total_pedidos}</td>
                                <td>${!u.is_admin ? `<button class="btn btn-delete" onclick="deleteUsuario(${u.id})">🗑️</button>` : ''}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <div id="tab-contatos" class="tab-content">
                        <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                        <tbody>${contatosResult.rows.map(c => `
                            <tr>
                                <td>${c.id}</td>
                                <td>${c.nome}</td>
                                <td>${c.telefone}</td>
                                <td>${c.mensagem.substring(0, 50)}${c.mensagem.length > 50 ? '...' : ''}</td>
                                <td>${new Date(c.data_envio).toLocaleDateString('pt-MZ')}</td>
                                <td><button class="btn btn-view" onclick="viewContato(${c.id})">👁️</button>
                                    <button class="btn btn-delete" onclick="deleteContato(${c.id})">🗑️</button></td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                </div>
                <div id="modal" class="modal"><div class="modal-content"><div id="modal-body"></div><button onclick="closeModal()" style="margin-top:20px; padding:8px 16px;">Fechar</button></div></div>
                <script>
                    const TOKEN = localStorage.getItem('admin_token_facilitaki');
                    if (!TOKEN) window.location.href = '/admin/login';
                    
                    async function apiRequest(url, options={}) {
                        const res = await fetch(url, {...options, headers:{'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}});
                        if(res.status===401) window.location.href='/admin/login';
                        return res.json();
                    }
                    function showTab(name){ document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active')); event.target.classList.add('active'); document.getElementById('tab-'+name).classList.add('active'); }
                    async function viewPedido(id){ const data=await apiRequest('/api/admin/pedido/'+id); if(data.success) document.getElementById('modal-body').innerHTML='<h3>Pedido #'+data.pedido.id+'</h3><p><strong>Cliente:</strong> '+data.pedido.cliente+'</p><p><strong>Telefone:</strong> '+data.pedido.telefone+'</p><p><strong>Serviço:</strong> '+data.pedido.nome_plano+'</p><p><strong>Valor:</strong> '+parseFloat(data.pedido.preco).toLocaleString('pt-MZ')+' MT</p><p><strong>Status:</strong> '+data.pedido.status+'</p><p><strong>Descrição:</strong> '+(data.pedido.descricao||data.pedido.tema||'Nenhuma')+'</p>'; document.getElementById('modal').style.display='flex'; }
                    async function updateStatus(id){ const s=prompt('Novo status (pendente, pago, em_andamento, concluido):'); if(s){ const data=await apiRequest('/api/admin/pedido/'+id+'/status',{method:'PUT',body:JSON.stringify({status:s})}); if(data.success) location.reload(); } }
                    async function deletePedido(id){ if(confirm('Excluir?')){ const data=await apiRequest('/api/admin/pedido/'+id,{method:'DELETE'}); if(data.success) location.reload(); } }
                    async function deleteUsuario(id){ if(confirm('Excluir usuário e seus pedidos?')){ const data=await apiRequest('/api/admin/usuario/'+id,{method:'DELETE'}); if(data.success) location.reload(); } }
                    async function viewContato(id){ const data=await apiRequest('/api/admin/contato/'+id); if(data.success) document.getElementById('modal-body').innerHTML='<h3>Contato #'+data.contato.id+'</h3><p><strong>Nome:</strong> '+data.contato.nome+'</p><p><strong>Telefone:</strong> '+data.contato.telefone+'</p><p><strong>Mensagem:</strong></p><p>'+data.contato.mensagem+'</p>'; document.getElementById('modal').style.display='flex'; }
                    async function deleteContato(id){ if(confirm('Excluir contato?')){ const data=await apiRequest('/api/admin/contato/'+id,{method:'DELETE'}); if(data.success) location.reload(); } }
                    function closeModal(){ document.getElementById('modal').style.display='none'; }
                    async function logout(){ await apiRequest('/api/admin/logout',{method:'POST'}); localStorage.removeItem('admin_token_facilitaki'); localStorage.removeItem('admin_dados'); window.location.href='/admin/login'; }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

// ===== ROTAS ADMIN API =====
app.get('/api/admin/pedido/:id', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/pedido/:id/status', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, req.params.id]);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/pedido/:id', authenticateAdminToken, async (req, res) => {
    try {
        const pedido = await pool.query('SELECT arquivo_path FROM pedidos WHERE id = $1', [req.params.id]);
        if (pedido.rows[0]?.arquivo_path && fs.existsSync(pedido.rows[0].arquivo_path)) {
            fs.unlinkSync(pedido.rows[0].arquivo_path);
        }
        await pool.query('DELETE FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/usuario/:id', authenticateAdminToken, async (req, res) => {
    try {
        const arquivos = await pool.query('SELECT arquivo_path FROM pedidos WHERE usuario_id = $1', [req.params.id]);
        arquivos.rows.forEach(row => { if (row.arquivo_path && fs.existsSync(row.arquivo_path)) fs.unlinkSync(row.arquivo_path); });
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/contato/:id', authenticateAdminToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/contato/:id', authenticateAdminToken, async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTAS PARA USUÁRIOS COMUNS =====
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const token = jwt.sign({ id: usuario.id, telefone: usuario.telefone, nome: usuario.nome }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: { id: usuario.id, nome: usuario.nome, telefone: usuario.telefone } });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const existing = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (existing.rows.length > 0) return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        
        const senhaHash = await bcrypt.hash(senha, 10);
        const result = await pool.query('INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone', [nome, telefone, senhaHash]);
        const token = jwt.sign({ id: result.rows[0].id, telefone, nome }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true });
});

app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento } = req.body;
        const prazoValidado = validarData(prazo);
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
            [req.user.id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazoValidado, plano, nomePlano, preco, metodoPagamento, req.file?.path]
        );
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC', [req.user.id]);
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefone, mensagem]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Redirecionar /admin para /admin/login
app.get('/admin', (req, res) => {
    res.redirect('/admin/login');
});

app.get('/admin/', (req, res) => {
    res.redirect('/admin/login');
});

// Iniciar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor...');
        await testarConexaoBD();
        await initDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Servidor rodando na porta ${PORT}`);
            console.log(`🌐 Site: http://localhost:${PORT}`);
            console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
            console.log(`📊 Status: http://localhost:${PORT}/status`);
        });
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

startServer();
