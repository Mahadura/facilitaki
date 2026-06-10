// server.js - Facilitaki Backend UNIFICADO (Versão Estável para Deploy)
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2025';

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db',
    ssl: { rejectUnauthorized: false },
});

// Configuração do multer para upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = '/tmp/uploads/';
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('.'));

// Logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ==================== MIDDLEWARES DE AUTENTICAÇÃO ====================

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
        if (!decoded.isAdmin) return res.status(403).json({ success: false, error: 'Acesso negado' });
        req.admin = decoded;
        next();
    });
};

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
    try {
        console.log('Inicializando banco...');
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                descricao TEXT,
                plano VARCHAR(50),
                nome_plano VARCHAR(100),
                preco DECIMAL(10,2),
                metodo_pagamento VARCHAR(50),
                status VARCHAR(20) DEFAULT 'pendente',
                arquivo_path VARCHAR(255),
                data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(100) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('Banco inicializado');
    } catch (error) {
        console.error('Erro ao inicializar banco:', error.message);
    }
}

// ==================== ROTAS PÚBLICAS ====================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/api/teste-banco', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW() as hora');
        res.json({ success: true, hora: result.rows[0].hora });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== ROTAS DE AUTENTICAÇÃO ====================
app.post('/api/login', async (req, res) => {
    try {
        const { telefone, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE telefone = $1', [telefone]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) {
            return res.status(401).json({ success: false, erro: 'Credenciais inválidas' });
        }
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome: result.rows[0].nome, isAdmin: result.rows[0].is_admin || false },
            SECRET_KEY,
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/cadastrar', async (req, res) => {
    try {
        const { nome, telefone, senha } = req.body;
        const telefoneLimpo = telefone.replace(/\D/g, '');
        
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefoneLimpo]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefoneLimpo, hash]
        );
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome, isAdmin: false },
            SECRET_KEY,
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true });
});

