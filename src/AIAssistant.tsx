// Reemplazá estas funciones en src/AIAssistant.tsx

const searchWeb = async (query: string): Promise<any> => {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'search',  // <-- Cambió de 'searchWeb' a 'search'
        data: {
          q: query,
          gl: 'br',
          hl: 'pt',
          num: 10
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching web:', error);
    throw error;
  }
};

const generateWithClaude = async (messages: any[], system?: string): Promise<string> => {
  try {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'claude',  // <-- Cambió de 'generateWithClaude' a 'claude'
        data: {
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          messages: messages,
          system: system || "Eres un asistente de ventas B2B experto en la metodología PPVVCC (Poder, Problema/Dolor, Visión, Valor, Control, Compras). Ayudas a analizar oportunidades comerciales y generar estrategias de venta consultiva."
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error generating with Claude:', error);
    throw error;
  }
};
