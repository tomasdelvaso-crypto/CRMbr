// Modificar las funciones en AIAssistant.tsx para usar el proxy

// Función para búsqueda web a través del proxy
const searchWebWithSerper = async (query: string): Promise<any[]> => {
  try {
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        action: 'search',
        data: {
          q: query,
          num: 10,
          gl: 'br',
          hl: 'pt'
        }
      })
    });
    
    if (!response.ok) {
      console.error('Error en búsqueda:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.organic || [];
  } catch (error) {
    console.error('Error buscando en web:', error);
    return [];
  }
};

// Función para llamar a Claude a través del proxy
const callClaudeAPI = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'claude',
        data: {
          model: 'claude-3-sonnet-20241022',
          max_tokens: 2000,
          messages: [
            { 
              role: 'user', 
              content: `Você é um assistente de vendas especializado na metodologia PPVVCC para a Ventapel Brasil.
              
              Contexto da Ventapel:
              - Vendemos soluções de embalagem e fechamento
              - Produtos: fitas adesivas, máquinas seladoras, stretch film, void fill
              - Atendemos e-commerce, indústria e logística
              - Foco em otimização de processos de embalagem
              - Redução de custos e aumento de eficiência
              
              Sempre responda em português do Brasil de forma direta e acionável.
              ${prompt}`
            }
          ]
        }
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Erro na API:', error);
    return 'Desculpe, não consegui processar sua solicitação no momento.';
  }
};