// ==================== ROTAS DE PEDIDOS ====================
app.post('/api/pedidos/upload', authenticateToken, upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        const result = await pool.query(
            `INSERT INTO pedidos (usuario_id, cliente, telefone, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento, req.file?.path]
        );
        
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/meus-pedidos', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data_pedido DESC', [req.user.id]);
        res.json({ success: true, pedidos: result.rows });
    } catch (error) {
        res.json({ success: true, pedidos: [] });
    }
});

app.post('/api/contato', async (req, res) => {
    try {
        const { nome, telefone, mensagem } = req.body;
        await pool.query('INSERT INTO contatos (nome, telefone, mensagem) VALUES ($1, $2, $3)', [nome, telefone, mensagem]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

// ==================== ROTAS ADMIN ====================

app.get('/api/admin/exists', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM usuarios WHERE is_admin = true');
        res.json({ exists: parseInt(result.rows[0].count) > 0 });
    } catch (error) {
        res.json({ exists: false });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        const result = await pool.query('SELECT * FROM usuarios WHERE nome = $1 AND is_admin = true', [usuario]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const valid = await bcrypt.compare(senha, result.rows[0].senha_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome: usuario, isAdmin: true },
            SECRET_KEY,
            { expiresIn: '8h' }
        );
        
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/register', async (req, res) => {
    try {
        const { usuario, telefone, senha } = req.body;
        
        const userExists = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Usuário já existe' });
        }
        
        const telefoneExists = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        if (telefoneExists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Telefone já cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            [usuario, telefone, hash]
        );
        
        res.json({ success: true, message: 'Administrador criado com sucesso!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Página de login admin
app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Admin Login - Facilitaki</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
            .container{background:#fff;padding:40px;border-radius:20px;width:400px;text-align:center}
            h1{color:#667eea;margin-bottom:30px}
            input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
            button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:bold}
            .error{color:#c33;margin-top:10px;display:none}
            .tabs{display:flex;margin-bottom:20px;border-bottom:2px solid #ddd}
            .tab{flex:1;padding:10px;cursor:pointer;color:#666}
            .tab.active{color:#667eea;border-bottom:2px solid #667eea}
            .form-container{display:none}
            .form-container.active{display:block}
        </style>
        </head>
        <body>
        <div class="container">
            <h1>Admin Login</h1>
            <div class="tabs">
                <div class="tab active" onclick="switchTab('login')">Login</div>
                <div class="tab" onclick="switchTab('register')">Criar Admin</div>
            </div>
            <div id="login-container" class="form-container active">
                <input type="text" id="username" placeholder="Usuário">
                <input type="password" id="password" placeholder="Senha">
                <button onclick="login()">Entrar</button>
            </div>
            <div id="register-container" class="form-container">
                <input type="text" id="newUser" placeholder="Usuário">
                <input type="text" id="newTelefone" placeholder="Telefone">
                <input type="password" id="newPass" placeholder="Senha">
                <input type="password" id="newPassConfirm" placeholder="Confirmar Senha">
                <button onclick="registerAdmin()">Criar Administrador</button>
            </div>
            <div id="error" class="error"></div>
        </div>
        <script>
            function switchTab(tab) {
                document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
                document.querySelectorAll('.form-container').forEach(c=>c.classList.remove('active'));
                if(tab==='login'){
                    document.querySelector('.tab').classList.add('active');
                    document.getElementById('login-container').classList.add('active');
                }else{
                    document.querySelectorAll('.tab')[1].classList.add('active');
                    document.getElementById('register-container').classList.add('active');
                }
                document.getElementById('error').style.display='none';
            }
            
            async function login() {
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const errorDiv = document.getElementById('error');
                if(!username||!password){
                    errorDiv.textContent='Preencha todos os campos';
                    errorDiv.style.display='block';
                    return;
                }
                try{
                    const res = await fetch('/api/admin/login', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({usuario:username, senha:password})
                    });
                    const data = await res.json();
                    if(data.success){
                        localStorage.setItem('admin_token', data.token);
                        window.location.href = '/admin/painel';
                    }else{
                        errorDiv.textContent = data.error || 'Erro no login';
                        errorDiv.style.display='block';
                    }
                }catch(e){
                    errorDiv.textContent = 'Erro de conexão';
                    errorDiv.style.display='block';
                }
            }
            
            async function registerAdmin() {
                const user = document.getElementById('newUser').value;
                const telefone = document.getElementById('newTelefone').value;
                const pass = document.getElementById('newPass').value;
                const confirm = document.getElementById('newPassConfirm').value;
                const errorDiv = document.getElementById('error');
                if(!user||!telefone||!pass||!confirm){
                    errorDiv.textContent='Preencha todos os campos';
                    errorDiv.style.display='block';
                    return;
                }
                if(pass!==confirm){
                    errorDiv.textContent='As senhas não coincidem';
                    errorDiv.style.display='block';
                    return;
                }
                if(pass.length<6){
                    errorDiv.textContent='Senha deve ter mínimo 6 caracteres';
                    errorDiv.style.display='block';
                    return;
                }
                try{
                    const res = await fetch('/api/admin/register', {
                        method:'POST',
                        headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({usuario:user, telefone:telefone, senha:pass})
                    });
                    const data = await res.json();
                    if(data.success){
                        alert('Administrador criado! Faça login.');
                        switchTab('login');
                    }else{
                        errorDiv.textContent = data.error || 'Erro ao criar admin';
                        errorDiv.style.display='block';
                    }
                }catch(e){
                    errorDiv.textContent = 'Erro de conexão';
                    errorDiv.style.display='block';
                }
            }
        </script>
        </body>
        </html>
    `);
});

