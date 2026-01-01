const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middlewares essenciais
app.use(express.json());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

// Servir arquivos estáticos
app.use(express.static(__dirname));

// ===== ROTA PRINCIPAL =====
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html', (err) => {
        if (err) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Facilitaki - Serviços Acadêmicos</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
                        .container { background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; max-width: 800px; }
                        h1 { font-size: 3rem; margin-bottom: 20px; }
                        .status { color: #4ade80; font-weight: bold; font-size: 1.2rem; }
                        .button { display: inline-block; padding: 12px 30px; margin: 10px; background: white; color: #667eea; border-radius: 8px; text-decoration: none; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚀 Facilitaki</h1>
                        <p class="status">✅ Servidor está funcionando!</p>
                        <p>Plataforma de serviços acadêmicos</p>
                        <div>
                            <a href="/status" class="button">📊 Status da API</a>
                            <a href="/index.html" class="button">🌐 Acessar Site</a>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    });
});

// ===== CONFIGURAÇÃO DO BANCO DE DADOS RENDER =====
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Testar conexão com banco
pool.on('connect', () => {
    console.log('✅ Conexão com PostgreSQL estabelecida!');
});

pool.on('error', (err) => {
    console.error('❌ Erro na pool do PostgreSQL:', err);
});

// Criar tabelas automaticamente
async function inicializarBanco() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        // Tabela de usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ativo BOOLEAN DEFAULT TRUE
            )
        `);
        
        // Tabela de pedidos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                instituicao VARCHAR(100),
                curso VARCHAR(100),
                cadeira VARCHAR(100),
                tema VARCHAR(200),
                descricao TEXT,
                prazo DATE,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pendente',
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Tabela de contatos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                mensagem TEXT NOT NULL,
                data_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                respondido BOOLEAN DEFAULT FALSE
            )
        `);
        
        console.log('✅ Tabelas criadas/verificadas com sucesso!');
        
        // Verificar se existe algum usuário
        const { rows } = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        console.log(`👥 Total de usuários no banco: ${rows[0].total}`);
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

// Executar inicialização
inicializarBanco();

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_producao_2025_segredo';

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====
function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            erro: 'Token de acesso necessário' 
        });
    }
    
    jwt.verify(token, SECRET_KEY, (err, usuario) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                erro: 'Token inválido ou expirado' 
            });
        }
        req.usuario = usuario;
        next();
    });
}

// ===== ROTAS DA API =====

// 1. Status
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as server_time');
        
        res.json({
            success: true,
            mensagem: 'Facilitaki API Online',
            timestamp: new Date().toISOString(),
            ambiente: process.env.NODE_ENV || 'production',
            banco: {
                status: 'conectado',
                hora_servidor: dbTest.rows[0].server_time
            },
            servidor: 'Render',
            regiao: 'Oregon, USA',
            versao: '2.0.0'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            erro: 'Erro no servidor'
        });
    }
});

// 2. Cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        // Validação
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Nome, telefone e senha são obrigatórios' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        // Verificar se já existe
        const existe = await pool.query(
            'SELECT id FROM usuarios WHERE telefone = $1',
            [telefoneLimpo]
        );
        
        if (existe.rows.length > 0) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Este telefone já está cadastrado' 
            });
        }
        
        // Criptografar senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);
        
        // Inserir usuário
        const novoUsuario = await pool.query(
            `INSERT INTO usuarios (nome, telefone, senha) 
             VALUES ($1, $2, $3) 
             RETURNING id, nome, telefone, data_cadastro`,
            [nome, telefoneLimpo, senhaHash]
        );
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: novoUsuario.rows[0].id,
                nome: nome,
                telefone: telefoneLimpo
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        res.status(201).json({
            success: true,
            mensagem: 'Cadastro realizado com sucesso!',
            token: token,
            usuario: novoUsuario.rows[0]
        });
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro interno no servidor' 
        });
    }
});

// 3. Login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ 
                success: false,
                erro: 'Telefone e senha são obrigatórios' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        // Buscar usuário
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1 AND ativo = true',
            [telefoneLimpo]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        const usuario = result.rows[0];
        
        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: usuario.id,
                nome: usuario.nome,
                telefone: usuario.telefone
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            mensagem: 'Login realizado com sucesso!',
            token: token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                telefone: usuario.telefone,
                data_cadastro: usuario.data_cadastro
            }
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro interno no servidor' 
        });
    }
});

