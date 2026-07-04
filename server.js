// server.js - Facilitaki Backend (COM ROTA DE ATUALIZAÇÃO DE ADMIN)
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
const JWT_SECRET = process.env.SECRET_KEY;
if (!JWT_SECRET) {
    console.warn('⚠️ SECRET_KEY não definida, usando fallback apenas para desenvolvimento');
}

// ============================================
// BANCO DE DADOS
// ============================================
let pool;
try {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    console.log('✅ Conectado ao banco de dados');
} catch (error) {
    console.error('❌ Erro ao conectar ao banco:', error.message);
    process.exit(1);
}

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// CONFIGURAÇÃO DO MULTER
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('📁 Diretório uploads criado');
    } catch (error) {
        console.warn('⚠️ Não foi possível criar diretório uploads:', error.message);
    }
}

const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, unique + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowed = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
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

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    
    jwt.verify(token, JWT_SECRET, function(err, user) {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    
    jwt.verify(token, JWT_SECRET, function(err, user) {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        
        pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [user.id])
            .then(function(result) {
                if (result.rows.length === 0 || !result.rows[0].is_admin) {
                    return res.status(403).json({ success: false, error: 'Acesso negado' });
                }
                req.user = user;
                next();
            })
            .catch(function(err) {
                console.error('Erro ao verificar admin:', err);
                return res.status(500).json({ success: false, error: 'Erro interno' });
            });
    });
}

