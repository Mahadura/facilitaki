// server.js - Código Completo para o Facilitaki
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jwt-simple');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Chave para segurança do Token
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_segredo_123';

// Configuração da Base de Dados (PostgreSQL)
// Se não houver DATABASE_URL no Render, o servidor avisará no log
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Testar ligação à base de dados
pool.connect((err) => {
    if (err) {
        console.error('AVISO: Base de dados não detetada. O sistema funcionará apenas em memória temporária.');
    } else {
        console.log('SUCESSO: Ligado ao PostgreSQL no Render.');
    }
});

// ===== ROTA DE CADASTRO =====
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const senhaHash = await bcrypt.hash(senha, 10);
        
        const result = await pool.query(
            "INSERT INTO usuarios (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome, telefone",
            [nome, telefone, senhaHash]
        );
        res.status(201).json({ success: true, usuario: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao cadastrar. O número pode já existir." });
    }
});

// ===== ROTA DE LOGIN =====
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query("SELECT * FROM usuarios WHERE telefone = $1", [telefone]);

        if (result.rows.length === 0) return res.status(401).json({ erro: "Utilizador não encontrado" });

        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) return res.status(401).json({ erro: "Senha incorreta" });

        const token = jwt.encode({ id: usuario.id, nome: usuario.nome }, SECRET_KEY);
        res.json({ token, usuario: { nome: usuario.nome, telefone: usuario.telefone } });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao processar login" });
    }
});

// ===== ROTA DE CRIAR PEDIDO (O QUE DAVA ERRO) =====
app.post('/api/pedidos', async (req, res) => {
    try {
        const { 
            cliente, telefone, instituicao, curso, cadeira, 
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento 
        } = req.body;

        // Comando para inserir na tabela 'pedidos'
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
        
        console.log("Novo pedido registado para:", cliente);
        res.status(201).json({ success: true, pedido: novoPedido.rows[0] });
    } catch (err) {
        console.error("ERRO NO PEDIDO:", err.message);
        res.status(500).json({ erro: "Erro ao guardar pedido. Verifique se a tabela 'pedidos' existe no SQL." });
    }
});

// ===== ROTA DE MEUS PEDIDOS (DASHBOARD) =====
app.get('/api/meus-pedidos', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(403).json({ erro: "Token ausente" });

        const decoded = jwt.decode(token, SECRET_KEY);
        // Busca os pedidos associados ao nome ou telefone do utilizador
        const result = await pool.query("SELECT * FROM pedidos WHERE cliente = $1 OR telefone = (SELECT telefone FROM usuarios WHERE id = $2) ORDER BY data_pedido DESC", [decoded.nome, decoded.id]);
        
        res.json({ success: true, pedidos: result.rows });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao carregar dashboard" });
    }
});

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Facilitaki ativo na porta ${PORT}`);
});
