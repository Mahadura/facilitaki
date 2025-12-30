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

// Serve arquivos estáticos (HTML, CSS, JS do frontend) 
// Certifique-se de que o seu index.html está na raiz ou numa pasta 'public'
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
    res.json({ mensagem: 'Servidor Facilitaki API está online!' });
});

// 2. Cadastro de Usuários
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            "INSERT INTO usuarios (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome, telefone",
            [nome, telefone, hash]
        );
        res.status(201).json({ success: true, usuario: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao cadastrar. O número pode já existir." });
    }
});

// 3. Login de Usuários
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query("SELECT * FROM usuarios WHERE telefone = $1", [telefone]);
        
        if (result.rows.length === 0) return res.status(401).json({ erro: "Usuário não encontrado" });

        const match = await bcrypt.compare(senha, result.rows[0].senha);
        if (!match) return res.status(401).json({ erro: "Senha incorreta" });

        const token = jwt.sign({ id: result.rows[0].id }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ 
            token, 
            usuario: { nome: result.rows[0].nome, telefone: result.rows[0].telefone } 
        });
    } catch (err) {
        res.status(500).json({ erro: "Erro no servidor durante o login." });
    }
});

// 4. Criar Pedido (A parte que faltava no seu sistema)
app.post('/api/pedidos', async (req, res) => {
    try {
        const { 
            cliente, telefone, instituicao, curso, cadeira, 
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento 
        } = req.body;

        const query = `
            INSERT INTO pedidos 
            (cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pendente') 
            RETURNING *`;

        const values = [
            cliente, telefone, instituicao, curso, cadeira, 
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        ];

        const novoPedido = await pool.query(query, values);
        res.status(201).json({ success: true, pedido: novoPedido.rows[0] });
    } catch (err) {
        console.error("Erro ao salvar pedido:", err.message);
        res.status(500).json({ erro: "Erro ao processar pedido no banco de dados." });
    }
});

// 5. Listar Pedidos do Usuário (Dashboard)
app.get('/api/meus-pedidos', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ erro: "Não autorizado" });

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, SECRET_KEY);

        const result = await pool.query(
            "SELECT * FROM pedidos WHERE telefone = (SELECT telefone FROM usuarios WHERE id = $1) ORDER BY data_pedido DESC", 
            [decoded.id]
        );
        res.json({ success: true, pedidos: result.rows });
    } catch (err) {
        res.status(401).json({ erro: "Sessão expirada. Faça login novamente." });
    }
});

// Porta do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Facilitaki ativo na porta ${PORT}`));
