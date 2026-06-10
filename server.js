// server.js - Versão Estável para Render
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
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png'];
        const ext = path.extname(file.originalname).toLowerCase();
        allowed.includes(ext) ? cb(null, true) : cb(new Error('Formato não suportado'));
    }
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// Log de requisições
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
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Acesso negado' });
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
        console.error('❌ Erro:', error.message);
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

// Página de login admin (HTML embutido)
app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Admin Login</title>
            <style>
                body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center;margin:0}
                .container{background:white;padding:40px;border-radius:20px;width:350px;text-align:center}
                input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
                button{width:100%;padding:12px;background:#667eea;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:bold}
                .error{color:#c33;margin-top:10px;display:none}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Admin Login</h1>
                <input type="text" id="username" placeholder="Usuário">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
            </div>
            <script>
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
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
                            window.location.href = '/admin/painel';
                        } else {
                            errorDiv.textContent = data.error || 'Erro no login';
                            errorDiv.style.display = 'block';
                        }
                    } catch(e) {
                        errorDiv.textContent = 'Erro de conexão';
                        errorDiv.style.display = 'block';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Login admin API
app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        
        if (result.rows.length === 0) {
            // Criar primeiro admin automaticamente
            if (usuario === 'admin') {
                const hash = await bcrypt.hash('admin123', 10);
                await pool.query('INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)', [usuario, 'admin@system.com', hash]);
                const token = jwt.sign({ id: 1, nome: usuario, isAdmin: true }, SECRET_KEY, { expiresIn: '8h' });
                return res.json({ success: true, token });
            }
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        
        const token = jwt.sign({ id: result.rows[0].id, nome: usuario, isAdmin: true }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Painel admin
app.get('/admin/painel', authenticateAdmin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Painel Admin</title>
            <style>
                body{font-family:Arial;padding:20px;background:#f5f5f5}
                .header{background:#667eea;color:white;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between}
                .card{background:white;padding:20px;border-radius:10px;margin-bottom:20px}
                button{background:#e74c3c;color:white;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
            </style>
        </head>
        <body>
            <div class="header">
                <div><h1>Painel Administrativo</h1><p>Bem-vindo, ${req.admin.nome}</p></div>
                <button onclick="logout()">Sair</button>
            </div>
            <div class="card">
                <h2>✅ Sistema funcionando!</h2>
                <p>Servidor rodando corretamente no Render.com</p>
            </div>
            <script>
                async function logout() {
                    localStorage.removeItem('admin_token');
                    window.location.href = '/admin/login';
                }
                const token = localStorage.getItem('admin_token');
                if (!token) window.location.href = '/admin/login';
            </script>
        </body>
        </html>
    `);
});

app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/', (req, res) => res.redirect('/admin/login'));

// ==================== INICIAR SERVIDOR ====================
async function start() {
    console.log('🚀 Iniciando servidor...');
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
    });
}

start();
