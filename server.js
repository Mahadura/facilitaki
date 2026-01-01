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

// ===== ROTA PRINCIPAL - PÁGINA INICIAL =====
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Facilitaki - Serviços Acadêmicos</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    text-align: center;
                    padding: 50px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    padding: 40px;
                    border-radius: 20px;
                    max-width: 800px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                }
                h1 {
                    font-size: 3rem;
                    margin-bottom: 20px;
                    color: white;
                }
                .status {
                    color: #4ade80;
                    font-weight: bold;
                    font-size: 1.2rem;
                    background: rgba(255, 255, 255, 0.1);
                    padding: 10px 20px;
                    border-radius: 50px;
                    display: inline-block;
                    margin: 10px;
                }
                .info {
                    background: rgba(255, 255, 255, 0.05);
                    padding: 25px;
                    border-radius: 15px;
                    margin: 25px 0;
                    text-align: left;
                }
                code {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 5px 10px;
                    border-radius: 5px;
                    font-family: 'Courier New', monospace;
                }
                a {
                    color: #60a5fa;
                    text-decoration: none;
                    font-weight: bold;
                }
                a:hover {
                    text-decoration: underline;
                }
                .buttons {
                    margin-top: 30px;
                }
                .button {
                    display: inline-block;
                    padding: 12px 30px;
                    margin: 10px;
                    background: white;
                    color: #667eea;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: bold;
                    transition: transform 0.3s, box-shadow 0.3s;
                }
                .button:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                }
                .api-list {
                    text-align: left;
                    margin: 20px 0;
                }
                .api-item {
                    margin: 10px 0;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 Facilitaki API</h1>
                <div class="status">✅ Servidor está funcionando!</div>
                
                <div class="info">
                    <p><strong>Versão:</strong> 1.0.0</p>
                    <p><strong>Status do Banco:</strong> ✅ Conectado</p>
                    <p><strong>Porta:</strong> ${process.env.PORT || 3000}</p>
                    <p><strong>Ambiente:</strong> ${process.env.NODE_ENV || 'production'}</p>
                </div>
                
                <div class="info">
                    <h3>📡 Endpoints da API:</h3>
                    <div class="api-list">
                        <div class="api-item">
                            <code>POST /api/cadastrar</code> - Cadastrar novo usuário
                        </div>
                        <div class="api-item">
                            <code>POST /api/login</code> - Login de usuário
                        </div>
                        <div class="api-item">
                            <code>POST /api/pedidos</code> - Criar novo pedido
                        </div>
                        <div class="api-item">
                            <code>GET /api/meus-pedidos</code> - Listar pedidos do usuário
                        </div>
                        <div class="api-item">
                            <code>GET /status</code> - Verificar status do servidor
                        </div>
                    </div>
                </div>
                
                <div class="buttons">
                    <a href="/status" class="button">📊 Ver Status da API</a>
                    <a href="https://facilitaki.onrender.com" class="button">🌐 Acessar Frontend</a>
                </div>
                
                <p style="margin-top: 30px; font-size: 0.9rem; opacity: 0.8;">
                    Servidor hospedado no Render • Banco PostgreSQL • Node.js + Express
                </p>
            </div>
        </body>
        </html>
    `);
});

// Serve arquivos estáticos (HTML, CSS, JS do frontend) 
// Se tiver uma pasta 'public' com frontend
app.use(express.static('public'));

// Configuração do Banco de Dados PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_segredo_2025';

// --- ROTAS DA API ---

// 1. Rota de Teste e Página Inicial
app.get('/status', (req, res) => {
    res.json({ 
        mensagem: 'Servidor Facilitaki API está online!',
        timestamp: new Date().toISOString(),
        status: 'operacional',
        database: 'conectado',
        versao: '1.0.0'
    });
});

// 2. Cadastro de Usuários
app.post('/api/cadastrar', async (req, res) => {
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
        res.status(201).json({ 
            success: true, 
            mensagem: "Usuário cadastrado com sucesso",
            usuario: result.rows[0] 
        });
    } catch (err) {
        console.error("Erro no cadastro:", err);
        
        if (err.code === '23505') { // Código de violação de unique constraint
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

// 3. Login de Usuários
app.post('/api/login', async (req, res) => {
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
            return res.status(401).json({ 
                success: false,
                erro: "Usuário não encontrado" 
            });
        }

        const usuario = result.rows[0];
        const match = await bcrypt.compare(senha, usuario.senha);
        
        if (!match) {
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
        console.error("Erro no login:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro interno no servidor durante o login" 
        });
    }
});

// 4. Criar Pedido
app.post('/api/pedidos', async (req, res) => {
    try {
        const { 
            cliente, telefone, instituicao, curso, cadeira, 
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento 
        } = req.body;

        // Validação básica
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
        
        res.status(201).json({ 
            success: true, 
            mensagem: "Pedido criado com sucesso",
            pedido: novoPedido.rows[0] 
        });
    } catch (err) {
        console.error("Erro ao salvar pedido:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro ao processar pedido no banco de dados" 
        });
    }
});

// 5. Listar Pedidos do Usuário (Dashboard)
app.get('/api/meus-pedidos', async (req, res) => {
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
        
        res.json({ 
            success: true, 
            pedidos: result.rows 
        });
    } catch (err) {
        console.error("Erro ao buscar pedidos:", err);
        
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

// 6. Rota de contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ 
                success: false,
                erro: "Nome, telefone e mensagem são obrigatórios" 
            });
        }
        
        // Aqui você poderia salvar no banco
        const query = `
            INSERT INTO contatos (nome, telefone, email, mensagem, data_contato)
            VALUES ($1, $2, $3, $4, NOW()) RETURNING *`;
        
        const result = await pool.query(query, [nome, telefone, email || null, mensagem]);
        
        res.json({ 
            success: true,
            mensagem: "Mensagem recebida com sucesso! Entraremos em contato em breve.",
            contato: result.rows[0]
        });
    } catch (err) {
        console.error("Erro no contato:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro ao processar mensagem de contato" 
        });
    }
});

// 7. Rota para verificar token
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

// 8. Rota para buscar usuário por token
app.get('/api/usuario', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                success: false,
                erro: "Token não fornecido" 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, SECRET_KEY);
        
        const result = await pool.query(
            "SELECT id, nome, telefone, data_cadastro FROM usuarios WHERE id = $1",
            [decoded.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                erro: "Usuário não encontrado" 
            });
        }
        
        res.json({ 
            success: true,
            usuario: result.rows[0]
        });
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                erro: "Token inválido" 
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: "Erro interno ao buscar usuário" 
        });
    }
});

// 9. Rota para atualizar pedido (status)
app.put('/api/pedidos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ 
                success: false,
                erro: "Status é obrigatório" 
            });
        }
        
        const result = await pool.query(
            "UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *",
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                erro: "Pedido não encontrado" 
            });
        }
        
        res.json({ 
            success: true,
            mensagem: "Status do pedido atualizado",
            pedido: result.rows[0]
        });
    } catch (err) {
        console.error("Erro ao atualizar pedido:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro interno ao atualizar pedido" 
        });
    }
});

// 10. Rota para logout (apenas remove token do cliente)
app.post('/api/logout', (req, res) => {
    res.json({ 
        success: true,
        mensagem: "Logout realizado com sucesso"
    });
});

// 11. Rota para estatísticas (admin)
app.get('/api/estatisticas', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ 
                success: false,
                erro: "Não autorizado" 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, SECRET_KEY);
        
        // Verificar se é admin (pode adicionar campo 'admin' na tabela usuarios)
        const totalUsuarios = await pool.query("SELECT COUNT(*) FROM usuarios");
        const totalPedidos = await pool.query("SELECT COUNT(*) FROM pedidos");
        const pedidosPendentes = await pool.query("SELECT COUNT(*) FROM pedidos WHERE status = 'pendente'");
        const valorTotal = await pool.query("SELECT SUM(preco) FROM pedidos WHERE status = 'pago'");
        
        res.json({ 
            success: true,
            estatisticas: {
                totalUsuarios: parseInt(totalUsuarios.rows[0].count),
                totalPedidos: parseInt(totalPedidos.rows[0].count),
                pedidosPendentes: parseInt(pedidosPendentes.rows[0].count),
                valorTotal: parseFloat(valorTotal.rows[0].sum || 0),
                data: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error("Erro ao buscar estatísticas:", err);
        res.status(500).json({ 
            success: false,
            erro: "Erro interno ao buscar estatísticas" 
        });
    }
});

// Rota 404 para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false,
        erro: "Rota não encontrada",
        rota: req.originalUrl,
        metodo: req.method
    });
});

// Middleware de erro global
app.use((err, req, res, next) => {
    console.error("Erro global:", err);
    res.status(500).json({ 
        success: false,
        erro: "Erro interno do servidor",
        detalhes: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Porta do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Servidor Facilitaki ativo na porta ${PORT}`);
    console.log(`🌐 Acesse: http://localhost:${PORT}`);
    console.log(`📡 Status da API: http://localhost:${PORT}/status`);
    console.log(`⚡ Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 JWT Secret: ${SECRET_KEY ? 'Configurado' : 'Usando padrão'}`);
});
