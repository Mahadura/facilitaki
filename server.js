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

// Configurar CORS mais permissivo
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
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Use PDF, DOC, DOCX, TXT, JPG, PNG.'));
        }
    }
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos estáticos
app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    if (req.body && Object.keys(req.body).length > 0 && req.method !== 'GET') {
        console.log('📦 Body:', JSON.stringify(req.body).substring(0, 500));
    }
    next();
});

// Middleware de autenticação JWT para usuários comuns
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('❌ Token não fornecido');
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.log('❌ Token inválido:', err.message);
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware de autenticação ADMIN (via token JWT)
const authenticateAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        // Se não tiver token, redirecionar para login se for HTML
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
            return res.status(403).json({ success: false, error: 'Acesso negado. Você não é administrador.' });
        }
        
        req.admin = decoded;
        next();
    });
};

// Testar conexão com banco de dados
async function testarConexaoBD() {
    try {
        console.log('🔍 Testando conexão com banco de dados...');
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as hora_atual, version() as versao');
        console.log('✅ Conexão com banco OK');
        console.log('⏰ Hora do banco:', result.rows[0].hora_atual);
        client.release();
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar no banco:', error.message);
        return false;
    }
}

// Inicializar banco de dados
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        // Testar conexão primeiro
        const conexaoOk = await testarConexaoBD();
        if (!conexaoOk) {
            throw new Error('Falha na conexão com o banco de dados');
        }
        
        // Criar tabela de usuários com coluna is_admin
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
        console.log('✅ Tabela usuarios criada/verificada');

        // Criar tabela de pedidos
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
        console.log('✅ Tabela pedidos criada/verificada');

        // Criar tabela de contatos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela contatos criada/verificada');

        console.log('✅ Banco de dados inicializado com sucesso!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error.message);
        return false;
    }
}

// Função para validar e converter data
function validarData(dataString) {
    if (!dataString || dataString.trim() === '' || dataString === 'null' || dataString === 'undefined') {
        return null;
    }
    
    try {
        const data = new Date(dataString);
        if (isNaN(data.getTime())) {
            return null;
        }
        return data.toISOString().split('T')[0];
    } catch (error) {
        console.log('❌ Erro ao converter data:', dataString, error.message);
        return null;
    }
}

// ===== ROTAS DA API =====

// Rota de status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'Facilitaki API está funcionando',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'PostgreSQL'
    });
});

// Rota de teste de banco de dados
app.get('/api/teste-banco', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as hora, version() as versao');
        res.json({
            success: true,
            hora: result.rows[0].hora,
            versao: result.rows[0].versao
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro ao conectar no banco: ' + error.message
        });
    }
});

// ===== ROTAS DE AUTENTICAÇÃO ADMIN =====

// Rota para verificar se existe admin
app.get('/api/admin/check', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        const existeAdmin = parseInt(result.rows[0].count) > 0;
        res.json({ 
            success: true, 
            existeAdmin: existeAdmin,
            message: existeAdmin ? 'Admin já cadastrado' : 'Nenhum admin cadastrado'
        });
    } catch (error) {
        console.error('Erro ao verificar admin:', error);
        res.status(500).json({ success: false, error: 'Erro ao verificar admin' });
    }
});

// Rota para criar primeiro admin (apenas uma vez)
app.post('/api/admin/setup', async (req, res) => {
    try {
        const { usuario, senha, codigo } = req.body;
        
        // Verificar código de segurança
        if (codigo !== 'FACILITAKI_ADMIN_2025') {
            return res.status(401).json({ 
                success: false, 
                error: 'Código de segurança inválido' 
            });
        }
        
        // Verificar se já existe algum admin
        const adminExistente = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminExistente.rows[0].count) > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Já existe um administrador cadastrado' 
            });
        }
        
        // Verificar se usuário já existe
        const usuarioExistente = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (usuarioExistente.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Este nome de usuário já está em uso' 
            });
        }
        
        // Hash da senha
        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);
        
        // Criar admin
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin, admin_created_at) VALUES ($1, $2, $3, true, NOW()) RETURNING id, nome',
            [usuario, 'admin@facilitaki.com', senhaHash]
        );
        
        console.log('✅ Admin criado com sucesso:', result.rows[0]);
        
        res.json({ 
            success: true, 
            message: 'Administrador criado com sucesso!',
            admin: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({ success: false, error: 'Erro ao criar administrador' });
    }
});

