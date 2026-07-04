// server.js - Facilitaki Backend (VERSÃO FINAL COM ADMIN VIA ENV)
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
// INICIALIZAÇÃO DO BANCO - ADMIN VIA ENV (SEGURO)
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
        
        // --- CRIAÇÃO AUTOMÁTICA DO ADMIN VIA VARIÁVEIS DE AMBIENTE ---
        // NENHUMA CREDENCIAL FICA NO CÓDIGO!
        // TUDO VEM DO .env OU DAS VARIÁVEIS DO RENDER
        
        const adminCheck = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        
        if (parseInt(adminCheck.rows[0].count) === 0) {
            // LER CREDENCIAIS APENAS DAS VARIÁVEIS DE AMBIENTE
            const adminPhone = process.env.ADMIN_PHONE;
            const adminName = process.env.ADMIN_NAME;
            const adminPassword = process.env.ADMIN_PASSWORD;
            
            // VALIDAR SE TODAS AS VARIÁVEIS FORAM DEFINIDAS
            if (!adminPhone) {
                console.error('❌ ADMIN_PHONE não definida no .env!');
                console.error('❌ O administrador NÃO será criado.');
                console.error('❌ Defina ADMIN_PHONE, ADMIN_NAME e ADMIN_PASSWORD no .env');
            } else if (!adminName) {
                console.error('❌ ADMIN_NAME não definida no .env!');
                console.error('❌ O administrador NÃO será criado.');
                console.error('❌ Defina ADMIN_NAME no .env');
            } else if (!adminPassword) {
                console.error('❌ ADMIN_PASSWORD não definida no .env!');
                console.error('❌ O administrador NÃO será criado.');
                console.error('❌ Defina ADMIN_PASSWORD no .env');
            } else if (adminPassword.length < 6) {
                console.error('❌ ADMIN_PASSWORD deve ter pelo menos 6 caracteres!');
                console.error('❌ O administrador NÃO será criado.');
            } else {
                // VALIDAR TELEFONE (9 a 12 dígitos)
                const phoneClean = adminPhone.toString().replace(/\D/g, '');
                if (phoneClean.length < 9 || phoneClean.length > 12) {
                    console.error('❌ ADMIN_PHONE inválido! Use 9 a 12 dígitos.');
                    console.error('❌ O administrador NÃO será criado.');
                } else {
                    // CRIAR ADMIN COM AS CREDENCIAIS DO .ENV
                    const hash = await bcrypt.hash(adminPassword, 10);
                    await pool.query(
                        `INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) 
                         VALUES ($1, $2, $3, true)`,
                        [adminName.trim(), phoneClean, hash]
                    );
                    
                    console.log('✅ ==========================================');
                    console.log('✅ ADMIN CRIADO COM SUCESSO!');
                    console.log('✅ ==========================================');
                    console.log(`   👤 Nome: ${adminName}`);
                    console.log(`   📱 WhatsApp: ${phoneClean}`);
                    console.log(`   🔑 Senha: (definida no .env - NÃO está no código!)`);
                    console.log('✅ ==========================================');
                    console.log('🔐 Acesse: /admin/login');
                }
            }
        } else {
            // ADMIN JÁ EXISTE - MOSTRAR INFORMAÇÕES (SEM A SENHA)
            const adminResult = await pool.query(
                'SELECT nome, telefone FROM usuarios WHERE is_admin = true LIMIT 1'
            );
            if (adminResult.rows.length > 0) {
                console.log('✅ ==========================================');
                console.log('✅ ADMIN JÁ EXISTE NO SISTEMA');
                console.log('✅ ==========================================');
                console.log(`   👤 Nome: ${adminResult.rows[0].nome}`);
                console.log(`   📱 WhatsApp: ${adminResult.rows[0].telefone}`);
                console.log(`   🔑 Senha: (definida no .env - NÃO está no código!)`);
                console.log('✅ ==========================================');
            }
        }
        
        console.log('✅ Banco inicializado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

// ============================================
// ROTA PARA CRIAR PRIMEIRO ADMIN (VIA .ENV)
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
// ROTAS PÚBLICAS (mantidas do original)
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
// ROTAS DE AUTENTICAÇÃO (mantidas do original)
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
// ROTAS PROTEGIDAS (mantidas do original)
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
// ROTAS ADMIN (mantidas do original)
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
// PÁGINAS ADMIN (mantidas do original)
// ============================================
app.get('/admin/login', function(req, res) {
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
            .warning{color:#856404;background:#fff3cd;padding:10px;border-radius:5px;margin-top:10px}
        </style>
        </head>
        <body>
            <div class="container">
                <h1>🔐 Admin Login</h1>
                <input type="text" id="username" placeholder="Usuário ou WhatsApp">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
                <div id="error" class="error"></div>
                <div class="warning">⚠️ Primeiro acesso? <a href="/admin/criar-primeiro-admin">Criar Administrador</a></div>
                <div class="info">👑 As credenciais são definidas no .env</div>
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
// PAINEL ADMIN (mantido do original)
// ============================================
app.get('/admin/painel', function(req, res) {
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
            .badge-status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:600}
            .badge-status.pendente{background:#fef3c7;color:#92400e}
            .badge-status.pago{background:#dbeafe;color:#1e40af}
            .badge-status.em_andamento{background:#ede9fe;color:#5b21b6}
            .badge-status.concluido{background:#d1fae5;color:#065f46}
            .btn-ver-detalhes{padding:4px 12px;background:#667eea;color:#fff;border:none;border-radius:5px;cursor:pointer}
            .pedido-detalhes-modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:none;justify-content:center;align-items:center;z-index:9999}
            .pedido-detalhes-modal.active{display:flex}
            .pedido-detalhes-content{background:#fff;padding:2rem;border-radius:20px;max-width:800px;width:90%;max-height:80vh;overflow-y:auto}
            .pedido-detalhes-content td{padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top}
            .pedido-detalhes-content td:first-child{font-weight:600;width:150px}
            .arquivo-link{color:#2563eb;text-decoration:none;font-weight:500}
            .btn-fechar-modal{margin-top:1rem;padding:10px 20px;background:#ef4444;color:#fff;border:none;border-radius:8px;cursor:pointer}
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
            
            <div class="pedido-detalhes-modal" id="modalDetalhes">
                <div class="pedido-detalhes-content">
                    <h2>📄 Detalhes do Pedido</h2>
                    <div id="detalhesPedido"></div>
                    <button class="btn-fechar-modal" onclick="fecharModal()">Fechar</button>
                </div>
            </div>

            <script>
                const token = localStorage.getItem('adminToken');
                if(!token) window.location.href = '/admin/login';
                document.getElementById('adminNome').textContent = localStorage.getItem('adminNome') || 'Admin';
                
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
                    try {
                        const data = await fetchWithAuth('/admin/api/dashboard');
                        document.getElementById('stats').innerHTML = \`
                            <div class="stat-card"><div class="stat-number">\${data.totalPedidos||0}</div><div>Total Pedidos</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.pedidosPendentes||0}</div><div>Pendentes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalClientes||0}</div><div>Clientes</div></div>
                            <div class="stat-card"><div class="stat-number">\${data.totalAdmins||0}</div><div>Administradores</div></div>
                        \`;
                        document.getElementById('pedidos-table').innerHTML = tablePedidos(data.pedidos || []);
                        document.getElementById('contatos-table').innerHTML = tableContatos(data.contatos || []);
                        carregarUsuarios();
                        carregarAdmins();
                    } catch(e) { console.error(e); }
                }
                
                function formatarData(data) {
                    if (!data) return '-';
                    try { return new Date(data).toLocaleDateString('pt-MZ'); } catch(e) { return '-'; }
                }
                
                function getStatusBadge(status) {
                    const labels = { 'pendente':'Pendente', 'pago':'Pago', 'em_andamento':'Em andamento', 'concluido':'Concluído' };
                    return \`<span class="badge-status \${status}">\${labels[status] || status}</span>\`;
                }
                
                function tablePedidos(pedidos) {
                    if(!pedidos || !pedidos.length) return '<p>Nenhum pedido</p>';
                    return \`
                        <table>
                            <thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Prazo</th><th>Arquivo</th><th>Status</th><th>Ações</th></tr></thead>
                            <tbody>
                                \${pedidos.map(p => \`
                                    <tr>
                                        <td>\${p.id}</td>
                                        <td>\${p.cliente}</td>
                                        <td>\${p.nome_plano}</td>
                                        <td>\${parseFloat(p.preco||0).toLocaleString('pt-MZ')} MT</td>
                                        <td>\${formatarData(p.prazo_entrega)}</td>
                                        <td>\${p.arquivo_nome ? '📎 Sim' : '❌ Não'}</td>
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
                    if(!clientes || !clientes.length) return '<p>Nenhum cliente</p>';
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
                    if(!admins || !admins.length) return '<p>Nenhum admin</p>';
                    const adminIdAtual = parseInt(localStorage.getItem('adminId') || '0');
                    return \`
                        <p style="background:#fff3cd;padding:10px;border-radius:5px;margin-bottom:10px;">⚠️ Administrador ID 1 é protegido</p>
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
                    if(!contatos || !contatos.length) return '<p>Nenhuma mensagem</p>';
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
                
                async function verDetalhes(id) {
                    const modal = document.getElementById('modalDetalhes');
                    const content = document.getElementById('detalhesPedido');
                    try {
                        const data = await fetchWithAuth('/admin/api/dashboard');
                        const pedido = (data.pedidos || []).find(p => p.id === id);
                        if (!pedido) { content.innerHTML = '<p>Pedido não encontrado</p>'; modal.classList.add('active'); return; }
                        
                        let arquivoHtml = '<span style="color:#999;">Nenhum arquivo enviado</span>';
                        if (pedido.arquivo_nome) {
                            arquivoHtml = \`
                                <a href="/api/pedidos/\${pedido.id}/arquivo" class="arquivo-link" target="_blank">
                                    📄 Baixar \${pedido.arquivo_original || pedido.arquivo_nome}
                                </a>
                            \`;
                        }
                        
                        content.innerHTML = \`
                            <table>
                                <tr><td>ID</td><td><strong>#\${pedido.id}</strong></td></tr>
                                <tr><td>Cliente</td><td><strong>\${pedido.cliente}</strong></td></tr>
                                <tr><td>WhatsApp</td><td><strong>\${pedido.telefone}</strong></td></tr>
                                <tr><td>Serviço</td><td><strong>\${pedido.nome_plano}</strong></td></tr>
                                <tr><td>Valor</td><td><strong>\${parseFloat(pedido.preco||0).toLocaleString('pt-MZ')} MT</strong></td></tr>
                                <tr><td>Descrição</td><td><strong style="white-space:pre-wrap;">\${pedido.descricao || pedido.tema || '-'}</strong></td></tr>
                                <tr><td>Prazo</td><td><strong>\${formatarData(pedido.prazo_entrega) || 'Não definido'}</strong></td></tr>
                                <tr><td>Arquivo</td><td>\${arquivoHtml}</td></tr>
                                <tr><td>Status</td><td>\${getStatusBadge(pedido.status)}</td></tr>
                                <tr><td>Data</td><td><strong>\${new Date(pedido.data_pedido).toLocaleString()}</strong></td></tr>
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
                
                async function carregarUsuarios() {
                    try {
                        const data = await fetchWithAuth('/admin/api/usuarios');
                        const clientes = (data.usuarios || []).filter(u => !u.is_admin);
                        document.getElementById('usuarios-table').innerHTML = tableClientes(clientes);
                    } catch(e) { console.error(e); }
                }
                
                async function carregarAdmins() {
                    try {
                        const data = await fetchWithAuth('/admin/api/usuarios');
                        const admins = (data.usuarios || []).filter(u => u.is_admin);
                        document.getElementById('admins-table').innerHTML = tableAdmins(admins);
                    } catch(e) { console.error(e); }
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
                    if(confirm('Excluir pedido?')) {
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
            console.log('\n⚠️ Para criar o administrador:');
            console.log('1. Configure ADMIN_PHONE, ADMIN_NAME e ADMIN_PASSWORD no .env');
            console.log('2. Acesse: http://localhost:' + PORT + '/admin/criar-primeiro-admin');
            console.log('3. Ou o sistema criará automaticamente se as variáveis estiverem definidas');
        });
    })
    .catch(function(err) {
        console.error('❌ Erro ao iniciar servidor:', err);
        process.exit(1);
    });
