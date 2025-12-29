// server.js - Backend completo para Facilitaki com suporte ao Render
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const SECRET_KEY = process.env.SECRET_KEY || 'facilitaki-secret-key-2024-production';

// Configurar caminho do banco de dados para Render
const isRender = process.env.RENDER === 'true';
const dbPath = isRender 
    ? path.join('/opt/render/project/src', 'database', 'facilitaki.db')
    : path.join(__dirname, 'database', 'facilitaki.db');

// Garantir que a pasta database existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Criar tabelas para serviços acadêmicos
db.serialize(() => {
    // Clientes (estudantes)
    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT UNIQUE NOT NULL,
            email TEXT,
            senha TEXT,
            instituicao TEXT,
            curso TEXT,
            saldo DECIMAL(10,2) DEFAULT 0,
            status TEXT DEFAULT 'ativo',
            data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Trabalhos dos clientes
    db.run(`
        CREATE TABLE IF NOT EXISTS trabalhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            titulo TEXT NOT NULL,
            disciplina TEXT,
            descricao TEXT,
            prazo DATE,
            status TEXT DEFAULT 'pendente',
            data_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        )
    `);

    // Serviços oferecidos
    db.run(`
        CREATE TABLE IF NOT EXISTS servicos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            descricao TEXT,
            preco DECIMAL(10,2) NOT NULL,
            prazo_medio TEXT,
            status TEXT DEFAULT 'ativo'
        )
    `);

    // Pedidos de serviços
    db.run(`
        CREATE TABLE IF NOT EXISTS pedidos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            servico_id INTEGER,
            trabalho_id INTEGER,
            valor_pago DECIMAL(10,2),
            metodo_pagamento TEXT,
            status TEXT DEFAULT 'pendente',
            data_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
            data_conclusao DATETIME,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (servico_id) REFERENCES servicos(id),
            FOREIGN KEY (trabalho_id) REFERENCES trabalhos(id)
        )
    `);

    // Transações financeiras
    db.run(`
        CREATE TABLE IF NOT EXISTS transacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER,
            tipo TEXT, -- 'deposito', 'servico', 'recarga'
            valor DECIMAL(10,2),
            descricao TEXT,
            referencia TEXT,
            status TEXT DEFAULT 'pendente',
            data_transacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id)
        )
    `);

    // Arquivos/trabalhos entregues
    db.run(`
        CREATE TABLE IF NOT EXISTS entregas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pedido_id INTEGER,
            arquivo_url TEXT,
            observacoes TEXT,
            data_entrega DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        )
    `);

    // Mensagens de contato/suporte
    db.run(`
        CREATE TABLE IF NOT EXISTS contatos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT NOT NULL,
            email TEXT,
            mensagem TEXT NOT NULL,
            status TEXT DEFAULT 'pendente',
            data_envio DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Verificar e inserir serviços padrão
    db.get('SELECT COUNT(*) as count FROM servicos', (err, row) => {
        if (err) {
            console.error('Erro ao verificar serviços:', err);
            return;
        }
        
        if (row.count === 0) {
            console.log('Inserindo serviços padrão...');
            db.run(`
                INSERT INTO servicos (nome, descricao, preco, prazo_medio) VALUES 
                ('Serviços Avulsos', 'Formatação, paginação e padronização de trabalhos', 100.00, '24h'),
                ('Trabalho de Campo', 'Planejamento e execução de pesquisa de campo', 500.00, '7 dias'),
                ('Monografia/TCC', 'Desenvolvimento completo de trabalho final', 15000.00, '3 meses')
            `, (err) => {
                if (err) {
                    console.error('Erro ao inserir serviços:', err);
                } else {
                    console.log('Serviços padrão inseridos com sucesso!');
                }
            });
        }
    });
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para health check (necessária para Render)
app.get('/health', (req, res) => {
    db.get('SELECT 1 as health', (err) => {
        if (err) {
            return res.status(500).json({ 
                status: 'error', 
                message: 'Database connection failed',
                error: err.message 
            });
        }
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'Facilitaki API',
            version: '1.0.0'
        });
    });
});

// Rota para informações do sistema
app.get('/api/info', (req, res) => {
    res.json({
        name: 'Facilitaki',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        database: 'SQLite',
        features: ['Autenticação', 'Pedidos', 'Pagamentos', 'Contato'],
        endpoints: [
            '/api/cadastrar',
            '/api/login',
            '/api/servicos',
            '/api/pedidos',
            '/api/perfil'
        ]
    });
});

// ========== ROTAS PÚBLICAS ==========

// 1. Cadastro de cliente
app.post('/api/cadastrar', async (req, res) => {
    const { nome, telefone, email, senha, instituicao, curso } = req.body;

    // Validações básicas
    if (!nome || !telefone || !senha) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Nome, telefone e senha são obrigatórios' 
        });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        
        db.run(
            `INSERT INTO clientes (nome, telefone, email, senha, instituicao, curso) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [nome, telefone, email || '', senhaHash, instituicao || '', curso || ''],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(409).json({ 
                            sucesso: false, 
                            erro: 'Telefone já cadastrado' 
                        });
                    }
                    console.error('Erro no cadastro:', err);
                    return res.status(500).json({ 
                        sucesso: false, 
                        erro: 'Erro no servidor ao realizar cadastro' 
                    });
                }

                // Gerar token
                const token = jwt.sign(
                    { id: this.lastID, telefone, nome },
                    SECRET_KEY,
                    { expiresIn: '30d' }
                );

                res.json({ 
                    sucesso: true, 
                    mensagem: 'Cadastro realizado com sucesso!',
                    cliente_id: this.lastID,
                    token 
                });
            }
        );
    } catch (error) {
        console.error('Erro ao criar hash:', error);
        res.status(500).json({ 
            sucesso: false, 
            erro: 'Erro interno do servidor' 
        });
    }
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { telefone, senha } = req.body;

    if (!telefone || !senha) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Telefone e senha são obrigatórios' 
        });
    }

    db.get(
        'SELECT id, nome, telefone, email, instituicao, curso, senha, saldo FROM clientes WHERE telefone = ? AND status = "ativo"',
        [telefone],
        async (err, cliente) => {
            if (err) {
                console.error('Erro no login:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro no servidor' 
                });
            }
            
            if (!cliente) {
                return res.status(404).json({ 
                    sucesso: false, 
                    erro: 'Cliente não encontrado' 
                });
            }

            const senhaValida = await bcrypt.compare(senha, cliente.senha);
            if (!senhaValida) {
                return res.status(401).json({ 
                    sucesso: false, 
                    erro: 'Senha incorreta' 
                });
            }

            const token = jwt.sign(
                { 
                    id: cliente.id, 
                    telefone: cliente.telefone,
                    nome: cliente.nome 
                },
                SECRET_KEY,
                { expiresIn: '30d' }
            );

            res.json({
                sucesso: true,
                mensagem: 'Login realizado com sucesso',
                cliente: {
                    id: cliente.id,
                    nome: cliente.nome,
                    telefone: cliente.telefone,
                    email: cliente.email,
                    instituicao: cliente.instituicao,
                    curso: cliente.curso,
                    saldo: cliente.saldo
                },
                token
            });
        }
    );
});

