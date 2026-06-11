// server.js - Facilitaki Backend (CORRIGIDO para deploy)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// ============================================
if (!process.env.SECRET_KEY) {
    console.error('❌ SECRET_KEY não definida! Usando chave padrão para desenvolvimento');
    process.env.SECRET_KEY = 'chave-secreta-facilitaki-desenvolvimento';
}

// ============================================
// CONFIGURAÇÃO DO BANCO DE DADOS
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
});

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

// ============================================
// RATE LIMITING
// ============================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Limite de uploads excedido.' }
});

// ============================================
// CONFIGURAÇÃO DE UPLOAD
// ============================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = '/tmp/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const safeName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, safeName);
    }
});

const upload = multer({ 
    storage, 
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ============================================
// FUNÇÕES DE VALIDAÇÃO
// ============================================
function validarTelefoneMocambique(telefone) {
    const telefoneLimpo = telefone.toString().replace(/\D/g, '');
    const regex = /^(84|85|86|87)\d{7}$/;
    return regex.test(telefoneLimpo);
}

function validarSenha(senha) {
    if (!senha || senha.length < 6) return false;
    return true;
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
        }
        req.user = user;
        next();
    });
};

const authenticateAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        const result = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [decoded.id]);
        
        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ success: false, error: 'Acesso negado.' });
        }
        
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Token inválido' });
    }
};

// ============================================
// GERAR TOKENS
// ============================================
function generateAccessToken(user) {
    return jwt.sign(
        { id: user.id, nome: user.nome, telefone: user.telefone },
        process.env.SECRET_KEY,
        { expiresIn: '7d' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id },
        process.env.SECRET_KEY,
        { expiresIn: '30d' }
    );
}

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
                refresh_token VARCHAR(500),
                reset_token VARCHAR(255),
                reset_token_expires TIMESTAMP,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                descricao TEXT,
                tema TEXT,
                plano VARCHAR(50),
                nome_plano VARCHAR(100),
                preco DECIMAL(10,2),
                metodo_pagamento VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_pagamento TIMESTAMP,
                comprovativo_path VARCHAR(255)
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Criar admin padrão se não existir
        const adminCheck = await pool.query("SELECT * FROM usuarios WHERE is_admin = true LIMIT 1");
        if (adminCheck.rows.length === 0) {
            const hash = await bcrypt.hash('Admin123', 10);
            await pool.query(
                "INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)",
                ['Administrador', '840000000', hash]
            );
            console.log('✅ Admin padrão criado: usuario=Administrador, senha=Admin123');
        }
        
        console.log('✅ Banco inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error.message);
    }
}

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

