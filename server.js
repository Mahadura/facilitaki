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

// ===== CONFIGURAÇÃO =====
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki_secret_key_2025';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-cu85gekf0os73f7ubm90-a.oregon-postgres.render.com/facilitaki_db';
const UPLOADS_DIR = process.env.NODE_ENV === 'production' ? '/tmp/uploads' : 'uploads';

// ===== BANCO DE DADOS =====
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===== UPLOADS =====
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'pedido-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif'
        ];
        allowedTypes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Tipo de arquivo não suportado'));
    }
});

// ===== MIDDLEWARES =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: ['https://facilitaki.onrender.com', 'http://localhost:10000', 'http://localhost:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// ===== FUNÇÕES AUXILIARES =====
function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, erro: 'Token de acesso necessário' });
    }
    
    jwt.verify(token, SECRET_KEY, (err, usuario) => {
        if (err) {
            return res.status(403).json({ success: false, erro: 'Token inválido ou expirado' });
        }
        req.usuario = usuario;
        next();
    });
}

async function inicializarBanco() {
    try {
        console.log('🛠️ Inicializando banco de dados...');
        
        // Criar tabela usuarios se não existir
        const usuariosExiste = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'usuarios'
            )
        `);
        
        if (!usuariosExiste.rows[0].exists) {
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
            console.log('✅ Tabela usuarios criada');
        }
        
        // Criar tabela pedidos se não existir
        const pedidosExiste = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'pedidos'
            )
        `);
        
        if (!pedidosExiste.rows[0].exists) {
            await pool.query(`
                CREATE TABLE pedidos (
                    id SERIAL PRIMARY KEY,
                    usuario_id INTEGER REFERENCES usuarios(id),
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
            console.log('✅ Tabela pedidos criada');
        }
        
        // Criar tabela contatos se não existir
        const contatosExiste = await pool.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'contatos'
            )
        `);
        
        if (!contatosExiste.rows[0].exists) {
            await pool.query(`
                CREATE TABLE contatos (
                    id SERIAL PRIMARY KEY,
                    nome VARCHAR(100) NOT NULL,
                    telefone VARCHAR(20) NOT NULL,
                    email VARCHAR(100),
                    mensagem TEXT NOT NULL,
                    data_contato TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    respondido BOOLEAN DEFAULT FALSE
                )
            `);
            console.log('✅ Tabela contatos criada');
        }
        
        console.log('✅ Banco de dados pronto');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco:', error.message);
    }
}

function formatarTamanho(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ===== ROTAS PÚBLICAS =====
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'Facilitaki API' }));

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

// ===== AUTENTICAÇÃO =====
app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        
        if (!nome || !telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        const existe = await pool.query(
            'SELECT id FROM usuarios WHERE telefone = $1',
            [telefoneLimpo]
        );
        
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        }
        
        const senhaHash = await bcrypt.hash(senha, 10);
        
        const usuario = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefoneLimpo, senhaHash]
        );
        
        const token = jwt.sign(
            { id: usuario.rows[0].id, nome, telefone: telefoneLimpo },
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
        res.status(500).json({ success: false, erro: 'Erro: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        
        if (!telefone || !senha) {
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        const usuario = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1',
            [telefoneLimpo]
        );
        
        if (usuario.rows.length === 0) {
            return res.status(401).json({ success: false, erro: 'Telefone ou senha incorretos' });
        }
        
        if (!usuario.rows[0].ativo) {
            return res.status(401).json({ success: false, erro: 'Conta desativada' });
        }
        
        const senhaValida = await bcrypt.compare(senha, usuario.rows[0].senha);
        
        if (!senhaValida) {
            return res.status(401).json({ success: false, erro: 'Telefone ou senha incorretos' });
        }
        
        const token = jwt.sign(
            { id: usuario.rows[0].id, nome: usuario.rows[0].nome, telefone: usuario.rows[0].telefone },
            SECRET_KEY,
            { expiresIn: '30d' }
        );
        
        res.json({
            success: true,
            mensagem: 'Login realizado!',
            token: token,
            usuario: { id: usuario.rows[0].id, nome: usuario.rows[0].nome, telefone: usuario.rows[0].telefone }
        });
        
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro: ' + error.message });
    }
});