// 3. Listar serviços disponíveis
app.get('/api/servicos', (req, res) => {
    db.all(
        'SELECT * FROM servicos WHERE status = "ativo" ORDER BY preco ASC',
        [],
        (err, servicos) => {
            if (err) {
                console.error('Erro ao buscar serviços:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar serviços' 
                });
            }

            res.json({
                sucesso: true,
                servicos: servicos || [],
                total: servicos ? servicos.length : 0
            });
        }
    );
});

// 4. Contato público (sem autenticação)
app.post('/api/contato', (req, res) => {
    const { nome, telefone, email, mensagem } = req.body;

    if (!nome || !telefone || !mensagem) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Nome, telefone e mensagem são obrigatórios' 
        });
    }

    db.run(
        `INSERT INTO contatos (nome, telefone, email, mensagem) 
         VALUES (?, ?, ?, ?)`,
        [nome, telefone, email || '', mensagem],
        function(err) {
            if (err) {
                console.error('Erro ao salvar contato:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao enviar mensagem' 
                });
            }

            // Em produção, enviar email de notificação aqui
            res.json({
                sucesso: true,
                mensagem: 'Mensagem enviada com sucesso! Responderemos em até 24h.',
                contato_id: this.lastID
            });
        }
    );
});

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========

const autenticar = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1] || 
                  req.query.token || 
                  req.body.token;
    
    if (!token) {
        return res.status(401).json({ 
            sucesso: false, 
            erro: 'Token de autenticação não fornecido' 
        });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.clienteId = decoded.id;
        req.clienteNome = decoded.nome;
        next();
    } catch (error) {
        console.error('Erro na autenticação:', error.message);
        return res.status(401).json({ 
            sucesso: false, 
            erro: 'Token inválido ou expirado' 
        });
    }
};

