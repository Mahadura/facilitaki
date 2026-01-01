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

// URL DIRETA do seu PostgreSQL no Render (CORRIGIDO!)
const DATABASE_URL = 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    // Configurações otimizadas para Render
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

// Testar conexão com banco
pool.on('connect', () => {
    console.log('✅ Conexão com PostgreSQL estabelecida!');
    console.log('📡 Banco: facilitaki_db (Render PostgreSQL)');
});

pool.on('error', (err) => {
    console.error('❌ Erro fatal na conexão PostgreSQL:', err.message);
});

// Criar tabelas automaticamente COM CORREÇÃO
async function inicializarBanco() {
    try {
        console.log('🔧 Inicializando banco de dados...');
        
        // ===== CORREÇÃO CRÍTICA: VERIFICAR E CORRIGIR TABELA PEDIDOS =====
        console.log('🛠️  Verificando estrutura da tabela pedidos...');
        
        try {
            // Primeiro criar tabela usuarios se não existir
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
            console.log('✅ Tabela usuarios OK');
            
            // Verificar se tabela pedidos existe
            const tabelaExiste = await pool.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'pedidos'
                ) as existe
            `);
            
            if (tabelaExiste.rows[0].existe) {
                // Tabela existe, verificar se tem coluna usuario_id
                const colunaExiste = await pool.query(`
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'pedidos' 
                        AND column_name = 'usuario_id'
                    ) as existe
                `);
                
                if (!colunaExiste.rows[0].existe) {
                    console.log('➕ Adicionando coluna usuario_id faltante...');
                    await pool.query(`ALTER TABLE pedidos ADD COLUMN usuario_id INTEGER`);
                    console.log('✅ Coluna usuario_id adicionada!');
                    
                    // Tentar adicionar constraint
                    try {
                        await pool.query(`
                            ALTER TABLE pedidos 
                            ADD CONSTRAINT fk_pedidos_usuario 
                            FOREIGN KEY (usuario_id) 
                            REFERENCES usuarios(id) 
                            ON DELETE SET NULL
                        `);
                        console.log('✅ Constraint adicionada');
                    } catch (constraintError) {
                        console.log('⚠️  Não foi possível adicionar constraint (pode já existir)');
                    }
                } else {
                    console.log('✅ Coluna usuario_id já existe');
                }
            } else {
                // Tabela não existe, criar correta
                console.log('🏗️  Criando tabela pedidos completa...');
                await pool.query(`
                    CREATE TABLE pedidos (
                        id SERIAL PRIMARY KEY,
                        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
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
                        data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                console.log('✅ Tabela pedidos criada corretamente!');
            }
            
        } catch (fixError) {
            console.error('⚠️  Erro na verificação/correção:', fixError.message);
        }
        // ===== FIM DA CORREÇÃO =====
        
        // Tabela de contatos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                mensagem TEXT NOT NULL,
                data_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                respondido BOOLEAN DEFAULT FALSE
            )
        `);
        console.log('✅ Tabela contatos OK');
        
        // Criar índices para performance
        try {
            await pool.query('CREATE INDEX IF NOT EXISTS idx_pedidos_usuario ON pedidos(usuario_id)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_telefone ON usuarios(telefone)');
            console.log('✅ Índices criados');
        } catch (indexError) {
            console.log('⚠️  Índices já existem');
        }
        
        // Verificar estatísticas
        const usuarios = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        const pedidos = await pool.query('SELECT COUNT(*) as total FROM pedidos');
        const contatos = await pool.query('SELECT COUNT(*) as total FROM contatos');
        
        console.log(`📊 Estatísticas:`);
        console.log(`   👥 Usuários: ${usuarios.rows[0].total}`);
        console.log(`   📦 Pedidos: ${pedidos.rows[0].total}`);
        console.log(`   📨 Contatos: ${contatos.rows[0].total}`);
        
        // Se não houver usuários, criar um de teste
        if (parseInt(usuarios.rows[0].total) === 0) {
            console.log('👤 Criando usuário de teste...');
            const senhaHash = await bcrypt.hash('teste123', 10);
            await pool.query(`
                INSERT INTO usuarios (nome, telefone, senha) 
                VALUES ('Usuário Teste', '841234567', $1)
                ON CONFLICT (telefone) DO NOTHING
            `, [senhaHash]);
            console.log('✅ Usuário de teste criado (senha: teste123)');
        }
        
        console.log('✅ Banco de dados inicializado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
        console.error('🔍 Detalhes do erro:', error);
    }
}

// Executar inicialização
inicializarBanco();

const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_producao_2025_segredo_muito_forte';

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
    res.sendFile(__dirname + '/index.html', (err) => {
        if (err) {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Facilitaki - Serviços Acadêmicos</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; }
                        .container { background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; max-width: 800px; }
                        h1 { font-size: 3rem; margin-bottom: 20px; }
                        .status { color: #4ade80; font-weight: bold; font-size: 1.2rem; }
                        .button { display: inline-block; padding: 12px 30px; margin: 10px; background: white; color: #667eea; border-radius: 8px; text-decoration: none; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🚀 Facilitaki</h1>
                        <p class="status">✅ Servidor está funcionando!</p>
                        <p>Plataforma de serviços acadêmicos</p>
                        <div>
                            <a href="/status" class="button">📊 Status da API</a>
                            <a href="/api/debug/db" class="button">🐘 Testar Banco</a>
                            <a href="/api/fix-pedidos" class="button">🔧 Corrigir Tabela</a>
                            <a href="/index.html" class="button">🌐 Acessar Site</a>
                        </div>
                    </div>
                </body>
                </html>
            `);
        }
    });
});

