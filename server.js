// server.js - Backend completo para Facilitaki
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Configurações do servidor
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2025';

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db',
    ssl: {
        rejectUnauthorized: false
    }
});

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['.pdf', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Use PDF, DOC ou DOCX.'));
        }
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            console.error('Erro na verificação do token:', err);
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Middleware de autenticação admin
const authenticateAdmin = (req, res, next) => {
    const senha = req.query.senha;
    if (senha === 'admin2025') {
        next();
    } else {
        res.status(401).send('Acesso não autorizado. Senha incorreta.');
    }
};

// Inicializar banco de dados
async function initDatabase() {
    try {
        // Criar tabela de usuários
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Criar tabela de pedidos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                instituicao VARCHAR(100),
                curso VARCHAR(100),
                cadeira VARCHAR(100),
                tema TEXT,
                descricao TEXT,
                prazo DATE,
                plano VARCHAR(50) NOT NULL,
                nome_plano VARCHAR(100) NOT NULL,
                preco DECIMAL(10,2) NOT NULL,
                metodo_pagamento VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Criar tabela de contatos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
    }
}

// ===== ROTAS DA API =====

// Rota de status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'Facilitaki API está funcionando',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Rota para verificar token
app.get('/api/verificar-token', authenticateToken, (req, res) => {
    res.json({ success: true, valido: true, usuario: req.user });
});

// Rota de login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        console.log('📥 Tentativa de login para:', telefone);

        // Buscar usuário
        const result = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1',
            [telefone]
        );

        if (result.rows.length === 0) {
            console.log('❌ Usuário não encontrado:', telefone);
            return res.status(401).json({
                success: false,
                erro: 'Telefone ou senha incorretos'
            });
        }

        const usuario = result.rows[0];

        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            console.log('❌ Senha incorreta para:', telefone);
            return res.status(401).json({
                success: false,
                erro: 'Telefone ou senha incorretos'
            });
        }

        // Gerar token JWT
        const token = jwt.sign(
            { id: usuario.id, telefone: usuario.telefone, nome: usuario.nome },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        console.log('✅ Login bem-sucedido para:', telefone);

        res.json({
            success: true,
            mensagem: 'Login realizado com sucesso!',
            token: token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                telefone: usuario.telefone
            }
        });

    } catch (error) {
        console.error('❌ Erro no login:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro interno do servidor'
        });
    }
});

// Rota de cadastro
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        console.log('📥 Tentativa de cadastro para:', telefone);

        // Verificar se usuário já existe
        const existingUser = await pool.query(
            'SELECT id FROM usuarios WHERE telefone = $1',
            [telefone]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({
                success: false,
                erro: 'Este telefone já está cadastrado'
            });
        }

        // Hash da senha
        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        // Inserir novo usuário
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefone, senhaHash]
        );

        const novoUsuario = result.rows[0];

        // Gerar token JWT
        const token = jwt.sign(
            { id: novoUsuario.id, telefone: novoUsuario.telefone, nome: novoUsuario.nome },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

        console.log('✅ Cadastro bem-sucedido para:', telefone);

        res.json({
            success: true,
            mensagem: 'Cadastro realizado com sucesso!',
            token: token,
            usuario: {
                id: novoUsuario.id,
                nome: novoUsuario.nome,
                telefone: novoUsuario.telefone
            }
        });

    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro interno do servidor'
        });
    }
});

// Rota de logout
app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true, mensagem: 'Logout realizado com sucesso' });
});

// Rota para criar pedido (sem arquivo)
app.post('/api/pedidos', authenticateToken, async (req, res) => {
    try {
        const {
            cliente,
            telefone,
            instituicao,
            curso,
            cadeira,
            descricao,
            plano,
            nomePlano,
            preco,
            metodoPagamento,
            status = 'pendente'
        } = req.body;

        console.log('📥 Criando pedido para:', cliente);

        // Inserir pedido
        const result = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira, 
                descricao, plano, nome_plano, preco, metodo_pagamento, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                req.user.id, cliente, telefone, instituicao, curso, cadeira,
                descricao, plano, nomePlano, preco, metodoPagamento, status
            ]
        );

        const novoPedido = result.rows[0];
        console.log('✅ Pedido criado com ID:', novoPedido.id);

        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: novoPedido
        });

    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao criar pedido'
        });
    }
});