// ============================================
// VALIDAÇÕES
// ============================================
function validarTelefone(telefone) {
    if (!telefone) return false;
    var limpo = telefone.toString().replace(/\D/g, '');
    return limpo.length >= 9 && limpo.length <= 12;
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
                descricao TEXT,
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
        
        // Adicionar colunas se não existirem
        const columnsToAdd = ['descricao', 'tema', 'arquivo_nome', 'arquivo_original', 'prazo_entrega'];
        for (const col of columnsToAdd) {
            try {
                await pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ${col} TEXT`);
            } catch (e) {
                // Coluna já existe ou erro ignorável
            }
        }
        
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
// ROTA PARA CRIAR PRIMEIRO ADMIN
// ============================================
app.get('/admin/criar-primeiro-admin', async function(req, res) {
    try {
        // Verificar se já existe admin
        const adminCheck = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        if (parseInt(adminCheck.rows[0].count) > 0) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Admin já existe</title>
                <style>
                    body{font-family:Arial;background:#f59e0b;min-height:100vh;display:flex;justify-content:center;align-items:center}
                    .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                    a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
                </style>
                </head>
                <body>
                    <div class="card">
                        <h1>⚠️ ADMIN JÁ EXISTE</h1>
                        <p>Já existe um administrador no sistema.</p>
                        <a href="/admin/login">Ir para Login</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Verificar se as variáveis de ambiente estão definidas
        const adminPhone = process.env.ADMIN_PHONE;
        const adminName = process.env.ADMIN_NAME;
        const adminPassword = process.env.ADMIN_PASSWORD;
        
        if (!adminPhone || !adminName || !adminPassword) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Erro</title>
                <style>
                    body{font-family:Arial;background:#ef4444;min-height:100vh;display:flex;justify-content:center;align-items:center}
                    .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                    .info{background:#f0f0f0;padding:15px;border-radius:10px;margin:20px 0;text-align:left}
                </style>
                </head>
                <body>
                    <div class="card">
                        <h1>❌ ERRO</h1>
                        <p>Variáveis de ambiente não configuradas!</p>
                        <div class="info">
                            <p><strong>Faltam:</strong></p>
                            <ul style="text-align:left;">
                                <li>${!adminPhone ? '❌ ADMIN_PHONE' : '✅ ADMIN_PHONE'}</li>
                                <li>${!adminName ? '❌ ADMIN_NAME' : '✅ ADMIN_NAME'}</li>
                                <li>${!adminPassword ? '❌ ADMIN_PASSWORD' : '✅ ADMIN_PASSWORD'}</li>
                            </ul>
                        </div>
                        <p style="color:#666;font-size:12px;">Configure as variáveis no Render e redeploy.</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Criar admin com as credenciais do .env
        const phoneClean = adminPhone.toString().replace(/\D/g, '');
        const hash = await bcrypt.hash(adminPassword, 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            [adminName.trim(), phoneClean, hash]
        );
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Admin Criado</title>
            <style>
                body{font-family:Arial;background:#10b981;min-height:100vh;display:flex;justify-content:center;align-items:center}
                .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                .info{background:#f0f0f0;padding:15px;border-radius:10px;margin:20px 0;text-align:left}
                a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
            </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ ADMIN CRIADO!</h1>
                    <div class="info">
                        <p><strong>Nome:</strong> ${adminName}</p>
                        <p><strong>WhatsApp:</strong> ${phoneClean}</p>
                        <p><strong>Senha:</strong> (definida no .env)</p>
                    </div>
                    <a href="/admin/login">🔐 Fazer Login</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Erro: ' + error.message);
    }
});

// ============================================
// ROTA DE EMERGÊNCIA - ATUALIZAR ADMIN EXISTENTE
// ============================================
app.get('/admin/atualizar-admin', async function(req, res) {
    try {
        // Verifica se já existe admin
        const adminCheck = await pool.query('SELECT id, nome, telefone FROM usuarios WHERE is_admin = true LIMIT 1');
        
        if (adminCheck.rows.length === 0) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Erro</title>
                <style>
                    body{font-family:Arial;background:#ef4444;min-height:100vh;display:flex;justify-content:center;align-items:center}
                    .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                    a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
                </style>
                </head>
                <body>
                    <div class="card">
                        <h1>❌ NENHUM ADMIN ENCONTRADO</h1>
                        <p>Use /admin/criar-primeiro-admin para criar um.</p>
                        <a href="/admin/criar-primeiro-admin">Criar Admin</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        const admin = adminCheck.rows[0];
        
        // Pega as credenciais do .env
        const adminPhone = process.env.ADMIN_PHONE || '841234567';
        const adminName = process.env.ADMIN_NAME || 'Super Admin';
        const adminPassword = process.env.ADMIN_PASSWORD || '1234567';
        
        // Valida senha
        if (!adminPassword || adminPassword.length < 6) {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head><meta charset="UTF-8"><title>Erro</title>
                <style>
                    body{font-family:Arial;background:#ef4444;min-height:100vh;display:flex;justify-content:center;align-items:center}
                    .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                </style>
                </head>
                <body>
                    <div class="card">
                        <h1>❌ SENHA INVÁLIDA</h1>
                        <p>ADMIN_PASSWORD deve ter pelo menos 6 caracteres.</p>
                        <p style="color:#666;font-size:12px;">Configure no .env e tente novamente.</p>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Atualiza o admin
        const phoneClean = adminPhone.toString().replace(/\D/g, '');
        const hash = await bcrypt.hash(adminPassword, 10);
        
        await pool.query(
            `UPDATE usuarios 
             SET nome = $1, telefone = $2, senha_hash = $3 
             WHERE id = $4`,
            [adminName.trim(), phoneClean, hash, admin.id]
        );
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Admin Atualizado</title>
            <style>
                body{font-family:Arial;background:#10b981;min-height:100vh;display:flex;justify-content:center;align-items:center}
                .card{background:#fff;padding:40px;border-radius:20px;text-align:center}
                .info{background:#f0f0f0;padding:15px;border-radius:10px;margin:20px 0;text-align:left}
                a{display:inline-block;margin-top:20px;padding:10px 20px;background:#667eea;color:#fff;text-decoration:none;border-radius:5px}
                .old{color:#999;font-size:12px;text-decoration:line-through}
                .new{color:#10b981;font-weight:bold}
            </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ ADMIN ATUALIZADO!</h1>
                    <div class="info">
                        <p><strong>ID:</strong> ${admin.id}</p>
                        <p><strong>Nome:</strong> <span class="new">${adminName}</span> <span class="old">(era: ${admin.nome})</span></p>
                        <p><strong>WhatsApp:</strong> <span class="new">${phoneClean}</span> <span class="old">(era: ${admin.telefone})</span></p>
                        <p><strong>Senha:</strong> (definida no .env)</p>
                    </div>
                    <a href="/admin/login">🔐 Fazer Login</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Erro: ' + error.message);
    }
});

// ============================================
// ROTA DE REPARO
// ============================================
app.get('/admin/reparar-tabela', function(req, res) {
    try {
        pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS descricao TEXT`);
        pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tema TEXT`);
        pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS arquivo_nome VARCHAR(255)`);
        pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS arquivo_original VARCHAR(255)`);
        pool.query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS prazo_entrega DATE`);
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
                    <p>Todas as colunas foram adicionadas com sucesso.</p>
                    <a href="/">Voltar ao site</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.send('Erro: ' + error.message);
    }
});

