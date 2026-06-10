// server.js - Versão Simplificada para Render
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

// Conexão com banco
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Upload config
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
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));
app.use('/uploads', express.static('/tmp/uploads'));

// Logger básico
console.log('🚀 Servidor iniciando...');

// Rota de status
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota de teste banco
app.get('/api/teste-banco', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as hora');
        res.json({ success: true, hora: result.rows[0].hora });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTAS DE AUTENTICAÇÃO =====

// Middleware auth
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

// Login usuário comum
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        
        const token = jwt.sign({ id: result.rows[0].id, nome: result.rows[0].nome, isAdmin: false }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// Cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (existe.rows.length > 0) return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query('INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone', [nome, telefone, hash]);
        const token = jwt.sign({ id: result.rows[0].id, nome, isAdmin: false }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// Criar pedido
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

// Meus pedidos
app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC', [req.user.id]);
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        res.json({ success: true, pedidos: [] });
    }
});

// Contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefone, mensagem]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== ROTAS ADMIN =====

// Login admin
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

// Registrar admin (primeiro acesso)
app.post('/api/admin/register', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        // Verificar se já existe algum admin
        const adminCount = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        const isFirstAdmin = parseInt(adminCount.rows[0].count) === 0;
        
        if (!isFirstAdmin) {
            // Verificar token para criar novos admins
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token) return res.status(401).json({ success: false, error: 'Apenas administradores podem criar novos admins' });
            
            try {
                const decoded = jwt.verify(token, SECRET_KEY);
                if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Apenas administradores podem criar novos admins' });
            } catch (err) {
                return res.status(401).json({ success: false, error: 'Token inválido' });
            }
        }
        
        // Verificar se usuário já existe
        const userExists = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Usuário já existe' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            [usuario, `admin_${Date.now()}@system.com`, hash]
        );
        
        res.json({ success: true, message: 'Administrador criado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Página de login admin
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// Painel admin
app.get('/admin/painel', authenticateAdmin, (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Painel Admin - Facilitaki</title>
            <style>
                body { font-family: Arial; padding: 20px; background: #f5f5f5; }
                .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
                .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                button { background: #e74c3c; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
                .logout-btn { background: #e74c3c; }
                .success { background: #2ecc71; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div><h1>📊 Painel Administrativo</h1><p>Bem-vindo, ${req.admin.nome}</p></div>
                <button class="logout-btn" onclick="logout()">Sair</button>
            </div>
            <div class="card">
                <h2>✅ Sistema funcionando!</h2>
                <p>Servidor rodando corretamente no Render.com</p>
                <p>Total de pedidos: carregando...</p>
                <button onclick="location.reload()">Atualizar</button>
            </div>
            <div class="card">
                <h3>Criar novo administrador</h3>
                <input type="text" id="newUser" placeholder="Usuário" style="padding: 10px; margin: 5px;">
                <input type="password" id="newPass" placeholder="Senha" style="padding: 10px; margin: 5px;">
                <input type="password" id="newPassConfirm" placeholder="Confirmar" style="padding: 10px; margin: 5px;">
                <button class="success" onclick="createAdmin()">Criar Admin</button>
                <div id="message"></div>
            </div>
            <script>
                const TOKEN = localStorage.getItem('admin_token');
                if (!TOKEN) window.location.href = '/admin/login';
                
                async function apiCall(url, options={}) {
                    const res = await fetch(url, {
                        ...options,
                        headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }
                    });
                    if (res.status === 401) window.location.href = '/admin/login';
                    return res.json();
                }
                
                async function createAdmin() {
                    const usuario = document.getElementById('newUser').value;
                    const senha = document.getElementById('newPass').value;
                    const confirm = document.getElementById('newPassConfirm').value;
                    const msgDiv = document.getElementById('message');
                    
                    if (!usuario || !senha || !confirm) {
                        msgDiv.innerHTML = '<span style="color:#c33;">Preencha todos os campos</span>';
                        return;
                    }
                    if (senha !== confirm) {
                        msgDiv.innerHTML = '<span style="color:#c33;">Senhas não coincidem</span>';
                        return;
                    }
                    if (senha.length < 6) {
                        msgDiv.innerHTML = '<span style="color:#c33;">Senha deve ter mínimo 6 caracteres</span>';
                        return;
                    }
                    
                    const data = await apiCall('/api/admin/register', {
                        method: 'POST',
                        body: JSON.stringify({ usuario, senha })
                    });
                    
                    if (data.success) {
                        msgDiv.innerHTML = '<span style="color:#3c3;">✅ ' + data.message + '</span>';
                        document.getElementById('newUser').value = '';
                        document.getElementById('newPass').value = '';
                        document.getElementById('newPassConfirm').value = '';
                    } else {
                        msgDiv.innerHTML = '<span style="color:#c33;">❌ ' + data.error + '</span>';
                    }
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
});

app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/', (req, res) => res.redirect('/admin/login'));

// Inicializar banco
async function initDB() {
    try {
        await pool.query(\`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        \`);
        
        await pool.query(\`
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
        \`);
        
        await pool.query(\`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        \`);
        
        console.log('✅ Banco inicializado');
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

// Iniciar servidor
initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: https://facilitaki.onrender.com/admin/login`);
    });
});