// Painel admin principal
app.get('/admin/painel', authenticateAdmin, async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC LIMIT 100');
        const usuarios = await pool.query('SELECT id, nome, telefone, is_admin, created_at FROM usuarios ORDER BY created_at DESC');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 100');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Painel Admin - Facilitaki</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial;background:#f5f5f5;padding:20px}
                .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between}
                .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin-bottom:20px}
                .stat-card{background:#fff;padding:20px;border-radius:10px;text-align:center}
                .stat-number{font-size:32px;font-weight:bold;color:#667eea}
                .tabs{display:flex;gap:10px;margin-bottom:20px}
                .tab{padding:10px 20px;background:#ddd;border:none;border-radius:5px;cursor:pointer}
                .tab.active{background:#667eea;color:#fff}
                .tab-content{display:none;background:#fff;padding:20px;border-radius:10px}
                .tab-content.active{display:block}
                table{width:100%;border-collapse:collapse}
                th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
                th{background:#f8f9fa}
                .status{padding:4px 8px;border-radius:4px;font-size:12px}
                .status-pendente{background:#fef3c7;color:#92400e}
                .btn{padding:5px 10px;border:none;border-radius:3px;cursor:pointer;margin:2px}
                .btn-view{background:#3498db;color:#fff}
                .btn-update{background:#2ecc71;color:#fff}
                .btn-delete{background:#e74c3c;color:#fff}
                .logout-btn{background:#e74c3c;color:#fff;padding:10px20px;border:none;border-radius:5px;cursor:pointer}
                .admin-badge{background:#667eea;color:#fff;font-size:10px;padding:2px6px;border-radius:10px}
            </style>
            </head>
            <body>
            <div class="header">
                <div><h1>Painel Administrativo</h1><p>Bem-vindo, ${req.admin.nome} <span class="admin-badge">Admin</span></p></div>
                <button class="logout-btn" onclick="logout()">Sair</button>
            </div>
            <div class="stats">
                <div class="stat-card"><div class="stat-number">${pedidos.rows.length}</div><div>Pedidos</div></div>
                <div class="stat-card"><div class="stat-number">${pedidos.rows.filter(p=>p.status==='pendente').length}</div><div>Pendentes</div></div>
                <div class="stat-card"><div class="stat-number">${usuarios.rows.filter(u=>!u.is_admin).length}</div><div>Clientes</div></div>
                <div class="stat-card"><div class="stat-number">${contatos.rows.length}</div><div>Contatos</div></div>
            </div>
            <div class="tabs">
                <button class="tab active" onclick="showTab('pedidos')">Pedidos (${pedidos.rows.length})</button>
                <button class="tab" onclick="showTab('usuarios')">Usuários (${usuarios.rows.length})</button>
                <button class="tab" onclick="showTab('contatos')">Contatos (${contatos.rows.length})</button>
            </div>
            <div id="tab-pedidos" class="tab-content active">
                <table><thead><tr><th>ID</th><th>Cliente</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                <tbody>${pedidos.rows.map(p => `<tr><td>${p.id}</td><td>${p.cliente}</td><td>${p.nome_plano}</td><td>${parseFloat(p.preco||0).toLocaleString('pt-MZ')} MT</td><td><span class="status status-${p.status}">${p.status}</span></td><td>${new Date(p.data_pedido).toLocaleDateString()}</td><td><button class="btn btn-view" onclick="viewPedido(${p.id})">Ver</button><button class="btn btn-update" onclick="updateStatus(${p.id})">Editar</button><button class="btn btn-delete" onclick="deletePedido(${p.id})">Excluir</button></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div id="tab-usuarios" class="tab-content">
                <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Tipo</th><th>Cadastro</th><th>Ações</th></tr></thead>
                <tbody>${usuarios.rows.map(u => `<tr><td>${u.id}</td><td>${u.nome}${u.is_admin ? ' <span class="admin-badge">Admin</span>' : ''}</td><td>${u.telefone}</td><td>${u.is_admin ? 'Admin' : 'Cliente'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${!u.is_admin ? `<button class="btn btn-delete" onclick="deleteUser(${u.id})">Excluir</button>` : '-'}</td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div id="tab-contatos" class="tab-content">
                <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                <tbody>${contatos.rows.map(c => `<tr><td>${c.id}</td><td>${c.nome}</td><td>${c.telefone}</td><td>${c.mensagem.substring(0,50)}...</td><td>${new Date(c.data_envio).toLocaleDateString()}</td><td><button class="btn btn-view" onclick="viewContato(${c.id})">Ver</button><button class="btn btn-delete" onclick="deleteContato(${c.id})">Excluir</button></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div id="modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);justify-content:center;align-items:center"><div style="background:#fff;padding:20px;border-radius:10px;max-width:500px"><div id="modalBody"></div><button onclick="closeModal()" style="margin-top:15px;padding:8px16px">Fechar</button></div></div>
            <script>
                const TOKEN = localStorage.getItem('admin_token');
                if(!TOKEN) window.location.href='/admin/login';
                async function apiCall(url,options={}) {
                    const res = await fetch(url,{...options,headers:{'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'}});
                    if(res.status===401){localStorage.removeItem('admin_token');window.location.href='/admin/login';return null;}
                    return res.json();
                }
                function showTab(name){
                    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
                    event.target.classList.add('active');
                    document.getElementById('tab-'+name).classList.add('active');
                }
                async function viewPedido(id){
                    const data=await apiCall('/api/admin/pedido/'+id);
                    if(data && data.success) document.getElementById('modalBody').innerHTML='<h3>Pedido #'+data.pedido.id+'</h3><p><strong>Cliente:</strong> '+data.pedido.cliente+'</p><p><strong>Serviço:</strong> '+data.pedido.nome_plano+'</p><p><strong>Valor:</strong> '+parseFloat(data.pedido.preco).toLocaleString('pt-MZ')+' MT</p><p><strong>Status:</strong> '+data.pedido.status+'</p>',document.getElementById('modal').style.display='flex';
                }
                async function updateStatus(id){
                    const status=prompt('Novo status (pendente, pago, em_andamento, concluido):');
                    if(status){await apiCall('/api/admin/pedido/'+id+'/status',{method:'PUT',body:JSON.stringify({status})});location.reload();}
                }
                async function deletePedido(id){if(confirm('Excluir?')){await apiCall('/api/admin/pedido/'+id,{method:'DELETE'});location.reload();}}
                async function deleteUser(id){if(confirm('Excluir usuário?')){await apiCall('/api/admin/usuario/'+id,{method:'DELETE'});location.reload();}}
                async function viewContato(id){
                    const data=await apiCall('/api/admin/contato/'+id);
                    if(data && data.success) document.getElementById('modalBody').innerHTML='<h3>Contato #'+data.contato.id+'</h3><p><strong>Nome:</strong> '+data.contato.nome+'</p><p><strong>Mensagem:</strong> '+data.contato.mensagem+'</p>',document.getElementById('modal').style.display='flex';
                }
                async function deleteContato(id){if(confirm('Excluir contato?')){await apiCall('/api/admin/contato/'+id,{method:'DELETE'});location.reload();}}
                function closeModal(){document.getElementById('modal').style.display='none';}
                async function logout(){await apiCall('/api/admin/logout',{method:'POST'});localStorage.removeItem('admin_token');window.location.href='/admin/login';}
            </script>
            </body>
            </html>
        `);
    } catch(error){
        res.status(500).send('Erro: '+error.message);
    }
});

// ==================== ROTAS ADMIN API ====================
app.get('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/pedido/:id/status', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/pedido/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/usuario/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1 AND is_admin = false', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/contato/:id', authenticateAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/logout', authenticateAdmin, (req, res) => {
    res.json({ success: true });
});

// Redirecionamentos
app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/pedidos', (req, res) => res.redirect('/admin/login'));

// Iniciar servidor
async function startServer() {
    console.log('🚀 Iniciando servidor Facilitaki...');
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: https://facilitaki.onrender.com/admin/login`);
    });
}

startServer();
