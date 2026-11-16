import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// Initialize GoogleGenAI server-side with required headers
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch (err) {
      console.error('Failed to initialize server-side GoogleGenAI:', err);
      return null;
    }
  }
  return aiClient;
}

// Health check route
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

// Dedicated Inventory Analysis Endpoint
app.post('/api/gemini/inventory-analysis', async (req: Request, res: Response) => {
  try {
    const { officeName, contextData } = req.body;
    const ai = getAI();

    if (!ai) {
      return res.status(200).json({
        success: false,
        fallback: true,
        message: 'GEMINI_API_KEY is not configured on server.',
      });
    }

    const prompt = `أنت خبير سلاسل إمداد طبية وإدارة مستودعات للمستشفيات والمكاتب الطبية في العراق.
قم بتحليل بيانات المخزون التالية لمكتب "${officeName || 'المكتب الطبي'}" وقدم تقريراً استراتيجياً باللغة العربية:
بيانات المخزون:
${JSON.stringify(contextData, null, 2)}

أرجع الناتج بصيغة JSON حصراً بالشكل التالي بدون أي نصوص إضافية:
{
  "summary": "نص موجز عن صحة المستودع وحالته العامة",
  "urgentActions": ["إجراء عاجل 1", "إجراء عاجل 2"],
  "reorderRecommendations": [
    {"productName": "اسم المادة", "recommendedQty": 50, "rationale": "السبب"}
  ],
  "expiryWarnings": [
    {"productName": "اسم المادة", "lotNumber": "LOT...", "daysLeft": 45, "action": "الإجراء المقترح (مثل خصم ترويجي أو تحويل)"}
  ]
}`;

    // Prefer gemini-3.8-flash, fallback to gemini-3.1-flash-lite with fast timeout handling
    let responseText = '';
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout contacting Gemini model ${modelName}`)), 10000)
        );
        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        if (response?.text) {
          responseText = response.text;
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} failed or timed out:`, err?.message || err);
      }
    }

    if (!responseText) {
      if (lastError) throw lastError;
      return res.status(500).json({ success: false, error: 'Empty response from Gemini' });
    }

    // Clean potential markdown fencing if present
    const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error in /api/gemini/inventory-analysis:', error);
    return res.status(200).json({
      success: false,
      fallback: true,
      error: error?.message || 'Server error processing Gemini request',
    });
  }
});

// General server-side prompt endpoint
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, model = 'gemini-3.8-flash', systemInstruction } = req.body;
    const ai = getAI();

    if (!ai) {
      return res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' });
    }

    const response = await ai.models.generateContent({
      model: model || 'gemini-3.8-flash',
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });

    return res.json({ text: response.text });
  } catch (error: any) {
    console.error('Error in /api/gemini/generate:', error);
    return res.status(500).json({ error: error?.message || 'Gemini generation failed' });
  }
});

// Streaming generation endpoint (SSE)
app.post('/api/gemini/stream', async (req: Request, res: Response) => {
  try {
    const { prompt, model = 'gemini-3.8-flash', systemInstruction } = req.body;
    const ai = getAI();

    if (!ai) {
      res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ai.models.generateContentStream({
      model: model || 'gemini-3.8-flash',
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Error in /api/gemini/stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message || 'Streaming failed' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error?.message })}\n\n`);
      res.end();
    }
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (!isProduction) {
    const viteReady = import('vite').then(({ createServer }) =>
      createServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true',
        },
        appType: 'spa',
      })
    );

    viteReady.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await viteReady;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port} (mode: ${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
