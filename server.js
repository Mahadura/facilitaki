// server.js - Facilitaki Backend Corrigido
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2025';

// Conexão com banco de dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Configuração de upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = '/tmp/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage, 
    limits: { fileSize: 10 * 1024 * 1024 },
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// Logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        if (!decoded.isAdmin) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        req.admin = decoded;
        next();
    });
};

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                descricao TEXT,
                plano VARCHAR(50),
                nome_plano VARCHAR(100),
                preco DECIMAL(10,2),
                metodo_pagamento VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Banco de dados inicializado');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

// ==================== ROTAS PÚBLICAS ====================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== ROTAS DE AUTENTICAÇÃO ====================
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const token = jwt.sign({ id: result.rows[0].id, nome: result.rows[0].nome }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (existe.rows.length > 0) return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query('INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone', [nome, telefone, hash]);
        const token = jwt.sign({ id: result.rows[0].id, nome }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true });
});

// ==================== ROTAS DE PEDIDOS ====================
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento, req.file?.path]
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
        res.json({ success: true, pedidos: [] });
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

// ==================== ROTAS ADMIN ====================

// Página de login admin - SEM CREDENCIAIS PADRÃO VISÍVEIS
app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Login - Facilitaki</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', Arial, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                .container {
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    width: 400px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                }
                h1 { text-align: center; color: #667eea; margin-bottom: 30px; }
                input {
                    width: 100%;
                    padding: 12px;
                    margin: 10px 0;
                    border: 2px solid #e1e5e9;
                    border-radius: 10px;
                    font-size: 16px;
                }
                input:focus { outline: none; border-color: #667eea; }
                button {
                    width: 100%;
                    padding: 12px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    margin-top: 10px;
                }
                button:hover { transform: translateY(-2px); }
                .error {
                    background: #fee;
                    color: #c33;
                    padding: 10px;
                    border-radius: 8px;
                    margin-top: 15px;
                    text-align: center;
                    display: none;
                }
                .success {
                    background: #efe;
                    color: #3c3;
                    padding: 10px;
                    border-radius: 8px;
                    margin-top: 15px;
                    text-align: center;
                    display: none;
                }
                .info {
                    margin-top: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #999;
                }
                .info a { color: #667eea; cursor: pointer; text-decoration: none; }
                .tabs {
                    display: flex;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #e1e5e9;
                }
                .tab {
                    flex: 1;
                    text-align: center;
                    padding: 10px;
                    cursor: pointer;
                    background: none;
                    color: #666;
                    margin-top: 0;
                }
                .tab.active {
                    color: #667eea;
                    border-bottom: 2px solid #667eea;
                }
                .form-container {
                    display: none;
                }
                .form-container.active {
                    display: block;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Admin Login</h1>
                
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('login')">Login</div>
                    <div class="tab" onclick="switchTab('register')">Criar Admin</div>
                </div>
                
                <div id="login-container" class="form-container active">
                    <input type="text" id="username" placeholder="Usuário">
                    <input type="password" id="password" placeholder="Senha">
                    <button onclick="login()">Entrar</button>
                </div>
                
                <div id="register-container" class="form-container">
                    <input type="text" id="newUsername" placeholder="Usuário">
                    <input type="password" id="newPassword" placeholder="Senha">
                    <input type="password" id="confirmPassword" placeholder="Confirmar Senha">
                    <button onclick="registerAdmin()">Criar Administrador</button>
                </div>
                
                <div id="error" class="error"></div>
                <div id="success" class="success"></div>
            </div>
            
            <script>
                function switchTab(tab) {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.form-container').forEach(c => c.classList.remove('active'));
                    
                    if (tab === 'login') {
                        document.querySelector('.tab').classList.add('active');
                        document.getElementById('login-container').classList.add('active');
                    } else {
                        document.querySelectorAll('.tab')[1].classList.add('active');
                        document.getElementById('register-container').classList.add('active');
                    }
                    
                    document.getElementById('error').style.display = 'none';
                    document.getElementById('success').style.display = 'none';
                }
                
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
                    const successDiv = document.getElementById('success');
                    
                    errorDiv.style.display = 'none';
                    successDiv.style.display = 'none';
                    
                    if (!username || !password) {
                        errorDiv.textContent = 'Preencha todos os campos';
                        errorDiv.style.display = 'block';
                        return;
                    }
                    
                    try {
                        const res = await fetch('/api/admin/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usuario: username, senha: password })
                        });
                        const data = await res.json();
                        
                        if (data.success) {
                            localStorage.setItem('admin_token', data.token);
                            successDiv.textContent = 'Login realizado! Redirecionando...';
                            successDiv.style.display = 'block';
                            setTimeout(() => {
                                window.location.href = '/admin/painel';
                            }, 1000);
                        } else {
                            errorDiv.textContent = data.error || 'Erro no login';
                            errorDiv.style.display = 'block';
                        }
                    } catch (error) {
                        errorDiv.textContent = 'Erro de conexão: ' + error.message;
                        errorDiv.style.display = 'block';
                    }
                }
                
                async function registerAdmin() {
                    const username = document.getElementById('newUsername').value;
                    const password = document.getElementById('newPassword').value;
                    const confirm = document.getElementById('confirmPassword').value;
                    const errorDiv = document.getElementById('error');
                    const successDiv = document.getElementById('success');
                    
                    errorDiv.style.display = 'none';
                    successDiv.style.display = 'none';
                    
                    if (!username || !password || !confirm) {
                        errorDiv.textContent = 'Preencha todos os campos';
                        errorDiv.style.display = 'block';
                        return;
                    }
                    
                    if (password !== confirm) {
                        errorDiv.textContent = 'As senhas não coincidem';
                        errorDiv.style.display = 'block';
                        return;
                    }
                    
                    if (password.length < 6) {
                        errorDiv.textContent = 'A senha deve ter no mínimo 6 caracteres';
                        errorDiv.style.display = 'block';
                        return;
                    }
                    
                    try {
                        const res = await fetch('/api/admin/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usuario: username, senha: password })
                        });
                        const data = await res.json();
                        
                        if (data.success) {
                            successDiv.textContent = data.message || 'Administrador criado com sucesso! Agora faça login.';
                            successDiv.style.display = 'block';
                            document.getElementById('newUsername').value = '';
                            document.getElementById('newPassword').value = '';
                            document.getElementById('confirmPassword').value = '';
                            setTimeout(() => {
                                switchTab('login');
                            }, 2000);
                        } else {
                            errorDiv.textContent = data.error || 'Erro ao criar administrador';
                            errorDiv.style.display = 'block';
                        }
                    } catch (error) {
                        errorDiv.textContent = 'Erro de conexão: ' + error.message;
                        errorDiv.style.display = 'block';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// API de login admin
app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        console.log('🔐 Tentativa login admin:', usuario);
        
        // Buscar admin no banco
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        
        if (result.rows.length === 0) {
            console.log('❌ Admin não encontrado:', usuario);
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const admin = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, admin.senha_hash);
        
        if (!senhaValida) {
            console.log('❌ Senha incorreta para:', usuario);
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const token = jwt.sign(
            { id: admin.id, nome: usuario, isAdmin: true },
            SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        console.log('✅ Login admin bem-sucedido:', usuario);
        res.json({ success: true, token });
        
    } catch (error) {
        console.error('❌ Erro no login admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API para criar novo admin (primeiro acesso ou admin existente)
app.post('/api/admin/register', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        // Verificar se já existe algum admin
        const adminCount = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        const isFirstAdmin = parseInt(adminCount.rows[0].count) === 0;
        
        // Se não for o primeiro admin, verificar token
        if (!isFirstAdmin) {
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({ success: false, error: 'Apenas administradores podem criar novos administradores' });
            }
            
            try {
                const decoded = jwt.verify(token, SECRET_KEY);
                if (!decoded.isAdmin) {
                    return res.status(403).json({ success: false, error: 'Apenas administradores podem criar novos administradores' });
                }
            } catch (err) {
                return res.status(401).json({ success: false, error: 'Token inválido. Faça login novamente.' });
            }
        }
        
        // Verificar se usuário já existe
        const userExists = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Este nome de usuário já está em uso' });
        }
        
        // Criar novo admin
        const hash = await bcrypt.hash(senha, 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            [usuario, `admin_${Date.now()}@facilitaki.com`, hash]
        );
        
        console.log('✅ Novo admin criado:', usuario);
        res.json({ success: true, message: 'Administrador criado com sucesso!' });
        
    } catch (error) {
        console.error('❌ Erro ao criar admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verificar token admin
app.get('/api/admin/verificar', authenticateAdmin, (req, res) => {
    res.json({ valid: true, admin: req.admin });
});

// Logout admin
app.post('/api/admin/logout', authenticateAdmin, (req, res) => {
    res.json({ success: true });
});

// ==================== PAINEL ADMIN PRINCIPAL ====================
app.get('/admin/painel', authenticateAdmin, async (req, res) => {
    try {
        // Buscar dados para o dashboard
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC LIMIT 50');
        const usuarios = await pool.query('SELECT id, nome, telefone, is_admin, created_at FROM usuarios ORDER BY created_at DESC LIMIT 50');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 50');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Painel Administrativo - Facilitaki</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Arial, sans-serif; 
                        background: #f5f5f5; 
                        padding: 20px; 
                    }
                    .header { 
                        background: linear-gradient(135deg, #667eea, #764ba2); 
                        color: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        margin-bottom: 20px; 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        flex-wrap: wrap; 
                    }
                    .stats { 
                        display: grid; 
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                        gap: 20px; 
                        margin-bottom: 20px; 
                    }
                    .stat-card { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
                        text-align: center;
                    }
                    .stat-number { 
                        font-size: 32px; 
                        font-weight: bold; 
                        color: #667eea; 
                    }
                    .tabs { 
                        display: flex; 
                        gap: 10px; 
                        margin-bottom: 20px; 
                        flex-wrap: wrap; 
                    }
                    .tab { 
                        padding: 10px 20px; 
                        background: #ddd; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        font-weight: bold; 
                        transition: all 0.3s ease;
                    }
                    .tab.active { 
                        background: #667eea; 
                        color: white; 
                    }
                    .tab-content { 
                        display: none; 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        overflow-x: auto; 
                    }
                    .tab-content.active { 
                        display: block; 
                    }
                    table { 
                        width: 100%; 
                        border-collapse: collapse; 
                    }
                    th, td { 
                        padding: 12px; 
                        text-align: left; 
                        border-bottom: 1px solid #ddd; 
                    }
                    th { 
                        background: #f8f9fa; 
                        font-weight: bold;
                    }
                    .status { 
                        padding: 4px 8px; 
                        border-radius: 4px; 
                        font-size: 12px; 
                        font-weight: bold; 
                    }
                    .status-pendente { background: #fef3c7; color: #92400e; }
                    .status-pago { background: #d1fae5; color: #065f46; }
                    .status-em_andamento { background: #dbeafe; color: #1e40af; }
                    .status-concluido { background: #d1fae5; color: #065f46; }
                    .btn { 
                        padding: 5px 10px; 
                        border: none; 
                        border-radius: 3px; 
                        cursor: pointer; 
                        margin: 2px; 
                        transition: all 0.3s ease;
                    }
                    .btn-view { background: #3498db; color: white; }
                    .btn-update { background: #2ecc71; color: white; }
                    .btn-delete { background: #e74c3c; color: white; }
                    .logout-btn { 
                        background: #e74c3c; 
                        color: white; 
                        padding: 10px 20px; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        font-weight: bold;
                    }
                    .logout-btn:hover { background: #c0392b; }
                    .modal { 
                        display: none; 
                        position: fixed; 
                        top: 0; 
                        left: 0; 
                        width: 100%; 
                        height: 100%; 
                        background: rgba(0,0,0,0.5); 
                        justify-content: center; 
                        align-items: center; 
                        z-index: 1000; 
                    }
                    .modal-content { 
                        background: white; 
                        padding: 20px; 
                        border-radius: 10px; 
                        max-width: 500px; 
                        width: 90%; 
                        max-height: 80vh; 
                        overflow-y: auto; 
                    }
                    .admin-badge { 
                        background: #667eea; 
                        color: white; 
                        font-size: 10px; 
                        padding: 2px 6px; 
                        border-radius: 10px; 
                        margin-left: 5px; 
                    }
                    .create-admin-section {
                        margin-top: 20px;
                        padding: 20px;
                        background: #f8f9fa;
                        border-radius: 10px;
                        border: 1px solid #e1e5e9;
                    }
                    .create-admin-section h4 {
                        margin-bottom: 15px;
                        color: #667eea;
                    }
                    .create-admin-section input {
                        padding: 10px;
                        margin: 5px;
                        border: 1px solid #ddd;
                        border-radius: 5px;
                        flex: 1;
                    }
                    .create-admin-section button {
                        background: #667eea;
                        color: white;
                        padding: 10px 20px;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    }
                    .flex-row {
                        display: flex;
                        gap: 10px;
                        flex-wrap: wrap;
                        align-items: center;
                    }
                    @media (max-width: 768px) {
                        body { padding: 10px; }
                        .stats { grid-template-columns: 1fr; }
                        th, td { padding: 8px; font-size: 12px; }
                        .flex-row { flex-direction: column; }
                        .flex-row input { width: 100%; }
                        .flex-row button { width: 100%; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h1><i class="fas fa-shield-alt"></i> Painel Administrativo</h1>
                        <p>Bem-vindo, ${req.admin.nome} <span class="admin-badge">Administrador</span></p>
                    </div>
                    <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Sair</button>
                </div>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-number">${pedidos.rows.length}</div>
                        <div><i class="fas fa-shopping-cart"></i> Total Pedidos</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${pedidos.rows.filter(p => p.status === 'pendente').length}</div>
                        <div><i class="fas fa-clock"></i> Pendentes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${usuarios.rows.filter(u => !u.is_admin).length}</div>
                        <div><i class="fas fa-users"></i> Clientes</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${contatos.rows.length}</div>
                        <div><i class="fas fa-envelope"></i> Contatos</div>
                    </div>
                </div>
                
                <div class="tabs">
                    <button class="tab active" onclick="showTab('pedidos')"><i class="fas fa-shopping-cart"></i> Pedidos (${pedidos.rows.length})</button>
                    <button class="tab" onclick="showTab('usuarios')"><i class="fas fa-users"></i> Usuários (${usuarios.rows.length})</button>
                    <button class="tab" onclick="showTab('contatos')"><i class="fas fa-envelope"></i> Contatos (${contatos.rows.length})</button>
                    <button class="tab" onclick="showTab('admins')"><i class="fas fa-user-shield"></i> Administradores</button>
                </div>
                
                <!-- Tab Pedidos -->
                <div id="tab-pedidos" class="tab-content active">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Cliente</th>
                                <th>Telefone</th>
                                <th>Serviço</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pedidos.rows.map(p => `
                            <tr>
                                <td>${p.id}</td>
                                <td>${p.cliente || '-'}</td>
                                <td>${p.telefone || '-'}</td>
                                <td>${p.nome_plano || p.plano || '-'}</td>
                                <td>${parseFloat(p.preco || 0).toLocaleString('pt-MZ')} MT</td>
                                <td><span class="status status-${p.status || 'pendente'}">${p.status || 'pendente'}</span></td>
                                <td>${p.data_pedido ? new Date(p.data_pedido).toLocaleDateString() : '-'}</td>
                                <td>
                                    <button class="btn btn-view" onclick="viewPedido(${p.id})"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-update" onclick="updateStatus(${p.id})"><i class="fas fa-edit"></i></button>
                                    <button class="btn btn-delete" onclick="deletePedido(${p.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Tab Usuários -->
                <div id="tab-usuarios" class="tab-content">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nome</th>
                                <th>Telefone</th>
                                <th>Admin</th>
                                <th>Cadastro</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuarios.rows.map(u => `
                            <tr>
                                <td>${u.id}</td>
                                <td>${u.nome} ${u.is_admin ? '<span class="admin-badge">Admin</span>' : ''}</td>
                                <td>${u.telefone}</td>
                                <td>${u.is_admin ? 'Sim' : 'Não'}</td>
                                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                                <td>${!u.is_admin ? `<button class="btn btn-delete" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>` : ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Tab Contatos -->
                <div id="tab-contatos" class="tab-content">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nome</th>
                                <th>Telefone</th>
                                <th>Mensagem</th>
                                <th>Data</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${contatos.rows.map(c => `
                            <tr>
                                <td>${c.id}</td>
                                <td>${c.nome}</td>
                                <td>${c.telefone}</td>
                                <td>${c.mensagem.substring(0, 50)}${c.mensagem.length > 50 ? '...' : ''}</td>
                                <td>${new Date(c.data_envio).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-view" onclick="viewContato(${c.id})"><i class="fas fa-eye"></i></button>
                                    <button class="btn btn-delete" onclick="deleteContato(${c.id})"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                
                <!-- Tab Administradores -->
                <div id="tab-admins" class="tab-content">
                    <div class="create-admin-section">
                        <h4><i class="fas fa-plus-circle"></i> Criar Novo Administrador</h4>
                        <div class="flex-row">
                            <input type="text" id="newAdminUser" placeholder="Usuário" style="flex: 2;">
                            <input type="password" id="newAdminPass" placeholder="Senha" style="flex: 2;">
                            <input type="password" id="newAdminPassConfirm" placeholder="Confirmar Senha" style="flex: 2;">
                            <button onclick="createNewAdmin()"><i class="fas fa-user-plus"></i> Criar Admin</button>
                        </div>
                        <div id="adminCreateMessage" style="margin-top: 10px; font-size: 14px;"></div>
                    </div>
                    
                    <h4 style="margin: 20px 0 10px 0;"><i class="fas fa-list"></i> Administradores Existentes</h4>
                    <div id="adminsList"></div>
                </div>
                
                <!-- Modal -->
                <div id="modal" class="modal">
                    <div class="modal-content">
                        <div id="modalBody"></div>
                        <button onclick="closeModal()" style="margin-top:15px; padding:8px 16px; background:#6c757d; color:white; border:none; border-radius:5px; cursor:pointer;">Fechar</button>
                    </div>
                </div>
                
                <script>
                    const TOKEN = localStorage.getItem('admin_token');
                    if (!TOKEN) {
                        window.location.href = '/admin/login';
                    }
                    
                    async function apiCall(url, options = {}) {
                        try {
                            const res = await fetch(url, {
                                ...options,
                                headers: {
                                    'Authorization': 'Bearer ' + TOKEN,
                                    'Content-Type': 'application/json'
                                }
                            });
                            if (res.status === 401) {
                                localStorage.removeItem('admin_token');
                                window.location.href = '/admin/login';
                                return null;
                            }
                            return await res.json();
                        } catch (error) {
                            console.error('Erro na API:', error);
                            return null;
                        }
                    }
                    
                    function showTab(name) {
                        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        event.target.classList.add('active');
                        document.getElementById('tab-' + name).classList.add('active');
                        if (name === 'admins') {
                            loadAdmins();
                        }
                    }
                    
                    async function loadAdmins() {
                        const data = await apiCall('/api/admin/listar');
                        if (data && data.success) {
                            const container = document.getElementById('adminsList');
                            if (data.admins.length === 0) {
                                container.innerHTML = '<p style="text-align:center; color:#999;">Nenhum administrador encontrado</p>';
                            } else {
                                container.innerHTML = \`
                                    <table>
                                        <thead>
                                            <tr><th>ID</th><th>Nome</th><th>Data de Criação</th><th>Ações</th></tr>
                                        </thead>
                                        <tbody>
                                            \${data.admins.map(admin => \`
                                                <tr>
                                                    <td>\${admin.id}</td>
                                                    <td>\${admin.nome} <span class="admin-badge">Admin</span>\${admin.id === ${req.admin.id} ? ' (Você)' : ''}</td>
                                                    <td>\${new Date(admin.created_at).toLocaleDateString()}</td>
                                                    <td>\${admin.id !== ${req.admin.id} ? '<button class="btn btn-delete" onclick="deleteAdmin('+admin.id+')"><i class="fas fa-trash"></i></button>' : '<span style="color:#999;">Não pode excluir próprio</span>'}</td>
                                                </tr>\`).join('')}
                                        </tbody>
                                    </table>
                                \`;
                            }
                        }
                    }
                    
                    async function createNewAdmin() {
                        const usuario = document.getElementById('newAdminUser').value;
                        const senha = document.getElementById('newAdminPass').value;
                        const confirm = document.getElementById('newAdminPassConfirm').value;
                        const msgDiv = document.getElementById('adminCreateMessage');
                        
                        if (!usuario || !senha || !confirm) {
                            msgDiv.innerHTML = '<span style="color:#c33;">❌ Preencha todos os campos</span>';
                            return;
                        }
                        if (senha !== confirm) {
                            msgDiv.innerHTML = '<span style="color:#c33;">❌ As senhas não coincidem</span>';
                            return;
                        }
                        if (senha.length < 6) {
                            msgDiv.innerHTML = '<span style="color:#c33;">❌ A senha deve ter no mínimo 6 caracteres</span>';
                            return;
                        }
                        
                        const data = await apiCall('/api/admin/register', {
                            method: 'POST',
                            body: JSON.stringify({ usuario, senha })
                        });
                        
                        if (data && data.success) {
                            msgDiv.innerHTML = '<span style="color:#3c3;">✅ ' + data.message + '</span>';
                            document.getElementById('newAdminUser').value = '';
                            document.getElementById('newAdminPass').value = '';
                            document.getElementById('newAdminPassConfirm').value = '';
                            loadAdmins();
                            setTimeout(() => { msgDiv.innerHTML = ''; }, 3000);
                        } else if (data) {
                            msgDiv.innerHTML = '<span style="color:#c33;">❌ ' + data.error + '</span>';
                        }
                    }
                    
                    async function deleteAdmin(id) {
                        if (confirm('Excluir este administrador?')) {
                            const data = await apiCall('/api/admin/usuario/' + id, { method: 'DELETE' });
                            if (data && data.success) {
                                loadAdmins();
                            }
                        }
                    }
                    
                    async function viewPedido(id) {
                        const data = await apiCall('/api/admin/pedido/' + id);
                        if (data && data.success) {
                            document.getElementById('modalBody').innerHTML = \`
                                <h3>Pedido #\${data.pedido.id}</h3>
                                <p><strong>Cliente:</strong> \${data.pedido.cliente || '-'}</p>
                                <p><strong>Telefone:</strong> \${data.pedido.telefone || '-'}</p>
                                <p><strong>Serviço:</strong> \${data.pedido.nome_plano || data.pedido.plano || '-'}</p>
                                <p><strong>Valor:</strong> \${parseFloat(data.pedido.preco || 0).toLocaleString('pt-MZ')} MT</p>
                                <p><strong>Status:</strong> \${data.pedido.status || 'pendente'}</p>
                                <p><strong>Descrição:</strong> \${data.pedido.descricao || 'Nenhuma'}</p>
                                \${data.pedido.arquivo_path ? '<p><strong>Arquivo:</strong> <a href="/' + data.pedido.arquivo_path + '" target="_blank">Download</a></p>' : ''}
                            \`;
                            document.getElementById('modal').style.display = 'flex';
                        }
                    }
                    
                    async function updateStatus(id) {
                        const status = prompt('Novo status (pendente, pago, em_andamento, concluido):');
                        if (status) {
                            const data = await apiCall('/api/admin/pedido/' + id + '/status', {
                                method: 'PUT',
                                body: JSON.stringify({ status })
                            });
                            if (data && data.success) {
                                location.reload();
                            }
                        }
                    }
                    
                    async function deletePedido(id) {
                        if (confirm('Excluir este pedido?')) {
                            const data = await apiCall('/api/admin/pedido/' + id, { method: 'DELETE' });
                            if (data && data.success) {
                                location.reload();
                            }
                        }
                    }
                    
                    async function deleteUser(id) {
                        if (confirm('Excluir este usuário?')) {
                            const data = await apiCall('/api/admin/usuario/' + id, { method: 'DELETE' });
                            if (data && data.success) {
                                location.reload();
                            }
                        }
                    }
                    
                    async function viewContato(id) {
                        const data = await apiCall('/api/admin/contato/' + id);
                        if (data && data.success) {
                            document.getElementById('modalBody').innerHTML = \`
                                <h3>Contato #\${data.contato.id}</h3>
                                <p><strong>Nome:</strong> \${data.contato.nome}</p>
                                <p><strong>Telefone:</strong> \${data.contato.telefone}</p>
                                <p><strong>Data:</strong> \${new Date(data.contato.data_envio).toLocaleString()}</p>
                                <p><strong>Mensagem:</strong></p>
                                <p style="margin-top:10px; padding:10px; background:#f5f5f5; border-radius:5px;">\${data.contato.mensagem}</p>
                            \`;
                            document.getElementById('modal').style.display = 'flex';
                        }
                    }
                    
                    async function deleteContato(id) {
                        if (confirm('Excluir este contato?')) {
                            const data = await apiCall('/api/admin/contato/' + id, { method: 'DELETE' });
                            if (data && data.success) {
                                location.reload();
                            }
                        }
                    }
                    
                    function closeModal() {
                        document.getElementById('modal').style.display = 'none';
                    }
                    
                    async function logout() {
                        await apiCall('/api/admin/logout', { method: 'POST' });
                        localStorage.removeItem('admin_token');
                        window.location.href = '/admin/login';
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro no painel admin:', error);
        res.status(500).send('Erro ao carregar painel: ' + error.message);
    }
});

// ==================== ROTAS ADMIN API CRUD ====================

// Listar administradores
app.get('/api/admin/listar', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, created_at FROM usuarios WHERE is_admin = true ORDER BY created_at DESC');
        res.json({ success: true, admins: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar pedido específico
app.get('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Atualizar status do pedido
app.put('/api/admin/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const validStatus = ['pendente', 'pago', 'em_andamento', 'concluido', 'cancelado'];
        if (!validStatus.includes(status)) {
            return res.status(400).json({ success: false, error: 'Status inválido' });
        }
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Excluir pedido
app.delete('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
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

// Excluir usuário (não admin)
app.delete('/api/admin/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        // Verificar se é admin
        const userCheck = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length > 0 && userCheck.rows[0].is_admin) {
            return res.status(400).json({ success: false, error: 'Não é possível excluir administradores' });
        }
        
        // Excluir arquivos dos pedidos do usuário
        const arquivos = await pool.query('SELECT arquivo_path FROM pedidos WHERE usuario_id = $1 AND arquivo_path IS NOT NULL', [req.params.id]);
        arquivos.rows.forEach(row => {
            if (row.arquivo_path && fs.existsSync(row.arquivo_path)) {
                fs.unlinkSync(row.arquivo_path);
            }
        });
        
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Buscar contato específico
app.get('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contato não encontrado' });
        }
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Excluir contato
app.delete('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== REDIRECIONAMENTOS ====================
app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/', (req, res) => res.redirect('/admin/login'));

// ==================== TRATAMENTO DE ERROS ====================
app.use((err, req, res, next) => {
    console.error('❌ Erro:', err.message);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: 'Arquivo muito grande. Máximo 10MB.' });
        }
    }
    res.status(500).json({ success: false, error: err.message });
});

app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Rota não encontrada' });
});

// ==================== INICIAR SERVIDOR ====================
async function startServer() {
    console.log('🚀 Iniciando servidor Facilitaki...');
    console.log('📡 Porta:', PORT);
    console.log('🌍 Ambiente:', process.env.NODE_ENV || 'development');
    
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Painel Admin: https://facilitaki.onrender.com/admin/login`);
        console.log(`🌐 Site: https://facilitaki.onrender.com`);
        console.log(`\n📝 Para criar o primeiro administrador:`);
        console.log(`   1. Acesse o link do painel admin`);
        console.log(`   2. Clique na aba "Criar Admin"`);
        console.log(`   3. Preencha usuário e senha (mínimo 6 caracteres)`);
        console.log(`   4. Após criar, faça login normalmente\n`);
    });
}

startServer();
