const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors()); // Permite que o navegador aceite a resposta do servidor
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SECRET_KEY = process.env.SECRET_KEY || 'chave_mestra_facilitaki';

// Configuração de Conexão com logs de diagnóstico
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Testa a conexão com o banco assim que o servidor sobe
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ ERRO AO CONECTAR NO POSTGRES:', err.stack);
    }
    console.log('✅ CONECTADO AO BANCO DE DADOS COM SUCESSO');
    release();
});

// Inicialização da Tabela
async function init() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (e) { console.error("Erro ao criar tabela:", e); }
}
init();

// Rota de Cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ erro: "Dados incompletos" });
        }

        const hash = await bcrypt.hash(senha, 10);
        await pool.query(
            'INSERT INTO clientes (nome, telefone, senha) VALUES ($1, $2, $3)',
            [nome, telefone, hash]
        );

        res.status(201).json({ mensagem: "Sucesso" });
    } catch (err) {
        console.error("Erro na rota cadastro:", err.message);
        res.status(500).json({ erro: "Erro no servidor", detalhe: err.message });
    }
});

// Rota de Login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
        
        if (result.rows.length === 0) return res.status(401).json({ erro: "Não encontrado" });

        const match = await bcrypt.compare(senha, result.rows[0].senha);
        if (!match) return res.status(401).json({ erro: "Senha incorreta" });

        const token = jwt.sign({ id: result.rows[0].id }, SECRET_KEY);
        res.json({ token, usuario: result.rows[0].nome });
    } catch (err) {
        res.status(500).json({ erro: "Erro no servidor" });
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ON: ${PORT}`));