// ============================================
// ROTAS PÚBLICAS
// ============================================
app.get('/status', function(req, res) {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/facilitaki.apk', function(req, res) {
    var apkPath = path.join(__dirname, 'facilitaki.apk');
    if (!fs.existsSync(apkPath)) {
        return res.status(404).json({ error: 'APK não encontrado' });
    }
    var stats = fs.statSync(apkPath);
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="facilitaki.apk"');
    res.setHeader('Content-Length', stats.size);
    res.sendFile(apkPath);
});

app.get('/api/apk-disponivel', function(req, res) {
    var apkPath = path.join(__dirname, 'facilitaki.apk');
    if (!fs.existsSync(apkPath)) {
        return res.json({ disponivel: false, tamanho: 0, versao: '2.0.0' });
    }
    var stats = fs.statSync(apkPath);
    res.json({ 
        disponivel: true, 
        tamanho: stats.size,
        tamanhoMB: (stats.size / (1024 * 1024)).toFixed(1),
        versao: '2.0.0'
    });
});

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================
app.post('/api/login', function(req, res) {
    try {
        var telefone = req.body.telefone;
        var senha = req.body.senha;
        
        if (!telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
        pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefoneLimpo])
            .then(function(result) {
                if (result.rows.length === 0) {
                    return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
                }
                
                bcrypt.compare(senha, result.rows[0].senha_hash)
                    .then(function(valid) {
                        if (!valid) {
                            return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
                        }
                        
                        var accessToken = generateAccessToken(result.rows[0]);
                        res.json({ 
                            success: true, 
                            accessToken: accessToken,
                            usuario: { 
                                id: result.rows[0].id, 
                                nome: result.rows[0].nome, 
                                telefone: result.rows[0].telefone, 
                                is_admin: result.rows[0].is_admin 
                            }
                        });
                    });
            });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.post('/api/cadastrar', function(req, res) {
    try {
        var nome = req.body.nome;
        var telefone = req.body.telefone;
        var senha = req.body.senha;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, erro: 'Senha deve ter pelo menos 6 caracteres' });
        }
        
        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, erro: 'Telefone inválido' });
        }
        
        pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo])
            .then(function(existe) {
                if (existe.rows.length > 0) {
                    return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
                }
                
                bcrypt.hash(senha, 10)
                    .then(function(hash) {
                        pool.query(
                            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, false) RETURNING id, nome, telefone',
                            [nome, telefoneLimpo, hash]
                        )
                        .then(function(result) {
                            var accessToken = generateAccessToken(result.rows[0]);
                            res.json({ 
                                success: true, 
                                accessToken: accessToken, 
                                usuario: { 
                                    id: result.rows[0].id, 
                                    nome: result.rows[0].nome, 
                                    telefone: result.rows[0].telefone 
                                } 
                            });
                        });
                    });
            });
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// ============================================
// ROTAS PROTEGIDAS
// ============================================
app.get('/api/perfil', authenticateToken, function(req, res) {
    try {
        pool.query('SELECT id, nome, telefone, email, created_at FROM usuarios WHERE id = $1', [req.user.id])
            .then(function(result) {
                if (result.rows.length === 0) {
                    return res.status(404).json({ success: false, erro: 'Usuário não encontrado' });
                }
                res.json({ success: true, usuario: result.rows[0] });
            });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.put('/api/perfil', authenticateToken, function(req, res) {
    try {
        var nome = req.body.nome;
        var email = req.body.email;
        pool.query('UPDATE usuarios SET nome = COALESCE($1, nome), email = COALESCE($2, email) WHERE id = $3', [nome, email, req.user.id])
            .then(function() {
                res.json({ success: true });
            });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.get('/api/meus-pedidos', authenticateToken, function(req, res) {
    try {
        pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC', [req.user.id])
            .then(function(result) {
                res.json({ success: true, pedidos: result.rows });
            });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// ============================================
// ROTA DE UPLOAD
// ============================================
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), function(req, res) {
    console.log('📤 UPLOAD RECEBIDO - Usuário:', req.user?.id);
    
    try {
        var cliente = req.body.cliente;
        var telefone = req.body.telefone;
        var tema = req.body.tema;
        var descricao = req.body.descricao;
        var plano = req.body.plano;
        var nomePlano = req.body.nomePlano;
        var preco = req.body.preco;
        var metodoPagamento = req.body.metodoPagamento;
        var prazo = req.body.prazo;
        
        var textoDescricao = tema || descricao;
        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        var precoNumero = parseFloat(preco);
        var nomeCliente = cliente || req.user.nome;
        
        var arquivoNome = null;
        var arquivoOriginal = null;
        
        if (req.file) {
            arquivoNome = req.file.filename;
            arquivoOriginal = req.file.originalname;
            console.log('📎 Arquivo salvo:', arquivoNome);
        }
        
        pool.query(
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
        )
        .then(function(result) {
            console.log('✅ Pedido criado! ID:', result.rows[0].id);
            res.json({ 
                success: true, 
                pedido: result.rows[0],
                message: 'Pedido registrado com sucesso!'
            });
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
// ROTA PARA BAIXAR ARQUIVO
// ============================================
app.get('/api/pedidos/:id/arquivo', authenticateToken, function(req, res) {
    try {
        var pedidoId = req.params.id;
        console.log('📥 Download solicitado - Pedido:', pedidoId);
        
        pool.query('SELECT arquivo_nome, arquivo_original, usuario_id FROM pedidos WHERE id = $1', [pedidoId])
            .then(function(result) {
                if (result.rows.length === 0) {
                    return res.status(404).json({ success: false, erro: 'Pedido não encontrado' });
                }
                
                var pedido = result.rows[0];
                console.log('📋 Pedido encontrado, arquivo:', pedido.arquivo_nome);
                
                // Verificar permissão
                if (pedido.usuario_id !== req.user.id) {
                    pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [req.user.id])
                        .then(function(adminCheck) {
                            if (adminCheck.rows.length === 0 || !adminCheck.rows[0].is_admin) {
                                return res.status(403).json({ success: false, erro: 'Acesso negado' });
                            }
                            enviarArquivo(pedido, res);
                        });
                } else {
                    enviarArquivo(pedido, res);
                }
            });
        
        function enviarArquivo(pedido, res) {
            if (!pedido.arquivo_nome) {
                return res.status(404).json({ success: false, erro: 'Arquivo não disponível' });
            }
            
            var filePath = path.join(uploadDir, pedido.arquivo_nome);
            console.log('📁 Caminho do arquivo:', filePath);
            
            // Verificar se o arquivo existe
            if (!fs.existsSync(filePath)) {
                console.log('❌ Arquivo não encontrado no disco');
                return res.status(404).json({ success: false, erro: 'Arquivo não encontrado' });
            }
            
            var stats = fs.statSync(filePath);
            var ext = path.extname(pedido.arquivo_original || pedido.arquivo_nome).toLowerCase();
            
            // Definir Content-Type correto
            var contentType = 'application/octet-stream';
            var mimeTypes = {
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.txt': 'text/plain'
            };
            if (mimeTypes[ext]) {
                contentType = mimeTypes[ext];
            }
            
            // Nome do arquivo para download
            var fileName = pedido.arquivo_original || pedido.arquivo_nome;
            
            console.log('📤 Enviando arquivo:', fileName, 'Tamanho:', stats.size, 'bytes');
            
            // Headers para download
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stats.size);
            res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(fileName) + '"');
            res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
            
            // Enviar arquivo
            res.sendFile(filePath, function(err) {
                if (err) {
                    console.error('❌ Erro ao enviar arquivo:', err);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, erro: 'Erro ao enviar arquivo' });
                    }
                } else {
                    console.log('✅ Arquivo enviado com sucesso!');
                }
            });
        }
        
    } catch (error) {
        console.error('❌ ERRO ao baixar arquivo:', error);
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

app.post('/api/contato', function(req, res) {
    try {
        var nome = req.body.nome;
        var telefone = req.body.telefone;
        var mensagem = req.body.mensagem;
        pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefone, mensagem])
            .then(function() {
                res.json({ success: true });
            });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
    }
});

// ============================================
// ROTAS ADMIN
// ============================================
app.post('/admin/api/login', function(req, res) {
    try {
        var usuario = req.body.usuario;
        var senha = req.body.senha;
        
        if (!usuario || !senha) {
            return res.status(400).json({ success: false, error: 'Preencha todos os campos' });
        }
        
        pool.query('SELECT * FROM usuarios WHERE (nome = $1 OR telefone = $1) AND is_admin = true', [usuario])
            .then(function(result) {
                if (result.rows.length === 0) {
                    return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
                }
                
                bcrypt.compare(senha, result.rows[0].senha_hash)
                    .then(function(valid) {
                        if (!valid) {
                            return res.status(401).json({ success: false, error: 'Credenciais inválidas' });
                        }
                        
                        var token = jwt.sign(
                            { id: result.rows[0].id, nome: result.rows[0].nome, isAdmin: true },
                            JWT_SECRET,
                            { expiresIn: '8h' }
                        );
                        
                        res.json({ success: true, token: token, admin: { id: result.rows[0].id, nome: result.rows[0].nome } });
                    });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/api/usuarios', authenticateAdmin, function(req, res) {
    try {
        pool.query('SELECT id, nome, telefone, email, is_admin, created_at FROM usuarios ORDER BY is_admin DESC, created_at DESC')
            .then(function(result) {
                res.json({ success: true, usuarios: result.rows });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/admin/api/criar-admin', authenticateAdmin, function(req, res) {
    try {
        var nome = req.body.nome;
        var telefone = req.body.telefone;
        var senha = req.body.senha;
        var confirmarSenha = req.body.confirmarSenha;
        
        if (!nome || !telefone || !senha || !confirmarSenha) {
            return res.status(400).json({ success: false, error: '❌ Preencha todos os campos' });
        }
        
        if (senha !== confirmarSenha) {
            return res.status(400).json({ success: false, error: '❌ As senhas não coincidem' });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({ success: false, error: '❌ A senha deve ter pelo menos 6 caracteres' });
        }
        
        var telefoneLimpo = telefone.toString().replace(/\D/g, '');
        if (!validarTelefone(telefoneLimpo)) {
            return res.status(400).json({ success: false, error: '❌ Telefone inválido' });
        }
        
        pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo])
            .then(function(existe) {
                if (existe.rows.length > 0) {
                    return res.status(400).json({ success: false, error: '❌ Este WhatsApp já está cadastrado' });
                }
                
                bcrypt.hash(senha, 10)
                    .then(function(hash) {
                        pool.query(
                            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true) RETURNING id, nome',
                            [nome.trim(), telefoneLimpo, hash]
                        )
                        .then(function(result) {
                            res.json({ success: true, message: '✅ Administrador criado com sucesso!', admin: result.rows[0] });
                        });
                    });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/remover-admin/:id', authenticateAdmin, function(req, res) {
    try {
        var adminId = parseInt(req.params.id);
        
        if (adminId === 1) {
            return res.status(400).json({ success: false, error: '❌ O primeiro administrador não pode ser removido!' });
        }
        
        if (adminId === req.user.id) {
            return res.status(400).json({ success: false, error: '❌ Você não pode remover sua própria conta' });
        }
        
        pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [adminId])
            .then(function(userCheck) {
                if (userCheck.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
                }
                
                if (!userCheck.rows[0].is_admin) {
                    return res.status(400).json({ success: false, error: 'Este usuário não é administrador' });
                }
                
                pool.query('DELETE FROM usuarios WHERE id = $1', [adminId])
                    .then(function() {
                        res.json({ success: true, message: '✅ Administrador removido com sucesso!' });
                    });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/remover-cliente/:id', authenticateAdmin, function(req, res) {
    try {
        var clienteId = parseInt(req.params.id);
        
        pool.query('SELECT is_admin FROM usuarios WHERE id = $1', [clienteId])
            .then(function(userCheck) {
                if (userCheck.rows.length === 0) {
                    return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
                }
                
                if (userCheck.rows[0].is_admin) {
                    return res.status(400).json({ success: false, error: 'Use a opção "Remover Admin" para administradores' });
                }
                
                pool.query('DELETE FROM usuarios WHERE id = $1', [clienteId])
                    .then(function() {
                        res.json({ success: true, message: '✅ Cliente removido com sucesso!' });
                    });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/admin/api/dashboard', authenticateAdmin, function(req, res) {
    try {
        pool.query(
            `SELECT id, cliente, telefone, descricao, tema, plano, nome_plano, preco, 
                    metodo_pagamento, arquivo_nome, arquivo_original, prazo_entrega, 
                    status, data_pedido, usuario_id 
             FROM pedidos ORDER BY data_pedido DESC LIMIT 100`
        )
        .then(function(pedidos) {
            pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 100')
                .then(function(contatos) {
                    pool.query('SELECT COUNT(*) FROM pedidos')
                        .then(function(totalPedidos) {
                            pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'pendente'")
                                .then(function(pedidosPendentes) {
                                    pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = false")
                                        .then(function(totalClientes) {
                                            pool.query("SELECT COUNT(*) FROM usuarios WHERE is_admin = true")
                                                .then(function(totalAdmins) {
                                                    res.json({
                                                        pedidos: pedidos.rows,
                                                        contatos: contatos.rows,
                                                        totalPedidos: parseInt(totalPedidos.rows[0].count),
                                                        pedidosPendentes: parseInt(pedidosPendentes.rows[0].count),
                                                        totalClientes: parseInt(totalClientes.rows[0].count),
                                                        totalAdmins: parseInt(totalAdmins.rows[0].count)
                                                    });
                                                });
                                        });
                                });
                        });
                });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/admin/api/pedido/:id/status', authenticateAdmin, function(req, res) {
    try {
        var status = req.body.status;
        var statusValidos = ['pendente', 'pago', 'em_andamento', 'concluido'];
        
        if (!status || !statusValidos.includes(status)) {
            return res.status(400).json({ success: false, error: 'Status inválido' });
        }
        
        pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [status, req.params.id])
            .then(function() {
                res.json({ success: true });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/admin/api/pedido/:id', authenticateAdmin, function(req, res) {
    try {
        var pedidoId = req.params.id;
        
        pool.query('SELECT arquivo_nome FROM pedidos WHERE id = $1', [pedidoId])
            .then(function(result) {
                if (result.rows.length > 0 && result.rows[0].arquivo_nome) {
                    var filePath = path.join(uploadDir, result.rows[0].arquivo_nome);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
                
                pool.query('DELETE FROM pedidos WHERE id = $1', [pedidoId])
                    .then(function() {
                        res.json({ success: true });
                    });
            });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// PÁGINA DE LOGIN ADMIN (COM CONTATO)
// ============================================
app.get('/admin/login', function(req, res) {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Admin Login - Facilitaki</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
            .container{background:#fff;padding:40px;border-radius:20px;width:400px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
            h1{color:#333;margin-bottom:10px}
            .subtitle{color:#666;font-size:14px;margin-bottom:20px}
            input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px;font-size:14px;transition:border 0.3s}
            input:focus{outline:none;border-color:#667eea}
            button{width:100%;padding:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:bold;font-size:16px;transition:transform 0.2s}
            button:hover{transform:scale(1.02)}
            .error{color:#e74c3c;margin-top:10px;font-size:14px}
            .info{margin-top:20px;padding:15px;background:#e8f4fd;border-radius:10px;font-size:13px;color:#555}
            .warning{color:#856404;background:#fff3cd;padding:12px;border-radius:5px;margin-top:10px;font-size:13px;border-left:4px solid #f59e0b}
            .warning a{color:#667eea;font-weight:bold;text-decoration:none}
            .warning a:hover{text-decoration:underline}
            .contact-box{background:#fef3c7;padding:15px;border-radius:10px;margin-top:15px;border-left:4px solid #f59e0b;text-align:left}
            .contact-box strong{color:#92400e}
            .contact-box .phone{color:#667eea;font-weight:bold;font-size:16px}
            .env-info{background:#f0f0f0;padding:10px;border-radius:8px;margin-top:10px;font-size:12px;color:#666}
            .env-info code{background:#e0e0e0;padding:2px 6px;border-radius:4px;font-size:11px}
        </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Admin Login</h1>
                <p class="subtitle">Acesse o painel administrativo do Facilitaki</p>
                
                <input type="text" id="username" placeholder="Usuário ou WhatsApp">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
                
                <div class="warning">
                    ⚠️ Se estiver com problemas, acesse: <a href="/admin/atualizar-admin">Atualizar Admin</a>
                </div>
                
                <div class="contact-box">
                    <strong>📞 Se estiver com dificuldades de acessar o painel administrativo:</strong><br>
                    <span>Contacte: <span class="phone">86 728 6665</span></span>
                    <br><small style="color:#666;">(Segunda a Sexta, 8h às 17h)</small>
                </div>
                
                <div class="info">
                    <strong>🔑 Lembre-se:</strong> As credenciais são definidas no <code>.env</code>
                </div>
                
                <div class="env-info">
                    <strong>Variáveis necessárias:</strong><br>
                    <code>ADMIN_PHONE</code> · <code>ADMIN_NAME</code> · <code>ADMIN_PASSWORD</code>
                </div>
            </div>
            <script>
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
                    
                    if(!username || !password) { 
                        errorDiv.textContent = '⚠️ Preencha todos os campos'; 
                        return; 
                    }
                    
                    errorDiv.textContent = '⏳ Aguarde...';
                    errorDiv.style.color = '#667eea';
                    
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
                            errorDiv.textContent = '❌ ' + data.error;
                            errorDiv.style.color = '#e74c3c';
                        }
                    } catch(e) { 
                        errorDiv.textContent = '❌ Erro de conexão. Tente novamente.';
                        errorDiv.style.color = '#e74c3c';
                    }
                }
                
                // Permitir pressionar Enter
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        login();
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// ============================================
// TRATAMENTO DE ERROS
// ============================================
process.on('uncaughtException', function(err) {
    console.error('❌ Erro não capturado:', err);
});

process.on('unhandledRejection', function(err) {
    console.error('❌ Promessa rejeitada não tratada:', err);
});

// ============================================
// INICIAR SERVIDOR
// ============================================
initDatabase()
    .then(function() {
        app.listen(PORT, '0.0.0.0', function() {
            console.log('\n✅ Servidor rodando na porta ' + PORT);
            console.log('🌐 Site: http://localhost:' + PORT);
            console.log('🔐 Admin: http://localhost:' + PORT + '/admin/login');
            console.log('📱 APK disponível em: http://localhost:' + PORT + '/facilitaki.apk');
            console.log('\n⚠️ Rotas de Admin:');
            console.log('   - /admin/criar-primeiro-admin (criar novo admin)');
            console.log('   - /admin/atualizar-admin (atualizar admin existente)');
            console.log('   - /admin/login (painel de login)');
        });
    })
    .catch(function(err) {
        console.error('❌ Erro ao iniciar servidor:', err);
        process.exit(1);
    });