// ========== ROTAS PROTEGIDAS ==========

// 5. Obter perfil do cliente
app.get('/api/perfil', autenticar, (req, res) => {
    const clienteId = req.clienteId;

    db.get(
        'SELECT id, nome, telefone, email, instituicao, curso, saldo, data_cadastro FROM clientes WHERE id = ?',
        [clienteId],
        (err, cliente) => {
            if (err) {
                console.error('Erro ao buscar perfil:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar perfil' 
                });
            }
            
            if (!cliente) {
                return res.status(404).json({ 
                    sucesso: false, 
                    erro: 'Cliente não encontrado' 
                });
            }

            res.json({
                sucesso: true,
                cliente: cliente
            });
        }
    );
});

// 6. Atualizar perfil
app.put('/api/perfil', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const { nome, email, instituicao, curso } = req.body;

    db.run(
        `UPDATE clientes 
         SET nome = COALESCE(?, nome),
             email = COALESCE(?, email),
             instituicao = COALESCE(?, instituicao),
             curso = COALESCE(?, curso)
         WHERE id = ?`,
        [nome, email, instituicao, curso, clienteId],
        function(err) {
            if (err) {
                console.error('Erro ao atualizar perfil:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao atualizar perfil' 
                });
            }

            res.json({
                sucesso: true,
                mensagem: 'Perfil atualizado com sucesso!'
            });
        }
    );
});

// 7. Gerenciar trabalhos
// 7.1 Listar trabalhos
app.get('/api/trabalhos', autenticar, (req, res) => {
    const clienteId = req.clienteId;

    db.all(
        `SELECT t.*, 
                (SELECT COUNT(*) FROM pedidos p WHERE p.trabalho_id = t.id) as total_pedidos
         FROM trabalhos t 
         WHERE t.cliente_id = ? 
         ORDER BY t.data_registro DESC`,
        [clienteId],
        (err, trabalhos) => {
            if (err) {
                console.error('Erro ao buscar trabalhos:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar trabalhos' 
                });
            }

            res.json({
                sucesso: true,
                trabalhos: trabalhos || [],
                total: trabalhos ? trabalhos.length : 0
            });
        }
    );
});

// 7.2 Adicionar trabalho
app.post('/api/trabalhos', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const { titulo, disciplina, descricao, prazo } = req.body;

    if (!titulo || !disciplina) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Título e disciplina são obrigatórios' 
        });
    }

    db.run(
        `INSERT INTO trabalhos (cliente_id, titulo, disciplina, descricao, prazo) 
         VALUES (?, ?, ?, ?, ?)`,
        [clienteId, titulo, disciplina, descricao || '', prazo || null],
        function(err) {
            if (err) {
                console.error('Erro ao adicionar trabalho:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao adicionar trabalho' 
                });
            }

            res.json({
                sucesso: true,
                mensagem: 'Trabalho adicionado com sucesso!',
                trabalho_id: this.lastID
            });
        }
    );
});

