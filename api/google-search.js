// api/google-search.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  const SERPER_API_KEY = process.env.SERPER_API_KEY; // Ya lo tenés!

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query + ' Brasil empresa',
        gl: 'br',
        hl: 'pt',
        num: 5
      })
    });

    const data = await response.json();
    
    // Extraer info relevante
    const results = (data.organic || []).map(item => ({
      title: item.title,
      snippet: item.snippet,
      link: item.link,
      // Buscar métricas en el snippet
      hasRevenue: item.snippet?.includes('R$') || item.snippet?.includes('milhões'),
      hasEmployees: item.snippet?.match(/\d+\s*(funcionários|empleados)/i)
    }));

    return res.status(200).json({ 
      success: true,
      results,
      query
    });

  } catch (error) {
    console.error('Error Serper:', error);
    return res.status(200).json({ 
      success: false,
      results: [],
      error: error.message
    });
  }
}
