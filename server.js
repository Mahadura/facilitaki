[file name]: server.js
[file content begin]
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        // Criar diretório se não existir
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Gerar nome único para o arquivo
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: function (req, file, cb) {
        // Permitir apenas certos tipos de arquivo
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido. Apenas PDF, Word, texto e imagens são aceitos.'));
        }
    }
});

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
                    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    arquivos TEXT[] DEFAULT '{}',
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
            'curso', 'cadeira', 'tema', 'descricao', 'prazo', 'plano', 
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
                if (coluna === 'arquivos') tipo = 'TEXT[]';
                if (coluna === 'observacoes_admin') tipo = 'TEXT';
                
                await pool.query(`ALTER TABLE pedidos ADD COLUMN ${coluna} ${tipo}`);
                
                // Adicionar defaults
                if (coluna === 'status') {
                    await pool.query(`ALTER TABLE pedidos ALTER COLUMN status SET DEFAULT 'pendente'`);
                }
                if (coluna === 'data_pedido') {
                    await pool.query(`ALTER TABLE pedidos ALTER COLUMN data_pedido SET DEFAULT CURRENT_TIMESTAMP`);
                }
                if (coluna === 'arquivos') {
                    await pool.query(`ALTER TABLE pedidos ALTER COLUMN arquivos SET DEFAULT '{}'`);
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

// ===== ROTAS DE DIAGNÓSTICO E CORREÇÃO =====

// 1. Status geral
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as hora');
        res.json({
            success: true,
            mensagem: 'Facilitaki Online',
            hora: dbTest.rows[0].hora,
            versao: '5.0',
            painel_admin: '/admin/pedidos?senha=admin2025',
            recursos: ['upload', 'exclusão', 'painel_admin']
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
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                arquivos TEXT[] DEFAULT '{}',
                observacoes_admin TEXT
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
                u.data_cadastro as usuario_data_cadastro,
                u.ativo as usuario_ativo
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);
        
        // Buscar todos usuários para o gerenciamento
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
        
        // Gerar HTML da página admin
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Facilitaki - Painel Completo</title>
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
                        max-width: 1600px;
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
                    
                    .tabs {
                        display: flex;
                        background: #f1f5f9;
                        border-bottom: 1px solid #e5e7eb;
                    }
                    
                    .tab {
                        padding: 15px 30px;
                        cursor: pointer;
                        font-weight: 500;
                        color: #6b7280;
                        transition: all 0.3s;
                        border-bottom: 3px solid transparent;
                    }
                    
                    .tab:hover {
                        background: #e5e7eb;
                        color: #1f2937;
                    }
                    
                    .tab.active {
                        background: white;
                        color: #1e40af;
                        border-bottom: 3px solid #3b82f6;
                    }
                    
                    .tab-content {
                        display: none;
                        padding: 25px;
                    }
                    
                    .tab-content.active {
                        display: block;
                    }
                    
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        padding: 25px;
                        background: #f8fafc;
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
                    .badge.cancelado { background: #fee2e2; color: #991b1b; }
                    
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
                        font-size: 12px;
                    }
                    
                    .btn:hover { background: #2563eb; }
                    
                    .btn-danger { background: #ef4444; }
                    .btn-danger:hover { background: #dc2626; }
                    
                    .btn-warning { background: #f59e0b; }
                    .btn-warning:hover { background: #d97706; }
                    
                    .btn-success { background: #10b981; }
                    .btn-success:hover { background: #059669; }
                    
                    .btn-secondary { 
                        background: #6b7280; 
                        color: white;
                        text-decoration: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        display: inline-block;
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
                        flex-wrap: wrap;
                    }
                    
                    .arquivos-list {
                        display: flex;
                        flex-direction: column;
                        gap: 5px;
                        margin-top: 10px;
                    }
                    
                    .arquivo-item {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 5px 10px;
                        background: #f3f4f6;
                        border-radius: 5px;
                    }
                    
                    .arquivo-item a {
                        color: #3b82f6;
                        text-decoration: none;
                    }
                    
                    .arquivo-item a:hover {
                        text-decoration: underline;
                    }
                    
                    .admin-actions {
                        margin-top: 20px;
                        padding: 20px;
                        background: #f8fafc;
                        border-radius: 10px;
                        border: 1px solid #e5e7eb;
                    }
                    
                    .admin-actions h3 {
                        margin-bottom: 15px;
                        color: #1e40af;
                    }
                    
                    .action-buttons {
                        display: flex;
                        gap: 10px;
                        flex-wrap: wrap;
                    }
                    
                    .search-box {
                        margin-bottom: 20px;
                        display: flex;
                        gap: 10px;
                    }
                    
                    .search-box input {
                        flex: 1;
                        padding: 10px 15px;
                        border: 1px solid #d1d5db;
                        border-radius: 5px;
                        font-size: 14px;
                    }
                    
                    .user-status {
                        display: inline-block;
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        margin-right: 5px;
                    }
                    
                    .user-status.ativo { background: #10b981; }
                    .user-status.inativo { background: #ef4444; }
                    
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
                        padding: 30px;
                        border-radius: 10px;
                        max-width: 500px;
                        width: 90%;
                        max-height: 80vh;
                        overflow-y: auto;
                    }
                    
                    .modal-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                    }
                    
                    .modal-header h2 {
                        color: #1e40af;
                    }
                    
                    .close-modal {
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #6b7280;
                    }
                    
                    .form-group {
                        margin-bottom: 15px;
                    }
                    
                    .form-group label {
                        display: block;
                        margin-bottom: 5px;
                        color: #374151;
                        font-weight: 500;
                    }
                    
                    .form-group input,
                    .form-group textarea,
                    .form-group select {
                        width: 100%;
                        padding: 10px;
                        border: 1px solid #d1d5db;
                        border-radius: 5px;
                        font-size: 14px;
                    }
                    
                    .form-group textarea {
                        min-height: 100px;
                        resize: vertical;
                    }
                    
                    .upload-area {
                        border: 2px dashed #d1d5db;
                        border-radius: 10px;
                        padding: 30px;
                        text-align: center;
                        cursor: pointer;
                        transition: border-color 0.3s;
                    }
                    
                    .upload-area:hover {
                        border-color: #3b82f6;
                    }
                    
                    .upload-area i {
                        font-size: 48px;
                        color: #9ca3af;
                        margin-bottom: 10px;
                    }
                    
                    .upload-area p {
                        color: #6b7280;
                        margin: 5px 0;
                    }
                    
                    .arquivos-upload {
                        margin-top: 15px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    
                    .arquivo-upload-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 10px;
                        background: #f9fafb;
                        border-radius: 5px;
                        border: 1px solid #e5e7eb;
                    }
                    
                    @media (max-width: 768px) {
                        .header { flex-direction: column; text-align: center; gap: 15px; }
                        .tabs { flex-wrap: wrap; }
                        .tab { flex: 1; text-align: center; padding: 12px; }
                        .stats { grid-template-columns: 1fr; }
                        table { font-size: 12px; }
                        th, td { padding: 8px; }
                        .actions { flex-direction: column; }
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
                            <div class="stat-label">Usuários Cadastrados</div>
                            <div class="stat-value">${usuarios.rows.length}</div>
                        </div>
                    </div>
                    
                    <div class="tabs">
                        <div class="tab active" onclick="abrirTab('pedidos')"><i class="fas fa-shopping-cart"></i> Pedidos</div>
                        <div class="tab" onclick="abrirTab('usuarios')"><i class="fas fa-users"></i> Usuários</div>
                        <div class="tab" onclick="abrirTab('contatos')"><i class="fas fa-envelope"></i> Contatos</div>
                        <div class="tab" onclick="abrirTab('upload')"><i class="fas fa-upload"></i> Upload</div>
                        <div class="tab" onclick="abrirTab('relatorios')"><i class="fas fa-chart-bar"></i> Relatórios</div>
                    </div>
                    
                    <!-- TAB PEDIDOS -->
                    <div id="tab-pedidos" class="tab-content active">
                        <div class="search-box">
                            <input type="text" id="buscarPedido" placeholder="Buscar pedido por ID, cliente, telefone..." onkeyup="buscarPedidos()">
                            <button class="btn" onclick="resetarBusca()"><i class="fas fa-redo"></i> Resetar</button>
                        </div>
                        
                        <div class="table-container">
                            <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-list"></i> Todos os Pedidos (${pedidos.rows.length})
                            </h2>
                            
                            <table id="tabelaPedidos">
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
            const arquivos = pedido.arquivos || [];
            
            html += `
                <tr data-id="${pedido.id}" data-cliente="${pedido.cliente || ''}" data-telefone="${pedido.telefone || ''}">
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
                        <button onclick="verDetalhes(${pedido.id})" class="btn" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button onclick="mudarStatus(${pedido.id})" class="btn btn-warning" title="Alterar status">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="gerenciarArquivos(${pedido.id})" class="btn btn-success" title="Gerenciar arquivos">
                            <i class="fas fa-file-upload"></i>
                        </button>
                        <button onclick="excluirPedido(${pedido.id}, '${pedido.cliente || ''}')" class="btn btn-danger" title="Excluir pedido">
                            <i class="fas fa-trash"></i>
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
                                <div class="detail-label">Arquivos</div>
                                <div class="detail-value">
                                    ${arquivos.length > 0 ? `
                                        <div class="arquivos-list">
                                            ${arquivos.map(arquivo => `
                                                <div class="arquivo-item">
                                                    <i class="fas fa-file"></i>
                                                    <a href="/uploads/${arquivo}" target="_blank">${arquivo}</a>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : 'Nenhum arquivo'}
                                </div>
                            </div>
                            <div class="detail-item" style="grid-column: 1 / -1;">
                                <div class="detail-label">Descrição</div>
                                <div class="detail-value">${pedido.descricao || 'Sem descrição'}</div>
                            </div>
                            ${pedido.observacoes_admin ? `
                            <div class="detail-item" style="grid-column: 1 / -1; background: #fef3c7; border-color: #f59e0b;">
                                <div class="detail-label">Observações Admin</div>
                                <div class="detail-value">${pedido.observacoes_admin}</div>
                            </div>
                            ` : ''}
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
                        
                        <div class="admin-actions">
                            <h3><i class="fas fa-cog"></i> Ações Administrativas</h3>
                            <div class="action-buttons">
                                <button onclick="atualizarTodosStatus('concluido')" class="btn btn-success">
                                    <i class="fas fa-check-circle"></i> Marcar Todos Concluídos
                                </button>
                                <button onclick="limparObservacoes()" class="btn btn-warning">
                                    <i class="fas fa-eraser"></i> Limpar Observações
                                </button>
                                <button onclick="exportarPedidos()" class="btn">
                                    <i class="fas fa-file-export"></i> Exportar Relatório
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- TAB USUÁRIOS -->
                    <div id="tab-usuarios" class="tab-content">
                        <div class="table-container">
                            <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-users"></i> Gerenciar Usuários (${usuarios.rows.length})
                            </h2>
                            
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Nome</th>
                                        <th>Telefone</th>
                                        <th>Data Cadastro</th>
                                        <th>Status</th>
                                        <th>Tipo</th>
                                        <th>Pedidos</th>
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
                    <td>
                        <span class="user-status ${statusClass}"></span>
                        ${statusText}
                    </td>
                    <td><span class="badge">${usuario.tipo_usuario || 'cliente'}</span></td>
                    <td>
                        <button onclick="verPedidosUsuario(${usuario.id})" class="btn">
                            <i class="fas fa-list"></i> Ver Pedidos
                        </button>
                    </td>
                    <td class="actions">
                        ${usuario.ativo ? `
                            <button onclick="desativarUsuario(${usuario.id}, '${usuario.nome}')" class="btn btn-warning" title="Desativar usuário">
                                <i class="fas fa-user-slash"></i>
                            </button>
                        ` : `
                            <button onclick="ativarUsuario(${usuario.id}, '${usuario.nome}')" class="btn btn-success" title="Ativar usuário">
                                <i class="fas fa-user-check"></i>
                            </button>
                        `}
                        <button onclick="alterarTipoUsuario(${usuario.id}, '${usuario.nome}')" class="btn" title="Alterar tipo de usuário">
                            <i class="fas fa-user-cog"></i>
                        </button>
                        <button onclick="excluirUsuario(${usuario.id}, '${usuario.nome}')" class="btn btn-danger" title="Excluir usuário">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>`;
        });
        
        html += `
                                </tbody>
                            </table>
                            
                            ${usuarios.rows.length === 0 ? 
                                '<div style="text-align: center; padding: 40px; color: #6b7280;"><i class="fas fa-user-slash" style="font-size: 48px; margin-bottom: 20px;"></i><h3>Nenhum usuário cadastrado</h3></div>' : 
                                ''
                            }
                        </div>
                    </div>
                    
                    <!-- TAB CONTATOS -->
                    <div id="tab-contatos" class="tab-content">
                        <div class="table-container">
                            <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-envelope"></i> Mensagens de Contato (${contatos.rows.length})
                            </h2>
                            
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Data</th>
                                        <th>Nome</th>
                                        <th>Telefone</th>
                                        <th>Email</th>
                                        <th>Mensagem</th>
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
                    <td>${dataContato.toLocaleDateString('pt-MZ')}<br>
                        <small>${dataContato.toLocaleTimeString('pt-MZ').substring(0,5)}</small>
                    </td>
                    <td><strong>${contato.nome}</strong></td>
                    <td>${contato.telefone}</td>
                    <td>${contato.email || 'Não informado'}</td>
                    <td style="max-width: 300px; word-wrap: break-word;">
                        ${contato.mensagem.length > 100 ? contato.mensagem.substring(0, 100) + '...' : contato.mensagem}
                        ${contato.mensagem.length > 100 ? `<br><button onclick="verMensagemCompleta(${contato.id})" class="btn" style="padding: 2px 8px; margin-top: 5px;">Ver mais</button>` : ''}
                    </td>
                    <td><span class="${respondidoClass}">${respondidoText}</span></td>
                    <td class="actions">
                        ${!contato.respondido ? `
                            <button onclick="marcarComoRespondido(${contato.id})" class="btn btn-success" title="Marcar como respondido">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : `
                            <button onclick="marcarComoNaoRespondido(${contato.id})" class="btn btn-warning" title="Marcar como não respondido">
                                <i class="fas fa-times"></i>
                            </button>
                        `}
                        <button onclick="excluirContato(${contato.id}, '${contato.nome}')" class="btn btn-danger" title="Excluir contato">
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
                    
                    <!-- TAB UPLOAD -->
                    <div id="tab-upload" class="tab-content">
                        <div class="table-container">
                            <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-upload"></i> Upload de Arquivos para Pedido
                            </h2>
                            
                            <div class="admin-actions">
                                <h3><i class="fas fa-paperclip"></i> Selecionar Pedido</h3>
                                <div class="form-group">
                                    <label for="pedidoUpload">ID do Pedido:</label>
                                    <input type="number" id="pedidoUpload" placeholder="Digite o ID do pedido" min="1">
                                </div>
                                <button onclick="verificarPedido()" class="btn">
                                    <i class="fas fa-search"></i> Verificar Pedido
                                </button>
                            </div>
                            
                            <div id="uploadArea" style="display: none;">
                                <h3 style="margin-top: 30px; color: #1e40af;"><i class="fas fa-cloud-upload-alt"></i> Área de Upload</h3>
                                
                                <div class="upload-area" onclick="document.getElementById('fileInput').click()">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <p><strong>Clique para selecionar arquivos</strong></p>
                                    <p>ou arraste e solte aqui</p>
                                    <p style="font-size: 12px; color: #9ca3af;">Formatos permitidos: PDF, Word, TXT, JPG, PNG, GIF (Máx: 10MB)</p>
                                </div>
                                
                                <input type="file" id="fileInput" multiple style="display: none;" onchange="prepararUpload(this.files)">
                                
                                <div id="arquivosLista" class="arquivos-upload"></div>
                                
                                <button onclick="enviarArquivos()" class="btn btn-success" style="margin-top: 20px; display: none;" id="btnEnviar">
                                    <i class="fas fa-upload"></i> Enviar Arquivos
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- TAB RELATÓRIOS -->
                    <div id="tab-relatorios" class="tab-content">
                        <div class="table-container">
                            <h2 style="margin-bottom: 20px; color: #1e40af; display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-chart-bar"></i> Relatórios e Estatísticas
                            </h2>
                            
                            <div class="stats" style="margin-bottom: 30px;">
                                <div class="stat-card">
                                    <div class="stat-label">Pedidos Hoje</div>
                                    <div class="stat-value" id="pedidosHoje">0</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-label">Pedidos Esta Semana</div>
                                    <div class="stat-value" id="pedidosSemana">0</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-label">Pedidos Este Mês</div>
                                    <div class="stat-value" id="pedidosMes">0</div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-label">Taxa de Conclusão</div>
                                    <div class="stat-value" id="taxaConclusao">0%</div>
                                </div>
                            </div>
                            
                            <div class="admin-actions">
                                <h3><i class="fas fa-download"></i> Gerar Relatórios</h3>
                                <div class="action-buttons">
                                    <button onclick="gerarRelatorio('diario')" class="btn">
                                        <i class="fas fa-file-alt"></i> Relatório Diário
                                    </button>
                                    <button onclick="gerarRelatorio('semanal')" class="btn">
                                        <i class="fas fa-file-alt"></i> Relatório Semanal
                                    </button>
                                    <button onclick="gerarRelatorio('mensal')" class="btn">
                                        <i class="fas fa-file-alt"></i> Relatório Mensal
                                    </button>
                                    <button onclick="gerarRelatorio('completo')" class="btn btn-success">
                                        <i class="fas fa-file-excel"></i> Relatório Completo
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- MODAL PARA MENSAGEM COMPLETA -->
                <div id="modalMensagem" class="modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2><i class="fas fa-envelope"></i> Mensagem Completa</h2>
                            <button class="close-modal" onclick="fecharModal('modalMensagem')">&times;</button>
                        </div>
                        <div id="conteudoMensagem"></div>
                    </div>
                </div>
                
                <script>
                    let pedidoUploadId = null;
                    let arquivosParaUpload = [];
                    
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
                        
                        // Carregar estatísticas se for a tab de relatórios
                        if (tabName === 'relatorios') {
                            carregarEstatisticas();
                        }
                    }
                    
                    function verDetalhes(id) {
                        const detalhes = document.getElementById('detalhes-' + id);
                        detalhes.style.display = detalhes.style.display === 'table-row' ? 'none' : 'table-row';
                    }
                    
                    function buscarPedidos() {
                        const termo = document.getElementById('buscarPedido').value.toLowerCase();
                        const linhas = document.querySelectorAll('#tabelaPedidos tbody tr:not(.detail-row)');
                        
                        linhas.forEach(linha => {
                            const id = linha.getAttribute('data-id') || '';
                            const cliente = linha.getAttribute('data-cliente') || '';
                            const telefone = linha.getAttribute('data-telefone') || '';
                            
                            if (id.includes(termo) || cliente.toLowerCase().includes(termo) || telefone.includes(termo)) {
                                linha.style.display = '';
                            } else {
                                linha.style.display = 'none';
                            }
                        });
                    }
                    
                    function resetarBusca() {
                        document.getElementById('buscarPedido').value = '';
                        buscarPedidos();
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
                    
                    function gerenciarArquivos(id) {
                        const observacoes = prompt('Digite observações para o pedido (opcional):');
                        if (observacoes !== null) {
                            fetch('/api/admin/adicionar-observacoes?senha=admin2025&pedido=' + id, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ observacoes: observacoes })
                            })
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Observações adicionadas!');
                                    location.reload();
                                }
                            });
                        }
                    }
                    
                    function excluirPedido(id, cliente) {
                        if (confirm('Tem certeza que deseja excluir o pedido #' + id + ' do cliente "' + cliente + '"?\\n\\nEsta ação não pode ser desfeita!')) {
                            fetch('/api/admin/excluir-pedido?senha=admin2025&pedido=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Pedido excluído com sucesso!');
                                        location.reload();
                                    } else {
                                        alert('Erro: ' + data.erro);
                                    }
                                })
                                .catch(error => alert('Erro: ' + error));
                        }
                    }
                    
                    function verPedidosUsuario(usuarioId) {
                        window.open('/admin/pedidos?senha=admin2025&usuario=' + usuarioId, '_blank');
                    }
                    
                    function desativarUsuario(id, nome) {
                        if (confirm('Desativar o usuário "' + nome + '"?\\nEle não poderá fazer login até ser reativado.')) {
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
                    
                    function ativarUsuario(id, nome) {
                        fetch('/api/admin/ativar-usuario?senha=admin2025&usuario=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Usuário ativado!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function alterarTipoUsuario(id, nome) {
                        const novoTipo = prompt('Novo tipo para "' + nome + '":\\n(cliente, admin, colaborador)');
                        if (novoTipo) {
                            fetch('/api/admin/alterar-tipo-usuario?senha=admin2025&usuario=' + id + '&tipo=' + encodeURIComponent(novoTipo))
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Tipo alterado!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function excluirUsuario(id, nome) {
                        if (confirm('🚨 ATENÇÃO!\\n\\nTem certeza que deseja EXCLUIR PERMANENTEMENTE o usuário "' + nome + '"?\\n\\nEsta ação:\\n• Exclui TODOS os pedidos do usuário\\n• Remove o usuário do sistema\\n• NÃO PODE ser desfeita!')) {
                            fetch('/api/admin/excluir-usuario?senha=admin2025&usuario=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Usuário excluído com sucesso!');
                                        location.reload();
                                    } else {
                                        alert('Erro: ' + data.erro);
                                    }
                                });
                        }
                    }
                    
                    function verMensagemCompleta(id) {
                        fetch('/api/admin/ver-mensagem?senha=admin2025&contato=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    document.getElementById('conteudoMensagem').innerHTML = \`
                                        <div style="margin-bottom: 15px;">
                                            <strong>Nome:</strong> \${data.contato.nome}<br>
                                            <strong>Telefone:</strong> \${data.contato.telefone}<br>
                                            <strong>Email:</strong> \${data.contato.email || 'Não informado'}<br>
                                            <strong>Data:</strong> \${new Date(data.contato.data_contato).toLocaleString('pt-MZ')}
                                        </div>
                                        <div style="background: #f9fafb; padding: 15px; border-radius: 5px; border: 1px solid #e5e7eb;">
                                            <strong>Mensagem:</strong><br>
                                            \${data.contato.mensagem}
                                        </div>
                                    \`;
                                    document.getElementById('modalMensagem').style.display = 'flex';
                                }
                            });
                    }
                    
                    function fecharModal(modalId) {
                        document.getElementById(modalId).style.display = 'none';
                    }
                    
                    function marcarComoRespondido(id) {
                        fetch('/api/admin/marcar-respondido?senha=admin2025&contato=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Mensagem marcada como respondida!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function marcarComoNaoRespondido(id) {
                        fetch('/api/admin/marcar-nao-respondido?senha=admin2025&contato=' + id)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Mensagem marcada como não respondida!');
                                    location.reload();
                                }
                            });
                    }
                    
                    function excluirContato(id, nome) {
                        if (confirm('Excluir mensagem de "' + nome + '"?')) {
                            fetch('/api/admin/excluir-contato?senha=admin2025&contato=' + id)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Mensagem excluída!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function verificarPedido() {
                        const pedidoId = document.getElementById('pedidoUpload').value;
                        if (!pedidoId) {
                            alert('Digite o ID do pedido!');
                            return;
                        }
                        
                        fetch('/api/admin/verificar-pedido?senha=admin2025&pedido=' + pedidoId)
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    pedidoUploadId = pedidoId;
                                    document.getElementById('uploadArea').style.display = 'block';
                                    alert('Pedido encontrado! Cliente: ' + data.pedido.cliente);
                                } else {
                                    alert('Pedido não encontrado!');
                                }
                            });
                    }
                    
                    function prepararUpload(files) {
                        const lista = document.getElementById('arquivosLista');
                        lista.innerHTML = '';
                        arquivosParaUpload = [];
                        
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            if (file.size > 10 * 1024 * 1024) {
                                alert('Arquivo "' + file.name + '" excede 10MB!');
                                continue;
                            }
                            
                            arquivosParaUpload.push(file);
                            
                            const item = document.createElement('div');
                            item.className = 'arquivo-upload-item';
                            item.innerHTML = \`
                                <div>
                                    <i class="fas fa-file"></i> \${file.name} (\${(file.size / 1024 / 1024).toFixed(2)} MB)
                                </div>
                                <button onclick="removerArquivo(\${i})" class="btn btn-danger" style="padding: 2px 8px;">
                                    <i class="fas fa-times"></i>
                                </button>
                            \`;
                            lista.appendChild(item);
                        }
                        
                        if (arquivosParaUpload.length > 0) {
                            document.getElementById('btnEnviar').style.display = 'inline-block';
                        }
                    }
                    
                    function removerArquivo(index) {
                        arquivosParaUpload.splice(index, 1);
                        prepararUpload(arquivosParaUpload);
                    }
                    
                    function enviarArquivos() {
                        if (arquivosParaUpload.length === 0) {
                            alert('Selecione arquivos primeiro!');
                            return;
                        }
                        
                        const formData = new FormData();
                        formData.append('pedidoId', pedidoUploadId);
                        
                        arquivosParaUpload.forEach(file => {
                            formData.append('arquivos', file);
                        });
                        
                        fetch('/api/upload-arquivos?senha=admin2025', {
                            method: 'POST',
                            body: formData
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                alert('Arquivos enviados com sucesso!');
                                location.reload();
                            } else {
                                alert('Erro: ' + data.erro);
                            }
                        })
                        .catch(error => alert('Erro: ' + error));
                    }
                    
                    function carregarEstatisticas() {
                        fetch('/api/admin/estatisticas?senha=admin2025')
                            .then(response => response.json())
                            .then(data => {
                                if (data.success) {
                                    document.getElementById('pedidosHoje').textContent = data.hoje;
                                    document.getElementById('pedidosSemana').textContent = data.semana;
                                    document.getElementById('pedidosMes').textContent = data.mes;
                                    document.getElementById('taxaConclusao').textContent = data.taxaConclusao + '%';
                                }
                            });
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
                    
                    function limparObservacoes() {
                        if (confirm('Limpar observações administrativas de TODOS os pedidos?')) {
                            fetch('/api/admin/limpar-observacoes?senha=admin2025')
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Observações limpas!');
                                        location.reload();
                                    }
                                });
                        }
                    }
                    
                    function exportarPedidos() {
                        window.location.href = '/admin/pedidos?senha=admin2025&export=csv';
                    }
                    
                    function gerarRelatorio(tipo) {
                        window.open('/api/admin/relatorio?senha=admin2025&tipo=' + tipo, '_blank');
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
                    
                    // Permitir arrastar e soltar arquivos
                    const uploadArea = document.querySelector('.upload-area');
                    if (uploadArea) {
                        uploadArea.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            uploadArea.style.borderColor = '#3b82f6';
                        });
                        
                        uploadArea.addEventListener('dragleave', () => {
                            uploadArea.style.borderColor = '#d1d5db';
                        });
                        
                        uploadArea.addEventListener('drop', (e) => {
                            e.preventDefault();
                            uploadArea.style.borderColor = '#d1d5db';
                            prepararUpload(e.dataTransfer.files);
                        });
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

// Atualizar status do pedido
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

// Adicionar observações ao pedido
app.post('/api/admin/adicionar-observacoes', async (req, res) => {
    const { senha, pedido } = req.query;
    const { observacoes } = req.body;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query(
            'UPDATE pedidos SET observacoes_admin = $1 WHERE id = $2',
            [observacoes, pedido]
        );
        
        res.json({ 
            success: true, 
            mensagem: `Observações adicionadas ao pedido #${pedido}` 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Excluir pedido
app.get('/api/admin/excluir-pedido', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        // Obter informações do pedido para excluir arquivos
        const pedidoInfo = await pool.query('SELECT arquivos FROM pedidos WHERE id = $1', [pedido]);
        
        if (pedidoInfo.rows.length > 0 && pedidoInfo.rows[0].arquivos) {
            // Excluir arquivos físicos
            pedidoInfo.rows[0].arquivos.forEach(arquivo => {
                const filePath = path.join(__dirname, 'uploads', arquivo);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        // Excluir pedido do banco
        await pool.query('DELETE FROM pedidos WHERE id = $1', [pedido]);
        
        res.json({ 
            success: true, 
            mensagem: `Pedido #${pedido} excluído com sucesso` 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Desativar usuário
app.get('/api/admin/desativar-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE usuarios SET ativo = false WHERE id = $1', [usuario]);
        
        res.json({ 
            success: true, 
            mensagem: 'Usuário desativado com sucesso' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Ativar usuário
app.get('/api/admin/ativar-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE usuarios SET ativo = true WHERE id = $1', [usuario]);
        
        res.json({ 
            success: true, 
            mensagem: 'Usuário ativado com sucesso' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Alterar tipo de usuário
app.get('/api/admin/alterar-tipo-usuario', async (req, res) => {
    const { senha, usuario, tipo } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE usuarios SET tipo_usuario = $1 WHERE id = $2', [tipo, usuario]);
        
        res.json({ 
            success: true, 
            mensagem: `Tipo do usuário alterado para: ${tipo}` 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Excluir usuário (e todos seus pedidos)
app.get('/api/admin/excluir-usuario', async (req, res) => {
    const { senha, usuario } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        // Primeiro, excluir todos os arquivos dos pedidos do usuário
        const pedidos = await pool.query('SELECT arquivos FROM pedidos WHERE usuario_id = $1', [usuario]);
        
        for (const pedido of pedidos.rows) {
            if (pedido.arquivos) {
                pedido.arquivos.forEach(arquivo => {
                    const filePath = path.join(__dirname, 'uploads', arquivo);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                });
            }
        }
        
        // Excluir todos os pedidos do usuário
        await pool.query('DELETE FROM pedidos WHERE usuario_id = $1', [usuario]);
        
        // Excluir o usuário
        await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario]);
        
        res.json({ 
            success: true, 
            mensagem: 'Usuário e todos os seus pedidos foram excluídos com sucesso' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Ver mensagem completa
app.get('/api/admin/ver-mensagem', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query('SELECT * FROM contatos WHERE id = $1', [contato]);
        
        if (resultado.rows.length === 0) {
            return res.json({ success: false, erro: 'Mensagem não encontrada' });
        }
        
        res.json({ 
            success: true, 
            contato: resultado.rows[0]
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Marcar como respondido
app.get('/api/admin/marcar-respondido', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE contatos SET respondido = true WHERE id = $1', [contato]);
        
        res.json({ 
            success: true, 
            mensagem: 'Mensagem marcada como respondida' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Marcar como não respondido
app.get('/api/admin/marcar-nao-respondido', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE contatos SET respondido = false WHERE id = $1', [contato]);
        
        res.json({ 
            success: true, 
            mensagem: 'Mensagem marcada como não respondida' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Excluir contato
app.get('/api/admin/excluir-contato', async (req, res) => {
    const { senha, contato } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [contato]);
        
        res.json({ 
            success: true, 
            mensagem: 'Mensagem excluída com sucesso' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Verificar pedido para upload
app.get('/api/admin/verificar-pedido', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query('SELECT id, cliente FROM pedidos WHERE id = $1', [pedido]);
        
        if (resultado.rows.length === 0) {
            return res.json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        res.json({ 
            success: true, 
            pedido: resultado.rows[0]
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Upload de arquivos
app.post('/api/upload-arquivos', upload.array('arquivos', 10), async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const { pedidoId } = req.body;
        
        if (!pedidoId || !req.files || req.files.length === 0) {
            return res.json({ success: false, erro: 'Pedido ID e arquivos são obrigatórios' });
        }
        
        // Obter arquivos atuais
        const pedido = await pool.query('SELECT arquivos FROM pedidos WHERE id = $1', [pedidoId]);
        
        if (pedido.rows.length === 0) {
            return res.json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const arquivosAtuais = pedido.rows[0].arquivos || [];
        const novosArquivos = req.files.map(file => file.filename);
        const todosArquivos = [...arquivosAtuais, ...novosArquivos];
        
        // Atualizar banco de dados
        await pool.query('UPDATE pedidos SET arquivos = $1 WHERE id = $2', [todosArquivos, pedidoId]);
        
        res.json({ 
            success: true, 
            mensagem: `${req.files.length} arquivo(s) enviado(s) com sucesso`,
            arquivos: novosArquivos
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Obter estatísticas
app.get('/api/admin/estatisticas', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        // Pedidos hoje
        const hoje = await pool.query(`
            SELECT COUNT(*) as total FROM pedidos 
            WHERE DATE(data_pedido) = CURRENT_DATE
        `);
        
        // Pedidos esta semana
        const semana = await pool.query(`
            SELECT COUNT(*) as total FROM pedidos 
            WHERE EXTRACT(WEEK FROM data_pedido) = EXTRACT(WEEK FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_pedido) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);
        
        // Pedidos este mês
        const mes = await pool.query(`
            SELECT COUNT(*) as total FROM pedidos 
            WHERE EXTRACT(MONTH FROM data_pedido) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_pedido) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);
        
        // Taxa de conclusão
        const conclusao = await pool.query(`
            SELECT 
                COUNT(CASE WHEN status = 'concluido' THEN 1 END) as concluidos,
                COUNT(*) as total
            FROM pedidos
        `);
        
        const totalConcluidos = parseInt(conclusao.rows[0].concluidos) || 0;
        const totalPedidos = parseInt(conclusao.rows[0].total) || 1;
        const taxaConclusao = Math.round((totalConcluidos / totalPedidos) * 100);
        
        res.json({ 
            success: true,
            hoje: parseInt(hoje.rows[0].total) || 0,
            semana: parseInt(semana.rows[0].total) || 0,
            mes: parseInt(mes.rows[0].total) || 0,
            taxaConclusao: taxaConclusao
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Atualizar todos os status
app.get('/api/admin/atualizar-todos-status', async (req, res) => {
    const { senha, status } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE pedidos SET status = $1', [status]);
        
        res.json({ 
            success: true, 
            mensagem: `Todos os pedidos foram atualizados para: ${status}` 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Limpar observações
app.get('/api/admin/limpar-observacoes', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE pedidos SET observacoes_admin = NULL');
        
        res.json({ 
            success: true, 
            mensagem: 'Observações limpas de todos os pedidos' 
        });
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Gerar relatório
app.get('/api/admin/relatorio', async (req, res) => {
    const { senha, tipo } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        let query = '';
        let filename = '';
        
        switch (tipo) {
            case 'diario':
                query = `SELECT * FROM pedidos WHERE DATE(data_pedido) = CURRENT_DATE ORDER BY data_pedido DESC`;
                filename = `relatorio_diario_${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'semanal':
                query = `SELECT * FROM pedidos WHERE EXTRACT(WEEK FROM data_pedido) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM data_pedido) = EXTRACT(YEAR FROM CURRENT_DATE) ORDER BY data_pedido DESC`;
                filename = `relatorio_semanal_${new Date().toISOString().split('T')[0]}.csv`;
                break;
            case 'mensal':
                query = `SELECT * FROM pedidos WHERE EXTRACT(MONTH FROM data_pedido) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM data_pedido) = EXTRACT(YEAR FROM CURRENT_DATE) ORDER BY data_pedido DESC`;
                filename = `relatorio_mensal_${new Date().toISOString().split('T')[0]}.csv`;
                break;
            default:
                query = `SELECT * FROM pedidos ORDER BY data_pedido DESC`;
                filename = `relatorio_completo_${new Date().toISOString().split('T')[0]}.csv`;
        }
        
        const resultado = await pool.query(query);
        
        // Gerar CSV
        let csv = 'ID;Data;Cliente;Telefone;Instituição;Curso;Cadeira;Tema;Plano;Preço;Status;Método Pagamento;Arquivos\n';
        
        resultado.rows.forEach(pedido => {
            const data = pedido.data_pedido ? new Date(pedido.data_pedido).toLocaleDateString('pt-MZ') : '';
            const arquivos = pedido.arquivos ? pedido.arquivos.join(', ') : '';
            
            csv += `"${pedido.id}";"${data}";"${pedido.cliente || ''}";"${pedido.telefone || ''}";"${pedido.instituicao || ''}";"${pedido.curso || ''}";"${pedido.cadeira || ''}";"${pedido.tema || ''}";"${pedido.nome_plano || ''}";"${pedido.preco || 0}";"${pedido.status || ''}";"${pedido.metodo_pagamento || ''}";"${arquivos}"\n`;
        });
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + csv);
        
    } catch (error) {
        res.json({ 
            success: false, 
            erro: error.message 
        });
    }
});

// Rota para servir arquivos uploadados
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ success: false, erro: 'Arquivo não encontrado' });
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
                telefone: usuario.rows[0].telefone,
                tipo: usuario.rows[0].tipo_usuario
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
                telefone: usuario.rows[0].telefone,
                tipo: usuario.rows[0].tipo_usuario
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
            'SELECT id, nome, telefone, data_cadastro, tipo_usuario FROM usuarios WHERE id = $1',
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

// 13. Upload de arquivos pelo usuário
app.post('/api/meus-pedidos/:id/upload', autenticarToken, upload.array('arquivos', 5), async (req, res) => {
    try {
        const pedidoId = req.params.id;
        
        // Verificar se o pedido pertence ao usuário
        const pedido = await pool.query(
            'SELECT id FROM pedidos WHERE id = $1 AND usuario_id = $2',
            [pedidoId, req.usuario.id]
        );
        
        if (pedido.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                erro: 'Pedido não encontrado ou acesso negado' 
            });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                success: false,
                erro: 'Nenhum arquivo enviado' 
            });
        }
        
        // Obter arquivos atuais
        const pedidoInfo = await pool.query('SELECT arquivos FROM pedidos WHERE id = $1', [pedidoId]);
        const arquivosAtuais = pedidoInfo.rows[0].arquivos || [];
        const novosArquivos = req.files.map(file => file.filename);
        const todosArquivos = [...arquivosAtuais, ...novosArquivos];
        
        // Atualizar banco de dados
        await pool.query('UPDATE pedidos SET arquivos = $1 WHERE id = $2', [todosArquivos, pedidoId]);
        
        res.json({ 
            success: true, 
            mensagem: `${req.files.length} arquivo(s) enviado(s) com sucesso`,
            arquivos: novosArquivos
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
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
    console.log('🚀 FACILITAKI - VERSÃO COMPLETA COM PAINEL ADMIN E UPLOAD');
    console.log('='.repeat(60));
    console.log(`📍 URL: https://facilitaki.onrender.com`);
    console.log(`🔧 Porta: ${PORT}`);
    console.log(`💾 Banco: PostgreSQL (Render)`);
    console.log(`📁 Uploads: ${path.join(__dirname, 'uploads')}`);
    console.log(`👨‍💼 Painel Admin: /admin/pedidos?senha=admin2025`);
    console.log(`🛠️  Correções: /api/fix-pedidos`);
    console.log('='.repeat(60));
    console.log('✅ SISTEMA 100% FUNCIONAL:');
    console.log('   ✅ Cadastro de usuários');
    console.log('   ✅ Login com JWT');
    console.log('   ✅ Criação de pedidos');
    console.log('   ✅ Upload de arquivos');
    console.log('   ✅ Armazenamento PostgreSQL');
    console.log('   ✅ Painel administrativo completo');
    console.log('   ✅ Exclusão de pedidos e usuários');
    console.log('   ✅ Gerenciamento de contatos');
    console.log('   ✅ Relatórios e estatísticas');
    console.log('='.repeat(60));
    console.log('🎯 ACESSE AGORA:');
    console.log('   1. https://facilitaki.onrender.com');
    console.log('   2. https://facilitaki.onrender.com/admin/pedidos?senha=admin2025');
    console.log('   3. https://facilitaki.onrender.com/api/debug/db');
    console.log('='.repeat(60));
});


