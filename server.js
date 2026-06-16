// server.js - Facilitaki Backend (VERSÃO DEFINITIVA CORRIGIDA)
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

// ============================================
// CONFIGURAÇÕES
// ============================================
const JWT_SECRET = process.env.SECRET_KEY || 'chave-secreta-facilitaki';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Configuração do multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================
// FUNÇÕES DE AUTENTICAÇÃO
// ============================================
function generateAccessToken(user) {
    return jwt.sign(
        { id: user.id, nome: user.nome, telefone: user.telefone },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [decoded.id]);
        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Token inválido' });
    }
};

// ============================================
// INICIALIZAÇÃO DO BANCO
// ============================================
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(100),
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            DROP TABLE IF EXISTS pedidos CASCADE
        `);
        
        await pool.query(`
            CREATE TABLE pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                descricao TEXT NOT NULL,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50) NOT NULL,
                arquivo TEXT,
                status VARCHAR(20) DEFAULT 'pendente',
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100),
                telefone VARCHAR(100),
                mensagem TEXT,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Banco inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

// ============================================
// ROTA DE EMERGÊNCIA - RECRIAR TABELA
// ============================================
app.get('/admin/reparar-tabela', async (req, res) => {
    try {
        await pool.query(`DROP TABLE IF EXISTS pedidos CASCADE`);
        await pool.query(`
            CREATE TABLE pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                descricao TEXT NOT NULL,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50) NOT NULL,
                arquivo TEXT,
                status VARCHAR(20) DEFAULT 'pendente',
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Tabela Reparada</title>
            <style>
                body{font-family:Arial;background:#10b981;min-height:100vh;display:flex;justify-content:center;align-items:center}
                .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
            </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ TABELA REPARADA!</h1>
                    <p>A tabela pedidos foi recriada com a estrutura correta.</p>
                    <a href="/">Voltar ao site</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send(`Erro: ${error.message}`);
    }
});

// ============================================
// ROTA DE EMERGÊNCIA - CRIAR PRIMEIRO ADMIN
// ============================================
app.get('/admin/criar-fresco', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE is_admin = true');
        const hash = await bcrypt.hash('Admin123', 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            ['Administrador', '840000000', hash]
        );
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Admin Criado</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
                .card{background:#fff;padding:40px;border-radius:20px;max-width:400px;text-align:center}
                h1{color:#27ae60;margin-bottom:20px}
                .info{background:#f0f0f0;padding:15px;border-radius:10px;margin:20px 0;text-align:left}
                a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
            </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ ADMIN CRIADO!</h1>
                    <div class="info">
                        <p><strong>Usuário:</strong> Administrador</p>
                        <p><strong>WhatsApp:</strong> 840000000</p>
                        <p><strong>Senha:</strong> Admin123</p>
                    </div>
                    <a href="/admin/login">🔐 Fazer Login</a>
                    <br><br>
                    <a href="/admin/reparar-tabela" style="background:#f59e0b">🔧 Reparar Tabela (se necessário)</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send(`Erro: ${error.message}`);
    }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) {
            return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        }
        
        const accessToken = generateAccessToken(result.rows[0]);
        res.json({ 
            success: true, 
            accessToken,
            usuario: { 
                id: result.rows[0].id, 
                nome: result.rows[0].nome, 
                telefone: result.rows[0].telefone, 
                is_admin: result.rows[0].is_admin 
            }
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, erro: 'Senha deve ter pelo menos 6 caracteres' });
        }
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, false) RETURNING id, nome, telefone',
            [nome, telefoneLimpo, hash]
        );
        
        const accessToken = generateAccessToken(result.rows[0]);
        
        console.log('✅ Novo usuário cadastrado:', nome, telefoneLimpo);
        res.json({ 
            success: true, 
            accessToken, 
            usuario: { 
                id: result.rows[0].id, 
                nome: result.rows[0].nome, 
                telefone: result.rows[0].telefone 
            } 
        });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ============================================
// ROTA PARA SERVIAR O APK (4º ASPECTO)
// ============================================
app.get('/facilitaki.apk', (req, res) => {
    const apkPath = path.join(__dirname, 'facilitaki.apk');
    
    if (!fs.existsSync(apkPath)) {
        return res.status(404).json({ error: 'APK não encontrado' });
    }
    
    const stats = fs.statSync(apkPath);
    const fileSize = stats.size;
    
    console.log(`📱 Servindo APK: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);
    
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="facilitaki.apk"');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Accept-Ranges', 'bytes');
    
    res.sendFile(apkPath);
});

