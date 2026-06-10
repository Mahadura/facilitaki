// server.js - Facilitaki Backend Completo e Atualizado
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2025';

// ==================== CONFIGURAÇÃO DO BANCO ====================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db',
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('❌ Erro no pool do banco:', err));

// ==================== CONFIGURAÇÃO DE UPLOAD ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = process.env.NODE_ENV === 'production' ? '/tmp/uploads/' : 'uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
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

// ==================== MIDDLEWARES ====================
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Accept'] }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));
app.use('/uploads', express.static(process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads'));

// Logger
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// ==================== MIDDLEWARES DE AUTENTICAÇÃO ====================
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
        if (req.path === '/admin/painel' || req.path === '/admin/') {
            return res.redirect('/admin/login');
        }
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            if (req.path === '/admin/painel') return res.redirect('/admin/login');
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Acesso negado' });
        req.admin = decoded;
        next();
    });
};

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        // Tabela usuarios com is_admin
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
        console.log('✅ Tabela usuarios OK');

        // Tabela pedidos
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
                plano VARCHAR(50),
                nome_plano VARCHAR(100),
                preco DECIMAL(10,2),
                metodo_pagamento VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela pedidos OK');

        // Tabela contatos
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

        // Criar admin padrão se não existir
        const adminCheck = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminCheck.rows[0].count) === 0) {
            const defaultHash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
                ['admin', 'admin@facilitaki.com', defaultHash]
            );
            console.log('✅ Admin padrão criado: admin / admin123');
        }

        console.log('✅ Banco de dados inicializado!');
        return true;
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
        return false;
    }
}

function validarData(dataString) {
    if (!dataString || dataString.trim() === '' || dataString === 'null' || dataString === 'undefined') return null;
    try {
        const data = new Date(dataString);
        return isNaN(data.getTime()) ? null : data.toISOString().split('T')[0];
    } catch { return null; }
}

// ==================== ROTAS PÚBLICAS ====================
app.get('/status', (req, res) => {
    res.json({ status: 'online', message: 'Facilitaki API funcionando', timestamp: new Date().toISOString() });
});