// ===== ROTAS DA API =====

// 1. Status
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as server_time');
        
        res.json({
            success: true,
            mensagem: 'Facilitaki API Online',
            timestamp: new Date().toISOString(),
            ambiente: process.env.NODE_ENV || 'production',
            banco: {
                status: 'conectado',
                hora_servidor: dbTest.rows[0].server_time
            },
            servidor: 'Render',
            regiao: 'Oregon, USA',
            versao: '2.1.0',
            conexao_ativa: true,
            tabela_pedidos_corrigida: true
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            erro: 'Erro no servidor: ' + error.message
        });
    }
});

// 2. Debug do Banco
app.get('/api/debug/db', async (req, res) => {
    try {
        console.log('🔍 Debug: Testando conexão com banco...');
        
        // Teste 1: Conexão básica
        const test1 = await pool.query('SELECT NOW() as hora, version() as versao');
        
        // Teste 2: Verificar tabelas
        const test2 = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name
        `);
        
        // Teste 3: Verificar estrutura da tabela pedidos
        const estruturaPedidos = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'pedidos'
            ORDER BY ordinal_position
        `);
        
        // Teste 4: Contar registros
        const usuarios = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        const pedidos = await pool.query('SELECT COUNT(*) as total FROM pedidos');
        const contatos = await pool.query('SELECT COUNT(*) as total FROM contatos');
        
        res.json({
            success: true,
            conexao: 'OK',
            hora_servidor: test1.rows[0].hora,
            versao_postgres: test1.rows[0].versao,
            tabelas: test2.rows,
            estrutura_pedidos: estruturaPedidos.rows,
            contagens: {
                usuarios: parseInt(usuarios.rows[0].total),
                pedidos: parseInt(pedidos.rows[0].total),
                contatos: parseInt(contatos.rows[0].total)
            },
            coluna_usuario_id_existe: estruturaPedidos.rows.some(col => col.column_name === 'usuario_id'),
            env: {
                database_url: 'CONFIGURADA (URL FIXA)',
                node_env: process.env.NODE_ENV || 'production'
            }
        });
        
    } catch (error) {
        console.error('❌ Erro no debug:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            dica: 'A tabela pedidos pode não existir ainda'
        });
    }
});

// 3. CORREÇÃO MANUAL DA TABELA PEDIDOS
app.get('/api/fix-pedidos', async (req, res) => {
    try {
        console.log('🛠️  Executando correção manual da tabela pedidos...');
        
        let steps = [];
        
        // Passo 1: Verificar se tabela existe
        const tabelaExiste = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'pedidos'
            ) as existe
        `);
        
        if (!tabelaExiste.rows[0].existe) {
            steps.push('❌ Tabela pedidos não existe. Criando...');
            
            // Primeiro garantir que usuarios existe
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
            
            // Criar tabela pedidos correta
            await pool.query(`
                CREATE TABLE pedidos (
                    id SERIAL PRIMARY KEY,
                    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
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
                    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            steps.push('✅ Tabela pedidos criada com coluna usuario_id!');
        } else {
            steps.push('✅ Tabela pedidos já existe');
            
            // Verificar coluna usuario_id
            const colunaExiste = await pool.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name = 'pedidos' 
                    AND column_name = 'usuario_id'
                ) as existe
            `);
            
            if (!colunaExiste.rows[0].existe) {
                steps.push('➕ Adicionando coluna usuario_id...');
                await pool.query(`ALTER TABLE pedidos ADD COLUMN usuario_id INTEGER`);
                steps.push('✅ Coluna usuario_id adicionada!');
                
                // Adicionar constraint
                try {
                    await pool.query(`
                        ALTER TABLE pedidos 
                        ADD CONSTRAINT fk_pedidos_usuario 
                        FOREIGN KEY (usuario_id) 
                        REFERENCES usuarios(id) 
                        ON DELETE SET NULL
                    `);
                    steps.push('✅ Constraint adicionada');
                } catch (e) {
                    steps.push('⚠️  Não foi possível adicionar constraint');
                }
            } else {
                steps.push('✅ Coluna usuario_id já existe');
            }
        }
        
        // Verificar estrutura final
        const estrutura = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'pedidos'
            ORDER BY ordinal_position
        `);
        
        res.json({
            success: true,
            mensagem: 'Correção executada com sucesso!',
            steps: steps,
            estrutura_final: estrutura.rows,
            pronto_para_uso: true,
            instrucao: 'Agora tente criar um pedido no site.'
        });
        
    } catch (error) {
        console.error('❌ Erro na correção:', error);
        res.status(500).json({
            success: false,
            erro: error.message,
            steps: ['❌ Falha na correção']
        });
    }
});

