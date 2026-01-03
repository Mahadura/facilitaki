const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Configurar uploads
const UPLOADS_DIR = 'uploads';
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'pedido-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
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
            cb(new Error('Tipo de arquivo não suportado. Use PDF, DOC, DOCX, TXT, JPG, PNG.'));
        }
    }
});

// Middlewares essenciais
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: ['https://facilitaki.onrender.com', 'http://localhost:10000', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Servir arquivos estáticos
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// ===== CONFIGURAÇÃO DO BANCO DE DADOS RENDER =====
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-cu85gekf0os73f7ubm90-a.oregon-postgres.render.com/facilitaki_db';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===== FUNÇÃO PARA CORRIGIR TABELA USUARIOS =====
async function corrigirTabelaUsuarios() {
    try {
        console.log('🛠️  Verificando tabela usuarios...');
        
        const existe = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'usuarios'
            ) as existe
        `);
        
        if (!existe.rows[0].existe) {
            console.log('📦 Criando tabela usuarios completa...');
            await pool.query(`
                CREATE TABLE usuarios (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL,
                    telefone VARCHAR(20) UNIQUE NOT NULL,
                    senha VARCHAR(255) NOT NULL,
                    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ativo BOOLEAN DEFAULT TRUE,
                    tipo_usuario VARCHAR(20) DEFAULT 'cliente'
                )
            `);
            console.log('✅ Tabela usuarios criada!');
            return true;
        }
        
        const colunas = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'usuarios'
        `);
        
        const colunasExistentes = colunas.rows.map(c => c.column_name);
        
        if (!colunasExistentes.includes('tipo_usuario')) {
            console.log('➕ Adicionando coluna tipo_usuario...');
            await pool.query(`ALTER TABLE usuarios ADD COLUMN tipo_usuario VARCHAR(20) DEFAULT 'cliente'`);
            console.log('✅ Coluna tipo_usuario adicionada!');
            return true;
        }
        
        console.log('✅ Tabela usuarios já está correta');
        return false;
        
    } catch (error) {
        console.error('❌ Erro ao corrigir tabela usuarios:', error.message);
        return false;
    }
}

