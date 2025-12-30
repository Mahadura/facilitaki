const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');

const app = express();

// 1. Configurações de Middleware
app.use(cors()); // Permite que o browser aceda à API sem bloqueios de segurança
app.use(express.json()); // Permite receber dados em formato JSON
app.use(express.static(path.join(__dirname))); // Serve os ficheiros HTML/JS/CSS da pasta atual

// 2. Configuração do Banco de Dados (PostgreSQL)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Obrigatório para bancos de dados geridos no Render
    }
});

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_seguranca_2025';

// 3. Inicialização do Banco de Dados (Criação da Tabela)
async function inicializarBanco() {
    try {
        console.log("⏳ Verificando/Criando tabela de clientes...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(50) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Banco de dados pronto para uso.");
    } catch (err) {
        console.error("❌ Erro ao configurar banco:", err.message);
    }
}
inicializarBanco();

// --- ROTAS DA API ---

// ROTA DE CADASTRO
app.post('/api/cadastrar', async (req, res) => {
    const { nome, telefone, senha } = req.body;

    // Validação de segurança
    if (!nome || !telefone || !senha) {
        return res.status(400).json({ erro: "Preencha todos os campos corretamente." });
    }

    try {
        // Encriptação da senha
        const senhaHash = await bcrypt.hash(senha, 10);
        
        // Limpeza de espaços no telefone (para evitar erros de login)
        const telefoneLimpo = telefone.replace(/\s/g, '');

        const query = 'INSERT INTO clientes (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id';
        const values = [nome, telefoneLimpo, senhaHash];
        
        const result = await pool.query(query, values);
        
        console.log(`👤 Novo usuário cadastrado: ${telefoneLimpo}`);
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
    const telefoneLimpo = telefone.replace(/\s/g, '');

    try {
        const result = await pool.query('SELECT * FROM clientes WHERE telefone = $1', [telefoneLimpo]);
        const usuario = result.rows[0];

        if (!usuario) {
            return res.status(401).json({ erro: "Usuário não encontrado." });
        }

        // Verifica se a senha coincide com o Hash no banco
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: "Senha incorreta." });
        }

        // Gera o Token JWT para manter o usuário logado
        const token = jwt.sign({ id: usuario.id }, SECRET_KEY, { expiresIn: '24h' });

        res.json({
            mensagem: "Login bem-sucedido!",
            token,
            usuario: { 
                nome: usuario.nome, 
                telefone: usuario.telefone 
            }
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
    console.log(`🚀 Servidor Facilitaki online na porta ${PORT}`);
});
