// server.js - Facilitaki Backend (Completo e Atualizado)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE
// ============================================
if (!process.env.SECRET_KEY) {
    console.error('❌ SECRET_KEY não definida!');
    process.exit(1);
}

// ============================================
// CONFIGURAÇÃO DO BANCO DE DADOS
// ============================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
});

// ============================================
// MIDDLEWARES DE SEGURANÇA
// ============================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://ui-avatars.com"],
        },
    },
}));

app.use(compression());

const allowedOrigins = process.env.CORS_ORIGIN 
    ? [process.env.CORS_ORIGIN, 'http://localhost:3000', 'http://localhost:5500']
    : ['https://facilitaki.onrender.com', 'http://localhost:3000'];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Origem não permitida pelo CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static('.'));

// ============================================
// RATE LIMITING
// ============================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Limite de uploads excedido. Tente novamente em 1 hora.' }
});

app.use('/api/', globalLimiter);
app.use('/admin/', globalLimiter);

// ============================================
// CONFIGURAÇÃO DE UPLOAD
// ============================================
const allowedFileTypes = ['.pdf', '.doc', '.docx', '.txt'];
const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedFileTypes.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não permitido. Use PDF, DOC, DOCX ou TXT.'), false);
    }
};

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
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter 
});

// ============================================
// FUNÇÕES DE VALIDAÇÃO CORRIGIDAS
// ============================================

function validarTelefoneMocambique(telefone) {
    const telefoneLimpo = telefone.toString().replace(/\D/g, '');
    const regex = /^(84|85|86|87)\d{7}$/;
    return regex.test(telefoneLimpo);
}

function validarEmail(email) {
    if (!email || email.trim() === '') return true;
    const regex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return regex.test(email);
}

function validarNome(nome) {
    if (!nome || typeof nome !== 'string') {
        return { valido: false, mensagem: 'Nome é obrigatório' };
    }
    
    const nomeTrim = nome.trim();
    if (nomeTrim.length < 3) {
        return { valido: false, mensagem: 'Nome deve ter pelo menos 3 caracteres' };
    }
    
    if (nomeTrim.length > 100) {
        return { valido: false, mensagem: 'Nome deve ter no máximo 100 caracteres' };
    }
    
    const nomeRegex = /^[a-zA-ZÀ-ÿ\s]+$/;
    if (!nomeRegex.test(nomeTrim)) {
        return { valido: false, mensagem: 'Nome deve conter apenas letras e espaços' };
    }
    
    return { valido: true, mensagem: '' };
}

function validarSenha(senha) {
    if (!senha || senha.length < 8) {
        return { valido: false, mensagem: 'A senha deve ter pelo menos 8 caracteres' };
    }
    if (!/[A-Z]/.test(senha)) {
        return { valido: false, mensagem: 'A senha deve conter pelo menos uma letra maiúscula' };
    }
    if (!/[0-9]/.test(senha)) {
        return { valido: false, mensagem: 'A senha deve conter pelo menos um número' };
    }
    if (senha.length > 100) {
        return { valido: false, mensagem: 'A senha deve ter no máximo 100 caracteres' };
    }
    return { valido: true, mensagem: '' };
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
            return res.status(403).json({ success: false, error: 'Acesso negado. Permissão de admin necessária.' });
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
        { expiresIn: '15m' }
    );
}

function generateRefreshToken(user) {
    return jwt.sign(
        { id: user.id },
        process.env.SECRET_KEY,
        { expiresIn: '7d' }
    );
}