// 8. Gerenciar pedidos
// 8.1 Criar pedido
app.post('/api/pedidos', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const { servico_id, trabalho_id, metodo_pagamento } = req.body;

    if (!servico_id || !metodo_pagamento) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Serviço e método de pagamento são obrigatórios' 
        });
    }

    // Verificar serviço
    db.get('SELECT * FROM servicos WHERE id = ?', [servico_id], (err, servico) => {
        if (err) {
            console.error('Erro ao buscar serviço:', err);
            return res.status(500).json({ 
                sucesso: false, 
                erro: 'Erro ao processar pedido' 
            });
        }
        
        if (!servico) {
            return res.status(404).json({ 
                sucesso: false, 
                erro: 'Serviço não encontrado' 
            });
        }

        // Verificar trabalho (se fornecido)
        if (trabalho_id) {
            db.get(
                'SELECT * FROM trabalhos WHERE id = ? AND cliente_id = ?',
                [trabalho_id, clienteId],
                (err, trabalho) => {
                    if (err) {
                        console.error('Erro ao verificar trabalho:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao processar pedido' 
                        });
                    }
                    
                    if (!trabalho) {
                        return res.status(404).json({ 
                            sucesso: false, 
                            erro: 'Trabalho não encontrado' 
                        });
                    }
                    criarPedido();
                }
            );
        } else {
            criarPedido();
        }

        function criarPedido() {
            // Verificar saldo se for pagamento com saldo
            if (metodo_pagamento === 'saldo') {
                db.get('SELECT saldo FROM clientes WHERE id = ?', [clienteId], (err, cliente) => {
                    if (err) {
                        console.error('Erro ao verificar saldo:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao processar pedido' 
                        });
                    }

                    if (!cliente) {
                        return res.status(404).json({ 
                            sucesso: false, 
                            erro: 'Cliente não encontrado' 
                        });
                    }

                    if (cliente.saldo < servico.preco) {
                        return res.json({ 
                            sucesso: false, 
                            erro: 'Saldo insuficiente',
                            saldo_atual: cliente.saldo,
                            valor_necessario: servico.preco,
                            faltam: servico.preco - cliente.saldo
                        });
                    }

                    // Debitar saldo
                    db.run(
                        'UPDATE clientes SET saldo = saldo - ? WHERE id = ?',
                        [servico.preco, clienteId],
                        (err) => {
                            if (err) {
                                console.error('Erro ao debitar saldo:', err);
                                return res.status(500).json({ 
                                    sucesso: false, 
                                    erro: 'Erro ao processar pagamento' 
                                });
                            }
                            finalizarPedido();
                        }
                    );
                });
            } else {
                finalizarPedido();
            }
        }

        function finalizarPedido() {
            // Criar pedido
            db.run(
                `INSERT INTO pedidos (cliente_id, servico_id, trabalho_id, valor_pago, metodo_pagamento) 
                 VALUES (?, ?, ?, ?, ?)`,
                [clienteId, servico_id, trabalho_id || null, servico.preco, metodo_pagamento],
                function(err) {
                    if (err) {
                        console.error('Erro ao criar pedido:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao criar pedido' 
                        });
                    }

                    const pedidoId = this.lastID;

                    // Registrar transação
                    db.run(
                        `INSERT INTO transacoes (cliente_id, tipo, valor, descricao, status) 
                         VALUES (?, 'servico', ?, ?, 'pendente')`,
                        [clienteId, servico.preco, `Pedido #${pedidoId} - ${servico.nome}`],
                        (err) => {
                            if (err) {
                                console.error('Erro ao registrar transação:', err);
                                // Não falhar o pedido se a transação falhar
                            }
                        }
                    );

                    res.json({
                        sucesso: true,
                        mensagem: 'Pedido criado com sucesso!',
                        pedido_id: pedidoId,
                        valor: servico.preco,
                        servico: servico.nome,
                        prazo_estimado: servico.prazo_medio,
                        status: 'pendente'
                    });
                }
            );
        }
    });
});

// 8.2 Listar pedidos do cliente
app.get('/api/pedidos', autenticar, (req, res) => {
    const clienteId = req.clienteId;

    db.all(
        `SELECT p.*, s.nome as servico_nome, s.descricao as servico_descricao,
                t.titulo as trabalho_titulo, t.disciplina as trabalho_disciplina
         FROM pedidos p
         JOIN servicos s ON p.servico_id = s.id
         LEFT JOIN trabalhos t ON p.trabalho_id = t.id
         WHERE p.cliente_id = ?
         ORDER BY p.data_pedido DESC`,
        [clienteId],
        (err, pedidos) => {
            if (err) {
                console.error('Erro ao buscar pedidos:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar pedidos' 
                });
            }

            res.json({
                sucesso: true,
                pedidos: pedidos || [],
                total: pedidos ? pedidos.length : 0
            });
        }
    );
});