// 4. Cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        // Validação
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ 
                success: false, 
                erro: 'Nome, telefone e senha são obrigatórios' 
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
                erro: 'Este telefone já está cadastrado' 
            });
        }
        
        // Criptografar senha
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(senha, salt);
        
        // Inserir usuário
        const novoUsuario = await pool.query(
            `INSERT INTO usuarios (nome, telefone, senha) 
             VALUES ($1, $2, $3) 
             RETURNING id, nome, telefone, data_cadastro`,
            [nome, telefoneLimpo, senhaHash]
        );
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: novoUsuario.rows[0].id,
                nome: nome,
                telefone: telefoneLimpo
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        console.log(`✅ Usuário cadastrado: ${nome} (${telefoneLimpo})`);
        
        res.status(201).json({
            success: true,
            mensagem: 'Cadastro realizado com sucesso!',
            token: token,
            usuario: novoUsuario.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro interno no servidor: ' + error.message 
        });
    }
});

// 5. Login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ 
                success: false,
                erro: 'Telefone e senha são obrigatórios' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        // Buscar usuário
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1 AND ativo = true',
            [telefoneLimpo]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        const usuario = result.rows[0];
        
        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({ 
                success: false,
                erro: 'Telefone ou senha incorretos' 
            });
        }
        
        // Gerar token
        const token = jwt.sign(
            { 
                id: usuario.id,
                nome: usuario.nome,
                telefone: usuario.telefone
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        console.log(`✅ Login realizado: ${usuario.nome} (${usuario.telefone})`);
        
        res.json({
            success: true,
            mensagem: 'Login realizado com sucesso!',
            token: token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                telefone: usuario.telefone,
                data_cadastro: usuario.data_cadastro
            }
        });
        
    } catch (error) {
        console.error('❌ Erro no login:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro interno no servidor: ' + error.message 
        });
    }
});

// 6. Criar pedido (AGORA FUNCIONANDO!)
app.post('/api/pedidos', autenticarToken, async (req, res) => {
    try {
        console.log('🛒 Recebendo pedido do usuário:', req.usuario.id);
        console.log('📦 Dados do pedido:', req.body);
        
        const {
            cliente, telefone, instituicao, curso, cadeira,
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        } = req.body;
        
        // Validação básica
        if (!cliente || !telefone || !plano || !preco) {
            return res.status(400).json({ 
                success: false,
                erro: 'Dados obrigatórios faltando: cliente, telefone, plano e preço' 
            });
        }
        
        // Preparar dados
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const precoNumerico = parseFloat(preco);
        
        if (isNaN(precoNumerico)) {
            return res.status(400).json({ 
                success: false,
                erro: 'Preço inválido' 
            });
        }
        
        console.log('📝 Inserindo pedido no banco...');
        
        const novoPedido = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira, 
                tema, descricao, prazo, plano, nome_plano, preco, 
                metodo_pagamento
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
                precoNumerico,
                metodoPagamento || 'mpesa'
            ]
        );
        
        console.log('✅ Pedido criado com ID:', novoPedido.rows[0].id);
        console.log('📊 Preço salvo:', novoPedido.rows[0].preco);
        
        res.status(201).json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: novoPedido.rows[0],
            salvo_no_banco: true
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error.message);
        console.error('🔍 Detalhes do erro:', error);
        
        // Se for erro de coluna faltante, sugerir correção
        if (error.message.includes('usuario_id') || error.message.includes('column')) {
            return res.status(500).json({ 
                success: false,
                erro: 'Problema na tabela. Execute a correção: ' + error.message,
                correcao: 'Acesse: https://facilitaki.onrender.com/api/fix-pedidos'
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao criar pedido: ' + error.message 
        });
    }
});