// Rota de login do administrador
app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        if (!usuario || !senha) {
            return res.status(400).json({ 
                success: false, 
                error: 'Usuário e senha são obrigatórios' 
            });
        }
        
        // Buscar usuário admin
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true',
            [usuario]
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Admin não encontrado:', usuario);
            return res.status(401).json({ 
                success: false, 
                error: 'Usuário ou senha incorretos' 
            });
        }
        
        const admin = result.rows[0];
        
        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, admin.senha_hash);
        if (!senhaValida) {
            console.log('❌ Senha incorreta para admin:', usuario);
            return res.status(401).json({ 
                success: false, 
                error: 'Usuário ou senha incorretos' 
            });
        }
        
        // Gerar token JWT para admin
        const token = jwt.sign(
            { 
                id: admin.id, 
                nome: admin.nome, 
                isAdmin: true,
                tipo: 'admin'
            },
            SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        console.log('✅ Login admin bem-sucedido:', admin.nome);
        
        res.json({
            success: true,
            mensagem: 'Login realizado com sucesso!',
            token: token,
            admin: {
                id: admin.id,
                nome: admin.nome
            }
        });
        
    } catch (error) {
        console.error('❌ Erro no login admin:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno do servidor' 
        });
    }
});

// Rota para verificar token admin
app.get('/api/admin/verificar', authenticateAdminToken, (req, res) => {
    res.json({ valid: true, admin: req.admin });
});

// Rota de logout admin
app.post('/api/admin/logout', authenticateAdminToken, (req, res) => {
    res.json({ success: true, mensagem: 'Logout realizado com sucesso' });
});

// ===== PÁGINAS ADMIN =====