// ===== FUNÇÃO PARA CORRIGIR TABELA PEDIDOS =====
async function corrigirTabelaPedidos() {
    try {
        console.log('🛠️  Verificando tabela pedidos...');
        
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
                    arquivo_nome VARCHAR(255),
                    arquivo_caminho VARCHAR(500),
                    arquivo_tamanho INTEGER,
                    arquivo_tipo VARCHAR(100),
                    observacoes_admin TEXT
                )
            `);
            console.log('✅ Tabela pedidos criada!');
            return true;
        }
        
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
            'arquivo_nome', 'arquivo_caminho', 'arquivo_tamanho', 'arquivo_tipo', 'observacoes_admin'
        ];
        
        let corrigido = false;
        
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
                if (coluna === 'arquivo_nome') tipo = 'VARCHAR(255)';
                if (coluna === 'arquivo_caminho') tipo = 'VARCHAR(500)';
                if (coluna === 'arquivo_tamanho') tipo = 'INTEGER';
                if (coluna === 'arquivo_tipo') tipo = 'VARCHAR(100)';
                if (coluna === 'observacoes_admin') tipo = 'TEXT';
                
                await pool.query(`ALTER TABLE pedidos ADD COLUMN ${coluna} ${tipo}`);
                
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
        
        await corrigirTabelaUsuarios();
        await corrigirTabelaPedidos();
        
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
app.get('/status', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW() as hora');
        res.json({
            success: true,
            mensagem: 'Facilitaki Online',
            hora: dbTest.rows[0].hora,
            versao: '8.0',
            painel_admin: '/admin/pedidos?senha=admin2025'
        });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== ROTA PARA UPLOAD DE ARQUIVO REAL =====
app.post('/api/pedidos/upload-completo', autenticarToken, upload.single('arquivo'), async (req, res) => {
    try {
        console.log('📤 Recebendo pedido completo com arquivo...');
        
        const {
            cliente, telefone, instituicao, curso, cadeira,
            tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento
        } = req.body;
        
        if (!cliente || !telefone || !plano || !preco || !metodoPagamento) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ 
                success: false,
                erro: 'Preencha: cliente, telefone, plano, preço e método de pagamento'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                erro: 'Arquivo é obrigatório' 
            });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const precoNum = parseFloat(preco);
        
        // Inserir pedido com arquivo
        const pedido = await pool.query(
            `INSERT INTO pedidos (
                usuario_id, cliente, telefone, instituicao, curso, cadeira, 
                tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento,
                arquivo_nome, arquivo_caminho, arquivo_tamanho, arquivo_tipo, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING id, cliente, plano, preco, status, data_pedido, arquivo_nome`,
            [
                req.usuario.id,
                cliente,
                telefoneLimpo,
                instituicao || 'Não informada',
                curso || 'Não informado',
                cadeira || 'Não informada',
                tema || 'Serviço solicitado via modal',
                descricao || '',
                prazo || null,
                plano,
                nomePlano || plano,
                precoNum,
                metodoPagamento,
                req.file.originalname,
                req.file.path,
                req.file.size,
                req.file.mimetype,
                'pendente'
            ]
        );
        
        console.log('✅ Pedido criado com arquivo! ID:', pedido.rows[0].id);
        
        res.json({
            success: true,
            mensagem: 'Pedido criado com arquivo!',
            pedido: pedido.rows[0],
            arquivo: {
                nome: req.file.originalname,
                tamanho: req.file.size,
                tipo: req.file.mimetype
            },
            instrucao: 'Após pagamento, envie comprovativo para WhatsApp: 86 728 6665'
        });
        
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('❌ Erro ao criar pedido com arquivo:', error.message);
        res.status(500).json({ 
            success: false,
            erro: 'Erro: ' + error.message 
        });
    }
});

// ===== ROTA PARA BAIXAR ARQUIVO (USUÁRIO) =====
app.get('/api/pedidos/download/:pedidoId', autenticarToken, async (req, res) => {
    try {
        const { pedidoId } = req.params;
        
        const resultado = await pool.query(
            'SELECT arquivo_nome, arquivo_caminho, arquivo_tipo FROM pedidos WHERE id = $1 AND usuario_id = $2',
            [pedidoId, req.usuario.id]
        );
        
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const arquivo = resultado.rows[0];
        
        if (!arquivo.arquivo_caminho || !fs.existsSync(arquivo.arquivo_caminho)) {
            return res.status(404).json({ success: false, erro: 'Arquivo não encontrado' });
        }
        
        res.download(arquivo.arquivo_caminho, arquivo.arquivo_nome);
        
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== ROTA ADMIN - BAIXAR ARQUIVO =====
app.get('/api/admin/download-arquivo', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.status(401).json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            'SELECT arquivo_nome, arquivo_caminho FROM pedidos WHERE id = $1',
            [pedido]
        );
        
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const arquivo = resultado.rows[0];
        
        if (!arquivo.arquivo_caminho || !fs.existsSync(arquivo.arquivo_caminho)) {
            return res.status(404).json({ success: false, erro: 'Arquivo físico não encontrado' });
        }
        
        res.download(arquivo.arquivo_caminho, arquivo.arquivo_nome);
        
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== ROTA ADMIN - VISUALIZAR ARQUIVO =====
app.get('/api/admin/visualizar-arquivo', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.status(401).json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query(
            'SELECT arquivo_nome, arquivo_caminho, arquivo_tipo FROM pedidos WHERE id = $1',
            [pedido]
        );
        
        if (resultado.rows.length === 0) {
            return res.status(404).json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const arquivo = resultado.rows[0];
        
        if (!arquivo.arquivo_caminho || !fs.existsSync(arquivo.arquivo_caminho)) {
            return res.status(404).json({ success: false, erro: 'Arquivo físico não encontrado' });
        }
        
        // Determinar tipo de conteúdo
        let contentType = 'application/octet-stream';
        if (arquivo.arquivo_tipo) {
            contentType = arquivo.arquivo_tipo;
        } else if (arquivo.arquivo_nome) {
            const ext = path.extname(arquivo.arquivo_nome).toLowerCase();
            if (ext === '.pdf') contentType = 'application/pdf';
            if (ext === '.doc') contentType = 'application/msword';
            if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            if (ext === '.txt') contentType = 'text/plain';
            if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            if (ext === '.png') contentType = 'image/png';
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${arquivo.arquivo_nome}"`);
        
        const fileStream = fs.createReadStream(arquivo.arquivo_caminho);
        fileStream.pipe(res);
        
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== ROTA ADMIN - EXCLUIR APENAS ARQUIVO =====
app.get('/api/admin/excluir-arquivo', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        // Buscar informações do arquivo
        const resultado = await pool.query(
            'SELECT arquivo_caminho FROM pedidos WHERE id = $1', 
            [pedido]
        );
        
        if (resultado.rows.length === 0) {
            return res.json({ success: false, erro: 'Pedido não encontrado' });
        }
        
        const caminhoArquivo = resultado.rows[0].arquivo_caminho;
        
        if (caminhoArquivo && fs.existsSync(caminhoArquivo)) {
            // Excluir arquivo físico
            fs.unlinkSync(caminhoArquivo);
            console.log('🗑️  Arquivo excluído:', caminhoArquivo);
        }
        
        // Limpar campos do arquivo no banco
        await pool.query(
            `UPDATE pedidos SET 
                arquivo_nome = NULL,
                arquivo_caminho = NULL,
                arquivo_tamanho = NULL,
                arquivo_tipo = NULL
            WHERE id = $1`,
            [pedido]
        );
        
        res.json({ 
            success: true, 
            mensagem: 'Arquivo excluído (pedido mantido)' 
        });
        
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// ===== ROTA ADMIN - VER TODOS PEDIDOS (ATUALIZADA) =====
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
                u.telefone as usuario_telefone
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);
        
        // Calcular totais
        const totais = await pool.query(`
            SELECT 
                COUNT(*) as total_pedidos,
                SUM(preco) as valor_total,
                AVG(preco) as media_valor,
                COUNT(CASE WHEN arquivo_nome IS NOT NULL THEN 1 END) as total_com_arquivos
            FROM pedidos
        `);
        
        // Gerar HTML
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Facilitaki - Gestão de Arquivos</title>
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
                        max-width: 1400px;
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
                    
                    .stats {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                        gap: 15px;
                        padding: 20px;
                        background: #f8fafc;
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
                        vertical-align: middle;
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
                        text-align: center;
                    }
                    
                    .btn:hover { background: #2563eb; }
                    .btn-danger { background: #ef4444; }
                    .btn-danger:hover { background: #dc2626; }
                    .btn-warning { background: #f59e0b; }
                    .btn-warning:hover { background: #d97706; }
                    .btn-success { background: #10b981; }
                    .btn-success:hover { background: #059669; }
                    .btn-info { background: #06b6d4; }
                    .btn-info:hover { background: #0891b2; }
                    .btn-file { background: #8b5cf6; }
                    .btn-file:hover { background: #7c3aed; }
                    
                    .arquivo-actions {
                        display: flex;
                        gap: 5px;
                        flex-wrap: wrap;
                    }
                    
                    .file-preview {
                        background: #f8fafc;
                        border: 1px solid #e5e7eb;
                        border-radius: 6px;
                        padding: 10px;
                        margin: 5px 0;
                        font-size: 12px;
                    }
                    
                    .file-preview .file-name {
                        font-weight: bold;
                        color: #1e40af;
                        margin-bottom: 3px;
                        word-break: break-all;
                    }
                    
                    .file-preview .file-details {
                        color: #6b7280;
                        display: flex;
                        flex-wrap: wrap;
                        gap: 10px;
                    }
                    
                    .file-preview .file-details span {
                        display: flex;
                        align-items: center;
                        gap: 3px;
                    }
                    
                    .search-box {
                        margin: 20px;
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
                    
                    @media (max-width: 768px) {
                        .header { padding: 15px; }
                        .header h1 { font-size: 20px; }
                        table { font-size: 12px; }
                        th, td { padding: 8px; }
                        .arquivo-actions { flex-direction: column; }
                        .btn { width: 100%; margin: 2px 0; }
                    }
                </style>
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1><i class="fas fa-file-alt"></i> Painel Administrativo - Gestão de Arquivos</h1>
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
                            <div class="stat-label">Com Arquivos</div>
                            <div class="stat-value">${totais.rows[0]?.total_com_arquivos || 0}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Valor Médio</div>
                            <div class="stat-value">${Math.round(totais.rows[0]?.media_valor || 0).toLocaleString('pt-MZ')} MT</div>
                        </div>
                    </div>
                    
                    <div class="search-box">
                        <input type="text" id="buscarPedido" placeholder="Buscar por cliente, telefone, serviço..." onkeyup="buscarPedidos()">
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table id="tabelaPedidos">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Data</th>
                                    <th>Cliente</th>
                                    <th>Serviço</th>
                                    <th>Valor</th>
                                    <th>Status</th>
                                    <th>Arquivo</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>`;
        
        // Função para formatar tamanho
        function formatarTamanho(bytes) {
            if (!bytes) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // Adicionar cada pedido à tabela
        pedidos.rows.forEach(pedido => {
            const dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido) : new Date();
            const statusClass = pedido.status ? pedido.status.toLowerCase().replace(' ', '-') : 'pendente';
            const temArquivo = pedido.arquivo_nome && pedido.arquivo_caminho;
            
            html += `
                <tr>
                    <td><strong>#${pedido.id}</strong></td>
                    <td>${dataPedido.toLocaleDateString('pt-MZ')}<br>
                        <small>${dataPedido.toLocaleTimeString('pt-MZ')}</small>
                    </td>
                    <td>
                        <strong>${pedido.cliente || 'Não informado'}</strong><br>
                        <small>${pedido.telefone || 'Não informado'}</small>
                        ${pedido.usuario_nome ? `<br><small><i class="fas fa-user"></i> ${pedido.usuario_nome}</small>` : ''}
                    </td>
                    <td>${pedido.nome_plano || pedido.plano || 'Serviço'}</td>
                    <td><strong>${pedido.preco ? pedido.preco.toLocaleString('pt-MZ') : '0'} MT</strong></td>
                    <td><span class="badge ${statusClass}">${pedido.status || 'pendente'}</span></td>
                    <td>
                        ${temArquivo ? 
                            `<div class="file-preview">
                                <div class="file-name">
                                    <i class="fas fa-file"></i> ${pedido.arquivo_nome}
                                </div>
                                <div class="file-details">
                                    <span><i class="fas fa-hdd"></i> ${formatarTamanho(pedido.arquivo_tamanho)}</span>
                                    <span><i class="fas fa-file-alt"></i> ${pedido.arquivo_tipo || 'Tipo desconhecido'}</span>
                                </div>
                            </div>` 
                            : '<span style="color: #9ca3af; font-style: italic;">Sem arquivo</span>'
                        }
                    </td>
                    <td>
                        <div class="arquivo-actions">
                            ${temArquivo ? 
                                `<button onclick="visualizarArquivo(${pedido.id})" class="btn btn-file" title="Visualizar no navegador">
                                    <i class="fas fa-eye"></i> Visualizar
                                </button>
                                <button onclick="baixarArquivo(${pedido.id})" class="btn btn-success" title="Baixar arquivo">
                                    <i class="fas fa-download"></i> Baixar
                                </button>
                                <button onclick="excluirArquivo(${pedido.id})" class="btn btn-danger" title="Excluir apenas o arquivo">
                                    <i class="fas fa-trash"></i> Arquivo
                                </button>` 
                                : ''
                            }
                            <button onclick="mudarStatus(${pedido.id})" class="btn btn-warning" title="Alterar status">
                                <i class="fas fa-edit"></i> Status
                            </button>
                            <button onclick="excluirPedido(${pedido.id})" class="btn btn-danger" title="Excluir pedido completo">
                                <i class="fas fa-trash-alt"></i> Pedido
                            </button>
                        </div>
                    </td>
                </tr>`;
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                    
                    ${pedidos.rows.length === 0 ? 
                        '<div style="text-align: center; padding: 40px; color: #6b7280;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 20px;"></i><h3>Nenhum pedido encontrado</h3></div>' : 
                        ''
                    }
                    
                    <div style="padding: 20px; background: #f8fafc; border-top: 1px solid #e5e7eb;">
                        <h3><i class="fas fa-info-circle"></i> Instruções:</h3>
                        <ul style="color: #6b7280; margin-top: 10px;">
                            <li><strong>Visualizar:</strong> Abre o arquivo diretamente no navegador (PDF, imagens, texto)</li>
                            <li><strong>Baixar:</strong> Faz download do arquivo original para seu computador</li>
                            <li><strong>Arquivo (lixeira):</strong> Exclui apenas o arquivo, mantendo o pedido</li>
                            <li><strong>Pedido (lixeira):</strong> Exclui o pedido completo com seu arquivo</li>
                            <li>Os arquivos são armazenados fisicamente na pasta /uploads do servidor</li>
                        </ul>
                    </div>
                </div>
                
                <script>
                    function formatarTamanho(bytes) {
                        if (!bytes) return '0 Bytes';
                        const k = 1024;
                        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
                    
                    function visualizarArquivo(pedidoId) {
                        window.open('/api/admin/visualizar-arquivo?senha=admin2025&pedido=' + pedidoId, '_blank');
                    }
                    
                    function baixarArquivo(pedidoId) {
                        window.open('/api/admin/download-arquivo?senha=admin2025&pedido=' + pedidoId, '_blank');
                    }
                    
                    function excluirArquivo(pedidoId) {
                        if (confirm('Excluir apenas o arquivo deste pedido?\\n\\nO pedido permanecerá no sistema.')) {
                            fetch('/api/admin/excluir-arquivo?senha=admin2025&pedido=' + pedidoId)
                                .then(response => response.json())
                                .then(data => {
                                    if (data.success) {
                                        alert('Arquivo excluído!');
                                        location.reload();
                                    } else {
                                        alert('Erro: ' + data.erro);
                                    }
                                });
                        }
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
                        if (confirm('🚨 ATENÇÃO!\\n\\nExcluir pedido #' + id + ' e seu arquivo?\\n\\nEsta ação NÃO pode ser desfeita.')) {
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
                </script>
            </body>
            </html>`;
        
        res.send(html);
        
    } catch (error) {
        console.error('❌ Erro no admin:', error);
        res.status(500).send(`Erro: ${error.message}`);
    }
});

// ===== ROTA ADMIN - EXCLUIR PEDIDO COM ARQUIVO =====
app.get('/api/admin/excluir-pedido', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        // Buscar informações do arquivo
        const resultado = await pool.query('SELECT arquivo_caminho FROM pedidos WHERE id = $1', [pedido]);
        
        if (resultado.rows.length > 0 && resultado.rows[0].arquivo_caminho) {
            const caminhoArquivo = resultado.rows[0].arquivo_caminho;
            // Excluir arquivo físico
            if (fs.existsSync(caminhoArquivo)) {
                fs.unlinkSync(caminhoArquivo);
                console.log('🗑️  Arquivo excluído:', caminhoArquivo);
            }
        }
        
        // Excluir do banco
        await pool.query('DELETE FROM pedidos WHERE id = $1', [pedido]);
        
        res.json({ success: true, mensagem: 'Pedido e arquivo excluídos' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// ===== ROTAS EXISTENTES =====

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

// Criar pedido (rota original sem upload)
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
    ║       FACILITAKI - VERSÃO 8.0         ║
    ║       COM UPLOAD REAL DE ARQUIVOS     ║
    ╚═══════════════════════════════════════╝
    📍 Porta: ${PORT}
    🌐 URL: https://facilitaki.onrender.com
    🚀 Versão: 8.0 - Upload real de arquivos
    ✅ Status: ONLINE
    💾 Banco: PostgreSQL (Render) - CONECTADO
    📁 Uploads: Pasta /uploads criada
    👨‍💼 Admin: /admin/pedidos?senha=admin2025
    📤 Sistema: Pronto para upload de arquivos reais!
    `);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