app.post('/api/login', loginLimiter, async (req, res) => {
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
        const refreshToken = generateRefreshToken(result.rows[0]);
        
        await pool.query('UPDATE usuarios SET refresh_token = $1 WHERE id = $2', [refreshToken, result.rows[0].id]);
        
        res.json({ 
            success: true, 
            accessToken,
            refreshToken,
            usuario: { id: result.rows[0].id, nome: result.rows[0].nome, telefone: result.rows[0].telefone }
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
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefoneLimpo, hash]
        );
        
        const accessToken = generateAccessToken(result.rows[0]);
        const refreshToken = generateRefreshToken(result.rows[0]);
        
        await pool.query('UPDATE usuarios SET refresh_token = $1 WHERE id = $2', [refreshToken, result.rows[0].id]);
        
        console.log('✅ Novo usuário cadastrado:', nome, telefoneLimpo);
        res.json({ success: true, accessToken, refreshToken, usuario: result.rows[0] });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({ success: false, error: 'Refresh token não fornecido' });
        }
        
        const result = await pool.query('SELECT * FROM usuarios WHERE refresh_token = $1', [refreshToken]);
        
        if (result.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Refresh token inválido' });
        }
        
        try {
            jwt.verify(refreshToken, process.env.SECRET_KEY);
            const newAccessToken = generateAccessToken(result.rows[0]);
            const newRefreshToken = generateRefreshToken(result.rows[0]);
            
            await pool.query('UPDATE usuarios SET refresh_token = $1 WHERE id = $2', [newRefreshToken, result.rows[0].id]);
            
            res.json({ success: true, accessToken: newAccessToken, refreshToken: newRefreshToken });
        } catch (err) {
            return res.status(403).json({ success: false, error: 'Refresh token expirado' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTAS PROTEGIDAS
// ============================================

app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC`,
            [req.user.id]
        );
        
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/pedidos/upload', authenticateToken, uploadLimiter, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, tema, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        const telefoneLimpo = telefone ? telefone.toString().replace(/\D/g, '') : req.user.telefone;
        
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, tema, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pendente') RETURNING *`,
            [req.user.id, cliente || req.user.nome, telefoneLimpo, tema || null, descricao || null, plano, nomePlano, preco, metodoPagamento, req.file?.path]
        );
        
        console.log('✅ Pedido criado:', result.rows[0].id);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ success: false, erro: error.message });
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

app.post('/admin/api/login', loginLimiter, async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
        }
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome: result.rows[0].nome, isAdmin: true },
            process.env.SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/api/dashboard', authenticateAdmin, async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC LIMIT 100');
        const usuarios = await pool.query('SELECT id, nome, telefone, email, is_admin, created_at FROM usuarios ORDER BY created_at DESC');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 100');
        
        const totalPedidos = (await pool.query('SELECT COUNT(*) FROM pedidos')).rows[0].count;
        const pedidosPendentes = (await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'pendente'")).rows[0].count;
        const totalClientes = (await pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = false")).rows[0].count;
        const totalAdmins = (await pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = true")).rows[0].count;
        
        res.json({
            pedidos: pedidos.rows,
            usuarios: usuarios.rows,
            contatos: contatos.rows,
            totalPedidos: parseInt(totalPedidos),
            pedidosPendentes: parseInt(pedidosPendentes),
            totalClientes: parseInt(totalClientes),
            totalAdmins: parseInt(totalAdmins),
            totalUsuarios: usuarios.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/admin/api/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const validStatus = ['pendente', 'pago', 'em_andamento', 'concluido', 'cancelado'];
        if (!validStatus.includes(req.body.status)) {
            return res.status(400).json({ success: false, error: 'Status inválido' });
        }
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

app.delete('/admin/api/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        const userCheck = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [req.params.id]);
        if (userCheck.rows.length > 0 && userCheck.rows[0].is_admin) {
            return res.status(400).json({ success: false, error: 'Não é possível excluir administradores' });
        }
        await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Admin Login</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
            .container{background:#fff;padding:40px;border-radius:20px;width:400px;text-align:center}
            input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
            button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:10px;cursor:pointer}
            .error{color:#c33;margin-top:10px}
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
                    const res = await fetch('/admin/api/login', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({usuario:document.getElementById('username').value, senha:document.getElementById('password').value})
                    });
                    const data = await res.json();
                    if(data.success){
                        localStorage.setItem('adminToken', data.token);
                        window.location.href = '/admin/painel';
                    }else{
                        document.getElementById('error').textContent = data.error;
                    }
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
        <head><meta charset="UTF-8"><title>Admin Painel</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:#f5f5f5;padding:20px}
            .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between}
            .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:20px}
            .stat-card{background:#fff;padding:20px;border-radius:10px;text-align:center}
            .stat-number{font-size:32px;font-weight:bold;color:#667eea}
            table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden}
            th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
            .btn{padding:5px 10px;border:none;border-radius:3px;cursor:pointer;margin:2px}
            .btn-update{background:#2ecc71;color:#fff}
            .btn-delete{background:#e74c3c;color:#fff}
            .logout-btn{background:#e74c3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
        </style>
        </head>
        <body>
            <div class="header"><h1>Painel Administrativo</h1><button class="logout-btn" onclick="logout()">Sair</button></div>
            <div id="content">Carregando...</div>
            <script>
                const token = localStorage.getItem('adminToken');
                if(!token) window.location.href = '/admin/login';
                
                async function fetchWithAuth(url, options={}) {
                    const res = await fetch(url, {
                        ...options,
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
                    });
                    if(res.status === 401) { localStorage.removeItem('adminToken'); window.location.href = '/admin/login'; }
                    return res.json();
                }
                
                async function load() {
                    const data = await fetchWithAuth('/admin/api/dashboard');
                    document.getElementById('content').innerHTML = \`
                        <div class="stats">
                            <div class="stat-card"><div class="stat-number">\${data.totalPedidos}</div><div>Total Pedidos</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.pedidosPendentes}</div><div>Pendentes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalClientes}</div><div>Clientes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalAdmins}</div><div>Admins</div></div>
                        </div>
                        <h3>Pedidos Recentes</h3>
                        <table><thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>
                            \${data.pedidos.map(p => \`<tr><td>\${p.id}</td><td>\${p.cliente}</td><td>\${p.nome_plano}</td><td>\${p.preco} MT</td><td>\${p.status}</td><td><button class="btn btn-update" onclick="updateStatus(\${p.id})">Status</button><button class="btn btn-delete" onclick="deletePedido(\${p.id})">Excluir</button></td></tr>\`).join('')}
                        </tbody></table>
                    \`;
                }
                
                async function updateStatus(id) {
                    const status = prompt('Novo status (pendente, pago, em_andamento, concluido):');
                    if(status) await fetchWithAuth('/admin/api/pedido/' + id + '/status', { method: 'PUT', body: JSON.stringify({status}) });
                    load();
                }
                
                async function deletePedido(id) {
                    if(confirm('Excluir?')) await fetchWithAuth('/admin/api/pedido/' + id, { method: 'DELETE' });
                    load();
                }
                
                function logout() { localStorage.removeItem('adminToken'); window.location.href = '/admin/login'; }
                load();
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
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: https://facilitaki.onrender.com/admin/login`);
        console.log(`👤 Admin padrão: Administrador / Admin123`);
    });
}

startServer();
