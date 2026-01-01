const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middlewares essenciais
app.use(express.json());
app.use(cors());

// ===== SERVIR ARQUIVOS ESTÁTICOS DA RAIZ =====
app.use(express.static(__dirname));

// ===== ROTA PRINCIPAL - SERVE O INDEX.HTML =====
app.get('/', (req, res) => {
    console.log('📄 Tentando servir index.html da raiz...');
    res.sendFile(__dirname + '/index.html', (err) => {
        if (err) {
            console.error('❌ Erro ao servir index.html:', err.message);
            console.log('📂 Conteúdo da raiz:', require('fs').readdirSync(__dirname));
            
            // Página de fallback
            res.send(`
                <!DOCTYPE html>
                <html lang="pt">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Facilitaki - Erro</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        h1 { color: #ef4444; }
                        .error { color: #991b1b; background: #fee2e2; padding: 20px; border-radius: 10px; }
                        code { background: #f3f4f6; padding: 5px; border-radius: 5px; }
                    </style>
                </head>
                <body>
                    <h1>❌ Erro: index.html não encontrado</h1>
                    <div class="error">
                        <p>O arquivo <code>index.html</code> não foi encontrado na raiz do projeto.</p>
                        <p><strong>Diretório atual:</strong> ${__dirname}</p>
                        <p><strong>Arquivos encontrados:</strong></p>
                        <pre>${require('fs').readdirSync(__dirname).join('\n')}</pre>
                    </div>
                    <p><a href="/status">Testar API</a> • <a href="https://github.com/seu-usuario/facilitaki">Ver repositório</a></p>
                </body>
                </html>
            `);
        } else {
            console.log('✅ index.html servido com sucesso!');
        }
    });
});

// ===== ROTA DE STATUS DA API =====
app.get('/status', (req, res) => {
    console.log('📊 Requisição para /status recebida');
    res.json({ 
        success: true,
        mensagem: 'Servidor Facilitaki está online!',
        timestamp: new Date().toISOString(),
        status: 'operacional',
        frontend: 'index.html na raiz',
        endpoints: {
            cadastro: 'POST /api/cadastrar',
            login: 'POST /api/login',
            pedidos: 'POST /api/pedidos',
            meusPedidos: 'GET /api/meus-pedidos',
            contato: 'POST /api/contato'
        }
    });
});

// Configuração do Banco de Dados PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_segredo_2025';

// ===== ROTAS DA API =====

// 1. Cadastro de Usuários
app.post('/api/cadastrar', async (req, res) => {
    console.log('📝 Cadastro solicitado:', req.body.telefone);
    try {
        const { nome, telefone, senha } = req.body;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ 
                success: false, 
                erro: "Nome, telefone e senha são obrigatórios" 
            });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            "INSERT INTO usuarios (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome, telefone",
            [nome, telefone, hash]
        );
        
        console.log('✅ Usuário cadastrado:', result.rows[0].telefone);
        res.status(201).json({ 
            success: true, 
            mensagem: "Usuário cadastrado com sucesso",
            usuario: result.rows[0] 
        });
    } catch (err) {
        console.error("❌ Erro no cadastro:", err.message);
        
        if (err.code === '23505') {
            return res.status(400).json({ 
                success: false, 
                erro: "Este número de telefone já está cadastrado" 
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: "Erro interno ao cadastrar usuário" 
        });
    }
});

// 2. Login de Usuários
app.post('/api/login', async (req, res) => {
    console.log('🔐 Login solicitado:', req.body.telefone);
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ 
                success: false,
                erro: "Telefone e senha são obrigatórios" 
            });
        }
        
        const result = await pool.query(
            "SELECT * FROM usuarios WHERE telefone = $1", 
            [telefone]
        );
        
        if (result.rows.length === 0) {
            console.log('❌ Usuário não encontrado:', telefone);
            return res.status(401).json({ 
                success: false,
                erro: "Usuário não encontrado" 
            });
        }

        const usuario = result.rows[0];
        const match = await bcrypt.compare(senha, usuario.senha);
        
        if (!match) {
            console.log('❌ Senha incorreta para:', telefone);
            return res.status(401).json({ 
                success: false,
                erro: "Senha incorreta" 
            });
        }

        const token = jwt.sign({ 
            id: usuario.id,
            telefone: usuario.telefone,
            nome: usuario.nome 
        }, SECRET_KEY, { expiresIn: '7d' });
        
        console.log('✅ Login bem-sucedido:', usuario.nome);
        res.json({ 
            success: true,
            mensagem: "Login realizado com sucesso",
            token, 
            usuario: { 
                id: usuario.id,
                nome: usuario.nome, 
                telefone: usuario.telefone 
            } 
        });
    } catch (err) {
        console.error("❌ Erro no login:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro interno no servidor durante o login" 
        });
    }
});