// ===== ROTAS PROTEGIDAS =====
app.get('/api/verificar-token', autenticarToken, (req, res) => {
    res.json({ success: true, valido: true, usuario: req.usuario });
});

app.get('/api/usuario', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, nome, telefone, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        
        res.json({ success: true, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/logout', autenticarToken, (req, res) => {
    res.json({ success: true, mensagem: 'Logout realizado' });
});

// ===== PEDIDOS =====
app.post('/api/pedidos', autenticarToken, async (req, res) => {
    try {
        const { cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        if (!cliente || !telefone || !plano || !preco) {
            return res.status(400).json({ success: false, erro: 'Preencha: cliente, telefone, plano e preço' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const precoNum = parseFloat(preco);
        
        const pedido = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING id, cliente, plano, preco, status, data_pedido`,
            [req.usuario.id, cliente, telefoneLimpo, instituicao || null, curso || null, cadeira || null, tema || null, descricao || null, prazo || null, plano, nomePlano || plano, precoNum, metodoPagamento || 'mpesa']
        );
        
        res.json({ success: true, mensagem: 'Pedido criado!', pedido: pedido.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro: ' + error.message });
    }
});

app.get('/api/meus-pedidos', autenticarToken, async (req, res) => {
    try {
        const pedidos = await pool.query(
            'SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC',
            [req.usuario.id]
        );
        
        res.json({ success: true, pedidos: pedidos.rows, total: pedidos.rows.length });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ===== UPLOAD COM ARQUIVO =====
app.post('/api/pedidos/upload-completo', autenticarToken, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        if (!cliente || !telefone || !plano || !preco || !metodoPagamento) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ success: false, erro: 'Preencha todos os campos obrigatórios' });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, erro: 'Arquivo é obrigatório' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        const precoNum = parseFloat(preco);
        
        const pedido = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, instituicao, curso, cadeira, tema, descricao, prazo, plano, nome_plano, preco, metodo_pagamento, arquivo_nome, arquivo_caminho, arquivo_tamanho, arquivo_tipo, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
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
        
        res.json({
            success: true,
            mensagem: 'Pedido criado com arquivo!',
            pedido: pedido.rows[0],
            arquivo: { nome: req.file.originalname, tamanho: req.file.size, tipo: req.file.mimetype },
            instrucao: 'Após pagamento, envie comprovativo para WhatsApp: 86 728 6665'
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ success: false, erro: 'Erro: ' + error.message });
    }
});

// ===== DOWNLOAD DE ARQUIVOS =====
app.get('/api/pedidos/download/:pedidoId', autenticarToken, async (req, res) => {
    try {
        const { pedidoId } = req.params;
        
        const resultado = await pool.query(
            'SELECT arquivo_nome, arquivo_caminho FROM pedidos WHERE id = $1 AND usuario_id = $2',
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

// ===== CONTATO =====
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, email, mensagem } = req.body;
        
        if (!nome || !telefone || !mensagem) {
            return res.status(400).json({ success: false, erro: 'Preencha: nome, telefone e mensagem' });
        }
        
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        await pool.query(
            'INSERT INTO contatos (nome, telefone, email, mensagem) VALUES ($1, $2, $3, $4)',
            [nome, telefoneLimpo, email || null, mensagem]
        );
        
        res.json({ success: true, mensagem: 'Mensagem enviada!' });
    } catch (error) {
        res.status(500).json({ success: false, erro: 'Erro: ' + error.message });
    }
});

// ===== ADMIN - COMPLETO =====
// Painel principal admin
app.get('/admin/pedidos', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html><head><title>Acesso Negado</title>
            <style>body{font-family:Arial;padding:50px;text-align:center;}</style>
            </head><body>
                <h1>🔒 Acesso Negado</h1>
                <p>Use: ?senha=admin2025</p>
                <a href="/admin/pedidos?senha=admin2025">Tentar com senha correta</a>
            </body></html>
        `);
    }
    
    try {
        const pedidos = await pool.query(`
            SELECT p.*, u.nome as usuario_nome 
            FROM pedidos p LEFT JOIN usuarios u ON p.usuario_id = u.id 
            ORDER BY p.data_pedido DESC
        `);
        
        const totais = await pool.query(`
            SELECT COUNT(*) as total, SUM(preco) as valor_total 
            FROM pedidos
        `);
        
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Facilitaki</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial; margin: 20px; background: #f5f5f5; }
                    .container { background: white; padding: 20px; border-radius: 10px; }
                    h1 { color: #1e40af; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
                    th { background: #f1f5f9; }
                    .stats { background: #f8fafc; padding: 15px; border-radius: 5px; margin: 20px 0; }
                    .badge { padding: 5px 10px; border-radius: 3px; font-size: 12px; }
                    .badge.pendente { background: #fef3c7; color: #92400e; }
                    .badge.pago { background: #d1fae5; color: #065f46; }
                    .badge.concluido { background: #ede9fe; color: #5b21b6; }
                    .btn { padding: 5px 10px; background: #3b82f6; color: white; border: none; border-radius: 3px; cursor: pointer; margin: 2px; }
                    .btn-danger { background: #ef4444; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📊 Painel Administrativo - Facilitaki</h1>
                    
                    <div class="stats">
                        <h3>📈 Estatísticas</h3>
                        <p><strong>Total de Pedidos:</strong> ${totais.rows[0]?.total || 0}</p>
                        <p><strong>Valor Total:</strong> ${(totais.rows[0]?.valor_total || 0).toLocaleString('pt-MZ')} MT</p>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Data</th>
                                <th>Cliente</th>
                                <th>Telefone</th>
                                <th>Serviço</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>`;
        
        pedidos.rows.forEach(p => {
            const dataPedido = new Date(p.data_pedido);
            const statusClass = p.status ? p.status.toLowerCase().replace(' ', '-') : 'pendente';
            
            html += `
                <tr>
                    <td>#${p.id}</td>
                    <td>${dataPedido.toLocaleDateString('pt-MZ')}</td>
                    <td>${p.cliente || 'N/A'}</td>
                    <td>${p.telefone || 'N/A'}</td>
                    <td>${p.nome_plano || p.plano || 'Serviço'}</td>
                    <td>${p.preco ? p.preco.toLocaleString('pt-MZ') : '0'} MT</td>
                    <td><span class="badge ${statusClass}">${p.status || 'pendente'}</span></td>
                    <td>
                        <button class="btn" onclick="mudarStatus(${p.id})">Status</button>
                        ${p.arquivo_nome ? `<button class="btn" onclick="baixarArquivo(${p.id})">Baixar</button>` : ''}
                        <button class="btn btn-danger" onclick="excluirPedido(${p.id})">Excluir</button>
                    </td>
                </tr>`;
        });
        
        html += `
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 30px;">
                        <h3>🔧 Ações Rápidas</h3>
                        <button class="btn" onclick="window.location.href='/api/admin/todos-usuarios?senha=admin2025'">Ver Usuários</button>
                        <button class="btn" onclick="window.location.href='/api/admin/todos-contatos?senha=admin2025'">Ver Contatos</button>
                    </div>
                </div>
                
                <script>
                    function mudarStatus(id) {
                        const novoStatus = prompt('Novo status para pedido #' + id + ' (pendente/pago/concluido/cancelado):');
                        if (novoStatus) {
                            fetch('/api/admin/atualizar-status?senha=admin2025&pedido=' + id + '&status=' + encodeURIComponent(novoStatus))
                                .then(r => r.json())
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
                    
                    function baixarArquivo(id) {
                        window.open('/api/admin/download-arquivo?senha=admin2025&pedido=' + id, '_blank');
                    }
                    
                    function excluirPedido(id) {
                        if (confirm('Excluir pedido #' + id + '?')) {
                            fetch('/api/admin/excluir-pedido?senha=admin2025&pedido=' + id)
                                .then(r => r.json())
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
        res.status(500).send('Erro: ' + error.message);
    }
});

// API Admin - Download arquivo
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
        
        if (resultado.rows.length === 0 || !resultado.rows[0].arquivo_caminho) {
            return res.status(404).json({ success: false, erro: 'Arquivo não encontrado' });
        }
        
        const arquivo = resultado.rows[0];
        res.download(arquivo.arquivo_caminho, arquivo.arquivo_nome);
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// API Admin - Atualizar status
app.get('/api/admin/atualizar-status', async (req, res) => {
    const { senha, pedido, status } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [status, pedido]);
        res.json({ success: true, mensagem: 'Status atualizado' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// API Admin - Excluir pedido
app.get('/api/admin/excluir-pedido', async (req, res) => {
    const { senha, pedido } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const resultado = await pool.query('SELECT arquivo_caminho FROM pedidos WHERE id = $1', [pedido]);
        
        if (resultado.rows.length > 0 && resultado.rows[0].arquivo_caminho) {
            const caminho = resultado.rows[0].arquivo_caminho;
            if (fs.existsSync(caminho)) {
                fs.unlinkSync(caminho);
            }
        }
        
        await pool.query('DELETE FROM pedidos WHERE id = $1', [pedido]);
        res.json({ success: true, mensagem: 'Pedido excluído' });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// API Admin - Ver todos usuários
app.get('/api/admin/todos-usuarios', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const usuarios = await pool.query('SELECT * FROM usuarios ORDER BY data_cadastro DESC');
        res.json({ success: true, usuarios: usuarios.rows });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// API Admin - Ver todos contatos
app.get('/api/admin/todos-contatos', async (req, res) => {
    const { senha } = req.query;
    
    if (senha !== 'admin2025') {
        return res.json({ success: false, erro: 'Acesso negado' });
    }
    
    try {
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_contato DESC');
        res.json({ success: true, contatos: contatos.rows });
    } catch (error) {
        res.json({ success: false, erro: error.message });
    }
});

// ===== TRATAMENTO DE ERROS =====
app.use((err, req, res, next) => {
    console.error('❌ Erro:', err.message);
    res.status(500).json({ success: false, erro: 'Erro interno do servidor' });
});

app.use('*', (req, res) => {
    res.status(404).json({ success: false, erro: 'Rota não encontrada' });
});

// ===== INICIAR SERVIDOR =====
const startServer = async () => {
    try {
        await pool.query('SELECT 1');
        console.log('✅ Conexão com banco de dados estabelecida');
        
        await inicializarBanco();
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
    ╔═══════════════════════════════════════╗
    ║       FACILITAKI - VERSÃO 8.0         ║
    ║         100% FUNCIONAL                ║
    ╚═══════════════════════════════════════╝
    📍 Porta: ${PORT}
    🌐 Ambiente: ${process.env.NODE_ENV || 'development'}
    ✅ Status: ONLINE
    💾 Banco: PostgreSQL - CONECTADO
    📁 Uploads: ${UPLOADS_DIR}
    👨‍💼 Admin: /admin/pedidos?senha=admin2025
    🚀 API: Pronta para uso
            `);
        });
    } catch (error) {
        console.error('❌ Falha ao conectar ao banco de dados:', error.message);
        console.log('⚠️  Servidor iniciando sem banco de dados...');
        
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor rodando na porta ${PORT} (sem banco)`);
        });
    }
};

startServer();
