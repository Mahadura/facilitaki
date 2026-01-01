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
            versao: '4.0',
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

// ===== ROTA ADMIN - VER TODOS PEDIDOS =====
app.get('/admin/pedidos', async (req, res) => {
    const { senha } = req.query;
    
    // Senha simples de admin (mude para uma mais segura!)
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
        
        // Buscar todos pedidos com informações do usuário
        const pedidos = await pool.query(`
            SELECT 
                p.*, 
                u.nome as usuario_nome, 
                u.telefone as usuario_telefone,
                u.data_cadastro as usuario_data_cadastro
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);
        
        // Calcular totais
        const totais = await pool.query(`
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(preco) as valor_total,
                AVG(preco) as media_valor
            FROM pedidos
        `);
        
        // Gerar HTML da página admin
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Facilitaki - Pedidos</title>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: #333;
                        min-height: 100vh;
                        padding: 20px;
                    }
                    
                    .container {
                        max-width: 1400px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 15px;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                        overflow: hidden;
                    }
                    
                    .header {
                        background: linear-gradient(135deg, #1e40af, #3b82f6);
                        color: white;
                        padding: 25px 30px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    
                    .header h1 {
                        font-size: 28px;
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    
                    .header h1 i {
                        font-size: 32px;
                        color: #60a5fa;
                    }
                    
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        padding: 25px;
                        background: #f8fafc;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .stat-card {
                        background: white;
                        padding: 20px;
                        border-radius: 10px;
                        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
                        text-align: center;
                    }
                    
                    .stat-value {
                        font-size: 32px;
                        font-weight: bold;
                        color: #1e40af;
                        margin: 10px 0;
                    }
                    
                    .stat-label {
                        color: #6b7280;
                        font-size: 14px;
                    }
                    
                    .table-container {
                        padding: 25px;
                        overflow-x: auto;
                    }
                    
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 14px;
                    }
                    
                    th {
                        background: #f1f5f9;
                        padding: 15px;
                        text-align: left;
                        font-weight: 600;
                        color: #1e40af;
                        border-bottom: 2px solid #e5e7eb;
                        position: sticky;
                        top: 0;
                    }
                    
                    td {
                        padding: 12px 15px;
                        border-bottom: 1px solid #e5e7eb;
                        vertical-align: top;
                    }
                    
                    tr:hover {
                        background: #f8fafc;
                    }
                    
                    .badge {
                        padding: 4px 10px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                        display: inline-block;
                    }
                    
                    .badge.pendente { background: #fef3c7; color: #92400e; }
                    .badge.pago { background: #d1fae5; color: #065f46; }
                    .badge.andamento { background: #dbeafe; color: #1e40af; }
                    .badge.concluido { background: #ede9fe; color: #5b21b6; }
                    
                    .btn {
                        display: inline-block;
                        padding: 8px 16px;
                        background: #3b82f6;
                        color: white;
                        border-radius: 5px;
                        text-decoration: none;
                        font-weight: 500;
                        border: none;
                        cursor: pointer;
                        transition: background 0.3s;
                    }
                    
                    .btn:hover { background: #2563eb; }
                    
                    .btn-danger { background: #ef4444; }
                    .btn-danger:hover { background: #dc2626; }
                    
                    .btn-secondary { 
                        background: #6b7280; 
                        color: white;
                        text-decoration: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        display: inline-block;
                        margin-top: 20px;
                    }
                    
                    .btn-secondary:hover { background: #4b5563; }
                    
                    .detail-row {
                        background: #f9fafb !important;
                    }
                    
                    .detail-cell {
                        padding: 15px;
                        background: #f8fafc;
                        border-top: 1px solid #e5e7eb;
                    }
                    
                    .detail-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 15px;
                    }
                    
                    .detail-item {
                        background: white;
                        padding: 10px;
                        border-radius: 5px;
                        border: 1px solid #e5e7eb;
                    }
                    
                    .detail-label {
                        font-size: 12px;
                        color: #6b7280;
                        margin-bottom: 5px;
                    }
                    
                    .detail-value {
                        font-weight: 500;
                        color: #1f2937;
                    }
                    
                    .actions {
                        display: flex;
                        gap: 8px;
                    }
                    
                    .export-btn {
                        background: #10b981;
                        color: white;
                        padding: 10px 20px;
                        border-radius: 5px;
                        text-decoration: none;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        margin: 20px 0;
                    }
                    
                    @media (max-width: 768px) {
                        .header { flex-direction: column; text-align: center; gap: 15px; }
                        .stats { grid-template-columns: 1fr; }
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
                        <div>
                            <a href="/" class="btn" target="_blank"><i class="fas fa-external-link-alt"></i> Ver Site</a>
                            <a href="/admin/pedidos?senha=admin2025&export=csv" class="btn" style="background: #10b981;">
                                <i class="fas fa-download"></i> Exportar CSV
                            </a>
                        </div>
                    </div>
                    
                    <div class="stats">`;
        
        // Estatísticas
        html += `
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
                            <div class="stat-label">Usuários Cadastrados</div>
                            <div class="stat-value">${pedidos.rows.filter((p, i, a) => a.findIndex(pi => pi.usuario_id === p.usuario_id) === i).length}</div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-list"></i> Todos os Pedidos (${pedidos.rows.length})
                        </h2>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Data/Hora</th>
                                    <th>Cliente</th>
                                    <th>Usuário</th>
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
                    <td>${dataPedido.toLocaleDateString('pt-MZ')}<br>
                        <small>${dataPedido.toLocaleTimeString('pt-MZ').substring(0,5)}</small>
                    </td>
                    <td>
                        <strong>${pedido.cliente || 'Não informado'}</strong><br>
                        <small>📱 ${pedido.telefone || 'Não informado'}</small>
                    </td>
                    <td>
                        ${pedido.usuario_nome ? `
                            <strong>${pedido.usuario_nome}</strong><br>
                            <small>${pedido.usuario_telefone}</small>
                        ` : 'Sem usuário'}
                    </td>
                    <td>
                        <strong>${pedido.nome_plano || pedido.plano || 'Serviço'}</strong><br>
                        <small>${pedido.cadeira ? `Cadeira: ${pedido.cadeira}` : ''}</small>
                    </td>
                    <td><strong style="color: #1e40af;">${pedido.preco ? pedido.preco.toLocaleString('pt-MZ') : '0'} MT</strong></td>
                    <td><span class="badge ${statusClass}">${pedido.status || 'pendente'}</span></td>
                    <td class="actions">
                        <button onclick="verDetalhes(${pedido.id})" class="btn" style="padding: 5px 10px; font-size: 12px;">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                        <button onclick="mudarStatus(${pedido.id})" class="btn" style="padding: 5px 10px; font-size: 12px; background: #f59e0b;">
                            <i class="fas fa-edit"></i> Status
                        </button>
                    </td>
                </tr>
                <tr id="detalhes-${pedido.id}" class="detail-row" style="display: none;">
                    <td colspan="8" class="detail-cell">
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Instituição</div>
                                <div class="detail-value">${pedido.instituicao || 'Não informada'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Curso</div>
                                <div class="detail-value">${pedido.curso || 'Não informado'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Tema</div>
                                <div class="detail-value">${pedido.tema || 'Não informado'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Prazo</div>
                                <div class="detail-value">${pedido.prazo || 'Não definido'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Método Pagamento</div>
                                <div class="detail-value">${pedido.metodo_pagamento || 'Não definido'}</div>
                            </div>
                            <div class="detail-item">
                                <div class="detail-label">Descrição</div>
                                <div class="detail-value">${pedido.descricao || 'Sem descrição'}</div>
                            </div>
                        </div>
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
                        
                        <div style="margin-top: 30px; text-align: center;">
                            <a href="/" class="btn-secondary">
                                <i class="fas fa-arrow-left"></i> Voltar ao Site
                            </a>
                        </div>
                    </div>
                </div>
                
                <script>
                    function verDetalhes(id) {
                        const detalhes = document.getElementById('detalhes-' + id);
                        detalhes.style.display = detalhes.style.display === 'table-row' ? 'none' : 'table-row';
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
                                })
                                .catch(error => alert('Erro: ' + error));
                        }
                    }
                    
                    // Exportar para CSV
                    if (window.location.search.includes('export=csv')) {
                        let csv = 'ID;Data;Cliente;Telefone;Serviço;Preço;Status;Usuário\\n';
                        document.querySelectorAll('tbody tr:not(.detail-row)').forEach(row => {
                            const cells = row.querySelectorAll('td');
                            if (cells.length >= 7) {
                                csv += [
                                    cells[0].textContent.replace('#', '').trim(),
                                    cells[1].textContent.trim(),
                                    cells[2].querySelector('strong')?.textContent.trim() || '',
                                    cells[2].querySelector('small')?.textContent.replace('📱', '').trim() || '',
                                    cells[4].querySelector('strong')?.textContent.trim() || '',
                                    cells[5].querySelector('strong')?.textContent.replace('MT', '').trim() || '',
                                    cells[6].textContent.trim(),
                                    cells[3].querySelector('strong')?.textContent.trim() || ''
                                ].join(';') + '\\n';
                            }
                        });
                        
                        const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = 'pedidos_facilitaki_' + new Date().toISOString().split('T')[0] + '.csv';
                        link.click();
                        
                        // Remove o parâmetro da URL
                        history.replaceState({}, '', window.location.pathname + '?senha=admin2025');
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

// ===== ROTA PARA ATUALIZAR STATUS =====
app.get('/api/admin/atualizar-status', async (req, res) => {
    const { senha, pedido, status } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query(
            'UPDATE pedidos SET status = $1 WHERE id = $2',
            [status, pedido]
        );
        
        res.json({ 
            success: true, 
            mensagem: `Status do pedido #${pedido} atualizado para: ${status}` 
        });
        
    } catch (error) {
        res.json({ 
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

// 7. CRIAR PEDIDO (ROTA PRINCIPAL)
app.post('/api/pedidos', autenticarToken, async (req, res) => {
    try {
        console.log('📦 Criando pedido para usuário:', req.usuario.id);
        console.log('📊 Dados recebidos:', JSON.stringify(req.body, null, 2));
        
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
        console.log('💰 Valor salvo:', pedido.rows[0].preco, 'MT');
        console.log('👤 Cliente:', pedido.rows[0].cliente);
        console.log('📅 Data:', pedido.rows[0].data_pedido);
        
        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: pedido.rows[0],
            salvo_no_banco: true
        });
        
    } catch (error) {
        console.error('❌ Erro ao criar pedido:', error.message);
        console.error('🔍 Detalhes do erro:', error);
        
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

// 10. Verificar token
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({
        success: true,
        valido: true,
        usuario: req.usuario
    });
});

// 11. Usuário atual
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

// 12. Logout
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

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 FACILITAKI - VERSÃO COMPLETA COM PAINEL ADMIN');
    console.log('='.repeat(60));
    console.log(`📍 URL: https://facilitaki.onrender.com`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`💾 Banco: PostgreSQL (Render)`);
    console.log(`👨‍💼 Painel Admin: /admin/pedidos?senha=admin2025`);
    console.log(`🛠️  Correções: /api/fix-pedidos`);
    console.log('='.repeat(60));
    console.log('✅ SISTEMA 100% FUNCIONAL:');
    console.log('   ✅ Cadastro de usuários');
    console.log('   ✅ Login com JWT');
    console.log('   ✅ Criação de pedidos');
    console.log('   ✅ Armazenamento PostgreSQL');
    console.log('   ✅ Painel administrativo');
    console.log('   ✅ Correção automática');
    console.log('='.repeat(60));
    console.log('🎯 ACESSE AGORA:');
    console.log('   1. https://facilitaki.onrender.com');
    console.log('   2. https://facilitaki.onrender.com/admin/pedidos?senha=admin2025');
    console.log('   3. https://facilitaki.onrender.com/api/debug/db');
    console.log('='.repeat(60));
});
