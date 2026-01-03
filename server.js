console.log('🔍 URL da API:', API_URL);

// Função de teste
window.testarUpload = async function() {
    console.log('🧪 Testando upload...');
    
    // Criar um arquivo de teste
    const file = new File(['conteudo de teste'], 'teste.txt', { type: 'text/plain' });
    arquivoSelecionado = file;
    
    // Testar a rota
    try {
        const response = await fetch(`${API_URL}/api/pedidos/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer test'
            },
            body: JSON.stringify({ test: true })
        });
        console.log('📤 Resposta do teste:', response.status, response.statusText);
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
};

// No console do navegador, execute: testarUpload()