// Página de login do admin
app.get('/admin/login', (req, res) => {
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
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
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
                .form-group label { display: block; margin-bottom: 8px; color: #555; font-weight: 600; font-size: 14px; }
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
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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
                .btn-login:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); }
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
                .setup-info a { color: #667eea; text-decoration: none; }
                .setup-info a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="login-container">
                <div class="login-header">
                    <i class="fas fa-shield-alt"></i>
                    <h1>Painel Administrativo</h1>
                    <p>Facilitaki - Área Restrita</p>
                </div>
                <form id="loginForm" onsubmit="event.preventDefault(); fazerLoginAdmin();">
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
                    <a href="#" onclick="mostrarSetup()">Criar primeiro administrador</a>
                </div>
            </div>
            <script>
                const API_URL = window.location.origin;
                
                async function fazerLoginAdmin() {
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
                        showMessage('Erro de conexão com o servidor', 'error');
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
                    const setupHtml = \`
                        <div class="setup-modal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px;">
                            <div style="background: white; border-radius: 20px; max-width: 450px; width: 100%; padding: 30px;">
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
                                    <small style="color: #999; font-size: 11px; display: block; margin-top: 5px;">Código: FACILITAKI_ADMIN_2025</small>
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
                    document.body.insertAdjacentHTML('beforeend', setupHtml);
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
                    const modal = document.querySelector('.setup-modal');
                    if (modal) modal.remove();
                }
                
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

// Página principal do painel admin
app.get('/admin/painel', authenticateAdminToken, async (req, res) => {
    try {
        const pedidosResult = await pool.query(`
            SELECT p.*, u.nome as usuario_nome, u.telefone as usuario_telefone
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);

        const contatosResult = await pool.query(`
            SELECT * FROM contatos ORDER BY data_envio DESC
        `);

        const usuariosResult = await pool.query(`
            SELECT id, nome, telefone, created_at, is_admin,
                   (SELECT COUNT(*) FROM pedidos WHERE usuario_id = usuarios.id) as total_pedidos
            FROM usuarios 
            ORDER BY created_at DESC
        `);

        const token = req.headers.authorization.split(' ')[1];

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Painel Admin - Facilitaki</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; }
                .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
                header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
                .stat-card { background: white; padding: 20px; border-radius: 10px; flex: 1; min-width: 200px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
                .tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                .tab { padding: 12px 24px; background: #e0e0e0; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.3s ease; }
                .tab.active { background: #667eea; color: white; }
                .tab-content { display: none; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow-x: auto; }
                .tab-content.active { display: block; }
                table { width: 100%; border-collapse: collapse; min-width: 600px; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f8f9fa; font-weight: 600; }
                .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
                .status-pendente { background: #fef3c7; color: #92400e; }
                .status-pago { background: #d1fae5; color: #065f46; }
                .status-em_andamento { background: #dbeafe; color: #1e40af; }
                .status-concluido { background: #d1fae5; color: #065f46; }
                .btn { padding: 6px 12px; border: none; border-radius: 5px; cursor: pointer; margin: 2px; font-size: 12px; transition: all 0.3s ease; }
                .btn-view { background: #3498db; color: white; }
                .btn-delete { background: #e74c3c; color: white; }
                .btn-update { background: #2ecc71; color: white; }
                .btn-logout { background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 5px; cursor: pointer; }
                .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; z-index: 1000; }
                .modal-content { background: white; padding: 20px; border-radius: 10px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; }
                .admin-info { display: flex; align-items: center; gap: 15px; }
                .admin-info span { color: white; font-weight: 500; }
                @media (max-width: 768px) {
                    .stats { flex-direction: column; }
                    .container { padding: 10px; }
                    th, td { padding: 8px; font-size: 12px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <div>
                        <h1><i class="fas fa-shield-alt"></i> Painel Administrativo</h1>
                        <p>Bem-vindo, ${req.admin.nome}</p>
                    </div>
                    <div class="admin-info">
                        <span><i class="fas fa-user-shield"></i> ${req.admin.nome}</span>
                        <button class="btn-logout" onclick="logout()">
                            <i class="fas fa-sign-out-alt"></i> Sair
                        </button>
                    </div>
                </header>

                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${pedidosResult.rows.length}</div>
                        <div>Total de Pedidos</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${pedidosResult.rows.filter(p => p.status === 'pendente').length}</div>
                        <div>Pedidos Pendentes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${usuariosResult.rows.length}</div>
                        <div>Usuários Cadastrados</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${contatosResult.rows.length}</div>
                        <div>Mensagens de Contato</div>
                    </div>
                </div>

                <div class="tabs">
                    <button class="tab active" onclick="showTab('pedidos')">📋 Pedidos</button>
                    <button class="tab" onclick="showTab('usuarios')">👥 Usuários</button>
                    <button class="tab" onclick="showTab('contatos')">💬 Contatos</button>
                </div>

                <div id="tab-pedidos" class="tab-content active">
                    <table>
                        <thead>
                            <tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Arquivo</th><th>Ações</th></tr>
                        </thead>
                        <tbody>`;

        pedidosResult.rows.forEach(pedido => {
            const arquivoLink = pedido.arquivo_path ? 
                `<a href="/${pedido.arquivo_path}" target="_blank" style="color: #3498db;">📄 Ver</a>` : '-';
            
            html += `<tr>
                <td>${pedido.id}</td>
                <td>${pedido.cliente}<br><small>${pedido.telefone}</small></td>
                <td>${pedido.nome_plano}</td>
                <td>${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</td>
                <td><span class="status status-${pedido.status}">${pedido.status.replace('_', ' ')}</span></td>
                <td>${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</td>
                <td>${arquivoLink}</td>
                <td>
                    <button class="btn btn-view" onclick="viewPedido(${pedido.id})">👁️</button>
                    <button class="btn btn-update" onclick="updateStatus(${pedido.id})">✏️</button>
                    <button class="btn btn-delete" onclick="deletePedido(${pedido.id})">🗑️</button>
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>
                <div id="tab-usuarios" class="tab-content">
                    <table><th>ID</th><th>Nome</th><th>Telefone</th><th>Admin</th><th>Cadastro</th><th>Pedidos</th><th>Ações</th></tr>
                    <tbody>`;

        usuariosResult.rows.forEach(usuario => {
            html += `<tr>
                <td>${usuario.id}</td>
                <td>${usuario.nome}${usuario.is_admin ? ' <span style="color:#667eea;">⭐</span>' : ''}</td>
                <td>${usuario.telefone}</td>
                <td>${usuario.is_admin ? 'Sim' : 'Não'}</td>
                <td>${new Date(usuario.created_at).toLocaleDateString('pt-MZ')}</td>
                <td>${usuario.total_pedidos}</td>
                <td><button class="btn btn-view" onclick="viewUsuario(${usuario.id})">👁️</button>
                    ${!usuario.is_admin ? `<button class="btn btn-delete" onclick="deleteUsuario(${usuario.id})">🗑️</button>` : ''}
                </td>
            </tr>`;
        });

        html += `</tbody></table></div>
                <div id="tab-contatos" class="tab-content">
                    <table><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr>
                    <tbody>`;

        contatosResult.rows.forEach(contato => {
            html += `<tr>
                <td>${contato.id}</td>
                <td>${contato.nome}</td>
                <td>${contato.telefone}</td>
                <td>${contato.mensagem.substring(0, 50)}${contato.mensagem.length > 50 ? '...' : ''}</td>
                <td>${new Date(contato.data_envio).toLocaleDateString('pt-MZ')}</td>
                <td><button class="btn btn-view" onclick="viewContato(${contato.id})">👁️</button>
                    <button class="btn btn-delete" onclick="deleteContato(${contato.id})">🗑️</button>
                </td>
            </tr>`;
        });

        html += `</tbody><table></div>
            </div>

            <div id="modal" class="modal">
                <div class="modal-content">
                    <div id="modal-body"></div>
                    <div style="text-align: right; margin-top: 20px;">
                        <button class="btn" onclick="closeModal()" style="background: #6c757d; color: white;">Fechar</button>
                    </div>
                </div>
            </div>

            <script>
                const API_URL = window.location.origin;
                const ADMIN_TOKEN = localStorage.getItem('admin_token_facilitaki');

                function showTab(tabName) {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    event.target.classList.add('active');
                    document.getElementById('tab-' + tabName).classList.add('active');
                }

                async function apiRequest(url, options = {}) {
                    const response = await fetch(API_URL + url, {
                        ...options,
                        headers: {
                            'Authorization': 'Bearer ' + ADMIN_TOKEN,
                            'Content-Type': 'application/json',
                            ...options.headers
                        }
                    });
                    if (response.status === 401) {
                        window.location.href = '/admin/login';
                        return null;
                    }
                    return response.json();
                }

                async function viewPedido(id) {
                    const data = await apiRequest('/api/admin/pedido/' + id);
                    if (data && data.success) {
                        const p = data.pedido;
                        let html = '<h3>Pedido #' + p.id + '</h3>';
                        html += '<p><strong>Cliente:</strong> ' + p.cliente + '</p>';
                        html += '<p><strong>Telefone:</strong> ' + p.telefone + '</p>';
                        html += '<p><strong>Serviço:</strong> ' + p.nome_plano + ' - ' + parseFloat(p.preco).toLocaleString('pt-MZ') + ' MT</p>';
                        html += '<p><strong>Status:</strong> ' + p.status + '</p>';
                        html += '<p><strong>Descrição:</strong> ' + (p.descricao || p.tema || 'Nenhuma') + '</p>';
                        if (p.arquivo_path) {
                            html += '<p><strong>Arquivo:</strong> <a href="/' + p.arquivo_path + '" target="_blank">Download</a></p>';
                        }
                        document.getElementById('modal-body').innerHTML = html;
                        document.getElementById('modal').style.display = 'flex';
                    }
                }

                async function updateStatus(id) {
                    const novoStatus = prompt('Novo status (pendente, pago, em_andamento, concluido, cancelado):');
                    if (novoStatus) {
                        const data = await apiRequest('/api/admin/pedido/' + id + '/status', {
                            method: 'PUT',
                            body: JSON.stringify({status: novoStatus})
                        });
                        if (data && data.success) {
                            alert('Status atualizado!');
                            location.reload();
                        }
                    }
                }

                async function deletePedido(id) {
                    if (confirm('Excluir este pedido?')) {
                        const data = await apiRequest('/api/admin/pedido/' + id, {method: 'DELETE'});
                        if (data && data.success) {
                            alert('Pedido excluído!');
                            location.reload();
                        }
                    }
                }

                async function viewUsuario(id) {
                    const data = await apiRequest('/api/admin/usuario/' + id);
                    if (data && data.success) {
                        const u = data.usuario;
                        let html = '<h3>Usuário #' + u.id + '</h3>';
                        html += '<p><strong>Nome:</strong> ' + u.nome + '</p>';
                        html += '<p><strong>Telefone:</strong> ' + u.telefone + '</p>';
                        html += '<p><strong>Cadastro:</strong> ' + new Date(u.created_at).toLocaleString('pt-MZ') + '</p>';
                        html += '<p><strong>Total Pedidos:</strong> ' + (u.total_pedidos || 0) + '</p>';
                        document.getElementById('modal-body').innerHTML = html;
                        document.getElementById('modal').style.display = 'flex';
                    }
                }

                async function deleteUsuario(id) {
                    if (confirm('Excluir usuário e todos os seus pedidos?')) {
                        const data = await apiRequest('/api/admin/usuario/' + id, {method: 'DELETE'});
                        if (data && data.success) {
                            alert('Usuário excluído!');
                            location.reload();
                        }
                    }
                }

                async function viewContato(id) {
                    const data = await apiRequest('/api/admin/contato/' + id);
                    if (data && data.success) {
                        const c = data.contato;
                        let html = '<h3>Contato #' + c.id + '</h3>';
                        html += '<p><strong>Nome:</strong> ' + c.nome + '</p>';
                        html += '<p><strong>Telefone:</strong> ' + c.telefone + '</p>';
                        html += '<p><strong>Data:</strong> ' + new Date(c.data_envio).toLocaleString('pt-MZ') + '</p>';
                        html += '<p><strong>Mensagem:</strong></p><p>' + c.mensagem + '</p>';
                        document.getElementById('modal-body').innerHTML = html;
                        document.getElementById('modal').style.display = 'flex';
                    }
                }

                async function deleteContato(id) {
                    if (confirm('Excluir este contato?')) {
                        const data = await apiRequest('/api/admin/contato/' + id, {method: 'DELETE'});
                        if (data && data.success) {
                            alert('Contato excluído!');
                            location.reload();
                        }
                    }
                }

                function closeModal() {
                    document.getElementById('modal').style.display = 'none';
                }

                async function logout() {
                    await apiRequest('/api/admin/logout', {method: 'POST'});
                    localStorage.removeItem('admin_token_facilitaki');
                    localStorage.removeItem('admin_dados');
                    window.location.href = '/admin/login';
                }

                window.onclick = function(event) {
                    if (event.target == document.getElementById('modal')) {
                        closeModal();
                    }
                }

                if (!ADMIN_TOKEN) {
                    window.location.href = '/admin/login';
                }
            </script>
        </body>
        </html>`;

        res.send(html);
    } catch (error) {
        console.error('Erro no painel admin:', error);
        res.status(500).send('Erro ao carregar painel administrativo');
    }
});

// ===== ROTAS ADMIN API =====

// Buscar pedido específico
app.get('/api/admin/pedido/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar pedido:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar pedido' });
    }
});

// Atualizar status do pedido
app.put('/api/admin/pedido/:id/status', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const result = await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
    }
});

// Excluir pedido
app.delete('/api/admin/pedido/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const pedido = await pool.query('SELECT arquivo_path FROM pedidos WHERE id = $1', [id]);
        if (pedido.rows.length > 0 && pedido.rows[0].arquivo_path && fs.existsSync(pedido.rows[0].arquivo_path)) {
            fs.unlinkSync(pedido.rows[0].arquivo_path);
        }
        await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Pedido excluído' });
    } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir pedido' });
    }
});

// Buscar usuário específico
app.get('/api/admin/usuario/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const usuario = await pool.query('SELECT id, nome, telefone, created_at, is_admin FROM usuarios WHERE id = $1', [id]);
        if (usuario.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }
        const pedidos = await pool.query('SELECT COUNT(*) as total FROM pedidos WHERE usuario_id = $1', [id]);
        const data = usuario.rows[0];
        data.total_pedidos = pedidos.rows[0].total;
        res.json({ success: true, usuario: data });
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
    }
});

// Excluir usuário
app.delete('/api/admin/usuario/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const arquivos = await pool.query('SELECT arquivo_path FROM pedidos WHERE usuario_id = $1 AND arquivo_path IS NOT NULL', [id]);
        arquivos.rows.forEach(row => {
            if (row.arquivo_path && fs.existsSync(row.arquivo_path)) {
                fs.unlinkSync(row.arquivo_path);
            }
        });
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Usuário excluído' });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir usuário' });
    }
});

// Buscar contato específico
app.get('/api/admin/contato/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contato não encontrado' });
        }
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar contato' });
    }
});

// Excluir contato
app.delete('/api/admin/contato/:id', authenticateAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM contatos WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Contato excluído' });
    } catch (error) {
        console.error('Erro ao excluir contato:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir contato' });
    }
});

// ===== ROTAS PARA USUÁRIOS COMUNS =====

// Rota de login para usuários comuns
app.post('/api/login', async (req, res) => {
    try {
        console.log('🔐 Tentativa de login para telefone:', req.body.telefone);
        const { telefone, senha } = req.body;

        if (!telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Telefone e senha são obrigatórios' });
        }

        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, erro: 'Telefone ou senha incorretos' });
        }

        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ success: false, erro: 'Telefone ou senha incorretos' });
        }

        const token = jwt.sign(
            { id: usuario.id, telefone: usuario.telefone, nome: usuario.nome, isAdmin: usuario.is_admin || false },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            mensagem: 'Login realizado com sucesso!',
            token: token,
            usuario: { id: usuario.id, nome: usuario.nome, telefone: usuario.telefone }
        });
    } catch (error) {
        console.error('❌ Erro no login:', error.message);
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// Rota de cadastro para usuários comuns
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Nome, telefone e senha são obrigatórios' });
        }

        const existingUser = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Este telefone já está cadastrado' });
        }

        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefone, senhaHash]
        );

        const novoUsuario = result.rows[0];
        const token = jwt.sign(
            { id: novoUsuario.id, telefone: novoUsuario.telefone, nome: novoUsuario.nome, isAdmin: false },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        res.json({ success: true, mensagem: 'Cadastro realizado com sucesso!', token: token, usuario: novoUsuario });
    } catch (error) {
        console.error('❌ Erro no cadastro:', error.message);
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// Rota de logout
app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true, mensagem: 'Logout realizado com sucesso' });
});

// Rota para criar pedido com upload
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    try {
        console.log('📤 Recebendo upload de arquivo...');
        const {
            cliente, telefone, instituicao = 'Não informada', curso = 'Não informado',
            cadeira = 'Não informada', tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        } = req.body;

        let arquivoPath = null;
        if (req.file) arquivoPath = req.file.path;

        const prazoValidado = validarData(prazo);
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento, arquivo_path, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pendente') RETURNING *`,
            [req.user.id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazoValidado, plano, nomePlano, parseFloat(preco) || 0, metodoPagamento, arquivoPath]
        );

        res.json({ success: true, mensagem: 'Pedido criado com sucesso!', pedido: result.rows[0] });
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error.message);
        res.status(500).json({ success: false, erro: 'Erro ao criar pedido: ' + error.message });
    }
});

// Rota para buscar pedidos do usuário
app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC', [req.user.id]);
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ success: false, erro: 'Erro ao buscar pedidos' });
    }
});

// Rota para envio de contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ success: false, erro: 'Nome, telefone e mensagem são obrigatórios' });
        }
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefone, mensagem]);
        res.json({ success: true, mensagem: 'Mensagem enviada com sucesso!' });
    } catch (error) {
        console.error('Erro ao salvar contato:', error);
        res.status(500).json({ success: false, erro: 'Erro ao enviar mensagem' });
    }
});

// Servir arquivo HTML principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Tratamento de erros
app.use((err, req, res, next) => {
    console.error('❌ Erro não tratado:', err.message);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'Arquivo muito grande. O tamanho máximo é 10MB.' });
        }
    }
    res.status(500).json({ success: false, error: 'Erro interno do servidor: ' + err.message });
});

// Rota padrão para erros 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// Inicializar servidor
async function startServer() {
    try {
        console.log('🚀 Iniciando servidor Facilitaki...');
        console.log('📊 Porta:', PORT);
        
        await testarConexaoBD();
        await initDatabase();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n✅ Servidor rodando na porta ${PORT}`);
            console.log(`🌐 Site: http://localhost:${PORT}`);
            console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
            console.log(`📊 Status: http://localhost:${PORT}/status`);
        });
    } catch (error) {
        console.error('❌ Falha ao iniciar servidor:', error.message);
        process.exit(1);
    }
}

startServer();
