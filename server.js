const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2024-production';

// Configuração da conexão com o PostgreSQL do Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Função para inicializar e alinhar a estrutura do banco
async function inicializarBanco() {
    try {
        console.log("🔄 Alinhando estrutura do banco de dados...");
        
        // Remove tabelas antigas para evitar erros de colunas inexistentes
        // NOTA: Isso apagará os dados de teste atuais para criar a estrutura correta
        await pool.query('DROP TABLE IF EXISTS pedidos, trabalhos, clientes CASCADE');

        // Criação da Tabela Clientes (exatamente o que o seu script.js envia)
        await pool.query(`
            CREATE TABLE clientes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Criação da Tabela Pedidos
        await pool.query(`
            CREATE TABLE pedidos (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                plano TEXT,
                preco DECIMAL(10,2),
                metodo_pagamento TEXT,
                status TEXT DEFAULT 'pendente',
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("✅ Banco de Dados RESETADO e tabelas criadas com sucesso!");
    } catch (err) {
        console.error("❌ Erro ao inicializar banco de dados:", err);
    }
}

inicializarBanco();

// --- ROTAS DA API ---

// Cadastro (Alinhado com o script.js)
app.post('/api/cadastrar', async (req, res) => {
    const { nome, telefone, senha } = req.body;
    
    if (!nome || !telefone || !senha) {
        return res.status(400).json({ erro: "Campos obrigatórios faltando." });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO clientes (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome',
            [nome, telefone, senhaHash]
        );
        res.status(201).json({ mensagem: "Cadastro realizado!", id: result.rows[0].id });
    } catch (err) {
        console.error("Erro no cadastro:", err.message);
        if (err.code === '23505') {
            return res.status(400).json({ erro: "Este telefone já está cadastrado." });
        }
        res.status(500).json({ erro: "Erro interno ao cadastrar usuário." });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
        const user = result.rows[0];

        if (!user) return res.status(401).json({ erro: "Usuário não encontrado." });

        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(401).json({ erro: "Senha incorreta." });

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '7d' });
        
        // Remove a senha antes de enviar para o cliente
        delete user.senha;
        res.json({ mensagem: "Login realizado!", token, usuario: user });
    } catch (err) {
        console.error("Erro no login:", err.message);
        res.status(500).json({ erro: "Erro no servidor." });
    }
});

// Health Check
app.get('/health', (req, res) => res.status(200).send('OK'));

// Servir o index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