// ============================================
// INICIALIZAÇÃO DO BANCO COM ÍNDICES
// ============================================
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco...');
        
        // Adicionar colunas necessárias
        try {
            await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(500)`);
            console.log('✅ Coluna refresh_token adicionada');
        } catch (err) {
            console.log('⚠️ Coluna refresh_token já existe');
        }
        
        try {
            await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(100)`);
            await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255)`);
            await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP`);
            console.log('✅ Colunas de recuperação adicionadas');
        } catch (err) {
            console.log('⚠️ Colunas de recuperação já existem');
        }
        
        // Criar tabelas principais
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
        
        // ============================================
        // ÍNDICES PARA OTIMIZAÇÃO
        // ============================================
        
        console.log('📊 Criando índices para otimização...');
        
        // Índices para tabela usuarios
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_is_admin ON usuarios(is_admin)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_usuarios_created_at ON usuarios(created_at DESC)`);
        
        // Índices para tabela pedidos
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_id ON pedidos(usuario_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_data_pedido ON pedidos(data_pedido DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_status ON pedidos(usuario_id, status)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_telefone ON pedidos(telefone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_plano ON pedidos(plano)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_data ON pedidos(usuario_id, data_pedido DESC)`);
        
        // Índices para tabela contatos
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_contatos_telefone ON contatos(telefone)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_contatos_data_envio ON contatos(data_envio DESC)`);
        
        console.log('✅ Todos os índices criados com sucesso');
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
        
        if (!validarTelefoneMocambique(telefone)) {
            return res.status(401).json({ success: false, erro: 'Telefone inválido' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
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
            const decoded = jwt.verify(refreshToken, process.env.SECRET_KEY);
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

app.post('/api/logout', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET refresh_token = NULL WHERE id = $1', [req.user.id]);
        res.json({ success: true, message: 'Logout realizado com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, email, senha } = req.body;
        
        const nomeValido = validarNome(nome);
        if (!nomeValido.valido) {
            return res.status(400).json({ success: false, erro: nomeValido.mensagem });
        }
        
        if (!validarTelefoneMocambique(telefone)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido. Use 84/85/86/87 + 7 dígitos' });
        }
        
        if (email && !validarEmail(email)) {
            return res.status(400).json({ success: false, erro: 'Email inválido' });
        }
        
        const senhaValida = validarSenha(senha);
        if (!senhaValida.valido) {
            return res.status(400).json({ success: false, erro: senhaValida.mensagem });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        }
        
        if (email) {
            const emailExists = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
            if (emailExists.rows.length > 0) {
                return res.status(400).json({ success: false, erro: 'Email já cadastrado' });
            }
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, email, senha_hash) VALUES ($1, $2, $3, $4) RETURNING id, nome, telefone, email',
            [nome, telefoneLimpo, email || null, hash]
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

// ============================================
// ROTAS PROTEGIDAS
// ============================================

app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        const countResult = await pool.query(
            'SELECT COUNT(*) as total FROM pedidos WHERE usuario_id = $1',
            [req.user.id]
        );
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        
        const result = await pool.query(
            `SELECT * FROM pedidos 
             WHERE usuario_id = $1 
             ORDER BY data_pedido DESC 
             LIMIT $2 OFFSET $3`,
            [req.user.id, limit, offset]
        );
        
        res.json({ 
            success: true, 
            pedidos: result.rows,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalItems: total,
                itemsPerPage: limit,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/pedidos/upload', authenticateToken, uploadLimiter, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, tema, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        if (!validarTelefoneMocambique(telefone)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, tema, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [req.user.id, cliente, telefoneLimpo, tema || null, descricao || null, plano, nomePlano, preco, metodoPagamento, req.file?.path]
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
        
        if (nome) {
            const nomeValido = validarNome(nome);
            if (!nomeValido.valido) {
                return res.status(400).json({ success: false, erro: nomeValido.mensagem });
            }
        }
        
        if (email && !validarEmail(email)) {
            return res.status(400).json({ success: false, erro: 'Email inválido' });
        }
        
        await pool.query(
            'UPDATE usuarios SET nome = COALESCE($1, nome), email = COALESCE($2, email) WHERE id = $3',
            [nome, email, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/contato', rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        
        if (!validarTelefoneMocambique(telefone)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefoneLimpo, mensagem]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ============================================
// RECUPERAÇÃO DE SENHA
// ============================================

app.post('/api/esqueci-senha', rateLimit({ windowMs: 60 * 60 * 1000, max: 3 }), async (req, res) => {
    try {
        const { telefone } = req.body;
        
        if (!telefone) {
            return res.status(400).json({ success: false, error: 'Informe seu telefone' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        
        if (result.rows.length === 0) {
            return res.json({ success: true, message: 'Se o usuário existir, enviaremos as instruções.' });
        }
        
        const usuario = result.rows[0];
        const resetToken = jwt.sign(
            { id: usuario.id, telefone: usuario.telefone },
            process.env.SECRET_KEY,
            { expiresIn: '1h' }
        );
        
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);
        
        await pool.query(
            'UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
            [resetToken, expiresAt, usuario.id]
        );
        
        console.log(`🔐 Token de recuperação para ${usuario.nome}: ${resetToken}`);
        
        res.json({
            success: true,
            message: 'Link de recuperação gerado. Entre em contato pelo WhatsApp 86 728 6665 para receber o link.'
        });
    } catch (error) {
        console.error('Erro na recuperação:', error);
        res.status(500).json({ success: false, error: 'Erro ao processar solicitação' });
    }
});

app.post('/api/redefinir-senha', async (req, res) => {
    try {
        const { token, novaSenha } = req.body;
        
        if (!token || !novaSenha) {
            return res.status(400).json({ success: false, error: 'Token e nova senha são obrigatórios' });
        }
        
        const senhaValida = validarSenha(novaSenha);
        if (!senhaValida.valido) {
            return res.status(400).json({ success: false, error: senhaValida.mensagem });
        }
        
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
        }
        
        const usuario = result.rows[0];
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        
        await pool.query(
            'UPDATE usuarios SET senha_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [senhaHash, usuario.id]
        );
        
        res.json({ success: true, message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        res.status(500).json({ success: false, error: 'Erro ao redefinir senha' });
    }
});

// ============================================
// ROTAS ADMIN
// ============================================

app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Admin Login - Facilitaki</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
                .container{background:#fff;padding:40px;border-radius:20px;width:400px;text-align:center}
                h1{color:#667eea;margin-bottom:30px}
                input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
                button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:bold;margin-top:10px}
                .error{color:#c33;margin-top:10px}
                .info{margin-top:20px;font-size:12px;color:#999}
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Admin Login</h1>
                <input type="text" id="username" placeholder="Usuário">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
                <div class="info">Acesso restrito a administradores</div>
            </div>
            <script>
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
                    
                    if(!username || !password){
                        errorDiv.textContent = 'Preencha todos os campos';
                        return;
                    }
                    
                    try{
                        const res = await fetch('/admin/api/login', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({usuario:username, senha:password})
                        });
                        const data = await res.json();
                        if(data.success){
                            localStorage.setItem('adminToken', data.token);
                            window.location.href = '/admin/painel';
                        }else{
                            errorDiv.textContent = data.error || 'Erro no login';
                        }
                    }catch(e){
                        errorDiv.textContent = 'Erro de conexão';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

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

app.get('/admin/painel', async (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Painel Administrativo - Facilitaki</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial;background:#f5f5f5;padding:20px}
                .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
                .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:20px}
                .stat-card{background:#fff;padding:20px;border-radius:10px;text-align:center}
                .stat-number{font-size:32px;font-weight:bold;color:#667eea}
                .tabs{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
                .tab{padding:10px 20px;background:#ddd;border:none;border-radius:5px;cursor:pointer}
                .tab.active{background:#667eea;color:#fff}
                .tab-content{display:none;background:#fff;padding:20px;border-radius:10px;overflow-x:auto}
                .tab-content.active{display:block}
                table{width:100%;border-collapse:collapse}
                th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
                th{background:#f8f9fa}
                .status{padding:4px 8px;border-radius:4px;font-size:12px}
                .status-pendente{background:#fef3c7;color:#92400e}
                .status-pago{background:#d1fae5;color:#065f46}
                .btn{padding:5px 10px;border:none;border-radius:3px;cursor:pointer;margin:2px}
                .btn-view{background:#3498db;color:#fff}
                .btn-update{background:#2ecc71;color:#fff}
                .btn-delete{background:#e74c3c;color:#fff}
                .logout-btn{background:#e74c3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
                .loading{text-align:center;padding:40px}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Painel Administrativo</h1>
                <button class="logout-btn" onclick="logout()">Sair</button>
            </div>
            <div id="loading" class="loading">Carregando...</div>
            <div id="admin-content" style="display:none"></div>
            <script>
                const token = localStorage.getItem('adminToken');
                if(!token){
                    window.location.href = '/admin/login';
                }
                
                async function fetchWithAuth(url, options={}) {
                    const res = await fetch(url, {
                        ...options,
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        }
                    });
                    if(res.status === 401 || res.status === 403){
                        localStorage.removeItem('adminToken');
                        window.location.href = '/admin/login';
                        throw new Error('Não autorizado');
                    }
                    return res.json();
                }
                
                async function loadDashboard() {
                    try {
                        const data = await fetchWithAuth('/admin/api/dashboard');
                        renderDashboard(data);
                        document.getElementById('loading').style.display = 'none';
                        document.getElementById('admin-content').style.display = 'block';
                    } catch(e) {
                        document.getElementById('loading').innerHTML = 'Erro ao carregar: ' + e.message;
                    }
                }
                
                function renderDashboard(data) {
                    const html = \`
                        <div class="stats">
                            <div class="stat-card"><div class="stat-number">\${data.totalPedidos}</div><div>Total Pedidos</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.pedidosPendentes}</div><div>Pendentes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalClientes}</div><div>Clientes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalAdmins}</div><div>Administradores</div></div>
                        </div>
                        <div class="tabs">
                            <button class="tab active" onclick="showTab('pedidos')">Pedidos (\${data.totalPedidos})</button>
                            <button class="tab" onclick="showTab('usuarios')">Usuários (\${data.totalUsuarios})</button>
                            <button class="tab" onclick="showTab('contatos')">Contatos (\${data.contatos.length})</button>
                        </div>
                        <div id="tab-pedidos" class="tab-content active">
                            \${renderPedidos(data.pedidos)}
                        </div>
                        <div id="tab-usuarios" class="tab-content">
                            \${renderUsuarios(data.usuarios)}
                        </div>
                        <div id="tab-contatos" class="tab-content">
                            \${renderContatos(data.contatos)}
                        </div>
                    \`;
                    document.getElementById('admin-content').innerHTML = html;
                }
                
                function renderPedidos(pedidos) {
                    if(pedidos.length === 0) return '<div>Nenhum pedido encontrado</div>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Cliente</th><th>Telefone</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${pedidos.map(p => \`
                                    <tr>
                                        <td>\${p.id}</td>
                                        <td>\${p.cliente}</td>
                                        <td>\${p.telefone}</td>
                                        <td>\${p.nome_plano || p.plano}</td>
                                        <td>\${parseFloat(p.preco || 0).toLocaleString('pt-MZ')} MT</td>
                                        <td><span class="status status-\${p.status}">\${p.status}</span></td>
                                        <td>\${new Date(p.data_pedido).toLocaleDateString()}</td>
                                        <td>
                                            <button class="btn btn-update" onclick="updateStatus(\${p.id})">Status</button>
                                            <button class="btn btn-delete" onclick="deletePedido(\${p.id})">Excluir</button>
                                        </td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function renderUsuarios(usuarios) {
                    if(usuarios.length === 0) return '<div>Nenhum usuário encontrado</div>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Email</th><th>Tipo</th><th>Cadastro</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${usuarios.map(u => \`
                                    <tr>
                                        <td>\${u.id}</td>
                                        <td>\${u.nome} \${u.is_admin ? '<span style="background:#667eea;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:5px">Admin</span>' : ''}</td>
                                        <td>\${u.telefone || '-'}</td>
                                        <td>\${u.email || '-'}</td>
                                        <td>\${u.is_admin ? 'Administrador' : 'Cliente'}</td>
                                        <td>\${new Date(u.created_at).toLocaleDateString()}</td>
                                        <td>\${!u.is_admin ? \`<button class="btn btn-delete" onclick="deleteUser(\${u.id})\">Excluir</button>\` : '<span>—</span>'}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function renderContatos(contatos) {
                    if(contatos.length === 0) return '<div>Nenhum contato encontrado</div>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${contatos.map(c => \`
                                    <tr>
                                        <td>\${c.id}</td>
                                        <td>\${c.nome}</td>
                                        <td>\${c.telefone}</td>
                                        <td>\${c.mensagem.substring(0, 80)}\${c.mensagem.length > 80 ? '...' : ''}</td>
                                        <td>\${new Date(c.data_envio).toLocaleDateString()}</td>
                                        <td><button class="btn btn-delete" onclick="deleteContato(\${c.id})">Excluir</button></td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                }
                
                function showTab(name) {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    event.target.classList.add('active');
                    document.getElementById('tab-' + name).classList.add('active');
                }
                
                async function updateStatus(id) {
                    const status = prompt('Novo status (pendente, pago, em_andamento, concluido, cancelado):');
                    if(status){
                        const data = await fetchWithAuth('/admin/api/pedido/' + id + '/status', { 
                            method: 'PUT', 
                            body: JSON.stringify({status}) 
                        });
                        if(data.success) location.reload();
                        else alert(data.error);
                    }
                }
                
                async function deletePedido(id) {
                    if(confirm('Excluir este pedido?')){
                        const data = await fetchWithAuth('/admin/api/pedido/' + id, { method: 'DELETE' });
                        if(data.success) location.reload();
                    }
                }
                
                async function deleteUser(id) {
                    if(confirm('Excluir este usuário?')){
                        const data = await fetchWithAuth('/admin/api/usuario/' + id, { method: 'DELETE' });
                        if(data.success) location.reload();
                    }
                }
                
                async function deleteContato(id) {
                    if(confirm('Excluir este contato?')){
                        const data = await fetchWithAuth('/admin/api/contato/' + id, { method: 'DELETE' });
                        if(data.success) location.reload();
                    }
                }
                
                function logout() {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/admin/login';
                }
                
                loadDashboard();
            </script>
        </body>
        </html>
    `);
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
        await pool.query('UPDATE pedidos SET status = $1, data_pagamento = CASE WHEN $1 = \'pago\' THEN NOW() ELSE data_pagamento END WHERE id = $2', [req.body.status, req.params.id]);
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

