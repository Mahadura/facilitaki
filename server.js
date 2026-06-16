// server.js - Facilitaki Backend (VERSÃO COMPLETA CORRIGIDA)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const xss = require('xss');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================
const JWT_SECRET = process.env.SECRET_KEY || 'chave-secreta-facilitaki-2026';
if (!process.env.SECRET_KEY) {
    console.warn('⚠️ SECRET_KEY não definida no .env, usando fallback. Configure para produção!');
}

// ============================================
// BANCO DE DADOS
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ============================================
// MIDDLEWARES DE SEGURANÇA
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://ui-avatars.com"],
            connectSrc: ["'self'"],
        },
    },
}));

// CORS restrito
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://seu-dominio.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, erro: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api', globalLimiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// Sanitização de entrada
app.use((req, res, next) => {
    if (req.body) {
        for (let key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key].trim());
            }
        }
    }
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

// Logger seguro (sem dados sensíveis)
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// CONFIGURAÇÃO DO MULTER (UPLOAD)
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'), false);
        }
    }
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
// VALIDAÇÕES
// ============================================
function validarTelefone(telefone) {
    const limpo = telefone.toString().replace(/\D/g, '');
    return limpo.length >= 9 && limpo.length <= 12;
}

function validarPedido(req, res, next) {
    const { cliente, telefone, tema, descricao, plano, preco, metodoPagamento, prazo } = req.body;
    
    if (!cliente || cliente.trim().length < 2) {
        return res.status(400).json({ success: false, erro: 'Nome do cliente inválido' });
    }
    
    if (!telefone || !validarTelefone(telefone)) {
        return res.status(400).json({ success: false, erro: 'Telefone inválido' });
    }
    
    const textoDescricao = tema || descricao;
    if (!textoDescricao || textoDescricao.trim().length < 5) {
        return res.status(400).json({ success: false, erro: 'Descreva o tema do trabalho (mínimo 5 caracteres)' });
    }
    
    if (!plano) {
        return res.status(400).json({ success: false, erro: 'Serviço não selecionado' });
    }
    
    const precoNum = parseFloat(preco);
    if (isNaN(precoNum) || precoNum <= 0) {
        return res.status(400).json({ success: false, erro: 'Preço inválido' });
    }
    
    const metodosValidos = ['mpesa', 'emola', 'deposito'];
    if (!metodoPagamento || !metodosValidos.includes(metodoPagamento)) {
        return res.status(400).json({ success: false, erro: 'Método de pagamento inválido' });
    }
    
    next();
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
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                descricao TEXT NOT NULL,
                tema TEXT,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50) NOT NULL,
                arquivo_nome VARCHAR(255),
                arquivo_original VARCHAR(255),
                prazo_entrega DATE,
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
        
        // Verificar se existe admin, se não criar
        const adminCheck = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminCheck.rows[0].count) === 0) {
            const hash = await bcrypt.hash('Admin123!@#', 10);
            await pool.query(
                'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
                ['Administrador', '840000000', hash]
            );
            console.log('✅ Admin padrão criado: 840000000 / Admin123!@#');
        }
        
        console.log('✅ Banco inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

// ============================================
// ROTA DE EMERGÊNCIA - REPARAR TABELA
// ============================================
app.get('/admin/reparar-tabela', async (req, res) => {
    try {
        // Verificar se já existe a estrutura correta
        const checkCol = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'pedidos' AND column_name = 'tema'
        `);
        
        if (checkCol.rows.length === 0) {
            await pool.query(`
                ALTER TABLE pedidos 
                ADD COLUMN tema TEXT,
                ADD COLUMN arquivo_nome VARCHAR(255),
                ADD COLUMN arquivo_original VARCHAR(255),
                ADD COLUMN prazo_entrega DATE
            `);
        }
        
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
                    <p>Colunas adicionadas: tema, arquivo_nome, arquivo_original, prazo_entrega</p>
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
// ROTAS PÚBLICAS
// ============================================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/facilitaki.apk', (req, res) => {
    const apkPath = path.join(__dirname, 'facilitaki.apk');
    
    if (!fs.existsSync(apkPath)) {
        return res.status(404).json({ error: 'APK não encontrado' });
    }
    
    const stats = fs.statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="facilitaki.apk"');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(apkPath);
});

app.get('/api/apk-disponivel', (req, res) => {
    const apkPath = path.join(__dirname, 'facilitaki.apk');
    if (!fs.existsSync(apkPath)) {
        return res.json({ disponivel: false, tamanho: 0, versao: '2.0.0' });
    }
    const stats = fs.statSync(apkPath);
    res.json({ 
        disponivel: true, 
        tamanho: stats.size,
        tamanhoMB: (stats.size / (1024 * 1024)).toFixed(1),
        versao: '2.0.0',
        nome: 'facilitaki.apk'
    });
});

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
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
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
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
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
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
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
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
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
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
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC',
            [req.user.id]
        );
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// ============================================
// ROTA DE UPLOAD COMPLETA
// ============================================
app.post('/api/pedidos/upload', 
    authenticateToken, 
    upload.single('arquivo'), 
    validarPedido, 
    async (req, res) => {
    console.log('📤 UPLOAD RECEBIDO - Usuário:', req.user?.id);
    
    try {
        const { 
            cliente, telefone, tema, descricao, 
            plano, nomePlano, preco, metodoPagamento, prazo 
        } = req.body;
        
        const textoDescricao = tema || descricao;
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        const precoNumero = parseFloat(preco);
        const nomeCliente = cliente || req.user.nome;
        
        let arquivoNome = null;
        let arquivoOriginal = null;
        
        if (req.file) {
            arquivoNome = req.file.filename;
            arquivoOriginal = req.file.originalname;
            console.log('📎 Arquivo salvo:', arquivoNome);
        }
        
        const result = await pool.query(
            `INSERT INTO pedidos 
             (usuario_id, cliente, telefone, descricao, tema, plano, nome_plano, 
              preco, metodo_pagamento, arquivo_nome, arquivo_original, prazo_entrega, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pendente')
             RETURNING id`,
            [
                req.user.id, nomeCliente, telefoneLimpo, textoDescricao, textoDescricao,
                plano, nomePlano, precoNumero, metodoPagamento,
                arquivoNome, arquivoOriginal, prazo || null
            ]
        );
        
        console.log('✅ Pedido criado! ID:', result.rows[0].id);
        
        res.json({ 
            success: true, 
            pedido: result.rows[0],
            message: 'Pedido registrado com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ ERRO no upload:', error);
        res.status(500).json({ 
            success: false, 
            erro: 'Erro interno: ' + error.message
        });
    }
});

// ============================================
// ROTA PARA BAIXAR ARQUIVO DO PEDIDO
// ============================================
app.get('/api/pedidos/:id/arquivo', authenticateToken, async (req, res) => {
    try {
        const pedidoId = req.params.id;
        
        const result = await pool.query(
            'SELECT arquivo_nome, arquivo_original, usuario_id FROM pedidos WHERE id = $1',
            [pedidoId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const pedido = result.rows[0];
        
        // Verificar se o usuário é o dono do pedido
        if (pedido.usuario_id !== req.user.id) {
            // Verificar se é admin
            const adminCheck = await pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [req.user.id]);
            if (adminCheck.rows.length === 0 || !adminCheck.rows[0].is_admin) {
                return res.status(403).json({ success: false, erro: 'Acesso negado' });
            }
        }
        
        if (!pedido.arquivo_nome) {
            return res.status(404).json({ success: false, erro: 'Arquivo não disponível' });
        }
        
        const filePath = path.join(uploadDir, pedido.arquivo_nome);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, erro: 'Arquivo não encontrado' });
        }
        
        res.setHeader('Content-Disposition', `attachment; filename="${pedido.arquivo_original || pedido.arquivo_nome}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', 
            [nome, telefone, mensagem]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
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
        const result = await pool.query(
            'SELECT id, nome, telefone, email, is_admin, created_at FROM usuarios ORDER BY is_admin DESC, created_at DESC'
        );
        res.json({ success: true, usuarios: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/api/criar-admin', authenticateAdmin, async (req, res) => {
    try {
        const { nome, telefone, senha, confirmarSenha } = req.body;
        
        if (!nome || !telefone || !senha || !confirmarSenha) {
            return res.status(400).json({ success: false, error: '❌ Preencha todos os campos' });
        }
        
        if (senha !== confirmarSenha) {
            return res.status(400).json({ success: false, error: '❌ As senhas não coincidem' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, error: '❌ A senha deve ter pelo menos 6 caracteres' });
        }
        
        const telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, error: '❌ Telefone inválido' });
        }
        
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, error: '❌ Este WhatsApp já está cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true) RETURNING id, nome',
            [nome.trim(), telefoneLimpo, hash]
        );
        
        res.json({ success: true, message: '✅ Administrador criado com sucesso!', admin: result.rows[0] });
    } catch (error) {
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
        const pedidos = await pool.query(
            `SELECT id, cliente, telefone, descricao, tema, plano, nome_plano, preco, 
                    metodo_pagamento, arquivo_nome, arquivo_original, prazo_entrega, 
                    status, data_pedido, usuario_id 
             FROM pedidos ORDER BY data_pedido DESC LIMIT 100`
        );
        
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
        const { status } = req.body;
        const statusValidos = ['pendente', 'pago', 'em_andamento', 'concluido'];
        
        if (!status || !statusValidos.includes(status)) {
            return res.status(400).json({ success: false, error: 'Status inválido' });
        }
        
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const pedidoId = req.params.id;
        
        // Buscar arquivo para deletar
        const result = await pool.query('SELECT arquivo_nome FROM pedidos WHERE id = $1', [pedidoId]);
        if (result.rows.length > 0 && result.rows[0].arquivo_nome) {
            const filePath = path.join(uploadDir, result.rows[0].arquivo_nome);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        await pool.query('DELETE FROM pedidos WHERE id = $1', [pedidoId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PÁGINA ADMIN LOGIN
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
                <div class="info">👑 Admin padrão: 840000000 / Admin123!@#</div>
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

// ============================================
// PÁGINA ADMIN PAINEL (COMPLETA COM DETALHES)
// ============================================
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
            table{width:100%;border-collapse:collapse;font-size:14px}
            th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}
            th{background:#f8f9fa;font-weight:600}
            .btn{padding:5px 12px;border:none;border-radius:5px;cursor:pointer;margin:2px;font-size:12px}
            .btn-danger{background:#e74c3c;color:#fff}
            .btn-warning{background:#f39c12;color:#fff}
            .btn-primary{background:#667eea;color:#fff}
            .logout-btn{background:#e74c3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
            .form-admin{background:#f8f9fa;padding:20px;border-radius:10px;margin-bottom:20px}
            .form-admin input{margin:8px 0;padding:10px;border:1px solid #ddd;border-radius:5px;width:100%}
            .alert-success{background:#d4edda;color:#155724;padding:10px;border-radius:5px;margin-top:10px}
            .alert-error{background:#f8d7da;color:#721c24;padding:10px;border-radius:5px;margin-top:10px}
            .alert-warning{background:#fff3cd;color:#856404;padding:10px;border-radius:5px;margin-bottom:10px}
            
            /* Modal Detalhes */
            .pedido-detalhes-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:none;justify-content:center;align-items:center;z-index:9999}
            .pedido-detalhes-modal.active{display:flex}
            .pedido-detalhes-content{background:#fff;padding:2rem;border-radius:20px;max-width:800px;width:90%;max-height:80vh;overflow-y:auto}
            .pedido-detalhes-content table{width:100%;border-collapse:collapse}
            .pedido-detalhes-content td{padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top}
            .pedido-detalhes-content td:first-child{font-weight:600;color:#555;width:150px}
            .arquivo-link{color:#2563eb;text-decoration:none;font-weight:500}
            .arquivo-link:hover{text-decoration:underline}
            .btn-fechar-modal{margin-top:1rem;padding:10px 20px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer}
            .badge-status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600}
            .badge-status.pendente{background:#fef3c7;color:#92400e}
            .badge-status.pago{background:#dbeafe;color:#1e40af}
            .badge-status.em_andamento{background:#ede9fe;color:#5b21b6}
            .badge-status.concluido{background:#d1fae5;color:#065f46}
            .btn-ver-detalhes{padding:4px 12px;background:#667eea;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:12px}
            .btn-ver-detalhes:hover{background:#5a67d8}
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
            
            <!-- Modal Detalhes -->
            <div class="pedido-detalhes-modal" id="modalDetalhes">
                <div class="pedido-detalhes-content">
                    <h2 style="margin-bottom:1rem;">📄 Detalhes do Pedido</h2>
                    <div id="detalhesPedido"></div>
                    <button class="btn-fechar-modal" onclick="fecharModal()">Fechar</button>
                </div>
            </div>

            <script>
                const token = localStorage.getItem('adminToken');
                if(!token) window.location.href = '/admin/login';
                const adminNome = localStorage.getItem('adminNome') || 'Admin';
                document.getElementById('adminNome').textContent = adminNome;
                
                async function fetchWithAuth(url, options={}) {
                    const res = await fetch(url, {
                        ...options,
                        headers: {
                            'Authorization': 'Bearer '+token,
                            'Content-Type': 'application/json',
                            ...(options.headers || {})
                        }
                    });
                    if(res.status===401){ localStorage.clear(); window.location.href='/admin/login'; }
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
                    document.getElementById('pedidos-table').innerHTML = tablePedidos(data.pedidos || []);
                    document.getElementById('contatos-table').innerHTML = tableContatos(data.contatos || []);
                    carregarUsuarios();
                    carregarAdmins();
                }
                
                function formatarData(data) {
                    if (!data) return '-';
                    return new Date(data).toLocaleDateString('pt-MZ');
                }
                
                function getStatusBadge(status) {
                    const labels = { 'pendente':'Pendente', 'pago':'Pago', 'em_andamento':'Em andamento', 'concluido':'Concluído' };
                    return \`<span class="badge-status \${status}">\${labels[status] || status}</span>\`;
                }
                
                function tablePedidos(pedidos) {
                    if(!pedidos.length) return '<p>Nenhum pedido</p>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Prazo</th><th>Status</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${pedidos.map(p => \`
                                    <tr>
                                        <td>\${p.id}</td>
                                        <td>\${p.cliente}</td>
                                        <td>\${p.nome_plano}</td>
                                        <td>\${parseFloat(p.preco).toLocaleString('pt-MZ')} MT</td>
                                        <td>\${formatarData(p.prazo_entrega)}</td>
                                        <td>\${getStatusBadge(p.status)}</td>
                                        <td>
                                            <button class="btn-ver-detalhes" onclick="verDetalhes(\${p.id})">👁️ Detalhes</button>
                                            <button class="btn btn-warning" onclick="alterarStatus(\${p.id})">Status</button>
                                            <button class="btn btn-danger" onclick="excluirPedido(\${p.id})">🗑️</button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function tableClientes(clientes) {
                    if(!clientes.length) return '<p>Nenhum cliente</p>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Email</th><th>Data</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${clientes.map(c => \`
                                    <tr>
                                        <td>\${c.id}</td>
                                        <td>\${c.nome}</td>
                                        <td>\${c.telefone}</td>
                                        <td>\${c.email || '-'}</td>
                                        <td>\${formatarData(c.created_at)}</td>
                                        <td><button class="btn btn-danger" onclick="removerCliente(\${c.id})">Remover</button></td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function tableAdmins(admins) {
                    if(!admins.length) return '<p>Nenhum admin</p>';
                    const adminIdAtual = parseInt(localStorage.getItem('adminId') || '0');
                    return \`
                        <p class="alert-warning">⚠️ Administrador ID 1 é protegido</p>
                        <table>
                            <thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Data</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${admins.map(a => \`
                                    <tr>
                                        <td>\${a.id}\${a.id===1 ? ' 🔒' : ''}</td>
                                        <td>\${a.nome}</td>
                                        <td>\${a.telefone}</td>
                                        <td>\${formatarData(a.created_at)}</td>
                                        <td>\${(a.id!==1 && a.id!==adminIdAtual) ? \`<button class="btn btn-danger" onclick="removerAdmin(\${a.id})">Remover</button>\` : '-'}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function tableContatos(contatos) {
                    if(!contatos.length) return '<p>Nenhuma mensagem</p>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Nome</th><th>WhatsApp</th><th>Mensagem</th><th>Data</th></tr></thead>
                            <tbody>
                                \${contatos.map(c => \`
                                    <tr>
                                        <td>\${c.id}</td>
                                        <td>\${c.nome}</td>
                                        <td>\${c.telefone}</td>
                                        <td style="max-width:300px;word-wrap:break-word;">\${(c.mensagem||'').substring(0,150)}\${(c.mensagem||'').length > 150 ? '...' : ''}</td>
                                        <td>\${new Date(c.data_envio).toLocaleString()}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                // ============================================
                // DETALHES DO PEDIDO
                // ============================================
                async function verDetalhes(id) {
                    const modal = document.getElementById('modalDetalhes');
                    const content = document.getElementById('detalhesPedido');
                    try {
                        const data = await fetchWithAuth('/admin/api/dashboard');
                        const pedido = (data.pedidos || []).find(p => p.id === id);
                        if (!pedido) { content.innerHTML = '<p>Pedido não encontrado</p>'; modal.classList.add('active'); return; }
                        
                        content.innerHTML = \`
                            <table>
                                <tr><td>ID</td><td><strong>#\${pedido.id}</strong></td></tr>
                                <tr><td>Cliente</td><td><strong>\${pedido.cliente}</strong></td></tr>
                                <tr><td>WhatsApp</td><td><strong>\${pedido.telefone}</strong></td></tr>
                                <tr><td>Serviço</td><td><strong>\${pedido.nome_plano}</strong></td></tr>
                                <tr><td>Valor</td><td><strong>\${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</strong></td></tr>
                                <tr><td>Status</td><td>\${getStatusBadge(pedido.status)}</td></tr>
                                <tr><td>Método Pagamento</td><td><strong>\${pedido.metodo_pagamento.toUpperCase()}</strong></td></tr>
                                <tr><td>Data Pedido</td><td><strong>\${new Date(pedido.data_pedido).toLocaleString()}</strong></td></tr>
                                <tr><td>Prazo Entrega</td><td><strong>\${formatarData(pedido.prazo_entrega) || 'Não definido'}</strong></td></tr>
                                <tr><td>Tema/Descrição</td><td><strong style="white-space:pre-wrap;word-wrap:break-word;">\${pedido.descricao || pedido.tema || '-'}</strong></td></tr>
                                <tr>
                                    <td>Arquivo</td>
                                    <td>
                                        \${pedido.arquivo_nome ? 
                                            \`<a href="/api/pedidos/\${pedido.id}/arquivo" class="arquivo-link" target="_blank">
                                                📎 \${pedido.arquivo_original || pedido.arquivo_nome}
                                            </a>\` : 
                                            '<span style="color:#999;">Nenhum arquivo enviado</span>'
                                        }
                                    </td>
                                </tr>
                            </table>
                        \`;
                        modal.classList.add('active');
                    } catch (error) {
                        content.innerHTML = '<p>Erro ao carregar detalhes</p>';
                        modal.classList.add('active');
                    }
                }
                
                function fecharModal() { document.getElementById('modalDetalhes').classList.remove('active'); }
                document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharModal(); });
                document.getElementById('modalDetalhes').addEventListener('click', (e) => {
                    if (e.target === e.currentTarget) fecharModal();
                });
                
                // ============================================
                // FUNÇÕES ADMIN
                // ============================================
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
                            msgDiv.innerHTML = \`<div class="alert-success">✅ \${data.message}</div>\`;
                            document.getElementById('adminNomeInput').value = '';
                            document.getElementById('adminTelefoneInput').value = '';
                            document.getElementById('adminSenhaInput').value = '';
                            document.getElementById('adminConfirmarSenhaInput').value = '';
                            carregarAdmins();
                            setTimeout(()=>msgDiv.innerHTML='', 5000);
                        } else {
                            msgDiv.innerHTML = \`<div class="alert-error">❌ \${data.error}</div>\`;
                        }
                    } catch(e) {
                        msgDiv.innerHTML = '<div class="alert-error">❌ Erro de conexão</div>';
                    }
                }
                
                async function removerAdmin(id) {
                    if(confirm('Remover este administrador?')) {
                        const data = await fetchWithAuth('/admin/api/remover-admin/'+id, {method:'DELETE'});
                        alert(data.success ? '✅ Removido!' : '❌ '+data.error);
                        if(data.success) carregarAdmins();
                    }
                }
                
                async function removerCliente(id) {
                    if(confirm('Remover este cliente?')) {
                        const data = await fetchWithAuth('/admin/api/remover-cliente/'+id, {method:'DELETE'});
                        alert(data.success ? '✅ Removido!' : '❌ '+data.error);
                        if(data.success) carregarUsuarios();
                    }
                }
                
                async function alterarStatus(id) {
                    const status = prompt('Status: pendente, pago, em_andamento, concluido');
                    if(status) {
                        const data = await fetchWithAuth('/admin/api/pedido/'+id+'/status', {
                            method:'PUT',
                            body:JSON.stringify({status})
                        });
                        alert(data.success ? '✅ Atualizado!' : '❌ '+data.error);
                        if(data.success) loadDashboard();
                    }
                }
                
                async function excluirPedido(id) {
                    if(confirm('Excluir pedido? Esta ação não pode ser desfeita.')) {
                        const data = await fetchWithAuth('/admin/api/pedido/'+id, {method:'DELETE'});
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
        console.log(`🔧 Reparar Tabela: http://localhost:${PORT}/admin/reparar-tabela`);
        console.log(`📱 APK disponível em: http://localhost:${PORT}/facilitaki.apk`);
        console.log(`\n👑 Admin padrão: 840000000 / Admin123!@#`);
    });
}

startServer();