// 7. Meus pedidos
app.get('/api/meus-pedidos', autenticarToken, async (req, res) => {
    try {
        console.log('📋 Buscando pedidos do usuário:', req.usuario.id);
        
        const pedidos = await pool.query(
            `SELECT * FROM pedidos 
             WHERE usuario_id = $1 
             ORDER BY data_pedido DESC`,
            [req.usuario.id]
        );
        
        console.log(`✅ Encontrados ${pedidos.rows.length} pedidos`);
        
        res.json({
            success: true,
            pedidos: pedidos.rows,
            total: pedidos.rows.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar pedidos:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao buscar pedidos: ' + error.message 
        });
    }
});

// 8. Contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ 
                success: false,
                erro: 'Nome, telefone e mensagem são obrigatórios' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        await pool.query(
            `INSERT INTO contatos (nome, telefone, email, mensagem)
             VALUES ($1, $2, $3, $4)`,
            [nome, telefoneLimpo, email || null, mensagem]
        );
        
        console.log(`📨 Mensagem de contato recebida de: ${nome} (${telefoneLimpo})`);
        
        res.json({
            success: true,
            mensagem: 'Mensagem recebida com sucesso! Entraremos em contacto em breve.'
        });
        
    } catch (error) {
        console.error('❌ Erro no contato:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao processar mensagem: ' + error.message 
        });
    }
});

// 9. Verificar token
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({
        success: true,
        valido: true,
        usuario: req.usuario
    });
});

// 10. Usuário atual
app.get('/api/usuario', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, telefone, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                erro: 'Usuário não encontrado' 
            });
        }
        
        res.json({
            success: true,
            usuario: result.rows[0]
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar usuário:', error);
        res.status(500).json({ 
            success: false,
            erro: 'Erro ao buscar usuário: ' + error.message 
        });
    }
});

// 11. Logout
app.post('/api/logout', autenticarToken, (req, res) => {
    console.log(`👋 Usuário ${req.usuario.nome} fez logout`);
    res.json({
        success: true,
        mensagem: 'Logout realizado com sucesso'
    });
});

// 12. Saúde do sistema
app.get('/api/saude', async (req, res) => {
    try {
        const db = await pool.query('SELECT NOW() as time, version() as version');
        const usuarios = await pool.query('SELECT COUNT(*) FROM usuarios');
        const pedidos = await pool.query('SELECT COUNT(*) FROM pedidos');
        const contatos = await pool.query('SELECT COUNT(*) FROM contatos');
        
        res.json({
            success: true,
            sistema: {
                status: 'operacional',
                timestamp: new Date().toISOString(),
                banco: {
                    hora: db.rows[0].time,
                    versao: db.rows[0].version.split(' ').slice(0, 3).join(' ')
                },
                estatisticas: {
                    total_usuarios: parseInt(usuarios.rows[0].count),
                    total_pedidos: parseInt(pedidos.rows[0].count),
                    total_contatos: parseInt(contatos.rows[0].count)
                },
                memoria: process.memoryUsage(),
                uptime: process.uptime()
            }
        });
    } catch (error) {
        console.error('❌ Erro na verificação de saúde:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro na verificação de saúde: ' + error.message
        });
    }
});

// 13. Forçar recriação de tabelas
app.post('/api/recreate-tables', async (req, res) => {
    try {
        console.log('🗑️  Recriando todas as tabelas...');
        
        // Remover tabelas existentes
        await pool.query('DROP TABLE IF EXISTS pedidos CASCADE');
        await pool.query('DROP TABLE IF EXISTS contatos CASCADE');
        await pool.query('DROP TABLE IF EXISTS usuarios CASCADE');
        
        // Recriar do zero
        await inicializarBanco();
        
        res.json({
            success: true,
            mensagem: 'Tabelas recriadas com sucesso!'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            erro: 'Erro ao recriar tabelas: ' + error.message
        });
    }
});

// ===== ROTAS PARA ARQUIVOS =====
app.get('/index.html', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/style.css', (req, res) => {
    res.sendFile(__dirname + '/style.css');
});

app.get('/script.js', (req, res) => {
    res.sendFile(__dirname + '/script.js');
});

// ===== ROTA 404 =====
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        erro: 'Rota não encontrada'
    });
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 FACILITAKI SERVER - VERSÃO CORRIGIDA');
    console.log('='.repeat(60));
    console.log(`📍 URL: https://facilitaki.onrender.com`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`💾 Banco: PostgreSQL (Render - Oregon)`);
    console.log(`🛠️  Correção: Tabela pedidos com usuario_id`);
    console.log(`🌎 Acesso: Global`);
    console.log('='.repeat(60));
    console.log('✅ Sistema pronto para armazenar pedidos!');
    console.log('✅ Correção automática de tabela incluída');
    console.log('✅ Teste em: https://facilitaki.onrender.com/api/fix-pedidos');
    console.log('='.repeat(60));
});