// 3. Criar Pedido
app.post('/api/pedidos', async (req, res) => {
    console.log('🛒 Novo pedido recebido');
    try {
        const { 
            cliente, telefone, instituicao, curso, cadeira, 
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento 
        } = req.body;

        if (!cliente || !telefone || !plano || !preco) {
            return res.status(400).json({ 
                success: false,
                erro: "Cliente, telefone, plano e preço são obrigatórios" 
            });
        }

        const query = `
            INSERT INTO pedidos 
            (cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento, status, data_pedido) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pendente', NOW()) 
            RETURNING *`;

        const values = [
            cliente, telefone, instituicao || null, curso || null, cadeira || null, 
            tema || null, descricao || null, prazo || null, plano, nomePlano || plano, 
            preco, metodoPagamento || 'mpesa'
        ];

        const novoPedido = await pool.query(query, values);
        
        console.log('✅ Pedido criado ID:', novoPedido.rows[0].id);
        res.status(201).json({ 
            success: true, 
            mensagem: "Pedido criado com sucesso",
            pedido: novoPedido.rows[0] 
        });
    } catch (err) {
        console.error("❌ Erro ao salvar pedido:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro ao processar pedido no banco de dados" 
        });
    }
});

// 4. Listar Pedidos do Usuário
app.get('/api/meus-pedidos', async (req, res) => {
    console.log('📋 Buscando pedidos do usuário');
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                success: false,
                erro: "Token de autorização não fornecido" 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, SECRET_KEY);

        const result = await pool.query(
            "SELECT * FROM pedidos WHERE telefone = (SELECT telefone FROM usuarios WHERE id = $1) ORDER BY data_pedido DESC", 
            [decoded.id]
        );
        
        console.log('✅ Pedidos encontrados:', result.rows.length);
        res.json({ 
            success: true, 
            pedidos: result.rows 
        });
    } catch (err) {
        console.error("❌ Erro ao buscar pedidos:", err.message);
        
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                erro: "Token inválido" 
            });
        }
        
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false,
                erro: "Sessão expirada. Faça login novamente." 
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: "Erro interno ao buscar pedidos" 
        });
    }
});

// 5. Rota de Contato
app.post('/api/contato', async (req, res) => {
    console.log('📩 Mensagem de contato recebida');
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ 
                success: false,
                erro: "Nome, telefone e mensagem são obrigatórios" 
            });
        }
        
        console.log("📨 Contato:", { nome, telefone, email, mensagem: mensagem.substring(0, 50) + '...' });
        
        res.json({ 
            success: true,
            mensagem: "Mensagem recebida com sucesso! Entraremos em contato em breve."
        });
    } catch (err) {
        console.error("❌ Erro no contato:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro ao processar mensagem de contato" 
        });
    }
});

// 6. Verificar Token
app.get('/api/verificar-token', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                success: false,
                valido: false,
                erro: "Token não fornecido" 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, SECRET_KEY);
        
        res.json({ 
            success: true,
            valido: true,
            usuario: decoded 
        });
    } catch (err) {
        res.status(401).json({ 
            success: false,
            valido: false,
            erro: "Token inválido ou expirado" 
        });
    }
});

// 7. Logout
app.post('/api/logout', (req, res) => {
    console.log('👋 Logout solicitado');
    res.json({ 
        success: true,
        mensagem: "Logout realizado com sucesso"
    });
});

// ===== ROTAS PARA TESTE DOS ARQUIVOS =====
app.get('/test-index', (req, res) => {
    res.send(`<h1>Teste Index</h1><p>Se esta página carrega, o servidor está funcionando.</p>`);
});

// ===== ROTA 404 =====
app.use('*', (req, res) => {
    console.log('❌ Rota não encontrada:', req.originalUrl);
    res.status(404).json({ 
        success: false,
        erro: "Rota não encontrada",
        rota: req.originalUrl,
        timestamp: new Date().toISOString()
    });
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 SERVIDOR FACILITAKI INICIADO`);
    console.log('='.repeat(50));
    console.log(`🌐 URL: https://facilitaki.onrender.com`);
    console.log(`📡 API: https://facilitaki.onrender.com/status`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`📁 Diretório: ${__dirname}`);
    console.log(`⚡ Ambiente: ${process.env.NODE_ENV || 'production'}`);
    console.log('='.repeat(50));
    
    // Tentar listar arquivos da raiz
    try {
        const fs = require('fs');
        const files = fs.readdirSync(__dirname);
        console.log('📂 Arquivos na raiz:');
        files.forEach(file => {
            console.log(`   📄 ${file}`);
        });
        console.log('='.repeat(50));
    } catch (err) {
        console.log('⚠️ Não foi possível listar arquivos da raiz');
    }
});
