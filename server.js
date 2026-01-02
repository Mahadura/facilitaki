const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
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
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db';

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
                    descricao TEXT,
                    prazo DATE,
                    plano VARCHAR(50) NOT NULL,
                    nome_plano VARCHAR(100) NOT NULL,
                    preco DECIMAL(10,2) NOT NULL,
                    metodo_pagamento VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'pendente',
                    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    arquivos TEXT,
                    observacoes_admin TEXT
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
            'curso', 'descricao', 'prazo', 'plano', 
            'nome_plano', 'preco', 'metodo_pagamento', 'status', 'data_pedido',
            'arquivos', 'observacoes_admin'
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
                if (coluna === 'arquivos') tipo = 'TEXT';
                if (coluna === 'observacoes_admin') tipo = 'TEXT';
                
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
                ativo BOOLEAN DEFAULT TRUE,
                tipo_usuario VARCHAR(20) DEFAULT 'cliente'
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
                data_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                respondido BOOLEAN DEFAULT FALSE
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

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Facilitaki API'
    });
});

// ===== ROTAS DE DIAGNÓSTICO =====

// 1. Status geral
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as hora');
        res.json({
            success: true,
            mensagem: 'Facilitaki Online',
            hora: dbTest.rows[0].hora,
            versao: '5.0',
            painel_admin: '/admin/pedidos?senha=admin2025'
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
        
        // Contagens
        const usuarios = await pool.query('SELECT COUNT(*) as total FROM usuarios');
        const pedidos = await pool.query('SELECT COUNT(*) as total FROM pedidos');
        const contatos = await pool.query('SELECT COUNT(*) as total FROM contatos');
        
        res.json({
            success: true,
            hora: hora.rows[0].hora,
            tabelas: tabelas.rows,
            estrutura_pedidos: estruturaPedidos.rows,
            contagens: {
                usuarios: parseInt(usuarios.rows[0].total),
                pedidos: parseInt(pedidos.rows[0].total),
                contatos: parseInt(contatos.rows[0].total)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// 3. CORREÇÃO DA TABELA PEDIDOS
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

// ===== ROTA ADMIN - VER TODOS PEDIDOS =====
app.get('/admin/pedidos', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html><head><title>Acesso Negado</title>
            <style>
                body { font-family: Arial; padding: 50px; text-align: center; background: #f8fafc; }
                .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                h1 { color: #ef4444; }
                .btn { background: #3b82f6; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; display: inline-block; margin-top: 20px; }
            </style>
            </head>
            <body>
                <div class="container">
                    <h1>🔒 Acesso Negado</h1>
                    <p>Senha de administrador incorreta.</p>
                    <p><strong>Dica:</strong> Acesse com: ?senha=admin2025</p>
                    <a href="/admin/pedidos?senha=admin2025" class="btn">Tentar com senha correta</a>
                </div>
            </body>
            </html>
        `);
    }
    
    try {
        console.log('👨‍💼 Acesso admin aos pedidos');
        
        // Buscar todos pedidos
        const pedidos = await pool.query(`
            SELECT 
                p.*, 
                u.nome as usuario_nome, 
                u.telefone as usuario_telefone,
                u.data_cadastro as usuario_data_cadastro,
                u.ativo as usuario_ativo
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);
        
        // Buscar todos usuários
        const usuarios = await pool.query(`
            SELECT id, nome, telefone, data_cadastro, ativo, tipo_usuario 
            FROM usuarios 
            ORDER BY data_cadastro DESC
        `);
        
        // Buscar contatos
        const contatos = await pool.query(`
            SELECT * FROM contatos ORDER BY data_contato DESC
        `);
        
        // Calcular totais
        const totais = await pool.query(`
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(preco) as valor_total,
                AVG(preco) as media_valor
            FROM pedidos
        `);
        
        // Gerar HTML simples
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Facilitaki</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: Arial, sans-serif; 
                        background: #f5f5f5;
                        color: #333;
                        padding: 20px;
                    }
                    
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }
                    
                    .header {
                        background: #1e40af;
                        color: white;
                        padding: 20px;
                        text-align: center;
                    }
                    
                    .header h1 {
                        font-size: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    }
                    
                    .tabs {
                        display: flex;
                        background: #f1f5f9;
                        border-bottom: 1px solid #e5e7eb;
                        flex-wrap: wrap;
                    }
                    
                    .tab {
                        padding: 12px 20px;
                        cursor: pointer;
                        font-weight: 500;
                        color: #6b7280;
                        border-bottom: 3px solid transparent;
                    }
                    
                    .tab:hover {
                        background: #e5e7eb;
                    }
                    
                    .tab.active {
                        background: white;
                        color: #1e40af;
                        border-bottom: 3px solid #3b82f6;
                    }
                    
                    .tab-content {
                        display: none;
                        padding: 20px;
                    }
                    
                    .tab-content.active {
                        display: block;
                    }
                    
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        padding: 20px;
                        background: #f8fafc;
                        margin-bottom: 20px;
                    }
                    
                    .stat-card {
                        background: white;
                        padding: 15px;
                        border-radius: 8px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                        text-align: center;
                    }
                    
                    .stat-value {
                        font-size: 24px;
                        font-weight: bold;
                        color: #1e40af;
                        margin: 5px 0;
                    }
                    
                    .stat-label {
                        color: #6b7280;
                        font-size: 12px;
                    }
                    
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 14px;
                        margin-bottom: 20px;
                    }
                    
                    th {
                        background: #f1f5f9;
                        padding: 12px;
                        text-align: left;
                        font-weight: 600;
                        color: #1e40af;
                        border-bottom: 2px solid #e5e7eb;
                    }
                    
                    td {
                        padding: 10px;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    tr:hover {
                        background: #f8fafc;
                    }
                    
                    .badge {
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 600;
                        display: inline-block;
                    }
                    
                    .badge.pendente { background: #fef3c7; color: #92400e; }
                    .badge.pago { background: #d1fae5; color: #065f46; }
                    .badge.andamento { background: #dbeafe; color: #1e40af; }
                    .badge.concluido { background: #ede9fe; color: #5b21b6; }
                    .badge.cancelado { background: #fee2e2; color: #991b1b; }
                    
                    .btn {
                        display: inline-block;
                        padding: 6px 12px;
                        background: #3b82f6;
                        color: white;
                        border-radius: 4px;
                        text-decoration: none;
                        border: none;
                        cursor: pointer;
                        font-size: 12px;
                        margin: 2px;
                    }
                    
                    .btn:hover { background: #2563eb; }
                    .btn-danger { background: #ef4444; }
                    .btn-danger:hover { background: #dc2626; }
                    .btn-warning { background: #f59e0b; }
                    .btn-warning:hover { background: #d97706; }
                    .btn-success { background: #10b981; }
                    .btn-success:hover { background: #059669; }
                    
                    .actions {
                        display: flex;
                        gap: 5px;
                        flex-wrap: wrap;
                    }
                    
                    .search-box {
                        margin-bottom: 15px;
                        display: flex;
                        gap: 10px;
                    }
                    
                    .search-box input {
                        flex: 1;
                        padding: 8px 12px;
                        border: 1px solid #d1d5db;
                        border-radius: 4px;
                        font-size: 14px;
                    }
                    
                    .admin-section {
                        margin-top: 30px;
                        padding: 20px;
                        background: #f8fafc;
                        border-radius: 8px;
                        border: 1px solid #e5e7eb;
                    }
                    
                    .admin-section h3 {
                        margin-bottom: 15px;
                        color: #1e40af;
                    }
                    
                    @media (max-width: 768px) {
                        .header { padding: 15px; }
                        .header h1 { font-size: 20px; }
                        .tab { padding: 10px; flex: 1; text-align: center; }
                        table { font-size: 12px; }
                        th, td { padding: 8px; }
                    }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1><i class="fas fa-chart-line"></i> Painel Administrativo - Facilitaki</h1>
                    </div>
                    
                    <div class="stats">
                        <div class="stat-card">
                            <div class="stat-label">Total de Pedidos</div>
                            <div class="stat-value">${totais.rows[0]?.total_pedidos || 0}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Valor Total</div>
                            <div class="stat-value">${(totais.rows[0]?.valor_total || 0).toLocaleString('pt-MZ')} MT</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Valor Médio</div>
                            <div class="stat-value">${Math.round(totais.rows[0]?.media_valor || 0).toLocaleString('pt-MZ')} MT</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Usuários</div>
                            <div class="stat-value">${usuarios.rows.length}</div>
                        </div>
                    </div>
                    
                    <div class="tabs">
                        <div class="tab active" onclick="abrirTab('pedidos')"><i class="fas fa-shopping-cart"></i> Pedidos</div>
                        <div class="tab" onclick="abrirTab('usuarios')"><i class="fas fa-users"></i> Usuários</div>
                        <div class="tab" onclick="abrirTab('contatos')"><i class="fas fa-envelope"></i> Contatos</div>
                    </div>
                    
                    <!-- TAB PEDIDOS -->
                    <div id="tab-pedidos" class="tab-content active">
                        <div class="search-box">
                            <input type="text" id="buscarPedido" placeholder="Buscar pedido..." onkeyup="buscarPedidos()">
                        </div>
                        
                        <table id="tabelaPedidos">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Data</th>
                                    <th>Cliente</th>
                                    <th>Serviço</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        // Adicionar cada pedido à tabela
        pedidos.rows.forEach(pedido => {
            const dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido) : new Date();
            const statusClass = pedido.status ? pedido.status.toLowerCase().replace(' ', '-') : 'pendente';
            
            html += `
                <tr>
                    <td><strong>#${pedido.id}</strong></td>
                    <td>${dataPedido.toLocaleDateString('pt-MZ')}</td>
                    <td>
                        <strong>${pedido.cliente || 'Não informado'}</strong><br>
                        <small>${pedido.telefone || 'Não informado'}</small>
                    </td>
                    <td>${pedido.nome_plano || pedido.plano || 'Serviço'}</td>
                    <td><strong>${pedido.preco ? pedido.preco.toLocaleString('pt-MZ') : '0'} MT</strong></td>
                    <td><span class="badge ${statusClass}">${pedido.status || 'pendente'}</span></td>
                    <td class="actions">
                        <button onclick="mudarStatus(${pedido.id})" class="btn btn-warning" title="Alterar status">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="excluirPedido(${pedido.id})" class="btn btn-danger" title="Excluir pedido">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        });
        
        html += `
                            </tbody>
                        </table>
                        
                        ${pedidos.rows.length === 0 ? 
                            '<div style="text-align: center; padding: 40px; color: #6b7280;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 20px;"></i><h3>Nenhum pedido encontrado</h3></div>' : 
                            ''
                        }
                        
                        <div class="admin-section">
                            <h3><i class="fas fa-cog"></i> Ações Rápidas</h3>
                            <div>
                                <button onclick="atualizarTodosStatus('concluido')" class="btn btn-success">
                                    <i class="fas fa-check-circle"></i> Marcar Todos Concluídos
                                </button>
                                <button onclick="exportarCSV()" class="btn">
                                    <i class="fas fa-download"></i> Exportar CSV
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- TAB USUÁRIOS -->
                    <div id="tab-usuarios" class="tab-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Data Cadastro</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        // Adicionar cada usuário à tabela
        usuarios.rows.forEach(usuario => {
            const dataCadastro = usuario.data_cadastro ? new Date(usuario.data_cadastro) : new Date();
            const statusClass = usuario.ativo ? 'ativo' : 'inativo';
            const statusText = usuario.ativo ? 'Ativo' : 'Inativo';
            
            html += `
                <tr>
                    <td><strong>#${usuario.id}</strong></td>
                    <td><strong>${usuario.nome}</strong></td>
                    <td>${usuario.telefone}</td>
                    <td>${dataCadastro.toLocaleDateString('pt-MZ')}</td>
                    <td>${statusText}</td>
                    <td class="actions">
                        ${usuario.ativo ? `
                            <button onclick="desativarUsuario(${usuario.id})" class="btn btn-warning" title="Desativar">
                                <i class="fas fa-user-slash"></i>
                            </button>
                        ` : `
                            <button onclick="ativarUsuario(${usuario.id})" class="btn btn-success" title="Ativar">
                                <i class="fas fa-user-check"></i>
                            </button>
                        `}
                        <button onclick="excluirUsuario(${usuario.id})" class="btn btn-danger" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- TAB CONTATOS -->
                    <div id="tab-contatos" class="tab-content">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Data</th>
                                    <th>Nome</th>
                                    <th>Telefone</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        // Adicionar cada contato à tabela
        contatos.rows.forEach(contato => {
            const dataContato = contato.data_contato ? new Date(contato.data_contato) : new Date();
            const respondidoClass = contato.respondido ? 'badge concluido' : 'badge pendente';
            const respondidoText = contato.respondido ? 'Respondido' : 'Pendente';
            
            html += `
                <tr>
                    <td><strong>#${contato.id}</strong></td>
                    <td>${dataContato.toLocaleDateString('pt-MZ')}</td>
                    <td><strong>${contato.nome}</strong></td>
                    <td>${contato.telefone}</td>
                    <td><span class="${respondidoClass}">${respondidoText}</span></td>
                    <td class="actions">
                        ${!contato.respondido ? `
                            <button onclick="marcarRespondido(${contato.id})" class="btn btn-success" title="Marcar respondido">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : `
                            <button onclick="marcarNaoRespondido(${contato.id})" class="btn btn-warning" title="Marcar não respondido">
                                <i class="fas fa-times"></i>
                            </button>
                        `}
                        <button onclick="excluirContato(${contato.id})" class="btn btn-danger" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <script>
                    function abrirTab(tabName) {
                        // Esconder todas as tabs
                        document.querySelectorAll('.tab-content').forEach(tab => {
                            tab.classList.remove('active');
                        });
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.classList.remove('active');
                        });
                        
                        // Mostrar a tab selecionada
                        document.getElementById('tab-' + tabName).classList.add('active');
                        document.querySelector('.tab[onclick="abrirTab(\\'' + tabName + '\\')"]').classList.add('active');
                    }
                    
                    function buscarPedidos() {
                        const termo = document.getElementById('buscarPedido').value.toLowerCase();
                        const linhas = document.querySelectorAll('#tabelaPedidos tbody tr');
                        
                        linhas.forEach(linha => {
                            const texto = linha.textContent.toLowerCase();
                            if (texto.includes(termo)) {
                                linha.style.display = '';
                            } else {
                                linha.style.display = 'none';
                            }
                        });
                    }
                    
                    function mudarStatus(id) {
                        const novoStatus = prompt('Novo status para pedido #' + id + ':\\n(pendente, pago, em_andamento, concluido, cancelado)');
                        if (novoStatus) {
                            fetch('/api/admin/atualizar-status?senha=admin2025&pedido=' + id + '&status=' + encodeURIComponent(novoStatus))
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Status atualizado!');
                                        location.reload();
                                    } else {
                                        alert('Erro: ' + data.erro);
                                    }
                                });
                        }
                    }
                    
                    function excluirPedido(id) {
                        if (confirm('Excluir pedido #' + id + '?')) {
                            fetch('/api/admin/excluir-pedido?senha=admin2025&pedido=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Pedido excluído!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function desativarUsuario(id) {
                        if (confirm('Desativar usuário?')) {
                            fetch('/api/admin/desativar-usuario?senha=admin2025&usuario=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Usuário desativado!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function ativarUsuario(id) {
                        fetch('/api/admin/ativar-usuario?senha=admin2025&usuario=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Usuário ativado!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function excluirUsuario(id) {
                        if (confirm('🚨 ATENÇÃO!\\nExcluir usuário e todos os seus pedidos?')) {
                            fetch('/api/admin/excluir-usuario?senha=admin2025&usuario=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Usuário excluído!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function marcarRespondido(id) {
                        fetch('/api/admin/marcar-respondido?senha=admin2025&contato=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Marcado como respondido!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function marcarNaoRespondido(id) {
                        fetch('/api/admin/marcar-nao-respondido?senha=admin2025&contato=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Marcado como não respondido!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function excluirContato(id) {
                        if (confirm('Excluir contato?')) {
                            fetch('/api/admin/excluir-contato?senha=admin2025&contato=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Contato excluído!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function atualizarTodosStatus(status) {
                        if (confirm('Atualizar TODOS os pedidos para "' + status + '"?')) {
                            fetch('/api/admin/atualizar-todos-status?senha=admin2025&status=' + status)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Status atualizados!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function exportarCSV() {
                        let csv = 'ID;Data;Cliente;Telefone;Serviço;Preço;Status\\n';
                        document.querySelectorAll('#tabelaPedidos tbody tr').forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 6) {
                                csv += [
                                    cells[0].textContent.replace('#', '').trim(),
                                    cells[1].textContent.trim(),
                                    cells[2].querySelector('strong')?.textContent.trim() || '',
                                    cells[2].querySelector('small')?.textContent.trim() || '',
                                    cells[3].textContent.trim(),
                                    cells[4].querySelector('strong')?.textContent.replace('MT', '').trim() || '',
                                    cells[5].textContent.trim()
                                ].join(';') + '\\n';
                            }
                        });
                        
                        const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = 'pedidos_facilitaki_' + new Date().toISOString().split('T')[0] + '.csv';
                        link.click();
                    }
                </script>
            </body>
            </html>`;
        
        res.send(html);
        
    } catch (error) {
        console.error('❌ Erro no admin:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html><head><title>Erro</title>
            <style>body { font-family: Arial; padding: 50px; text-align: center; }
            .error { color: #ef4444; margin: 20px 0; }
            </style></head>
            <body>
                <h1>❌ Erro no Painel Admin</h1>
                <div class="error">${error.message}</div>
                <a href="/admin/pedidos?senha=admin2025">Tentar novamente</a>
            </body>
            </html>
        `);
    }
});

// ===== ROTAS ADMIN - AÇÕES =====

app.get('/api/admin/atualizar-status', async (req, res) => {
    const { senha, pedido, status } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [status, pedido]);
        res.json({ success: true, mensagem: `Status atualizado` });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/excluir-pedido', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('DELETE FROM pedidos WHERE id = $1', [pedido]);
        res.json({ success: true, mensagem: 'Pedido excluído' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/desativar-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [usuario]);
        res.json({ success: true, mensagem: 'Usuário desativado' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/ativar-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE usuarios SET ativo = true WHERE id = $1', [usuario]);
        res.json({ success: true, mensagem: 'Usuário ativado' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/excluir-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('DELETE FROM pedidos WHERE usuario_id = $1', [usuario]);
        await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario]);
        res.json({ success: true, mensagem: 'Usuário excluído' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/marcar-respondido', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE contatos SET respondido = true WHERE id = $1', [contato]);
        res.json({ success: true, mensagem: 'Marcado como respondido' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/marcar-nao-respondido', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE contatos SET respondido = false WHERE id = $1', [contato]);
        res.json({ success: true, mensagem: 'Marcado como não respondido' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/excluir-contato', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [contato]);
        res.json({ success: true, mensagem: 'Contato excluído' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

app.get('/api/admin/atualizar-todos-status', async (req, res) => {
    const { senha, status } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE pedidos SET status = $1', [status]);
        res.json({ success: true, mensagem: 'Status atualizados' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// ===== ROTAS PRINCIPAIS =====

// Cadastro
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

// Login
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
        
        // Verificar se usuário está ativo
        if (!usuario.rows[0].ativo) {
            return res.status(401).json({ 
                success: false,
                erro: 'Sua conta está desativada. Contate o administrador.' 
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

// Criar pedido
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
        
        if (error.message.includes('column')) {
            return res.json({
                success: false,
                erro: 'Problema na tabela. Execute a correção:',
                correcao_url: '/api/fix-pedidos'
            });
        }
        
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// Meus pedidos
app.get('/api/meus-pedidos', autenticarToken, async (req, res) => {
    try {
        console.log('📋 Buscando pedidos do usuário:', req.usuario.id);
        
        const pedidos = await pool.query(
            'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC',
            [req.usuario.id]
        );
        
        console.log(`✅ Encontrados ${pedidos.rows.length} pedidos`);
        
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

// Contato
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
        
        console.log(`📨 Mensagem de contato recebida de: ${nome} (${telefoneLimpo})`);
        
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

// Verificar token
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({
        success: true,
        valido: true,
        usuario: req.usuario
    });
});

// Usuário atual
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

// Logout
app.post('/api/logout', autenticarToken, (req, res) => {
    console.log(`👋 Usuário ${req.usuario.nome} fez logout`);
    res.json({
        success: true,
        mensagem: 'Logout realizado com sucesso'
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

// ===== ROTA 404 =====
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        erro: 'Rota não encontrada'
    });
});

// ===== MIDDLEWARE DE ERROS =====
app.use((err, req, res, next) => {
    console.error('❌ ERRO INTERNO:', err.message);
    console.error(err.stack);
    res.status(500).json({
        success: false,
        erro: 'Erro interno do servidor'
    });
});

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║       FACILITAKI - RENDER DEPLOY      ║
    ╚═══════════════════════════════════════╝
    📍 Porta: ${PORT}
    🌐 URL: https://facilitaki.onrender.com
    🚀 Versão: 5.0 - Render Ready
    ✅ Status: ONLINE
    💾 Banco: PostgreSQL (Render)
    👨‍💼 Admin: /admin/pedidos?senha=admin2025
    🏥 Health: /health
    `);
});

// Capturar erros não tratados
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

