// server.js - Backend Facilitaki atualizado para PostgreSQL
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
// Usa a chave do Render ou uma padrão para desenvolvimento
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2024-production';

// Configuração da conexão com o PostgreSQL do Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Necessário para a segurança do Render
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Função para criar as tabelas automaticamente se não existirem no Postgres
async function inicializarBanco() {
    try {
        // Tabela de Clientes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT UNIQUE NOT NULL,
                email TEXT,
                senha TEXT,
                instituicao TEXT,
                curso TEXT,
                saldo DECIMAL(10,2) DEFAULT 0,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de Trabalhos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS trabalhos (
                id SERIAL PRIMARY KEY,
                titulo TEXT NOT NULL,
                categoria TEXT,
                preco_base DECIMAL(10,2),
                descricao TEXT
            )
        `);

        // Tabela de Pedidos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER REFERENCES clientes(id),
                trabalho_id INTEGER REFERENCES trabalhos(id),
                status TEXT DEFAULT 'pendente',
                valor_total DECIMAL(10,2),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("✅ Conectado ao PostgreSQL e tabelas verificadas!");
    } catch (err) {
        console.error("❌ Erro ao conectar ao banco de dados:", err);
    }
}

inicializarBanco();

// --- ROTAS DA API ---

// Rota de Cadastro
app.post('/api/cadastrar', async (req, res) => {
    const { nome, telefone, email, senha, instituicao, curso } = req.body;
    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO clientes (nome, telefone, email, senha, instituicao, curso) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [nome, telefone, email, senhaHash, instituicao, curso]
        );
        res.status(201).json({ mensagem: "Cadastro realizado com sucesso!", id: result.rows[0].id });
    } catch (err) {
        if (err.code === '23505') { // Código de erro para 'duplicado' no Postgres
            return res.status(400).json({ erro: "Este número de telefone já está registado." });
        }
        res.status(500).json({ erro: "Erro ao processar o cadastro." });
    }
});

// Rota de Login
app.post('/api/login', async (req, res) => {
    const { telefone, senha } = req.body;
    try {
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ erro: "Utilizador não encontrado." });
        }

        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: "Palavra-passe incorreta." });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '7d' });
        
        delete user.senha; // Não envia a senha para o navegador
        res.json({ mensagem: "Login realizado!", token, usuario: user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro interno no servidor." });
    }
});

// Health Check para o Render monitorar o site
app.get('/health', (req, res) => res.status(200).send('OK'));

// Servir o Frontend (index.html)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar o Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor Facilitaki a rodar na porta ${PORT}`);
});
