// server.js - Facilitaki Backend (Reset completo)
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
const SECRET_KEY = 'facilitaki-secret-key-2025';

// Configuração do PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://facilitaki_user:hUf4YfChbZvSWoq1cIRat14Jodok6WOb@dpg-d59mcr4hg0os73cenpi0-a.oregon-postgres.render.com/facilitaki_db',
    ssl: { rejectUnauthorized: false },
});

// Configuração de upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = '/tmp/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

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

// ==================== INICIALIZAÇÃO DO BANCO ====================
async function initDatabase() {
    try {
        console.log('🔧 Inicializando banco...');
        
        // Recriar tabela usuarios do zero para evitar problemas
        await pool.query(`DROP TABLE IF EXISTS pedidos CASCADE`);
        await pool.query(`DROP TABLE IF EXISTS contatos CASCADE`);
        await pool.query(`DROP TABLE IF EXISTS usuarios CASCADE`);
        
        await pool.query(`
            CREATE TABLE usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) UNIQUE NOT NULL,
                senha_hash VARCHAR(255) NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await pool.query(`
            CREATE TABLE pedidos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER REFERENCES usuarios(id),
                cliente VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
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
            CREATE TABLE contatos (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                mensagem TEXT NOT NULL,
                data_envio TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Banco reinicializado com sucesso!');
        console.log('⚠️ Nenhum admin existe. Crie o primeiro admin na página de login.');
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

// ==================== ROTAS PÚBLICAS ====================
app.get('/status', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==================== ROTAS ADMIN ====================

// Página de login admin
app.get('/admin/login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Admin Login - Facilitaki</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center}
                .container{background:#fff;padding:40px;border-radius:20px;width:350px;text-align:center}
                h1{color:#667eea;margin-bottom:30px}
                input{width:100%;padding:12px;margin:10px 0;border:2px solid #ddd;border-radius:10px}
                button{width:100%;padding:12px;background:#667eea;color:#fff;border:none;border-radius:10px;cursor:pointer;font-weight:bold;margin-top:10px}
                button:hover{transform:translateY(-2px)}
                .error{color:#c33;margin-top:10px;display:none}
                .success{color:#3c3;margin-top:10px;display:none}
                .tabs{display:flex;margin-bottom:20px;border-bottom:2px solid #ddd}
                .tab{flex:1;padding:10px;cursor:pointer;color:#666}
                .tab.active{color:#667eea;border-bottom:2px solid #667eea}
                .form-container{display:none}
                .form-container.active{display:block}
                .info{margin-top:20px;font-size:12px;color:#999;text-align:center}
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
                    <input type="password" id="newPass" placeholder="Senha">
                    <input type="password" id="newPassConfirm" placeholder="Confirmar Senha">
                    <button onclick="registerAdmin()">Criar Administrador</button>
                </div>
                <div id="error" class="error"></div>
                <div id="success" class="success"></div>
                <div class="info" id="infoMsg">⚠️ Nenhum administrador existe. Crie o primeiro admin na aba "Criar Admin"!</div>
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
                    document.getElementById('success').style.display='none';
                }
                
                async function login() {
                    const username = document.getElementById('username').value;
                    const password = document.getElementById('password').value;
                    const errorDiv = document.getElementById('error');
                    errorDiv.style.display='none';
                    
                    if(!username||!password){
                        errorDiv.textContent='Preencha todos os campos';
                        errorDiv.style.display='block';
                        return;
                    }
                    
                    try{
                        const res = await fetch('/admin/do-login', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({usuario:username, senha:password})
                        });
                        const data = await res.json();
                        if(data.success){
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
                    const pass = document.getElementById('newPass').value;
                    const confirm = document.getElementById('newPassConfirm').value;
                    const errorDiv = document.getElementById('error');
                    const successDiv = document.getElementById('success');
                    errorDiv.style.display='none';
                    successDiv.style.display='none';
                    
                    if(!user||!pass||!confirm){
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
                        errorDiv.textContent='A senha deve ter no mínimo 6 caracteres';
                        errorDiv.style.display='block';
                        return;
                    }
                    
                    try{
                        const res = await fetch('/admin/do-register', {
                            method:'POST',
                            headers:{'Content-Type':'application/json'},
                            body:JSON.stringify({usuario:user, senha:pass})
                        });
                        const data = await res.json();
                        if(data.success){
                            successDiv.textContent = data.message || 'Administrador criado! Faça login.';
                            successDiv.style.display='block';
                            document.getElementById('newUser').value='';
                            document.getElementById('newPass').value='';
                            document.getElementById('newPassConfirm').value='';
                            document.getElementById('infoMsg').innerHTML = '✅ Admin criado! Agora faça login na aba "Login".';
                            document.getElementById('infoMsg').style.color = '#3c3';
                            setTimeout(()=>{
                                switchTab('login');
                            },2000);
                        }else{
                            errorDiv.textContent = data.error || 'Erro ao criar admin';
                            errorDiv.style.display='block';
                        }
                    }catch(e){
                        errorDiv.textContent = 'Erro de conexão: ' + e.message;
                        errorDiv.style.display='block';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Processar login admin
app.post('/admin/do-login', async (req, res) => {
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
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Registrar novo admin - SEM RESTRIÇÕES (sempre permite)
app.post('/admin/do-register', async (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        console.log('📝 Tentando criar admin:', usuario);
        
        // Verificar se usuário já existe
        const exists = await pool.query('SELECT id FROM usuarios WHERE nome = $1', [usuario]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Usuário já existe' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash, is_admin) VALUES ($1, $2, $3, true)',
            [usuario, `admin_${Date.now()}@system.com`, hash]
        );
        
        console.log('✅ Admin criado com sucesso:', usuario);
        res.json({ success: true, message: 'Administrador criado com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Painel admin
app.get('/admin/painel', async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC LIMIT 50');
        const usuarios = await pool.query('SELECT id, nome, telefone, is_admin, created_at FROM usuarios ORDER BY created_at DESC LIMIT 50');
        const contatos = await pool.query('SELECT * FROM contatos ORDER BY data_envio DESC LIMIT 50');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Painel Administrativo - Facilitaki</title>
                <style>
                    *{margin:0;padding:0;box-sizing:border-box}
                    body{font-family:Arial;background:#f5f5f5;padding:20px}
                    .header{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
                    .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:20px}
                    .stat-card{background:#fff;padding:20px;border-radius:10px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
                    .stat-number{font-size:32px;font-weight:bold;color:#667eea}
                    .tabs{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
                    .tab{padding:10px 20px;background:#ddd;border:none;border-radius:5px;cursor:pointer;font-weight:bold}
                    .tab.active{background:#667eea;color:#fff}
                    .tab-content{display:none;background:#fff;padding:20px;border-radius:10px;overflow-x:auto}
                    .tab-content.active{display:block}
                    table{width:100%;border-collapse:collapse}
                    th,td{padding:12px;text-align:left;border-bottom:1px solid #ddd}
                    th{background:#f8f9fa}
                    .status{padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold}
                    .status-pendente{background:#fef3c7;color:#92400e}
                    .status-pago{background:#d1fae5;color:#065f46}
                    .btn{padding:5px 10px;border:none;border-radius:3px;cursor:pointer;margin:2px}
                    .btn-view{background:#3498db;color:#fff}
                    .btn-update{background:#2ecc71;color:#fff}
                    .btn-delete{background:#e74c3c;color:#fff}
                    .logout-btn{background:#e74c3c;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer}
                    .admin-badge{background:#667eea;color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:5px}
                </style>
            </head>
            <body>
                <div class="header">
                    <div><h1>Painel Administrativo</h1><p>Bem-vindo, Administrador</p></div>
                    <button class="logout-btn" onclick="logout()">Sair</button>
                </div>
                
                <div class="stats">
                    <div class="stat-card"><div class="stat-number">${pedidos.rows.length}</div><div>Total Pedidos</div></div>
                    <div class="stat-card"><div class="stat-number">${pedidos.rows.filter(p=>p.status==='pendente').length}</div><div>Pendentes</div></div>
                    <div class="stat-card"><div class="stat-number">${usuarios.rows.filter(u=>!u.is_admin).length}</div><div>Clientes</div></div>
                    <div class="stat-card"><div class="stat-number">${contatos.rows.length}</div><div>Contatos</div></div>
                </div>
                
                <div class="tabs">
                    <button class="tab active" onclick="showTab('pedidos')">Pedidos (${pedidos.rows.length})</button>
                    <button class="tab" onclick="showTab('usuarios')">Usuários (${usuarios.rows.length})</button>
                    <button class="tab" onclick="showTab('contatos')">Contatos (${contatos.rows.length})</button>
                    <button class="tab" onclick="showTab('admins')">Administradores</button>
                </div>
                
                <div id="tab-pedidos" class="tab-content active">
                    <table><thead><tr><th>ID</th><th>Cliente</th><th>Telefone</th><th>Serviço</th><th>Valor</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody>${pedidos.rows.map(p => `<tr><td>${p.id}</td><td>${p.cliente}</td><td>${p.telefone}</td><td>${p.nome_plano}</td><td>${parseFloat(p.preco||0).toLocaleString('pt-MZ')} MT</td><td><span class="status status-${p.status}">${p.status}</span></td><td>${new Date(p.data_pedido).toLocaleDateString()}</td><td><button class="btn btn-view" onclick="viewPedido(${p.id})">Ver</button><button class="btn btn-update" onclick="updateStatus(${p.id})">Editar</button><button class="btn btn-delete" onclick="deletePedido(${p.id})">Excluir</button></td></tr>`).join('')}</tbody>
                    </table>
                </div>
                
                <div id="tab-usuarios" class="tab-content">
                    <table><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Admin</th><th>Cadastro</th><th>Ações</th></tr></thead>
                    <tbody>${usuarios.rows.map(u => `<tr><td>${u.id}</td><td>${u.nome} ${u.is_admin ? '<span class="admin-badge">Admin</span>' : ''}</td><td>${u.telefone}</td><td>${u.is_admin ? 'Sim' : 'Não'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${!u.is_admin ? `<button class="btn btn-delete" onclick="deleteUser(${u.id})">Excluir</button>` : ''}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
                
                <div id="tab-contatos" class="tab-content">
                    <tr><thead><tr><th>ID</th><th>Nome</th><th>Telefone</th><th>Mensagem</th><th>Data</th><th>Ações</th></tr></thead>
                    <tbody>${contatos.rows.map(c => `<tr><td>${c.id}</td><td>${c.nome}</td><td>${c.telefone}</td><td>${c.mensagem.substring(0,50)}${c.mensagem.length>50?'...':''}</td><td>${new Date(c.data_envio).toLocaleDateString()}</td><td><button class="btn btn-view" onclick="viewContato(${c.id})">Ver</button><button class="btn btn-delete" onclick="deleteContato(${c.id})">Excluir</button></td></tr>`).join('')}</tbody>
                    </table>
                </div>
                
                <div id="tab-admins" class="tab-content">
                    <div style="margin-bottom:20px;padding:15px;background:#f8f9fa;border-radius:8px">
                        <h3>Criar Novo Administrador</h3>
                        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
                            <input type="text" id="newAdminUser" placeholder="Usuário" style="flex:2;padding:10px;border:1px solid #ddd;border-radius:5px">
                            <input type="password" id="newAdminPass" placeholder="Senha" style="flex:2;padding:10px;border:1px solid #ddd;border-radius:5px">
                            <input type="password" id="newAdminPassConfirm" placeholder="Confirmar" style="flex:2;padding:10px;border:1px solid #ddd;border-radius:5px">
                            <button onclick="createNewAdmin()" style="background:#667eea;color:#fff;padding:10px 20px;border:none;border-radius:5px;cursor:pointer">Criar Admin</button>
                        </div>
                        <div id="adminMsg" style="margin-top:10px"></div>
                    </div>
                    <div id="adminsList"></div>
                </div>
                
                <script>
                    async function apiCall(url, options={}) {
                        const res = await fetch(url, {
                            ...options,
                            headers: { 'Content-Type': 'application/json' }
                        });
                        return res.json();
                    }
                    
                    function showTab(name) {
                        document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
                        event.target.classList.add('active');
                        document.getElementById('tab-'+name).classList.add('active');
                        if(name==='admins') loadAdmins();
                    }
                    
                    async function loadAdmins() {
                        const data = await apiCall('/api/admin/listar');
                        if(data && data.success) {
                            const container = document.getElementById('adminsList');
                            if(data.admins.length===0) {
                                container.innerHTML = '<p>Nenhum administrador encontrado</p>';
                            } else {
                                container.innerHTML = '<table><thead><tr><th>ID</th><th>Nome</th><th>Data</th><th>Ações</th></tr></thead><tbody>' + 
                                    data.admins.map(admin => '</tr><td>'+admin.id+'</td><td>'+admin.nome+' <span class="admin-badge">Admin</span>+'</span>'+'</td><td>'+new Date(admin.created_at).toLocaleDateString()+'</span></td>.<span'+(admin.id !== 1 ? '<button class="btn btn-delete" onclick="deleteAdmin('+admin.id+')">Excluir</button>' : '<span>Admin principal</span>')+'</span></tr>').join('') +
                                    '</tbody></table>';
                            }
                        }
                    }
                    
                    async function createNewAdmin() {
                        const usuario = document.getElementById('newAdminUser').value;
                        const senha = document.getElementById('newAdminPass').value;
                        const confirm = document.getElementById('newAdminPassConfirm').value;
                        const msgDiv = document.getElementById('adminMsg');
                        
                        if(!usuario||!senha||!confirm){
                            msgDiv.innerHTML='<span style="color:#c33">Preencha todos os campos</span>';
                            return;
                        }
                        if(senha!==confirm){
                            msgDiv.innerHTML='<span style="color:#c33">As senhas não coincidem</span>';
                            return;
                        }
                        if(senha.length<6){
                            msgDiv.innerHTML='<span style="color:#c33">Mínimo 6 caracteres</span>';
                            return;
                        }
                        
                        const data = await apiCall('/admin/do-register', { method:'POST', body:JSON.stringify({usuario, senha}) });
                        if(data && data.success){
                            msgDiv.innerHTML='<span style="color:#3c3">✅ '+data.message+'</span>';
                            document.getElementById('newAdminUser').value='';
                            document.getElementById('newAdminPass').value='';
                            document.getElementById('newAdminPassConfirm').value='';
                            loadAdmins();
                            setTimeout(()=>msgDiv.innerHTML='',3000);
                        } else if(data){
                            msgDiv.innerHTML='<span style="color:#c33">❌ '+data.error+'</span>';
                        }
                    }
                    
                    async function deleteAdmin(id) {
                        if(confirm('Excluir este administrador?')){
                            const data = await apiCall('/api/admin/usuario/'+id, { method:'DELETE' });
                            if(data && data.success) loadAdmins();
                        }
                    }
                    
                    async function viewPedido(id) {
                        const data = await apiCall('/api/admin/pedido/'+id);
                        if(data && data.success){
                            alert('Pedido #'+data.pedido.id+'\\nCliente: '+data.pedido.cliente+'\\nServiço: '+data.pedido.nome_plano+'\\nValor: '+parseFloat(data.pedido.preco).toLocaleString('pt-MZ')+' MT\\nStatus: '+data.pedido.status);
                        }
                    }
                    
                    async function updateStatus(id) {
                        const status = prompt('Novo status (pendente, pago, em_andamento, concluido):');
                        if(status){
                            const data = await apiCall('/api/admin/pedido/'+id+'/status', { method:'PUT', body:JSON.stringify({status}) });
                            if(data && data.success) location.reload();
                        }
                    }
                    
                    async function deletePedido(id) {
                        if(confirm('Excluir este pedido?')){
                            const data = await apiCall('/api/admin/pedido/'+id, { method:'DELETE' });
                            if(data && data.success) location.reload();
                        }
                    }
                    
                    async function deleteUser(id) {
                        if(confirm('Excluir este usuário?')){
                            const data = await apiCall('/api/admin/usuario/'+id, { method:'DELETE' });
                            if(data && data.success) location.reload();
                        }
                    }
                    
                    async function viewContato(id) {
                        const data = await apiCall('/api/admin/contato/'+id);
                        if(data && data.success){
                            alert('Contato de '+data.contato.nome+'\\nTelefone: '+data.contato.telefone+'\\nMensagem: '+data.contato.mensagem);
                        }
                    }
                    
                    async function deleteContato(id) {
                        if(confirm('Excluir este contato?')){
                            const data = await apiCall('/api/admin/contato/'+id, { method:'DELETE' });
                            if(data && data.success) location.reload();
                        }
                    }
                    
                    function logout() {
                        window.location.href = '/admin/login';
                    }
                    
                    // Carregar admins ao iniciar
                    if(document.getElementById('tab-admins')) {
                        loadAdmins();
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Erro: ' + error.message);
    }
});

// ==================== ROTAS ADMIN API ====================
app.get('/api/admin/listar', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, created_at FROM usuarios WHERE is_admin = true ORDER BY created_at DESC');
        res.json({ success: true, admins: result.rows });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/pedido/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/pedido/:id/status', async (req, res) => {
    try {
        await pool.query('UPDATE pedidos SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/pedido/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM pedidos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/usuario/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM usuarios WHERE id = $1 AND is_admin = false', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/contato/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true, contato: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/contato/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM contatos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== ROTAS PARA USUÁRIOS COMUNS ====================
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
            { id: result.rows[0].id, nome: result.rows[0].nome },
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
        const existe = await pool.query('SELECT id FROM usuarios WHERE telefone = $1', [telefone]);
        
        if (existe.rows.length > 0) {
            return res.status(400).json({ success: false, erro: 'Telefone já cadastrado' });
        }
        
        const hash = await bcrypt.hash(senha, 10);
        const result = await pool.query(
            'INSERT INTO usuarios (nome, telefone, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, telefone',
            [nome, telefone, hash]
        );
        
        const token = jwt.sign(
            { id: result.rows[0].id, nome },
            SECRET_KEY,
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token, usuario: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.post('/api/pedidos/upload', upload.single('arquivo'), async (req, res) => {
    try {
        const { cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento } = req.body;
        
        const result = await pool.query(
            `INSERT INTO pedidos (cliente, telefone, descricao, plano, nome_plano, preco, metodo_pagamento, arquivo_path)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [cliente, telefone, descricao, plano, nomePlano, preco, metodoPagamento, req.file?.path]
        );
        
        res.json({ success: true, pedido: result.rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, erro: error.message });
    }
});

app.get('/api/meus-pedidos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM pedidos ORDER BY data_pedido DESC');
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

// Redirecionamentos
app.get('/admin', (req, res) => res.redirect('/admin/login'));
app.get('/admin/', (req, res) => res.redirect('/admin/login'));

// ==================== INICIAR SERVIDOR ====================
async function startServer() {
    console.log('🚀 Iniciando servidor Facilitaki...');
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor rodando na porta ${PORT}`);
        console.log(`🔐 Admin: https://facilitaki.onrender.com/admin/login`);
        console.log(`💡 IMPORTANTE: Crie o primeiro administrador na aba "Criar Admin"`);
    });
}

startServer();
