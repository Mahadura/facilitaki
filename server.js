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
    origin: ['https://facilitaki.onrender.com', 'http://localhost:10000', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Servir arquivos estáticos
app.use(express.static(__dirname));

// ===== CONFIGURAÇÃO DO BANCO DE DADOS RENDER =====
const DATABASE_URL = 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===== FUNÇÃO PARA CORRIGIR TABELA PEDIDOS =====
async function corrigirTabelaPedidos() {
    try {
        console.log('🛠️  Verificando tabela pedidos...');
        
        // Verificar se a tabela existe
        const existe = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'pedidos'
            ) as existe
        `);
        
        if (!existe.rows[0].existe) {
            console.log('📦 Criando tabela pedidos completa...');
            await pool.query(`
                CREATE TABLE pedidos (
                    id SERIAL PRIMARY KEY,
                    usuario_id INTEGER,
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
                    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Tabela pedidos criada!');
            return true;
        }
        
        // Verificar colunas faltantes
        const colunas = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'pedidos'
        `);
        
        const colunasExistentes = colunas.rows.map(c => c.column_name);
        const colunasNecessarias = [
            'id', 'usuario_id', 'cliente', 'telefone', 'instituicao', 
            'curso', 'cadeira', 'tema', 'descricao', 'prazo', 'plano', 
            'nome_plano', 'preco', 'metodo_pagamento', 'status', 'data_pedido'
        ];
        
        let corrigido = false;
        
        // Adicionar colunas faltantes
        for (const coluna of colunasNecessarias) {
            if (!colunasExistentes.includes(coluna)) {
                console.log(`➕ Adicionando coluna ${coluna}...`);
                
                let tipo = 'VARCHAR(100)';
                if (coluna === 'id') tipo = 'SERIAL PRIMARY KEY';
                if (coluna === 'usuario_id') tipo = 'INTEGER';
                if (coluna === 'telefone') tipo = 'VARCHAR(20)';
                if (coluna === 'preco') tipo = 'DECIMAL(10,2)';
                if (coluna === 'descricao') tipo = 'TEXT';
                if (coluna === 'prazo') tipo = 'DATE';
                if (coluna === 'plano') tipo = 'VARCHAR(50)';
                if (coluna === 'nome_plano') tipo = 'VARCHAR(100)';
                if (coluna === 'metodo_pagamento') tipo = 'VARCHAR(50)';
                if (coluna === 'status') tipo = 'VARCHAR(20)';
                if (coluna === 'data_pedido') tipo = 'TIMESTAMP';
                
                await pool.query(`ALTER TABLE pedidos ADD COLUMN ${coluna} ${tipo}`);
                
                // Adicionar defaults
                if (coluna === 'status') {
                    await pool.query(`ALTER TABLE pedidos ALTER COLUMN status SET DEFAULT 'pendente'`);
                }
                if (coluna === 'data_pedido') {
                    await pool.query(`ALTER TABLE pedidos ALTER COLUMN data_pedido SET DEFAULT CURRENT_TIMESTAMP`);
                }
                
                corrigido = true;
            }
        }
        
        if (corrigido) {
            console.log('✅ Tabela pedidos corrigida!');
        } else {
            console.log('✅ Tabela pedidos já está correta');
        }
        
        return corrigido;
        
    } catch (error) {
        console.error('❌ Erro ao corrigir tabela:', error.message);
        return false;
    }
}

// ===== INICIALIZAÇÃO DO BANCO =====
async function inicializarBanco() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        // Criar tabela usuarios
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
        
        // Corrigir tabela pedidos
        await corrigirTabelaPedidos();
        
        // Criar tabela contatos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                mensagem TEXT NOT NULL,
                data_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Banco inicializado!');
        
    } catch (error) {
        console.error('❌ Erro na inicialização:', error.message);
    }
}

// Executar inicialização
inicializarBanco();

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_secret_key_2025';

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

// ===== ROTA PRINCIPAL =====
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// ===== ROTAS DE DIAGNÓSTICO E CORREÇÃO =====

// 1. Status geral
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as hora');
        res.json({
            success: true,
            mensagem: 'Facilitaki Online',
            hora: dbTest.rows[0].hora,
            versao: '3.0'
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// 2. Debug do banco
app.get('/api/debug/db', async (req, res) => {
    try {
        const hora = await pool.query('SELECT NOW() as hora');
        const tabelas = await pool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' ORDER BY table_name
        `);
        
        // Estrutura da tabela pedidos
        let estruturaPedidos = [];
        try {
            estruturaPedidos = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'pedidos' 
                ORDER BY ordinal_position
            `);
        } catch (e) {
            estruturaPedidos = { rows: [] };
        }
        
        res.json({
            success: true,
            hora: hora.rows[0].hora,
            tabelas: tabelas.rows,
            estrutura_pedidos: estruturaPedidos.rows
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// 3. CORREÇÃO DA TABELA PEDIDOS (A ROTA QUE VOCÊ PRECISA!)
app.get('/api/fix-pedidos', async (req, res) => {
    try {
        console.log('🔧 Executando correção da tabela pedidos...');
        const corrigido = await corrigirTabelaPedidos();
        
        // Verificar estrutura após correção
        const estrutura = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'pedidos' 
            ORDER BY ordinal_position
        `);
        
        res.json({
            success: true,
            corrigido: corrigido,
            mensagem: corrigido ? 'Tabela corrigida com sucesso!' : 'Tabela já estava correta',
            estrutura: estrutura.rows,
            colunas_totais: estrutura.rows.length,
            instrucao: 'Agora tente criar um pedido!'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// 4. RECRIAR TABELA DO ZERO (EMERGÊNCIA)
app.get('/api/recreate-pedidos', async (req, res) => {
    try {
        console.log('🔄 Recriando tabela pedidos do zero...');
        
        // Remover tabela antiga
        await pool.query('DROP TABLE IF EXISTS pedidos CASCADE');
        
        // Criar nova tabela
        await pool.query(`
            CREATE TABLE pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER,
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
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Tabela pedidos recriada!');
        
        res.json({
            success: true,
            mensagem: 'Tabela pedidos recriada com sucesso!',
            instrucao: 'Agora os pedidos vão funcionar!'
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// ===== ROTAS PRINCIPAIS DA APLICAÇÃO =====

// 5. Cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Preencha todos os campos' 
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
                erro: 'Telefone já cadastrado' 
            });
        }
        
        // Criptografar senha
        const senhaHash = await bcrypt.hash(senha, 10);
        
        // Inserir usuário
        const usuario = await pool.query(
            `INSERT INTO usuarios (nome, telefone, senha) 
             VALUES ($1, $2, $3) 
             RETURNING id, nome, telefone`,
            [nome, telefoneLimpo, senhaHash]
        );
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: usuario.rows[0].id,
                nome: nome,
                telefone: telefoneLimpo
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            mensagem: 'Cadastro realizado!',
            token: token,
            usuario: usuario.rows[0]
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// 6. Login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ 
                success: false,
                erro: 'Preencha todos os campos' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        // Buscar usuário
        const usuario = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1',
            [telefoneLimpo]
        );
        
        if (usuario.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.rows[0].senha);
        
        if (!senhaValida) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: usuario.rows[0].id,
                nome: usuario.rows[0].nome,
                telefone: usuario.rows[0].telefone
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            mensagem: 'Login realizado!',
            token: token,
            usuario: {
                id: usuario.rows[0].id,
                nome: usuario.rows[0].nome,
                telefone: usuario.rows[0].telefone
            }
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// 7. CRIAR PEDIDO (ROTA PRINCIPAL CORRIGIDA)
app.post('/api/pedidos', autenticarToken, async (req, res) => {
    try {
        console.log('📦 Criando pedido para usuário:', req.usuario.id);
        
        const {
            cliente, telefone, instituicao, curso, cadeira,
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        } = req.body;
        
        // Validação básica
        if (!cliente || !telefone || !plano || !preco) {
            return res.status(400).json({ 
                success: false,
                erro: 'Preencha: cliente, telefone, plano e preço' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const precoNum = parseFloat(preco);
        
        // Inserir pedido
        const pedido = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira, 
                tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id, cliente, plano, preco, status, data_pedido`,
            [
                req.usuario.id,
                cliente,
                telefoneLimpo,
                instituicao || null,
                curso || null,
                cadeira || null,
                tema || null,
                descricao || null,
                prazo || null,
                plano,
                nomePlano || plano,
                precoNum,
                metodoPagamento || 'mpesa'
            ]
        );
        
        console.log('✅ Pedido criado! ID:', pedido.rows[0].id);
        
        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: pedido.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error.message);
        
        // Se for erro de coluna faltante, sugerir correção
        if (error.message.includes('column') || error.message.includes('usuario_id')) {
            return res.json({
                success: false,
                erro: 'Problema na tabela. Execute a correção primeiro:',
                correcao_url: 'https://facilitaki.onrender.com/api/fix-pedidos',
                dica: 'Acesse a URL acima para corrigir a tabela'
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// 8. Meus pedidos
app.get('/api/meus-pedidos', autenticarToken, async (req, res) => {
    try {
        const pedidos = await pool.query(
            'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC',
            [req.usuario.id]
        );
        
        res.json({
            success: true,
            pedidos: pedidos.rows,
            total: pedidos.rows.length
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// 9. Contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ 
                success: false,
                erro: 'Preencha: nome, telefone e mensagem' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        await pool.query(
            `INSERT INTO contatos (nome, telefone, email, mensagem)
             VALUES ($1, $2, $3, $4)`,
            [nome, telefoneLimpo, email || null, mensagem]
        );
        
        res.json({
            success: true,
            mensagem: 'Mensagem enviada!'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// 10. Verificar token
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({
        success: true,
        valido: true,
        usuario: req.usuario
    });
});

// ===== ROTAS PARA ARQUIVOS ESTÁTICOS =====
app.get('/index.html', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/style.css');
});

app.get('/script.js', (req, res) => {
    res.sendFile(__dirname + '/script.js');
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 FACILITAKI - SERVIDOR CORRIGIDO');
    console.log('='.repeat(60));
    console.log(`📍 URL: https://facilitaki.onrender.com`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`💾 Banco: PostgreSQL (Render)`);
    console.log(`🛠️  Correções: Tabela pedidos completa`);
    console.log('='.repeat(60));
    console.log('✅ ROTAS DISPONÍVEIS:');
    console.log('   /status              - Status do servidor');
    console.log('   /api/debug/db        - Debug do banco');
    console.log('   /api/fix-pedidos     - CORRIGIR tabela pedidos');
    console.log('   /api/recreate-pedidos - Recriar tabela do zero');
    console.log('   /api/cadastrar       - Cadastrar usuário');
    console.log('   /api/login           - Login');
    console.log('   /api/pedidos         - Criar pedido (POST)');
    console.log('   /api/meus-pedidos    - Listar pedidos (GET)');
    console.log('='.repeat(60));
    console.log('🎯 PRIMEIRO: Acesse /api/fix-pedidos para corrigir a tabela');
    console.log('🎯 DEPOIS: Tente criar um pedido no site');
    console.log('='.repeat(60));
});
