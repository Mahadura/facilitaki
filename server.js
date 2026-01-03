// server.js - Backend simplificado e funcional para Facilitaki
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
    limits: { fileSize: 10 * 1024 * 1024 },
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
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));
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
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
};

// Inicializar banco de dados
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Banco de dados inicializado!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
    }
}

// ===== ROTAS PÚBLICAS =====

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota de status
app.get('/status', (req, res) => {
    res.json({
        status: 'online',
        message: 'Facilitaki API está funcionando',
        timestamp: new Date().toISOString()
    });
});

// Rota de login
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;

        const result = await pool.query(
            'SELECT * FROM usuarios WHERE telefone = $1',
            [telefone]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                erro: 'Telefone ou senha incorretos'
            });
        }

        const usuario = result.rows[0];
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        
        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                erro: 'Telefone ou senha incorretos'
            });
        }

        const token = jwt.sign(
            { id: usuario.id, telefone: usuario.telefone, nome: usuario.nome },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

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
        console.error('Erro no login:', error);
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

        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefone, senhaHash]
        );

        const novoUsuario = result.rows[0];
        const token = jwt.sign(
            { id: novoUsuario.id, telefone: novoUsuario.telefone, nome: novoUsuario.nome },
            SECRET_KEY,
            { expiresIn: '7d' }
        );

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
        console.error('Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro interno do servidor'
        });
    }
});

// Rota de contato
app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;

        await pool.query(
            'INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)',
            [nome, telefone, mensagem]
        );

        res.json({
            success: true,
            mensagem: 'Mensagem enviada com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao salvar contato:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao enviar mensagem'
        });
    }
});

// ===== ROTAS PROTEGIDAS =====

// Rota de logout
app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true, mensagem: 'Logout realizado com sucesso' });
});

// Rota para criar pedido
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

        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao criar pedido:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao criar pedido'
        });
    }
});

// Rota para criar pedido com arquivo
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

        let arquivoPath = null;
        if (req.file) {
            arquivoPath = req.file.path;
        }

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

        res.json({
            success: true,
            mensagem: 'Pedido criado com sucesso!',
            pedido: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao criar pedido com arquivo:', error);
        res.status(500).json({
            success: false,
            erro: error.message || 'Erro ao criar pedido'
        });
    }
});