// 9. Sistema de recarga
app.post('/api/recarregar', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const { valor, metodo } = req.body;

    // Validações
    if (!valor || !metodo) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Valor e método são obrigatórios' 
        });
    }
    
    if (valor < 50) {
        return res.json({ 
            sucesso: false, 
            erro: 'Valor mínimo: 50 MT' 
        });
    }
    
    if (valor > 5000) {
        return res.json({ 
            sucesso: false, 
            erro: 'Valor máximo: 5.000 MT' 
        });
    }

    // Gerar referência
    const referencia = `REC${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Registrar transação pendente
    db.run(
        `INSERT INTO transacoes (cliente_id, tipo, valor, descricao, referencia, status) 
         VALUES (?, 'deposito', ?, ?, ?, 'pendente')`,
        [clienteId, valor, `Recarga via ${metodo}`, referencia],
        function(err) {
            if (err) {
                console.error('Erro ao registrar recarga:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao registrar recarga' 
                });
            }

            // Instruções de pagamento
            const instrucoes = {
                mpesa: `Envie ${valor} MT para o número 84 728 6665 com a referência ${referencia}`,
                emola: `Use a referência ${referencia} no terminal e-Mola e envie ${valor} MT`,
                deposito: `Deposite ${valor} MT na conta BCI 1234567890 com a referência ${referencia}`
            };

            res.json({
                sucesso: true,
                mensagem: 'Solicitação de recarga registrada',
                transacao_id: this.lastID,
                referencia: referencia,
                valor: valor,
                metodo: metodo,
                instrucoes: instrucoes[metodo] || 'Siga as instruções do método escolhido',
                observacao: 'Após o pagamento, entraremos em contacto para confirmação.'
            });
        }
    );
});

// 10. Confirmar recarga (endpoint para admin/webhook)
app.post('/api/confirmar-recarga', (req, res) => {
    const { referencia, comprovante } = req.body;

    if (!referencia) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Referência é obrigatória' 
        });
    }

    // Buscar transação
    db.get(
        'SELECT * FROM transacoes WHERE referencia = ? AND status = "pendente"',
        [referencia],
        (err, transacao) => {
            if (err) {
                console.error('Erro ao buscar transação:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar transação' 
                });
            }
            
            if (!transacao) {
                return res.status(404).json({ 
                    sucesso: false, 
                    erro: 'Transação não encontrada ou já confirmada' 
                });
            }

            // Atualizar saldo
            db.run(
                'UPDATE clientes SET saldo = saldo + ? WHERE id = ?',
                [transacao.valor, transacao.cliente_id],
                (err) => {
                    if (err) {
                        console.error('Erro ao atualizar saldo:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao atualizar saldo' 
                        });
                    }

                    // Atualizar status da transação
                    db.run(
                        'UPDATE transacoes SET status = "concluido" WHERE id = ?',
                        [transacao.id],
                        (err) => {
                            if (err) {
                                console.error('Erro ao atualizar transação:', err);
                                // Continuar mesmo se falhar
                            }

                            res.json({
                                sucesso: true,
                                mensagem: 'Recarga confirmada com sucesso',
                                valor: transacao.valor,
                                cliente_id: transacao.cliente_id
                            });
                        }
                    );
                }
            );
        }
    );
});

// 11. Histórico de transações
app.get('/api/transacoes', autenticar, (req, res) => {
    const clienteId = req.clienteId;

    db.all(
        `SELECT * FROM transacoes 
         WHERE cliente_id = ? 
         ORDER BY data_transacao DESC 
         LIMIT 50`,
        [clienteId],
        (err, transacoes) => {
            if (err) {
                console.error('Erro ao buscar transações:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar transações' 
                });
            }

            res.json({
                sucesso: true,
                transacoes: transacoes || [],
                total: transacoes ? transacoes.length : 0
            });
        }
    );
});

// 12. Entregas do pedido
app.get('/api/entregas/:pedido_id', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const pedidoId = req.params.pedido_id;

    // Verificar se o pedido pertence ao cliente
    db.get(
        'SELECT * FROM pedidos WHERE id = ? AND cliente_id = ?',
        [pedidoId, clienteId],
        (err, pedido) => {
            if (err) {
                console.error('Erro ao verificar pedido:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar entregas' 
                });
            }
            
            if (!pedido) {
                return res.status(404).json({ 
                    sucesso: false, 
                    erro: 'Pedido não encontrado' 
                });
            }

            // Buscar entregas
            db.all(
                'SELECT * FROM entregas WHERE pedido_id = ? ORDER BY data_entrega DESC',
                [pedidoId],
                (err, entregas) => {
                    if (err) {
                        console.error('Erro ao buscar entregas:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao buscar entregas' 
                        });
                    }

                    res.json({
                        sucesso: true,
                        pedido: pedido,
                        entregas: entregas || [],
                        total: entregas ? entregas.length : 0
                    });
                }
            );
        }
    );
});

// 13. Contato/suporte (autenticado)
app.post('/api/suporte', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const { assunto, mensagem } = req.body;

    if (!assunto || !mensagem) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Assunto e mensagem são obrigatórios' 
        });
    }

    // Buscar informações do cliente
    db.get(
        'SELECT nome, telefone, email FROM clientes WHERE id = ?',
        [clienteId],
        (err, cliente) => {
            if (err || !cliente) {
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar informações do cliente' 
                });
            }

            // Salvar mensagem de suporte
            db.run(
                `INSERT INTO contatos (nome, telefone, email, mensagem) 
                 VALUES (?, ?, ?, ?)`,
                [cliente.nome, cliente.telefone, cliente.email, `[SUPORTE] ${assunto}: ${mensagem}`],
                function(err) {
                    if (err) {
                        console.error('Erro ao salvar suporte:', err);
                        return res.status(500).json({ 
                            sucesso: false, 
                            erro: 'Erro ao enviar mensagem' 
                        });
                    }

                    res.json({
                        sucesso: true,
                        mensagem: 'Mensagem enviada com sucesso! Responderemos em até 24h.',
                        ticket_id: `TKT${this.lastID.toString().padStart(6, '0')}`
                    });
                }
            );
        }
    );
});

// 14. Dashboard - estatísticas do cliente
app.get('/api/dashboard', autenticar, (req, res) => {
    const clienteId = req.clienteId;

    const estatisticas = {};

    // Total de pedidos
    db.get(
        'SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ?',
        [clienteId],
        (err, row) => {
            if (!err) estatisticas.total_pedidos = row.total;
            
            // Pedidos pendentes
            db.get(
                'SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ? AND status = "pendente"',
                [clienteId],
                (err, row) => {
                    if (!err) estatisticas.pedidos_pendentes = row.total;
                    
                    // Pedidos concluídos
                    db.get(
                        'SELECT COUNT(*) as total FROM pedidos WHERE cliente_id = ? AND status = "concluido"',
                        [clienteId],
                        (err, row) => {
                            if (!err) estatisticas.pedidos_concluidos = row.total;
                            
                            // Valor total gasto
                            db.get(
                                'SELECT SUM(valor_pago) as total FROM pedidos WHERE cliente_id = ? AND status = "concluido"',
                                [clienteId],
                                (err, row) => {
                                    if (!err) estatisticas.valor_total_gasto = row.total || 0;
                                    
                                    // Saldo atual
                                    db.get(
                                        'SELECT saldo FROM clientes WHERE id = ?',
                                        [clienteId],
                                        (err, cliente) => {
                                            if (!err) estatisticas.saldo_atual = cliente.saldo;
                                            
                                            // Trabalhos registrados
                                            db.get(
                                                'SELECT COUNT(*) as total FROM trabalhos WHERE cliente_id = ?',
                                                [clienteId],
                                                (err, row) => {
                                                    if (!err) estatisticas.trabalhos_registrados = row.total;
                                                    
                                                    res.json({
                                                        sucesso: true,
                                                        estatisticas: estatisticas,
                                                        atualizado_em: new Date().toISOString()
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// 15. Alterar senha
app.post('/api/alterar-senha', autenticar, async (req, res) => {
    const clienteId = req.clienteId;
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
        return res.status(400).json({ 
            sucesso: false, 
            erro: 'Senha atual e nova senha são obrigatórias' 
        });
    }

    // Buscar senha atual
    db.get(
        'SELECT senha FROM clientes WHERE id = ?',
        [clienteId],
        async (err, cliente) => {
            if (err || !cliente) {
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar informações do cliente' 
                });
            }

            // Verificar senha atual
            const senhaValida = await bcrypt.compare(senha_atual, cliente.senha);
            if (!senhaValida) {
                return res.status(401).json({ 
                    sucesso: false, 
                    erro: 'Senha atual incorreta' 
                });
            }

            // Gerar nova senha hash
            try {
                const novaSenhaHash = await bcrypt.hash(nova_senha, 10);
                
                db.run(
                    'UPDATE clientes SET senha = ? WHERE id = ?',
                    [novaSenhaHash, clienteId],
                    function(err) {
                        if (err) {
                            console.error('Erro ao alterar senha:', err);
                            return res.status(500).json({ 
                                sucesso: false, 
                                erro: 'Erro ao alterar senha' 
                            });
                        }

                        res.json({
                            sucesso: true,
                            mensagem: 'Senha alterada com sucesso!'
                        });
                    }
                );
            } catch (error) {
                console.error('Erro ao gerar hash da senha:', error);
                res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro interno do servidor' 
                });
            }
        }
    );
});

// 16. Rota para verificar status do pedido
app.get('/api/pedido/:id/status', autenticar, (req, res) => {
    const clienteId = req.clienteId;
    const pedidoId = req.params.id;

    db.get(
        `SELECT p.*, s.nome as servico_nome
         FROM pedidos p
         JOIN servicos s ON p.servico_id = s.id
         WHERE p.id = ? AND p.cliente_id = ?`,
        [pedidoId, clienteId],
        (err, pedido) => {
            if (err) {
                console.error('Erro ao buscar status do pedido:', err);
                return res.status(500).json({ 
                    sucesso: false, 
                    erro: 'Erro ao buscar status do pedido' 
                });
            }
            
            if (!pedido) {
                return res.status(404).json({ 
                    sucesso: false, 
                    erro: 'Pedido não encontrado' 
                });
            }

            res.json({
                sucesso: true,
                pedido: {
                    id: pedido.id,
                    servico: pedido.servico_nome,
                    valor: pedido.valor_pago,
                    status: pedido.status,
                    data_pedido: pedido.data_pedido,
                    data_conclusao: pedido.data_conclusao,
                    metodo_pagamento: pedido.metodo_pagamento
                }
            });
        }
    );
});

// Rota para servir todas as páginas do frontend
app.get('*', (req, res) => {
    // Verificar se é uma rota da API
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ 
            sucesso: false, 
            erro: 'Rota da API não encontrada' 
        });
    }
    
    // Tentar servir o arquivo estático
    const filePath = path.join(__dirname, req.path);
    
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
        return res.sendFile(filePath);
    }
    
    // Caso contrário, servir o index.html
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err.stack);
    res.status(500).json({ 
        sucesso: false, 
        erro: 'Erro interno do servidor',
        mensagem: process.env.NODE_ENV === 'development' ? err.message : 'Ocorreu um erro no servidor'
    });
});

// Inicializar servidor
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║                   FACILITAKI SERVER                      ║
╠══════════════════════════════════════════════════════════╣
║  Servidor rodando em: http://${HOST}:${PORT}             ║
║  Ambiente: ${process.env.NODE_ENV || 'development'}      ║
║  Banco de dados: ${dbPath}                               ║
║  Data: ${new Date().toLocaleString('pt-MZ')}             ║
║                                                          ║
║  Rotas principais:                                       ║
║  • GET  /              - Interface do usuário            ║
║  • GET  /health        - Health check                   ║
║  • GET  /api/info      - Informações do sistema         ║
║  • POST /api/cadastrar - Cadastro de cliente            ║
║  • POST /api/login     - Login                          ║
║  • GET  /api/servicos  - Listar serviços                ║
╚══════════════════════════════════════════════════════════╝
    `);
});

// Tratamento de encerramento gracioso
process.on('SIGTERM', () => {
    console.log('Recebido SIGTERM, encerrando servidor...');
    server.close(() => {
        db.close((err) => {
            if (err) {
                console.error('Erro ao fechar banco de dados:', err);
            } else {
                console.log('Banco de dados fechado com sucesso.');
            }
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('Recebido SIGINT, encerrando servidor...');
    server.close(() => {
        db.close();
        process.exit(0);
    });
});

// Manter conexão do banco viva
setInterval(() => {
    db.get('SELECT 1', (err) => {
        if (err) {
            console.error('Erro na conexão do banco de dados:', err.message);
        }
    });
}, 300000); // A cada 5 minutos

module.exports = app;