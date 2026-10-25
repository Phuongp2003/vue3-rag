import * as http from 'http';
import { URL } from 'url';
import { PresetStore, callByModelId, streamByModelId } from './llm-caller';
import { renderView } from './ejs-templates';
import { getDbClient } from './db';
import { VueDocumentRepository } from './vue3-documents';
import { ToolRegistry } from './tools';

function parseJsonBody(req: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        return reject(new Error('Payload too large (max 1MB).'));
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export async function createServer(store: PresetStore, port = 3000): Promise<http.Server> {
  const prisma = getDbClient();
  const vueRepo = new VueDocumentRepository(prisma, store);
  const toolRegistry = new ToolRegistry(vueRepo, store);

  const server = http.createServer(async (req, res) => {
    const rawHost = req.headers.host || 'localhost';
    const parsedUrl = new URL(req.url || '/', `http://${rawHost}`);
    const pathname = parsedUrl.pathname;
    const method = req.method?.toUpperCase();

    const sendHtml = (html: string) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    };
    const sendJson = (data: any, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const menuItems = [
      { label: 'API & Components', url: '/documents', active: pathname === '/' || pathname === '/documents' },
      { label: 'AI Assistant', url: '/chat', active: pathname === '/chat' },
      { label: 'Providers', url: '/providers', active: pathname.startsWith('/providers') },
      { label: 'Settings', url: '/settings', active: pathname === '/settings' }
    ];

    try {
      // Root redirect to /documents
      if (pathname === '/') {
        res.writeHead(302, { Location: '/documents' });
        return res.end();
      }

      // 1. VUE 3 WIKI VIEW: GET /documents
      if (method === 'GET' && pathname === '/documents') {
        const html = await renderView('documents', { documents: [] }, {
          title: 'Vue 3 Documentation & Components',
          brand: 'Vue 3 Docs',
          menuItems
        });
        return sendHtml(html);
      }

      // API: Multi-mode Search with Top-K Debug info (GET /api/documents)
      if (method === 'GET' && pathname === '/api/documents') {
        const query = (parsedUrl.searchParams.get('q') || '').trim();
        const category = (parsedUrl.searchParams.get('category') || 'ALL').trim();
        const mode = (parsedUrl.searchParams.get('mode') || 'hybrid') as any;
        const hybridWeight = parseFloat(parsedUrl.searchParams.get('weight') || '0.5');
        const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(10, parseInt(parsedUrl.searchParams.get('limit') || '30')));

        const result = await vueRepo.searchDocuments({
          query,
          category,
          mode,
          hybridWeight,
          page,
          limit,
          topKDebug: 5
        });

        return sendJson(result);
      }

      // API: Get Single Document Detail (GET /api/documents/:id)
      const docDetailMatch = pathname.match(/^\/api\/documents\/([^\/]+)$/);
      if (method === 'GET' && docDetailMatch) {
        const id = docDetailMatch[1];
        const doc = await vueRepo.getDocumentById(id);
        if (!doc) return sendJson({ error: 'Document not found' }, 404);
        return sendJson(doc);
      }

      // API: Re-index embeddings dynamically (POST /api/documents/reindex)
      if (method === 'POST' && pathname === '/api/documents/reindex') {
        const count = await vueRepo.reindexAllEmbeddings();
        return sendJson({ success: true, count });
      }

      // API: Tool Registry & Configuration
      if (method === 'GET' && pathname === '/api/tools') {
        return sendJson(toolRegistry.getTools());
      }

      if (method === 'POST' && pathname === '/api/tools/toggle') {
        const body = await parseJsonBody(req);
        toolRegistry.setToolStatus(body.name, body.enabled);
        return sendJson({ success: true, tools: toolRegistry.getTools() });
      }

      // 2. CHAT VIEW: GET /chat
      if (method === 'GET' && pathname === '/chat') {
        const chatModels = store.getAllChatModels();
        const tools = toolRegistry.getTools();
        const html = await renderView('chat', { chatModels, tools }, {
          title: 'Vue 3 AI Assistant',
          brand: 'Vue 3 Docs',
          menuItems
        });
        return sendHtml(html);
      }

      // 3. SETTINGS VIEW: GET /settings
      if (method === 'GET' && pathname === '/settings') {
        const embeddingModels = store.getAllEmbeddingModels();
        const activeSetting = store.getSetting('active_model', 'embedding');
        const defaultModeSetting = store.getSetting('default_mode', 'search');
        const defaultWeightSetting = store.getSetting('default_weight', 'search');

        const html = await renderView('settings', {
          embeddingModels,
          activeEmbeddingId: activeSetting?.value || (embeddingModels[0]?.id || ''),
          defaultMode: defaultModeSetting?.value || 'hybrid',
          defaultWeight: defaultWeightSetting ? parseFloat(defaultWeightSetting.value) : 0.5
        }, {
          title: 'System Settings',
          brand: 'Vue 3 Docs',
          menuItems
        });
        return sendHtml(html);
      }

      // API: Save Active Embedding Model Setting
      if (method === 'POST' && pathname === '/api/settings/embedding-model') {
        const body = await parseJsonBody(req);
        store.upsertSetting({
          key: 'active_model',
          group: 'embedding',
          value: body.modelId,
          title: 'Active Semantic Embedding Model',
          description: 'Model ID used to compute vector embeddings'
        });
        return sendJson({ success: true });
      }

      // API: Save Search Defaults Setting
      if (method === 'POST' && pathname === '/api/settings/search-defaults') {
        const body = await parseJsonBody(req);
        store.upsertSetting({
          key: 'default_mode',
          group: 'search',
          value: body.mode || 'hybrid',
          title: 'Default Search Mode',
          description: 'fuzzy, semantic, or hybrid'
        });
        store.upsertSetting({
          key: 'default_weight',
          group: 'search',
          value: (body.weight !== undefined ? body.weight : 0.5).toString(),
          title: 'Default Hybrid Semantic Weight',
          description: 'Value between 0.0 and 1.0'
        });
        return sendJson({ success: true });
      }

      // API: Agentic Chat with Autonomous Turning, Intent Compacting & Trace Stream (POST /api/chat/stream)
      if (method === 'POST' && pathname === '/api/chat/stream') {
        const body = await parseJsonBody(req);
        const { modelId, messages } = body;

        if (!modelId) {
          return sendJson({ error: 'modelId is required' }, 400);
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        const sendEvent = (event: string, payload: any) => {
          if (!res.writableEnded) {
            res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
          }
        };

        try {
          const enabledTools = toolRegistry.getEnabledTools();
          const lastUserMessage = messages[messages.length - 1]?.content || '';

          // Tool: search_vue3_knowledge_base
          const kbTool = enabledTools.find(t => t.name === 'search_vue3_knowledge_base');
          if (kbTool && lastUserMessage.length > 2) {
            sendEvent('turn_start', {
              step: 'INTENT_PLANNING',
              title: 'Analyzing Intent & Turning',
              detail: 'Translating user prompt into technical problem scope and compacting keywords...'
            });

            const plan = await toolRegistry.compactUserIntent(lastUserMessage, modelId);

            sendEvent('tool_trace', {
              toolName: 'intent_planner',
              input: { rawPrompt: lastUserMessage },
              output: {
                compactQuery: plan.compactQuery,
                selectedCategory: plan.category,
                selectedMode: plan.mode,
                hybridWeight: plan.hybridWeight,
                reasoning: plan.reasoning
              }
            });

            sendEvent('turn_start', {
              step: 'TOOL_INSPECTION',
              title: 'Executing Knowledge Base Search',
              detail: `Searching KB with query: "${plan.compactQuery}" [Mode: ${plan.mode.toUpperCase()}, Weight: ${Math.round(plan.hybridWeight * 100)}%]`
            });

            const toolOutput = await toolRegistry.executeTool('search_vue3_knowledge_base', {
              query: plan.compactQuery,
              category: plan.category,
              mode: plan.mode,
              hybridWeight: plan.hybridWeight
            });

            sendEvent('tool_trace', {
              toolName: 'search_vue3_knowledge_base',
              input: { query: plan.compactQuery, category: plan.category, mode: plan.mode, weight: plan.hybridWeight },
              output: toolOutput
            });

            const contextText = (toolOutput.topMatches || [])
              .map((m: any) => `### ${m.title} (v${m.vueVersion})\nCategory: ${m.category}\nSummary: ${m.summary}\nUse Cases: ${m.useCases.join(', ')}`)
              .join('\n\n');

            messages.splice(messages.length - 1, 0, {
              role: 'system',
              content: `You have access to Vue 3 official knowledge base.
User Problem: "${lastUserMessage}"
Identified Technical Concept: "${plan.compactQuery}"
Relevant Vue 3 Documentation:\n${contextText}

Instructions:
1. Explain the optimal Vue 3 solution (e.g. Teleport, Provide/Inject, KeepAlive, etc.).
2. Provide code examples comparing Composition API (<script setup>) and Options API.
3. Be direct, concise, and focused on practical architecture.`
            });
          }

          sendEvent('turn_start', {
            step: 'MODEL_GENERATION',
            title: 'Generating Response',
            detail: `Streaming output via model ${modelId}`
          });

          await streamByModelId(
            store,
            modelId,
            { payload: { messages } },
            (token: string) => {
              sendEvent('token', { token });
            }
          );

          sendEvent('turn_end', { step: 'COMPLETED' });
          if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
          }
        } catch (streamErr: any) {
          sendEvent('error', { error: streamErr.message });
        }
        if (!res.writableEnded) {
          return res.end();
        }
      }

      // 4. PROVIDERS VIEW: GET /providers
      if (method === 'GET' && pathname === '/providers') {
        const providers = store.getAllProviders();
        const html = await renderView('providers', { providers }, {
          title: 'Providers',
          brand: 'Vue 3 Docs',
          menuItems
        });
        return sendHtml(html);
      }

      // API: Provider CRUD
      if (method === 'POST' && pathname === '/api/providers') {
        const body = await parseJsonBody(req);
        store.upsertProvider(body);
        return sendJson({ success: true });
      }

      if (method === 'POST' && pathname === '/api/providers/bulk') {
        const list = await parseJsonBody(req);
        if (Array.isArray(list)) {
          for (const item of list) store.upsertProvider(item);
        }
        return sendJson({ success: true, count: list.length });
      }

      if (method === 'DELETE' && pathname.startsWith('/api/providers/')) {
        const id = pathname.replace('/api/providers/', '');
        store.deleteProvider(id);
        return sendJson({ success: true });
      }

      // 5. MODELS VIEW: GET /providers/:id/models
      const modelsPageMatch = pathname.match(/^\/providers\/([^\/]+)\/models$/);
      if (method === 'GET' && modelsPageMatch) {
        const providerId = modelsPageMatch[1];
        const provider = store.getProvider(providerId);
        if (!provider) {
          res.writeHead(404);
          return res.end('Provider not found');
        }
        const models = store.getModelsByProvider(providerId);
        const html = await renderView('models', { provider, models }, {
          title: `Models - ${provider.name}`,
          brand: 'Vue 3 Docs',
          menuItems
        });
        return sendHtml(html);
      }

      if (method === 'POST' && pathname.match(/^\/api\/providers\/([^\/]+)\/models$/)) {
        const body = await parseJsonBody(req);
        store.upsertModel(body);
        return sendJson({ success: true });
      }

      if (method === 'DELETE' && pathname.match(/^\/api\/providers\/([^\/]+)\/models\/([^\/]+)$/)) {
        const matches = pathname.match(/^\/api\/providers\/([^\/]+)\/models\/([^\/]+)$/);
        const modelId = matches ? matches[2] : '';
        store.deleteModel(modelId);
        return sendJson({ success: true });
      }

      // API: Ping & Test Model
      const pingMatch = pathname.match(/^\/api\/models\/([^\/]+)\/ping$/);
      if (method === 'POST' && pingMatch) {
        const modelId = pingMatch[1];
        const startTime = Date.now();
        const modelConfig = store.getModelWithProvider(modelId);
        if (!modelConfig) return sendJson({ error: 'Model not found' }, 404);

        const payload = modelConfig.type === 'chat' ? { prompt: 'ping' } : { text: 'ping' };
        const resData = await callByModelId(store, modelId, {
          payload,
          customParams: modelConfig.type === 'chat' ? { max_tokens: 5 } : {}
        });
        const latencyMs = Date.now() - startTime;
        return sendJson({ success: true, latencyMs, ...resData });
      }

      const testMatch = pathname.match(/^\/api\/models\/([^\/]+)\/test$/);
      if (method === 'POST' && testMatch) {
        const modelId = testMatch[1];
        const body = await parseJsonBody(req);
        const resData = await callByModelId(store, modelId, {
          payload: { prompt: body.prompt || 'hello' },
          customParams: body.customParams || {}
        });
        return sendJson({ success: true, ...resData });
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err: any) {
      sendJson({ error: err.message || 'Internal Server Error' }, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}