app.get('/api/apk-disponivel', (req, res) => {
    const apkPath = path.join(__dirname, 'facilitaki.apk');
    
    if (!fs.existsSync(apkPath)) {
        return res.json({ 
            disponivel: false, 
            tamanho: 0,
            versao: '2.0.0'
        });
    }
    
    const stats = fs.statSync(apkPath);
    const tamanhoMB = (stats.size / (1024 * 1024)).toFixed(1);
    
    res.json({ 
        disponivel: true, 
        tamanho: stats.size,
        tamanhoMB: tamanhoMB,
        versao: '2.0.0',
        nome: 'facilitaki.apk'
    });
});

// ============================================
// ROTAS PROTEGIDAS
// ============================================
app.get('/api/perfil', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, telefone, email, created_at FROM usuarios WHERE id = $1',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
        }
        res.json({ success: true, usuario: result.rows[0] });
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

// ============================================
// ROTA DE UPLOAD
// ============================================
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    console.log('=== UPLOAD RECEBIDO ===');
    console.log('Usuário ID:', req.user?.id);
    console.log('Body:', req.body);
    console.log('File:', req.file ? req.file.originalname : 'sem arquivo');
    
    try {
        const { cliente, telefone, tema, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        if (!plano) {
            return res.status(400).json({ success: false, erro: 'Serviço não selecionado' });
        }
        if (!nomePlano) {
            return res.status(400).json({ success: false, erro: 'Nome do plano não informado' });
        }
        if (!preco) {
            return res.status(400).json({ success: false, erro: 'Preço não informado' });
        }
        if (!metodoPagamento) {
            return res.status(400).json({ success: false, erro: 'Método de pagamento não selecionado' });
        }
        
        const textoDescricao = tema || descricao;
        if (!textoDescricao || textoDescricao.trim() === '') {
            return res.status(400).json({ success: false, erro: 'Descreva o tema do seu trabalho' });
        }
        
        let arquivoBase64 = null;
        if (req.file) {
            arquivoBase64 = req.file.buffer.toString('base64');
            console.log('Arquivo convertido, tamanho:', Math.round(arquivoBase64.length / 1024), 'KB');
        }
        
        const telefoneLimpo = telefone ? telefone.toString().replace(/\D/g, '') : req.user.telefone;
        const precoNumero = parseFloat(preco);
        const nomeCliente = cliente || req.user.nome;
        
        console.log('Inserindo no banco...');
        
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendente')
             RETURNING id`,
            [req.user.id, nomeCliente, telefoneLimpo, textoDescricao, plano, nomePlano, precoNumero, metodoPagamento, arquivoBase64]
        );
        
        console.log('✅ Pedido criado! ID:', result.rows[0].id);
        
        res.json({ 
            success: true, 
            pedido: result.rows[0],
            message: 'Pedido registrado com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ ERRO:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro interno: ' + error.message
        });
    }
});

app.put('/api/perfil', authenticateToken, async (req, res) => {
    try {
        const { nome, email } = req.body;
        await pool.query(
            'UPDATE usuarios SET nome = COALESCE($1, nome), email = COALESCE($2, email) WHERE id = $3',
            [nome, email, req.user.id]
        );
        res.json({ success: true });
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

// ============================================
// ROTAS ADMIN
// ============================================
app.post('/admin/api/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE (nome = $1 OR telefone = $1) AND is_admin = true', [usuario]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome: result.rows[0].nome, isAdmin: true },
            JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({ success: true, token, admin: { id: result.rows[0].id, nome: result.rows[0].nome } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/api/usuarios', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, telefone, email, is_admin, created_at FROM usuarios ORDER BY is_admin DESC, created_at DESC');
        res.json({ success: true, usuarios: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/api/criar-admin', authenticateAdmin, async (req, res) => {
    console.log('📝 Criando admin:', req.body);
    
    try {
        const { nome, telefone, senha, confirmarSenha } = req.body;
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, error: '❌ Nome é obrigatório' });
        }
        if (!telefone || telefone.trim() === '') {
            return res.status(400).json({ success: false, error: '❌ WhatsApp é obrigatório' });
        }
        if (!senha || senha.trim() === '') {
            return res.status(400).json({ success: false, error: '❌ Senha é obrigatória' });
        }
        if (!confirmarSenha || confirmarSenha.trim() === '') {
            return res.status(400).json({ success: false, error: '❌ Confirmar senha é obrigatório' });
        }
        
        if (senha !== confirmarSenha) {
            return res.status(400).json({ success: false, error: '❌ As senhas não coincidem' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, error: '❌ A senha deve ter pelo menos 6 caracteres' });
        }
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, error: '❌ Este WhatsApp já está cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true) RETURNING id, nome',
            [nome.trim(), telefoneLimpo, hash]
        );
        
        console.log('✅ Admin criado:', result.rows[0]);
        res.json({ success: true, message: '✅ Administrador criado com sucesso!', admin: result.rows[0] });
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/remover-admin/:id', authenticateAdmin, async (req, res) => {
    try {
        const adminId = parseInt(req.params.id);
        
        if (adminId === 1) {
            return res.status(400).json({ success: false, error: '❌ O primeiro administrador não pode ser removido!' });
        }
        
        if (adminId === req.user.id) {
            return res.status(400).json({ success: false, error: '❌ Você não pode remover sua própria conta' });
        }
        
        const userCheck = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [adminId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }
        
        if (!userCheck.rows[0].is_admin) {
            return res.status(400).json({ success: false, error: 'Este usuário não é administrador' });
        }
        
        await pool.query('DELETE FROM usuarios WHERE id = $1', [adminId]);
        
        res.json({ success: true, message: '✅ Administrador removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/remover-cliente/:id', authenticateAdmin, async (req, res) => {
    try {
        const clienteId = parseInt(req.params.id);
        
        const userCheck = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [clienteId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }
        
        if (userCheck.rows[0].is_admin) {
            return res.status(400).json({ success: false, error: 'Use a opção "Remover Admin" para administradores' });
        }
        
        await pool.query('DELETE FROM usuarios WHERE id = $1', [clienteId]);
        
        res.json({ success: true, message: '✅ Cliente removido com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/api/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC LIMIT 100');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 100');
        const totalPedidos = (await pool.query('SELECT COUNT(*) FROM pedidos')).rows[0].count;
        const pedidosPendentes = (await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'pendente'")).rows[0].count;
        const totalClientes = (await pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = false")).rows[0].count;
        const totalAdmins = (await pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = true")).rows[0].count;
        
        res.json({
            pedidos: pedidos.rows,
            contatos: contatos.rows,
            totalPedidos: parseInt(totalPedidos),
            pedidosPendentes: parseInt(pedidosPendentes),
            totalClientes: parseInt(totalClientes),
            totalAdmins: parseInt(totalAdmins)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/admin/api/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PÁGINAS ADMIN
// ============================================
app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Admin Login - Facilitaki</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
            .container{background:#fff;padding:40px;border-radius:20px;width:400px;text-align:center}
            h1{color:#333;margin-bottom:10px}
            input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
            button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:bold}
            .error{color:#e74c3c;margin-top:10px}
            .info{margin-top:20px;padding:10px;background:#e8f4fd;border-radius:10px}
        </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Admin Login</h1>
                <input type="text" id="username" placeholder="Usuário ou WhatsApp">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
                <div class="info">⚠️ Primeiro acesso? <a href="/admin/criar-fresco">Clique aqui</a></div>
            </div>
            <script>
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
                    if(!username || !password) { errorDiv.textContent = 'Preencha todos os campos'; return; }
                    try {
                        const res = await fetch('/admin/api/login', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({usuario:username, senha:password})
                        });
                        const data = await res.json();
                        if(data.success){
                            localStorage.setItem('adminToken', data.token);
                            localStorage.setItem('adminNome', data.admin.nome);
                            localStorage.setItem('adminId', data.admin.id);
                            window.location.href = '/admin/painel';
                        } else {
                            errorDiv.textContent = data.error;
                        }
                    } catch(e) { errorDiv.textContent = 'Erro de conexão'; }
                }
            </script>
        </body>
        </html>
    `);
});