// Rota para criar pedido com upload de arquivo
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    try {
        const {
            cliente,
            telefone,
            instituicao = 'Não informada',
            curso = 'Não informado',
            cadeira = 'Não informada',
            tema,
            descricao,
            prazo,
            plano,
            nomePlano,
            preco,
            metodoPagamento
        } = req.body;

        console.log('📥 Criando pedido com arquivo para:', cliente);

        let arquivoPath = null;
        if (req.file) {
            arquivoPath = req.file.path;
            console.log('📎 Arquivo salvo em:', arquivoPath);
        }

        // Inserir pedido
        const result = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira,
                tema, descricao, prazo, plano, nome_plano, preco, 
                metodo_pagamento, arquivo_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *`,
            [
                req.user.id, cliente, telefone, instituicao, curso, cadeira,
                tema, descricao, prazo, plano, nomePlano, preco,
                metodoPagamento, arquivoPath
            ]
        );

        const novoPedido = result.rows[0];
        console.log('✅ Pedido com arquivo criado com ID:', novoPedido.id);

        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: novoPedido
        });

    } catch (error) {
        console.error('❌ Erro ao criar pedido com arquivo:', error);
        res.status(500).json({
            success: false,
            erro: error.message || 'Erro ao criar pedido'
        });
    }
});

// Rota para buscar pedidos do usuário
app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        console.log('📥 Buscando pedidos para usuário:', req.user.id);

        const result = await pool.query(
            `SELECT * FROM pedidos 
             WHERE usuario_id = $1 
             ORDER BY data_pedido DESC`,
            [req.user.id]
        );

        console.log('✅ Pedidos encontrados:', result.rows.length);

        res.json({
            success: true,
            pedidos: result.rows
        });

    } catch (error) {
        console.error('❌ Erro ao buscar pedidos:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar pedidos'
        });
    }
});

// Rota para envio de contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        console.log('📥 Nova mensagem de contato de:', nome);

        await pool.query(
            'INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)',
            [nome, telefone, mensagem]
        );

        console.log('✅ Mensagem de contato salva');

        res.json({
            success: true,
            mensagem: 'Mensagem enviada com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro ao salvar contato:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao enviar mensagem'
        });
    }
});

// ===== PAINEL ADMINISTRATIVO =====

// Rota principal do painel admin
app.get('/admin/pedidos', authenticateAdmin, async (req, res) => {
    try {
        // Buscar todos os pedidos com informações do usuário
        const pedidosResult = await pool.query(`
            SELECT p.*, u.nome as usuario_nome, u.telefone as usuario_telefone
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);

        // Buscar contatos
        const contatosResult = await pool.query(`
            SELECT * FROM contatos ORDER BY data_envio DESC
        `);

        // Buscar usuários
        const usuariosResult = await pool.query(`
            SELECT id, nome, telefone, created_at, 
                   (SELECT COUNT(*) FROM pedidos WHERE usuario_id = usuarios.id) as total_pedidos
            FROM usuarios 
            ORDER BY created_at DESC
        `);

        res.send(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Painel Administrativo - Facilitaki</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        background: #f3f4f6; 
                        color: #333;
                    }
                    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
                    header {
                        background: #1e40af;
                        color: white;
                        padding: 1.5rem;
                        margin-bottom: 2rem;
                        border-radius: 8px;
                    }
                    header h1 { display: flex; align-items: center; gap: 10px; }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin-bottom: 2rem;
                    }
                    .stat-card {
                        background: white;
                        padding: 1.5rem;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .stat-number {
                        font-size: 2rem;
                        font-weight: bold;
                        color: #1e40af;
                    }
                    .tabs {
                        display: flex;
                        gap: 10px;
                        margin-bottom: 2rem;
                        border-bottom: 2px solid #e5e7eb;
                        padding-bottom: 10px;
                    }
                    .tab {
                        padding: 10px 20px;
                        background: #e5e7eb;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-weight: 500;
                    }
                    .tab.active {
                        background: #1e40af;
                        color: white;
                    }
                    .tab-content {
                        display: none;
                    }
                    .tab-content.active {
                        display: block;
                    }
                    table {
                        width: 100%;
                        background: white;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    th, td {
                        padding: 12px 15px;
                        text-align: left;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    th {
                        background: #f8fafc;
                        font-weight: 600;
                        color: #4b5563;
                    }
                    tr:hover {
                        background: #f9fafb;
                    }
                    .status-badge {
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.85rem;
                        font-weight: 500;
                    }
                    .status-pendente { background: #fef3c7; color: #92400e; }
                    .status-pago { background: #d1fae5; color: #065f46; }
                    .status-em_andamento { background: #dbeafe; color: #1e40af; }
                    .status-concluido { background: #e9d5ff; color: #6b21a8; }
                    .status-cancelado { background: #fee2e2; color: #991b1b; }
                    .btn {
                        padding: 6px 12px;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 0.85rem;
                        transition: opacity 0.3s;
                    }
                    .btn:hover { opacity: 0.9; }
                    .btn-view { background: #3b82f6; color: white; }
                    .btn-delete { background: #ef4444; color: white; }
                    .btn-update { background: #10b981; color: white; }
                    .file-link { color: #1e40af; text-decoration: none; }
                    .file-link:hover { text-decoration: underline; }
                    .modal {
                        display: none;
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,0.5);
                        z-index: 1000;
                        align-items: center;
                        justify-content: center;
                    }
                    .modal-content {
                        background: white;
                        padding: 2rem;
                        border-radius: 8px;
                        max-width: 800px;
                        width: 90%;
                        max-height: 80vh;
                        overflow-y: auto;
                    }
                    @media (max-width: 768px) {
                        .container { padding: 10px; }
                        table { font-size: 0.9rem; }
                        th, td { padding: 8px 10px; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <header>
                        <h1><i class="fas fa-cogs"></i> Painel Administrativo - Facilitaki</h1>
                        <p style="margin-top: 10px; opacity: 0.9;">Total de pedidos: ${pedidosResult.rows.length} | Usuários: ${usuariosResult.rows.length}</p>
                    </header>

                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-number">${pedidosResult.rows.length}</div>
                            <div>Total de Pedidos</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${pedidosResult.rows.filter(p => p.status === 'pendente').length}</div>
                            <div>Pedidos Pendentes</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${usuariosResult.rows.length}</div>
                            <div>Usuários Cadastrados</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-number">${contatosResult.rows.length}</div>
                            <div>Mensagens de Contato</div>
                        </div>
                    </div>

                    <div class="tabs">
                        <button class="tab active" onclick="showTab('pedidos')">Pedidos</button>
                        <button class="tab" onclick="showTab('usuarios')">Usuários</button>
                        <button class="tab" onclick="showTab('contatos')">Contatos</button>
                    </div>

                    <!-- Tab Pedidos -->
                    <div id="tab-pedidos" class="tab-content active">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Cliente</th>
                                    <th>Serviço</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Data</th>
                                    <th>Arquivo</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pedidosResult.rows.map(pedido => `
                                    <tr>
                                        <td>${pedido.id}</td>
                                        <td>
                                            <strong>${pedido.cliente}</strong><br>
                                            <small>${pedido.telefone}</small>
                                        </td>
                                        <td>${pedido.nome_plano}</td>
                                        <td>${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</td>
                                        <td>
                                            <span class="status-badge status-${pedido.status}">
                                                ${pedido.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td>${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</td>
                                        <td>
                                            ${pedido.arquivo_path ? 
                                                `<a href="/${pedido.arquivo_path}" target="_blank" class="file-link">
                                                    <i class="fas fa-file"></i> Ver arquivo
                                                </a>` : 
                                                'Sem arquivo'}
                                        </td>
                                        <td>
                                            <button class="btn btn-view" onclick="verDetalhes(${pedido.id})">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-update" onclick="atualizarStatus(${pedido.id})">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-delete" onclick="excluirPedido(${pedido.id})">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Tab Usuários -->
                    <div id="tab-usuarios" class="tab-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Cadastro</th>
                                    <th>Pedidos</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${usuariosResult.rows.map(usuario => `
                                    <tr>
                                        <td>${usuario.id}</td>
                                        <td>${usuario.nome}</td>
                                        <td>${usuario.telefone}</td>
                                        <td>${new Date(usuario.created_at).toLocaleDateString('pt-MZ')}</td>
                                        <td>${usuario.total_pedidos}</td>
                                        <td>
                                            <button class="btn btn-view" onclick="verUsuario(${usuario.id})">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-delete" onclick="excluirUsuario(${usuario.id})">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Tab Contatos -->
                    <div id="tab-contatos" class="tab-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Mensagem</th>
                                    <th>Data</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${contatosResult.rows.map(contato => `
                                    <tr>
                                        <td>${contato.id}</td>
                                        <td>${contato.nome}</td>
                                        <td>${contato.telefone}</td>
                                        <td style="max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                            ${contato.mensagem}
                                        </td>
                                        <td>${new Date(contato.data_envio).toLocaleDateString('pt-MZ')}</td>
                                        <td>
                                            <button class="btn btn-view" onclick="verMensagem(${contato.id})">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-delete" onclick="excluirContato(${contato.id})">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Modal de Detalhes -->
                <div id="modalDetalhes" class="modal">
                    <div class="modal-content">
                        <div id="modalContent"></div>
                        <div style="text-align: right; margin-top: 20px;">
                            <button class="btn btn-secondary" onclick="fecharModal()">Fechar</button>
                        </div>
                    </div>
                </div>

                <!-- Modal de Atualização de Status -->
                <div id="modalStatus" class="modal">
                    <div class="modal-content">
                        <h3>Atualizar Status do Pedido</h3>
                        <select id="novoStatus" style="width: 100%; padding: 10px; margin: 15px 0;">
                            <option value="pendente">Pendente</option>
                            <option value="pago">Pago</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluído</option>
                            <option value="cancelado">Cancelado</option>
                        </select>
                        <div style="text-align: right; margin-top: 20px;">
                            <button class="btn btn-secondary" onclick="fecharModal()">Cancelar</button>
                            <button class="btn btn-update" onclick="confirmarAtualizarStatus()">Atualizar</button>
                        </div>
                    </div>
                </div>

                <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
                <script>
                    let pedidoAtual = null;
                    let pedidoIdParaAtualizar = null;

                    function showTab(tabName) {
                        // Remover classe active de todas as tabs e conteúdos
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.classList.remove('active');
                        });
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        
                        // Adicionar classe active à tab e conteúdo selecionados
                        document.querySelector(`.tab[onclick="showTab('${tabName}')"]`).classList.add('active');
                        document.getElementById(`tab-${tabName}`).classList.add('active');
                    }

                    function verDetalhes(pedidoId) {
                        fetch('/api/admin/pedidos/' + pedidoId + '?senha=admin2025')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    const pedido = data.pedido;
                                    pedidoAtual = pedido;
                                    
                                    let html = \`
                                        <h2>Detalhes do Pedido #\${pedido.id}</h2>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                                            <div>
                                                <h4>Informações do Cliente</h4>
                                                <p><strong>Nome:</strong> \${pedido.cliente}</p>
                                                <p><strong>Telefone:</strong> \${pedido.telefone}</p>
                                                <p><strong>Instituição:</strong> \${pedido.instituicao || 'Não informada'}</p>
                                                <p><strong>Curso:</strong> \${pedido.curso || 'Não informado'}</p>
                                                <p><strong>Cadeira:</strong> \${pedido.cadeira || 'Não informada'}</p>
                                            </div>
                                            <div>
                                                <h4>Informações do Serviço</h4>
                                                <p><strong>Serviço:</strong> \${pedido.nome_plano}</p>
                                                <p><strong>Plano:</strong> \${pedido.plano}</p>
                                                <p><strong>Valor:</strong> \${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</p>
                                                <p><strong>Método de Pagamento:</strong> \${pedido.metodo_pagamento}</p>
                                                <p><strong>Status:</strong> <span class="status-badge status-\${pedido.status}">\${pedido.status.replace('_', ' ')}</span></p>
                                            </div>
                                        </div>
                                        <div style="margin-top: 20px;">
                                            <h4>Descrição/Tema</h4>
                                            <p>\${pedido.descricao || pedido.tema || 'Sem descrição'}</p>
                                        </div>
                                        \${pedido.arquivo_path ? \`
                                            <div style="margin-top: 20px;">
                                                <h4>Arquivo Anexado</h4>
                                                <a href="/\${pedido.arquivo_path}" target="_blank" style="display: inline-flex; align-items: center; gap: 10px; padding: 10px; background: #3b82f6; color: white; border-radius: 5px; text-decoration: none;">
                                                    <i class="fas fa-download"></i> Baixar Arquivo
                                                </a>
                                            </div>
                                        \` : ''}
                                        <div style="margin-top: 20px;">
                                            <h4>Datas</h4>
                                            <p><strong>Data do Pedido:</strong> \${new Date(pedido.data_pedido).toLocaleString('pt-MZ')}</p>
                                            \${pedido.prazo ? \`<p><strong>Prazo Solicitado:</strong> \${new Date(pedido.prazo).toLocaleDateString('pt-MZ')}</p>\` : ''}
                                            <p><strong>Última Atualização:</strong> \${new Date(pedido.updated_at).toLocaleString('pt-MZ')}</p>
                                        </div>
                                    \`;
                                    
                                    document.getElementById('modalContent').innerHTML = html;
                                    document.getElementById('modalDetalhes').style.display = 'flex';
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao carregar detalhes do pedido');
                            });
                    }

                    function verUsuario(usuarioId) {
                        fetch('/api/admin/usuarios/' + usuarioId + '?senha=admin2025')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    const usuario = data.usuario;
                                    let html = \`
                                        <h2>Detalhes do Usuário #\${usuario.id}</h2>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
                                            <div>
                                                <h4>Informações Pessoais</h4>
                                                <p><strong>Nome:</strong> \${usuario.nome}</p>
                                                <p><strong>Telefone:</strong> \${usuario.telefone}</p>
                                                <p><strong>Data de Cadastro:</strong> \${new Date(usuario.created_at).toLocaleString('pt-MZ')}</p>
                                            </div>
                                            <div>
                                                <h4>Estatísticas</h4>
                                                <p><strong>Total de Pedidos:</strong> \${usuario.total_pedidos || 0}</p>
                                            </div>
                                        </div>
                                        \${usuario.pedidos && usuario.pedidos.length > 0 ? \`
                                            <div style="margin-top: 20px;">
                                                <h4>Últimos Pedidos</h4>
                                                <table style="width: 100%; margin-top: 10px;">
                                                    <thead>
                                                        <tr>
                                                            <th>ID</th>
                                                            <th>Serviço</th>
                                                            <th>Valor</th>
                                                            <th>Status</th>
                                                            <th>Data</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        \${usuario.pedidos.map(pedido => \`
                                                            <tr>
                                                                <td>\${pedido.id}</td>
                                                                <td>\${pedido.nome_plano}</td>
                                                                <td>\${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</td>
                                                                <td><span class="status-badge status-\${pedido.status}">\${pedido.status.replace('_', ' ')}</span></td>
                                                                <td>\${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</td>
                                                            </tr>
                                                        \`).join('')}
                                                    </tbody>
                                                </table>
                                            </div>
                                        \` : '<p>Este usuário ainda não fez pedidos.</p>'}
                                    \`;
                                    
                                    document.getElementById('modalContent').innerHTML = html;
                                    document.getElementById('modalDetalhes').style.display = 'flex';
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao carregar detalhes do usuário');
                            });
                    }

                    function verMensagem(contatoId) {
                        fetch('/api/admin/contatos/' + contatoId + '?senha=admin2025')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    const contato = data.contato;
                                    let html = \`
                                        <h2>Mensagem de Contato #\${contato.id}</h2>
                                        <div style="margin-top: 20px;">
                                            <p><strong>Nome:</strong> \${contato.nome}</p>
                                            <p><strong>Telefone:</strong> \${contato.telefone}</p>
                                            <p><strong>Data de Envio:</strong> \${new Date(contato.data_envio).toLocaleString('pt-MZ')}</p>
                                        </div>
                                        <div style="margin-top: 20px;">
                                            <h4>Mensagem</h4>
                                            <div style="background: #f8fafc; padding: 15px; border-radius: 5px; border-left: 4px solid #3b82f6;">
                                                \${contato.mensagem}
                                            </div>
                                        </div>
                                    \`;
                                    
                                    document.getElementById('modalContent').innerHTML = html;
                                    document.getElementById('modalDetalhes').style.display = 'flex';
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao carregar mensagem');
                            });
                    }

                    function atualizarStatus(pedidoId) {
                        pedidoIdParaAtualizar = pedidoId;
                        document.getElementById('modalStatus').style.display = 'flex';
                    }

                    function confirmarAtualizarStatus() {
                        const novoStatus = document.getElementById('novoStatus').value;
                        
                        fetch('/api/admin/pedidos/' + pedidoIdParaAtualizar + '/status?senha=admin2025', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: novoStatus })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                alert('Status atualizado com sucesso!');
                                location.reload();
                            } else {
                                alert('Erro ao atualizar status: ' + data.error);
                            }
                        })
                        .catch(error => {
                            console.error('Erro:', error);
                            alert('Erro ao atualizar status');
                        })
                        .finally(() => {
                            fecharModal();
                        });
                    }

                    function excluirPedido(pedidoId) {
                        if (confirm('Tem certeza que deseja excluir este pedido? Esta ação não pode ser desfeita.')) {
                            fetch('/api/admin/pedidos/' + pedidoId + '?senha=admin2025', {
                                method: 'DELETE'
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Pedido excluído com sucesso!');
                                    location.reload();
                                } else {
                                    alert('Erro ao excluir pedido: ' + data.error);
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao excluir pedido');
                            });
                        }
                    }

                    function excluirUsuario(usuarioId) {
                        if (confirm('ATENÇÃO: Excluir um usuário também excluirá todos os seus pedidos. Tem certeza?')) {
                            fetch('/api/admin/usuarios/' + usuarioId + '?senha=admin2025', {
                                method: 'DELETE'
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Usuário excluído com sucesso!');
                                    location.reload();
                                } else {
                                    alert('Erro ao excluir usuário: ' + data.error);
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao excluir usuário');
                            });
                        }
                    }

                    function excluirContato(contatoId) {
                        if (confirm('Tem certeza que deseja excluir esta mensagem de contato?')) {
                            fetch('/api/admin/contatos/' + contatoId + '?senha=admin2025', {
                                method: 'DELETE'
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Contato excluído com sucesso!');
                                    location.reload();
                                } else {
                                    alert('Erro ao excluir contato: ' + data.error);
                                }
                            })
                            .catch(error => {
                                console.error('Erro:', error);
                                alert('Erro ao excluir contato');
                            });
                        }
                    }

                    function fecharModal() {
                        document.getElementById('modalDetalhes').style.display = 'none';
                        document.getElementById('modalStatus').style.display = 'none';
                        pedidoAtual = null;
                        pedidoIdParaAtualizar = null;
                    }

                    // Fechar modal ao clicar fora
                    window.onclick = function(event) {
                        const modalDetalhes = document.getElementById('modalDetalhes');
                        const modalStatus = document.getElementById('modalStatus');
                        
                        if (event.target === modalDetalhes) {
                            fecharModal();
                        }
                        if (event.target === modalStatus) {
                            fecharModal();
                        }
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('❌ Erro no painel admin:', error);
        res.status(500).send('Erro ao carregar painel administrativo');
    }
});

// ===== ROTAS DE ADMIN API =====

// Buscar detalhes de um pedido específico
app.get('/api/admin/pedidos/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT p.*, u.nome as usuario_nome, u.telefone as usuario_telefone
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pedido não encontrado'
            });
        }

        res.json({
            success: true,
            pedido: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erro ao buscar pedido:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar pedido'
        });
    }
});

// Atualizar status de um pedido
app.put('/api/admin/pedidos/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await pool.query(
            'UPDATE pedidos SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pedido não encontrado'
            });
        }

        res.json({
            success: true,
            mensagem: 'Status atualizado com sucesso',
            pedido: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar status:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar status'
        });
    }
});

// Excluir um pedido
app.delete('/api/admin/pedidos/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Primeiro, buscar o pedido para verificar se tem arquivo
        const pedidoResult = await pool.query(
            'SELECT arquivo_path FROM pedidos WHERE id = $1',
            [id]
        );

        if (pedidoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Pedido não encontrado'
            });
        }

        // Excluir arquivo físico se existir
        const pedido = pedidoResult.rows[0];
        if (pedido.arquivo_path && fs.existsSync(pedido.arquivo_path)) {
            fs.unlinkSync(pedido.arquivo_path);
            console.log('🗑️ Arquivo excluído:', pedido.arquivo_path);
        }

        // Excluir pedido do banco de dados
        await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);

        res.json({
            success: true,
            mensagem: 'Pedido excluído com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro ao excluir pedido:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir pedido'
        });
    }
});

// Buscar detalhes de um usuário específico
app.get('/api/admin/usuarios/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Buscar usuário
        const usuarioResult = await pool.query(
            'SELECT id, nome, telefone, created_at FROM usuarios WHERE id = $1',
            [id]
        );

        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        const usuario = usuarioResult.rows[0];

        // Buscar pedidos do usuário
        const pedidosResult = await pool.query(
            'SELECT id, nome_plano, preco, status, data_pedido FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC LIMIT 10',
            [id]
        );

        usuario.pedidos = pedidosResult.rows;
        usuario.total_pedidos = pedidosResult.rows.length;

        res.json({
            success: true,
            usuario: usuario
        });
    } catch (error) {
        console.error('❌ Erro ao buscar usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar usuário'
        });
    }
});

// Excluir um usuário
app.delete('/api/admin/usuarios/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar arquivos associados aos pedidos do usuário
        const arquivosResult = await pool.query(
            'SELECT arquivo_path FROM pedidos WHERE usuario_id = $1 AND arquivo_path IS NOT NULL',
            [id]
        );

        // Excluir arquivos físicos
        arquivosResult.rows.forEach(row => {
            if (row.arquivo_path && fs.existsSync(row.arquivo_path)) {
                fs.unlinkSync(row.arquivo_path);
                console.log('🗑️ Arquivo excluído:', row.arquivo_path);
            }
        });

        // Excluir usuário (os pedidos serão excluídos automaticamente devido ao CASCADE)
        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

        res.json({
            success: true,
            mensagem: 'Usuário e todos os seus pedidos excluídos com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro ao excluir usuário:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir usuário'
        });
    }
});

// Buscar detalhes de um contato específico
app.get('/api/admin/contatos/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'SELECT * FROM contatos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Contato não encontrado'
            });
        }

        res.json({
            success: true,
            contato: result.rows[0]
        });
    } catch (error) {
        console.error('❌ Erro ao buscar contato:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar contato'
        });
    }
});

// Excluir um contato
app.delete('/api/admin/contatos/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        await pool.query('DELETE FROM contatos WHERE id = $1', [id]);

        res.json({
            success: true,
            mensagem: 'Contato excluído com sucesso'
        });
    } catch (error) {
        console.error('❌ Erro ao excluir contato:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir contato'
        });
    }
});

// Servir arquivos HTML
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar servidor
async function startServer() {
    try {
        // Inicializar banco de dados
        await initDatabase();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
            console.log(`🔧 Painel administrativo: http://localhost:${PORT}/admin/pedidos?senha=admin2025`);
            console.log(`📁 Uploads disponíveis em: http://localhost:${PORT}/uploads/`);
            console.log(`🌐 URL da API: http://localhost:${PORT}/status`);
        });
    } catch (error) {
        console.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