app.get('/api/teste-banco', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as hora');
        res.json({ success: true, hora: result.rows[0].hora });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
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
        
        const token = jwt.sign({ id: result.rows[0].id, nome: result.rows[0].nome, telefone }, SECRET_KEY, { expiresIn: '7d' });
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
        const token = jwt.sign({ id: result.rows[0].id, nome, telefone }, SECRET_KEY, { expiresIn: '7d' });
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
        const { cliente, telefone, tema, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, tema, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [req.user.id, cliente, telefone, tema, descricao, plano, nomePlano, preco, metodoPagamento, req.file?.path]
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

// ==================== ROTAS ADMIN - PÁGINAS ====================
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
                .info {
                    margin-top: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #999;
                }
                .info a { color: #667eea; cursor: pointer; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Admin Login</h1>
                <input type="text" id="username" placeholder="Usuário" value="admin">
                <input type="password" id="password" placeholder="Senha" value="admin123">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
                <div class="info">
                    <p>🔑 Credenciais padrão: <strong>admin / admin123</strong></p>
                </div>
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

// ==================== ROTAS ADMIN - API ====================
app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        
        const token = jwt.sign({ id: result.rows[0].id, nome: usuario, isAdmin: true }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/verificar', authenticateAdmin, (req, res) => {
    res.json({ valid: true, admin: req.admin });
});

app.post('/api/admin/logout', authenticateAdmin, (req, res) => {
    res.json({ success: true });
});

// ==================== ROTAS ADMIN - CRUD ====================
app.get('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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

app.delete('/api/admin/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        const arquivos = await pool.query('SELECT arquivo_path FROM pedidos WHERE usuario_id = $1', [req.params.id]);
        arquivos.rows.forEach(row => { if (row.arquivo_path && fs.existsSync(row.arquivo_path)) fs.unlinkSync(row.arquivo_path); });
        await pool.query('DELETE FROM usuarios WHERE id = $1 AND is_admin = false', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== PAINEL ADMIN PRINCIPAL ====================
app.get('/admin/painel', authenticateAdmin, async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC');
        const usuarios = await pool.query('SELECT id, nome, telefone, is_admin, created_at FROM usuarios ORDER BY created_at DESC');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Painel Admin - Facilitaki</title>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 20px; }
                    .stat-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                    .stat-number { font-size: 32px; font-weight: bold; color: #667eea; }
                    .tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
                    .tab { padding: 10px 20px; background: #ddd; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
                    .tab.active { background: #667eea; color: white; }
                    .tab-content { display: none; background: white; padding: 20px; border-radius: 10px; overflow-x: auto; }
                    .tab-content.active { display: block; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                    th { background: #f8f9fa; }
                    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
                    .status-pendente { background: #fef3c7; color: #92400e; }
                    .status-pago { background: #d1fae5; color: #065f46; }
                    .status-em_andamento { background: #dbeafe; color: #1e40af; }
                    .status-concluido { background: #d1fae5; color: #065f46; }
                    .btn { padding: 5px 10px; border: none; border-radius: 3px; cursor: pointer; margin: 2px; }
                    .btn-view { background: #3498db; color: white; }
                    .btn-update { background: #2ecc71; color: white; }
                    .btn-delete { background: #e74c3c; color: white; }
                    .logout-btn { background: #e74c3c; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                    .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; z-index: 1000; }
                    .modal-content { background: white; padding: 20px; border-radius: 10px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div><h1><i class="fas fa-shield-alt"></i> Painel Administrativo</h1><p>Bem-vindo, ${req.admin.nome}</p></div>
                    <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Sair</button>
                </div>
                <div class="stats">
                    <div class="stat-card"><div class="stat-number">${pedidos.rows.length}</div><div>Total Pedidos</div></div>
                    <div class="stat-card"><div class="stat-number">${pedidos.rows.filter(p => p.status === 'pendente').length}</div><div>Pendentes</div></div>
                    <div class="stat-card"><div class="stat-number">${usuarios.rows.filter(u => !u.is_admin).length}</div><div>Clientes</div></div>
                    <div class="stat-card"><div class="stat-number">${contatos.rows.length}</div><div>Contatos</div></div>
                </div>
                <div class="tabs">
                    <button class="tab active" onclick="showTab('pedidos')"><i class="fas fa-shopping-cart"></i> Pedidos (${pedidos.rows.length})</button>
                    <button class="tab" onclick="showTab('usuarios')"><i class="fas fa-users"></i> Usuários (${usuarios.rows.length})</button>
                    <button class="tab" onclick="showTab('contatos')"><i class="fas fa-envelope"></i> Contatos (${contatos.rows.length})</button>
                </div>
                <div id="tab-pedidos" class="tab-content active">
                    <table><thead><tr><th>ID</th><th>Cliente</th><th>Telefone</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody>${pedidos.rows.map(p => `
                        <tr>
                            <td>${p.id}</td>
                            <td>${p.cliente}</td>
                            <td>${p.telefone}</td>
                            <td>${p.nome_plano || p.plano}</td>
                            <td>${parseFloat(p.preco).toLocaleString('pt-MZ')} MT</td>
                            <td><span class="status status-${p.status}">${p.status}</span></td>
                            <td>${new Date(p.data_pedido).toLocaleDateString()}</td>
                            <td>
                                <button class="btn btn-view" onclick="viewPedido(${p.id})"><i class="fas fa-eye"></i></button>
                                <button class="btn btn-update" onclick="updateStatus(${p.id})"><i class="fas fa-edit"></i></button>
                                <button class="btn btn-delete" onclick="deletePedido(${p.id})"><i class="fas fa-trash"></i></button>
                            </td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div id="tab-usuarios" class="tab-content">
                    <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Admin</th><th>Cadastro</th><th>Ações</th></tr></thead>
                    <tbody>${usuarios.rows.map(u => `
                        <tr>
                            <td>${u.id}</td>
                            <td>${u.nome}${u.is_admin ? ' ⭐' : ''}</td>
                            <td>${u.telefone}</td>
                            <td>${u.is_admin ? 'Sim' : 'Não'}</td>
                            <td>${new Date(u.created_at).toLocaleDateString()}</td>
                            <td>${!u.is_admin ? `<button class="btn btn-delete" onclick="deleteUser(${u.id})"><i class="fas fa-trash"></i></button>` : ''}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div id="tab-contatos" class="tab-content">
                    <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody>${contatos.rows.map(c => `
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
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div id="modal" class="modal"><div class="modal-content"><div id="modalBody"></div><button onclick="closeModal()" style="margin-top:15px; padding:8px 16px;">Fechar</button></div></div>
                <script>
                    const TOKEN = localStorage.getItem('admin_token');
                    if (!TOKEN) window.location.href = '/admin/login';
                    async function apiCall(url, options={}) {
                        const res = await fetch(url, {...options, headers:{'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}});
                        if (res.status === 401) window.location.href = '/admin/login';
                        return res.json();
                    }
                    function showTab(name) {
                        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
                        event.target.classList.add('active');
                        document.getElementById('tab-'+name).classList.add('active');
                    }
                    async function viewPedido(id) {
                        const data = await apiCall('/api/admin/pedido/'+id);
                        if (data.success) {
                            document.getElementById('modalBody').innerHTML = \`
                                <h3>Pedido #\${data.pedido.id}</h3>
                                <p><strong>Cliente:</strong> \${data.pedido.cliente}</p>
                                <p><strong>Telefone:</strong> \${data.pedido.telefone}</p>
                                <p><strong>Serviço:</strong> \${data.pedido.nome_plano}</p>
                                <p><strong>Valor:</strong> \${parseFloat(data.pedido.preco).toLocaleString('pt-MZ')} MT</p>
                                <p><strong>Status:</strong> \${data.pedido.status}</p>
                                <p><strong>Descrição:</strong> \${data.pedido.descricao || 'Nenhuma'}</p>
                                \${data.pedido.arquivo_path ? '<p><strong>Arquivo:</strong> <a href="/'+data.pedido.arquivo_path+'" target="_blank">Download</a></p>' : ''}
                            \`;
                            document.getElementById('modal').style.display = 'flex';
                        }
                    }
                    async function updateStatus(id) {
                        const status = prompt('Novo status (pendente, pago, em_andamento, concluido):');
                        if (status) { await apiCall('/api/admin/pedido/'+id+'/status', {method:'PUT', body:JSON.stringify({status})}); location.reload(); }
                    }
                    async function deletePedido(id) { if (confirm('Excluir este pedido?')) { await apiCall('/api/admin/pedido/'+id, {method:'DELETE'}); location.reload(); } }
                    async function deleteUser(id) { if (confirm('Excluir este usuário?')) { await apiCall('/api/admin/usuario/'+id, {method:'DELETE'}); location.reload(); } }
                    async function viewContato(id) {
                        const data = await apiCall('/api/admin/contato/'+id);
                        if (data.success) {
                            document.getElementById('modalBody').innerHTML = \`
                                <h3>Contato #\${data.contato.id}</h3>
                                <p><strong>Nome:</strong> \${data.contato.nome}</p>
                                <p><strong>Telefone:</strong> \${data.contato.telefone}</p>
                                <p><strong>Data:</strong> \${new Date(data.contato.data_envio).toLocaleString()}</p>
                                <p><strong>Mensagem:</strong></p>
                                <p>\${data.contato.mensagem}</p>
                            \`;
                            document.getElementById('modal').style.display = 'flex';
                        }
                    }
                    async function deleteContato(id) { if (confirm('Excluir este contato?')) { await apiCall('/api/admin/contato/'+id, {method:'DELETE'}); location.reload(); } }
                    function closeModal() { document.getElementById('modal').style.display = 'none'; }
                    async function logout() { await apiCall('/api/admin/logout', {method:'POST'}); localStorage.removeItem('admin_token'); window.location.href='/admin/login'; }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

// Redirecionamentos
app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/', (req, res) => res.redirect('/admin/login'));

// Tratamento de erros
app.use((err, req, res, next) => {
    console.error('❌ Erro:', err.message);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'Arquivo muito grande. Máximo 10MB.' });
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
        console.log(`\n✅ Servidor rodando em http://localhost:${PORT}`);
        console.log(`🔐 Painel Admin: https://facilitaki.onrender.com/admin/login`);
        console.log(`🌐 Site: https://facilitaki.onrender.com`);
        console.log(`\n📝 Credenciais admin padrão:`);
        console.log(`   Usuário: admin`);
        console.log(`   Senha: admin123\n`);
    });
}

startServer();