app.get('/admin/painel', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Admin Painel - Facilitaki</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:#f0f2f5;padding:20px}
            .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}
            .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:20px}
            .stat-card{background:#fff;padding:20px;border-radius:10px;text-align:center;box-shadow:0 2px 5px rgba(0,0,0,0.1)}
            .stat-number{font-size:32px;font-weight:bold;color:#667eea}
            .tabs{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
            .tab-btn{background:#fff;border:none;padding:12px 24px;border-radius:10px;cursor:pointer;font-weight:bold}
            .tab-btn.active{background:#667eea;color:#fff}
            .tab-content{display:none;background:#fff;border-radius:10px;padding:20px;overflow-x:auto}
            .tab-content.active{display:block}
            table{width:100%;border-collapse:collapse}
            th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
            .btn{padding:6px 12px;border:none;border-radius:5px;cursor:pointer;margin:2px}
            .btn-danger{background:#e74c3c;color:#fff}
            .btn-warning{background:#f39c12;color:#fff}
            .btn-primary{background:#667eea;color:#fff}
            .logout-btn{background:#e74c3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
            .form-admin{background:#f8f9fa;padding:20px;border-radius:10px;margin-bottom:20px}
            .form-admin input{margin:8px 0;padding:10px;border:1px solid #ddd;border-radius:5px;width:100%}
            .alert-success{background:#d4edda;color:#155724;padding:10px;border-radius:5px;margin-top:10px}
            .alert-error{background:#f8d7da;color:#721c24;padding:10px;border-radius:5px;margin-top:10px}
        </style>
        </head>
        <body>
            <div class="header">
                <div><h1>📊 Facilitaki Admin</h1><p>Bem-vindo, <span id="adminNome">Admin</span>!</p></div>
                <button class="logout-btn" onclick="logout()">Sair</button>
            </div>
            <div class="stats" id="stats"></div>
            <div class="tabs">
                <button class="tab-btn active" onclick="showTab('pedidos')">📦 Pedidos</button>
                <button class="tab-btn" onclick="showTab('usuarios')">👥 Usuários</button>
                <button class="tab-btn" onclick="showTab('admins')">👑 Administradores</button>
                <button class="tab-btn" onclick="showTab('contatos')">📬 Contatos</button>
            </div>
            <div id="tab-pedidos" class="tab-content active"><div id="pedidos-table">Carregando...</div></div>
            <div id="tab-usuarios" class="tab-content"><div id="usuarios-table">Carregando...</div></div>
            <div id="tab-admins" class="tab-content">
                <div class="form-admin">
                    <h3>➕ Criar Administrador</h3>
                    <input type="text" id="adminNomeInput" placeholder="Nome *">
                    <input type="tel" id="adminTelefoneInput" placeholder="WhatsApp *">
                    <input type="password" id="adminSenhaInput" placeholder="Senha *">
                    <input type="password" id="adminConfirmarSenhaInput" placeholder="Confirmar senha *">
                    <button class="btn btn-primary" onclick="criarAdmin()">Criar Administrador</button>
                    <div id="adminMsg"></div>
                </div>
                <div id="admins-table">Carregando...</div>
            </div>
            <div id="tab-contatos" class="tab-content"><div id="contatos-table">Carregando...</div></div>
            <script>
                const token = localStorage.getItem('adminToken');
                if(!token) window.location.href = '/admin/login';
                
                async function fetchWithAuth(url, options={}) {
                    const res = await fetch(url, {...options, headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}});
                    if(res.status===401){localStorage.clear();window.location.href='/admin/login';}
                    return res.json();
                }
                
                async function loadDashboard() {
                    const data = await fetchWithAuth('/admin/api/dashboard');
                    document.getElementById('stats').innerHTML = \`
                        <div class="stat-card"><div class="stat-number">\${data.totalPedidos}</div><div>Total Pedidos</div></div>
                        <div class="stat-card"><div class="stat-number">\${data.pedidosPendentes}</div><div>Pendentes</div></div>
                        <div class="stat-card"><div class="stat-number">\${data.totalClientes}</div><div>Clientes</div></div>
                        <div class="stat-card"><div class="stat-number">\${data.totalAdmins}</div><div>Administradores</div></div>
                    \`;
                    document.getElementById('pedidos-table').innerHTML = tablePedidos(data.pedidos);
                    document.getElementById('contatos-table').innerHTML = tableContatos(data.contatos);
                    carregarUsuarios();
                    carregarAdmins();
                }
                
                async function carregarUsuarios() {
                    const data = await fetchWithAuth('/admin/api/usuarios');
                    const clientes = (data.usuarios || []).filter(u => !u.is_admin);
                    document.getElementById('usuarios-table').innerHTML = tableClientes(clientes);
                }
                
                async function carregarAdmins() {
                    const data = await fetchWithAuth('/admin/api/usuarios');
                    const admins = (data.usuarios || []).filter(u => u.is_admin);
                    document.getElementById('admins-table').innerHTML = tableAdmins(admins);
                }
                
                function tablePedidos(pedidos) {
                    if(!pedidos.length) return '<p>Nenhum pedido</p>';
                    return '<table><thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>' +
                        pedidos.map(p => '<tr><td>'+p.id+'</td><td>'+p.cliente+'</td><td>'+p.nome_plano+'</td><td>'+p.preco+' MT</td><td>'+p.status+'</td><td><button class="btn btn-warning" onclick="alterarStatus('+p.id+')">Status</button> <button class="btn btn-danger" onclick="excluirPedido('+p.id+')">Excluir</button></td></tr>').join('') +
                        '</tbody></table>';
                }
                
                function tableClientes(clientes) {
                    if(!clientes.length) return '<p>Nenhum cliente</p>';
                    return '<table><thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Data</th><th>Ações</th></tr></thead><tbody>' +
                        clientes.map(c => '<tr><td>'+c.id+'</td><td>'+c.nome+'</td><td>'+c.telefone+'</td><td>'+new Date(c.created_at).toLocaleDateString()+'</td><td><button class="btn btn-danger" onclick="removerCliente('+c.id+')">Remover</button></td></tr>').join('') +
                        '</tbody></table>';
                }
                
                function tableAdmins(admins) {
                    if(!admins.length) return '<p>Nenhum admin</p>';
                    const adminIdAtual = parseInt(localStorage.getItem('adminId'));
                    return '<p class="alert-warning">⚠️ Administrador ID 1 é protegido</p>' +
                        '<table><thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Data</th><th>Ações</th></tr></thead><tbody>' +
                        admins.map(a => '<tr><td>'+a.id+'</td><td>'+a.nome+(a.id===1?' 🔒':'')+'</td><td>'+a.telefone+'</td><td>'+new Date(a.created_at).toLocaleDateString()+'</td><td>'+(a.id!==1 && a.id!==adminIdAtual ? '<button class="btn btn-danger" onclick="removerAdmin('+a.id+')">Remover</button>' : '-')+'</td></tr>').join('') +
                        '</tbody></table>';
                }
                
                function tableContatos(contatos) {
                    if(!contatos.length) return '<p>Nenhuma mensagem</p>';
                    return '<table><thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Mensagem</th><th>Data</th></tr></thead><tbody>' +
                        contatos.map(c => '<tr><td>'+c.id+'</td><td>'+c.nome+'</td><td>'+c.telefone+'</td><td style="max-width:300px">'+(c.mensagem||'').substring(0,100)+'</td><td>'+new Date(c.data_envio).toLocaleString()+'</td></tr>').join('') +
                        '</tbody></table>';
                }
                
                async function criarAdmin() {
                    const nome = document.getElementById('adminNomeInput').value;
                    const telefone = document.getElementById('adminTelefoneInput').value;
                    const senha = document.getElementById('adminSenhaInput').value;
                    const confirmar = document.getElementById('adminConfirmarSenhaInput').value;
                    const msgDiv = document.getElementById('adminMsg');
                    
                    if(!nome || !telefone || !senha || !confirmar) {
                        msgDiv.innerHTML = '<div class="alert-error">❌ Preencha todos os campos</div>';
                        return;
                    }
                    if(senha !== confirmar) {
                        msgDiv.innerHTML = '<div class="alert-error">❌ As senhas não coincidem</div>';
                        return;
                    }
                    if(senha.length < 6) {
                        msgDiv.innerHTML = '<div class="alert-error">❌ A senha deve ter pelo menos 6 caracteres</div>';
                        return;
                    }
                    
                    msgDiv.innerHTML = '<div class="alert-success">⏳ Criando administrador...</div>';
                    
                    try {
                        const data = await fetchWithAuth('/admin/api/criar-admin', {
                            method:'POST',
                            body:JSON.stringify({nome, telefone, senha, confirmarSenha:confirmar})
                        });
                        
                        if(data.success) {
                            msgDiv.innerHTML = '<div class="alert-success">✅ '+data.message+'</div>';
                            document.getElementById('adminNomeInput').value = '';
                            document.getElementById('adminTelefoneInput').value = '';
                            document.getElementById('adminSenhaInput').value = '';
                            document.getElementById('adminConfirmarSenhaInput').value = '';
                            carregarAdmins();
                            setTimeout(()=>msgDiv.innerHTML='',3000);
                        } else {
                            msgDiv.innerHTML = '<div class="alert-error">❌ '+data.error+'</div>';
                        }
                    } catch(e) {
                        msgDiv.innerHTML = '<div class="alert-error">❌ Erro de conexão</div>';
                    }
                }
                
                async function removerAdmin(id) {
                    if(confirm('Remover este administrador?')) {
                        const data = await fetchWithAuth('/admin/api/remover-admin/'+id,{method:'DELETE'});
                        alert(data.success ? '✅ Removido!' : '❌ '+data.error);
                        if(data.success) carregarAdmins();
                    }
                }
                
                async function removerCliente(id) {
                    if(confirm('Remover este cliente?')) {
                        const data = await fetchWithAuth('/admin/api/remover-cliente/'+id,{method:'DELETE'});
                        alert(data.success ? '✅ Removido!' : '❌ '+data.error);
                        if(data.success) carregarUsuarios();
                    }
                }
                
                async function alterarStatus(id) {
                    const status = prompt('Status: pendente, pago, em_andamento, concluido');
                    if(status) {
                        const data = await fetchWithAuth('/admin/api/pedido/'+id+'/status',{method:'PUT',body:JSON.stringify({status})});
                        alert(data.success ? '✅ Atualizado!' : '❌ '+data.error);
                        if(data.success) loadDashboard();
                    }
                }
                
                async function excluirPedido(id) {
                    if(confirm('Excluir pedido?')) {
                        const data = await fetchWithAuth('/admin/api/pedido/'+id,{method:'DELETE'});
                        alert(data.success ? '✅ Excluído!' : '❌ '+data.error);
                        if(data.success) loadDashboard();
                    }
                }
                
                function showTab(tab) {
                    document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
                    document.querySelectorAll('.tab-btn').forEach(t=>t.classList.remove('active'));
                    document.getElementById('tab-'+tab).classList.add('active');
                    event.target.classList.add('active');
                }
                
                function logout() { localStorage.clear(); window.location.href='/admin/login'; }
                
                loadDashboard();
            </script>
        </body>
        </html>
    `);
});

// ============================================
// INICIAR SERVIDOR
// ============================================
async function startServer() {
    console.log('🚀 Iniciando servidor Facilitaki...');
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n✅ Servidor rodando na porta ${PORT}`);
        console.log(`🌐 Site: http://localhost:${PORT}`);
        console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
        console.log(`👑 Criar Admin: http://localhost:${PORT}/admin/criar-fresco`);
        console.log(`🔧 Reparar Tabela: http://localhost:${PORT}/admin/reparar-tabela`);
        console.log(`📱 APK disponível em: http://localhost:${PORT}/facilitaki.apk`);
    });
}

startServer();