// Rota para buscar pedidos do usuário
app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM pedidos 
             WHERE usuario_id = $1 
             ORDER BY data_pedido DESC`,
            [req.user.id]
        );

        res.json({
            success: true,
            pedidos: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar pedidos:', error);
        res.status(500).json({
            success: false,
            erro: 'Erro ao buscar pedidos'
        });
    }
});

// ===== PAINEL ADMINISTRATIVO =====

// Middleware de autenticação admin
const authenticateAdmin = (req, res, next) => {
    const senha = req.query.senha;
    if (senha === 'admin2025') {
        next();
    } else {
        res.status(401).send('Acesso não autorizado. Senha incorreta.');
    }
};

// Página principal do admin
app.get('/admin/pedidos', authenticateAdmin, async (req, res) => {
    try {
        const pedidosResult = await pool.query(`
            SELECT p.*, u.nome as usuario_nome, u.telefone as usuario_telefone
            FROM pedidos p
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            ORDER BY p.data_pedido DESC
        `);

        const contatosResult = await pool.query(`
            SELECT * FROM contatos ORDER BY data_envio DESC
        `);

        const usuariosResult = await pool.query(`
            SELECT id, nome, telefone, created_at, 
                   (SELECT COUNT(*) FROM pedidos WHERE usuario_id = usuarios.id) as total_pedidos
            FROM usuarios 
            ORDER BY created_at DESC
        `);

        // HTML simples para o painel admin
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Painel Admin - Facilitaki</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .container { max-width: 1400px; margin: 0 auto; }
                header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                .stat-card { background: white; padding: 20px; border-radius: 5px; flex: 1; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .stat-number { font-size: 24px; font-weight: bold; color: #3498db; }
                .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
                .tab { padding: 10px 20px; background: #ecf0f1; border: none; border-radius: 5px; cursor: pointer; }
                .tab.active { background: #3498db; color: white; }
                .tab-content { display: none; background: white; padding: 20px; border-radius: 5px; }
                .tab-content.active { display: block; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background: #f8f9fa; }
                .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
                .status-pendente { background: #fef3c7; color: #92400e; }
                .status-pago { background: #d1fae5; color: #065f46; }
                .status-em_andamento { background: #dbeafe; color: #1e40af; }
                .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; margin: 2px; }
                .btn-view { background: #3498db; color: white; }
                .btn-delete { background: #e74c3c; color: white; }
                .btn-update { background: #2ecc71; color: white; }
                .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
                .modal-content { background: white; padding: 20px; border-radius: 5px; max-width: 600px; width: 90%; }
            </style>
        </head>
        <body>
            <div class="container">
                <header>
                    <h1><i class="fas fa-cogs"></i> Painel Administrativo - Facilitaki</h1>
                    <p>Total de pedidos: ${pedidosResult.rows.length} | Usuários: ${usuariosResult.rows.length}</p>
                </header>

                <div class="stats">
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
        `;

        // Adicionar pedidos
        pedidosResult.rows.forEach(pedido => {
            const arquivoLink = pedido.arquivo_path ? 
                `<a href="/${pedido.arquivo_path}" target="_blank" style="color: #3498db;">Ver arquivo</a>` : 
                '-';
            
            html += `
                <tr>
                    <td>${pedido.id}</td>
                    <td>${pedido.cliente}<br><small>${pedido.telefone}</small></td>
                    <td>${pedido.nome_plano}</td>
                    <td>${parseFloat(pedido.preco).toLocaleString('pt-MZ')} MT</td>
                    <td><span class="status status-${pedido.status}">${pedido.status}</span></td>
                    <td>${new Date(pedido.data_pedido).toLocaleDateString('pt-MZ')}</td>
                    <td>${arquivoLink}</td>
                    <td>
                        <button class="btn btn-view" onclick="viewPedido(${pedido.id})">Ver</button>
                        <button class="btn btn-update" onclick="updateStatus(${pedido.id})">Editar</button>
                        <button class="btn btn-delete" onclick="deletePedido(${pedido.id})">Excluir</button>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>

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
        `;

        // Adicionar usuários
        usuariosResult.rows.forEach(usuario => {
            html += `
                <tr>
                    <td>${usuario.id}</td>
                    <td>${usuario.nome}</td>
                    <td>${usuario.telefone}</td>
                    <td>${new Date(usuario.created_at).toLocaleDateString('pt-MZ')}</td>
                    <td>${usuario.total_pedidos}</td>
                    <td>
                        <button class="btn btn-view" onclick="viewUsuario(${usuario.id})">Ver</button>
                        <button class="btn btn-delete" onclick="deleteUsuario(${usuario.id})">Excluir</button>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>

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
        `;

        // Adicionar contatos
        contatosResult.rows.forEach(contato => {
            html += `
                <tr>
                    <td>${contato.id}</td>
                    <td>${contato.nome}</td>
                    <td>${contato.telefone}</td>
                    <td>${contato.mensagem.substring(0, 50)}${contato.mensagem.length > 50 ? '...' : ''}</td>
                    <td>${new Date(contato.data_envio).toLocaleDateString('pt-MZ')}</td>
                    <td>
                        <button class="btn btn-view" onclick="viewContato(${contato.id})">Ver</button>
                        <button class="btn btn-delete" onclick="deleteContato(${contato.id})">Excluir</button>
                    </td>
                </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                </div>
            </div>

            <div id="modal" class="modal">
                <div class="modal-content">
                    <div id="modal-body"></div>
                    <div style="text-align: right; margin-top: 20px;">
                        <button class="btn" onclick="closeModal()">Fechar</button>
                    </div>
                </div>
            </div>

            <script>
                function showTab(tabName) {
                    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    
                    event.target.classList.add('active');
                    document.getElementById('tab-' + tabName).classList.add('active');
                }

                function viewPedido(id) {
                    fetch('/api/admin/pedido/' + id + '?senha=admin2025')
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                const p = data.pedido;
                                let html = '<h3>Pedido #' + p.id + '</h3>';
                                html += '<p><strong>Cliente:</strong> ' + p.cliente + '</p>';
                                html += '<p><strong>Telefone:</strong> ' + p.telefone + '</p>';
                                html += '<p><strong>Serviço:</strong> ' + p.nome_plano + ' - ' + parseFloat(p.preco).toLocaleString('pt-MZ') + ' MT</p>';
                                html += '<p><strong>Status:</strong> ' + p.status + '</p>';
                                html += '<p><strong>Descrição:</strong> ' + (p.descricao || p.tema || 'Nenhuma') + '</p>';
                                if (p.arquivo_path) {
                                    html += '<p><strong>Arquivo:</strong> <a href="/' + p.arquivo_path + '" target="_blank">Download</a></p>';
                                }
                                document.getElementById('modal-body').innerHTML = html;
                                document.getElementById('modal').style.display = 'flex';
                            }
                        });
                }

                function updateStatus(id) {
                    const novoStatus = prompt('Novo status (pendente, pago, em_andamento, concluido, cancelado):');
                    if (novoStatus) {
                        fetch('/api/admin/pedido/' + id + '/status?senha=admin2025', {
                            method: 'PUT',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({status: novoStatus})
                        })
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                alert('Status atualizado!');
                                location.reload();
                            }
                        });
                    }
                }

                function deletePedido(id) {
                    if (confirm('Excluir este pedido?')) {
                        fetch('/api/admin/pedido/' + id + '?senha=admin2025', {method: 'DELETE'})
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Pedido excluído!');
                                    location.reload();
                                }
                            });
                    }
                }

                function viewUsuario(id) {
                    fetch('/api/admin/usuario/' + id + '?senha=admin2025')
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                const u = data.usuario;
                                let html = '<h3>Usuário #' + u.id + '</h3>';
                                html += '<p><strong>Nome:</strong> ' + u.nome + '</p>';
                                html += '<p><strong>Telefone:</strong> ' + u.telefone + '</p>';
                                html += '<p><strong>Cadastro:</strong> ' + new Date(u.created_at).toLocaleString('pt-MZ') + '</p>';
                                html += '<p><strong>Total Pedidos:</strong> ' + (u.total_pedidos || 0) + '</p>';
                                document.getElementById('modal-body').innerHTML = html;
                                document.getElementById('modal').style.display = 'flex';
                            }
                        });
                }

                function deleteUsuario(id) {
                    if (confirm('Excluir usuário e todos os seus pedidos?')) {
                        fetch('/api/admin/usuario/' + id + '?senha=admin2025', {method: 'DELETE'})
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Usuário excluído!');
                                    location.reload();
                                }
                            });
                    }
                }

                function viewContato(id) {
                    fetch('/api/admin/contato/' + id + '?senha=admin2025')
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                const c = data.contato;
                                let html = '<h3>Contato #' + c.id + '</h3>';
                                html += '<p><strong>Nome:</strong> ' + c.nome + '</p>';
                                html += '<p><strong>Telefone:</strong> ' + c.telefone + '</p>';
                                html += '<p><strong>Data:</strong> ' + new Date(c.data_envio).toLocaleString('pt-MZ') + '</p>';
                                html += '<p><strong>Mensagem:</strong></p><p>' + c.mensagem + '</p>';
                                document.getElementById('modal-body').innerHTML = html;
                                document.getElementById('modal').style.display = 'flex';
                            }
                        });
                }

                function deleteContato(id) {
                    if (confirm('Excluir este contato?')) {
                        fetch('/api/admin/contato/' + id + '?senha=admin2025', {method: 'DELETE'})
                            .then(r => r.json())
                            .then(data => {
                                if (data.success) {
                                    alert('Contato excluído!');
                                    location.reload();
                                }
                            });
                    }
                }

                function closeModal() {
                    document.getElementById('modal').style.display = 'none';
                }

                window.onclick = function(event) {
                    if (event.target == document.getElementById('modal')) {
                        closeModal();
                    }
                }
            </script>
        </body>
        </html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Erro no painel admin:', error);
        res.status(500).send('Erro ao carregar painel administrativo');
    }
});

// ===== ROTAS ADMIN API =====

// Buscar pedido específico
app.get('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM pedidos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }

        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar pedido:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar pedido' });
    }
});

// Atualizar status do pedido
app.put('/api/admin/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await pool.query(
            'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Pedido não encontrado' });
        }

        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ success: false, error: 'Erro ao atualizar status' });
    }
});

// Excluir pedido
app.delete('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const pedido = await pool.query('SELECT arquivo_path FROM pedidos WHERE id = $1', [id]);
        if (pedido.rows.length > 0 && pedido.rows[0].arquivo_path && fs.existsSync(pedido.rows[0].arquivo_path)) {
            fs.unlinkSync(pedido.rows[0].arquivo_path);
        }

        await pool.query('DELETE FROM pedidos WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Pedido excluído' });
    } catch (error) {
        console.error('Erro ao excluir pedido:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir pedido' });
    }
});

// Buscar usuário específico
app.get('/api/admin/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const usuario = await pool.query(
            'SELECT id, nome, telefone, created_at FROM usuarios WHERE id = $1',
            [id]
        );

        if (usuario.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        const pedidos = await pool.query(
            'SELECT COUNT(*) as total FROM pedidos WHERE usuario_id = $1',
            [id]
        );

        const data = usuario.rows[0];
        data.total_pedidos = pedidos.rows[0].total;
        
        res.json({ success: true, usuario: data });
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar usuário' });
    }
});

// Excluir usuário
app.delete('/api/admin/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const arquivos = await pool.query(
            'SELECT arquivo_path FROM pedidos WHERE usuario_id = $1 AND arquivo_path IS NOT NULL',
            [id]
        );

        arquivos.rows.forEach(row => {
            if (row.arquivo_path && fs.existsSync(row.arquivo_path)) {
                fs.unlinkSync(row.arquivo_path);
            }
        });

        await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Usuário excluído' });
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir usuário' });
    }
});

// Buscar contato específico
app.get('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM contatos WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Contato não encontrado' });
        }

        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar contato:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar contato' });
    }
});

// Excluir contato
app.delete('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM contatos WHERE id = $1', [id]);
        res.json({ success: true, mensagem: 'Contato excluído' });
    } catch (error) {
        console.error('Erro ao excluir contato:', error);
        res.status(500).json({ success: false, error: 'Erro ao excluir contato' });
    }
});

// ===== INICIALIZAR SERVIDOR =====

async function startServer() {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
            console.log(`🌐 Site: http://localhost:${PORT}`);
            console.log(`🔧 Admin: http://localhost:${PORT}/admin/pedidos?senha=admin2025`);
            console.log(`📊 API: http://localhost:${PORT}/status`);
        });
    } catch (error) {
        console.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
