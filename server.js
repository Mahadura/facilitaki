const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();

// Configurações de Segurança e JSON
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 1. Chave Secreta para o Token JWT
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_sucesso_2025';

// 2. Configuração do Banco de Dados com SSL Obrigatório para o Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Essencial para funcionar no Render
    }
});

// 3. Inicialização Automática do Banco de Dados
async function setupDatabase() {
    try {
        console.log("⏳ Verificando estrutura do banco...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                telefone TEXT UNIQUE NOT NULL,
                senha TEXT NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Banco de dados pronto para uso.");
    } catch (err) {
        console.error("❌ Erro ao configurar banco:", err.message);
    }
}
setupDatabase();

// --- ROTAS DA API ---

// ROTA DE CADASTRO
app.post('/api/cadastrar', async (req, res) => {
    const { nome, telefone, senha } = req.body;

    // Validação básica
    if (!nome || !telefone || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos corretamente." });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        
        const query = 'INSERT INTO clientes (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id';
        const values = [nome, telefone, senhaHash];
        
        const result = await pool.query(query, values);
        
        console.log(`👤 Novo usuário cadastrado: ${telefone}`);
        res.status(201).json({ mensagem: "Cadastro realizado com sucesso!", id: result.rows[0].id });

    } catch (err) {
        console.error("❌ ERRO NO CADASTRO:", err.message);
        
        if (err.code === '23505') {
            return res.status(400).json({ erro: "Este número de WhatsApp já está cadastrado." });
        }
        
        res.status(500).json({ erro: "Erro interno no servidor ao cadastrar.", detalhe: err.message });
    }
});

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
    const { telefone, senha } = req.body;

    try {
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefone]);
        const usuario = result.rows[0];

        if (!usuario) {
            return res.status(401).json({ erro: "Usuário não encontrado." });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: "Senha incorreta." });
        }

        // Gera o Token de Acesso
        const token = jwt.sign({ id: usuario.id }, SECRET_KEY, { expiresIn: '24h' });

        res.json({
            mensagem: "Login bem-sucedido!",
            token,
            usuario: { nome: usuario.nome, telefone: usuario.telefone }
        });

    } catch (err) {
        console.error("❌ ERRO NO LOGIN:", err.message);
        res.status(500).json({ erro: "Erro interno no servidor ao fazer login." });
    }
});

// ROTA PARA SERVIR O FRONTEND (Sempre por último)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