// 4. Criar pedido
app.post('/api/pedidos', autenticarToken, async (req, res) => {
    try {
        const {
            cliente, telefone, instituicao, curso, cadeira,
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        } = req.body;
        
        if (!cliente || !telefone || !plano || !preco) {
            return res.status(400).json({ 
                success: false,
                erro: 'Dados obrigatórios faltando' 
            });
        }
        
        const novoPedido = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira, 
                tema, descricao, prazo, plano, nome_plano, preco, 
                metodo_pagamento
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                req.usuario.id,
                cliente,
                telefone.replace(/\D/g, ''),
                instituicao || null,
                curso || null,
                cadeira || null,
                tema || null,
                descricao || null,
                prazo || null,
                plano,
                nomePlano || plano,
                parseFloat(preco),
                metodoPagamento || 'mpesa'
            ]
        );
        
        res.status(201).json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: novoPedido.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao criar pedido' 
        });
    }
});

// 5. Meus pedidos
app.get('/api/meus-pedidos', autenticarToken, async (req, res) => {
    try {
        const pedidos = await pool.query(
            `SELECT * FROM pedidos 
             WHERE usuario_id = $1 
             ORDER BY data_pedido DESC`,
            [req.usuario.id]
        );
        
        res.json({
            success: true,
            pedidos: pedidos.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao buscar pedidos' 
        });
    }
});

// 6. Contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ 
                success: false,
                erro: 'Nome, telefone e mensagem são obrigatórios' 
            });
        }
        
        await pool.query(
            `INSERT INTO contatos (nome, telefone, email, mensagem)
             VALUES ($1, $2, $3, $4)`,
            [nome, telefone.replace(/\D/g, ''), email || null, mensagem]
        );
        
        res.json({
            success: true,
            mensagem: 'Mensagem recebida com sucesso!'
        });
        
    } catch (error) {
        console.error('Erro no contato:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao processar mensagem' 
        });
    }
});

// 7. Verificar token
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({
        success: true,
        valido: true,
        usuario: req.usuario
    });
});

// 8. Usuário atual
app.get('/api/usuario', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, telefone, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        
        res.json({
            success: true,
            usuario: result.rows[0]
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao buscar usuário' 
        });
    }
});

// 9. Logout
app.post('/api/logout', (req, res) => {
    res.json({
        success: true,
        mensagem: 'Logout realizado com sucesso'
    });
});

// 10. Saúde do sistema
app.get('/api/saude', async (req, res) => {
    try {
        const db = await pool.query('SELECT NOW() as time, version() as version');
        const usuarios = await pool.query('SELECT COUNT(*) FROM usuarios');
        const pedidos = await pool.query('SELECT COUNT(*) FROM pedidos');
        
        res.json({
            success: true,
            sistema: {
                status: 'operacional',
                timestamp: new Date().toISOString(),
                banco: {
                    hora: db.rows[0].time,
                    versao: db.rows[0].version.split(' ').slice(0, 3).join(' ')
                },
                estatisticas: {
                    total_usuarios: parseInt(usuarios.rows[0].count),
                    total_pedidos: parseInt(pedidos.rows[0].count)
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            erro: 'Erro na verificação de saúde'
        });
    }
});

// ===== ROTAS PARA ARQUIVOS =====
app.get('/index.html', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/style.css');
});

app.get('/script.js', (req, res) => {
    res.sendFile(__dirname + '/script.js');
});

// ===== ROTA 404 =====
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        erro: 'Rota não encontrada'
    });
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 FACILITAKI SERVER - PRODUÇÃO');
    console.log('='.repeat(60));
    console.log(`📍 URL: https://facilitaki.onrender.com`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`💾 Banco: PostgreSQL (Render)`);
    console.log(`🌎 Acesso: Global`);
    console.log(`📊 Dados: Permanentes`);
    console.log('='.repeat(60));
    console.log('✅ Sistema pronto para uso mundial!');
    console.log('✅ Dados armazenados em PostgreSQL na nuvem');
    console.log('✅ Usuários podem acessar de qualquer lugar');
    console.log('='.repeat(60));
});