app.delete('/admin/api/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/api/register-first', async (req, res) => {
    try {
        const { nome, telefone, email, senha } = req.body;
        
        const adminExists = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminExists.rows[0].count) > 0) {
            return res.status(403).json({ success: false, error: 'Já existe um administrador cadastrado' });
        }
        
        const nomeValido = validarNome(nome);
        if (!nomeValido.valido) {
            return res.status(400).json({ success: false, error: nomeValido.mensagem });
        }
        
        if (!validarTelefoneMocambique(telefone)) {
            return res.status(400).json({ success: false, error: 'Telefone inválido' });
        }
        
        const senhaValida = validarSenha(senha);
        if (!senhaValida.valido) {
            return res.status(400).json({ success: false, error: senhaValida.mensagem });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const hash = await bcrypt.hash(senha, 10);
        
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, email, senha_hash, is_admin) VALUES ($1, $2, $3, $4, true)',
            [nome, telefoneLimpo, email || null, hash]
        );
        
        res.json({ success: true, message: 'Administrador criado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// INICIAR SERVIDOR
// ============================================
async function startServer() {
    console.log('🚀 Iniciando servidor Facilitaki com todas as melhorias...');
    console.log('🔒 Helmet e CORS restrito ativados');
    console.log('📦 Compression ativada');
    console.log('🔐 Validação de senha forte (8+ chars, maiúscula, número)');
    console.log('🔄 Refresh tokens implementados');
    console.log('📁 Filtro de arquivos para upload (PDF, DOC, DOCX, TXT)');
    console.log('👑 Rotas admin protegidas com middleware');
    console.log('📊 Índices PostgreSQL otimizados');
    
    await initDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: http://localhost:${PORT}/admin/login`);
    });
}

startServer();
