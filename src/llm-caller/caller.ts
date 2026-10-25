import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { Provider, ModelWithProvider, CallPayload, CallResult, ChatMessage } from './types';

export function httpRequest(targetUrl: string, options: { method?: string; headers?: Record<string, string> } = {}, body: any = null): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const bodyData = body
      ? (typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(JSON.stringify(body), 'utf8'))
      : null;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };
    if (bodyData) {
      reqHeaders['Content-Length'] = bodyData.length.toString();
    }

    const reqOptions: http.RequestOptions = {
      method: options.method || 'GET',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: reqHeaders
    };

    const req = client.request(reqOptions, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.from(chunk)));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}

        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } else {
          const err: any = new Error(`HTTP ${res.statusCode}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
          err.status = res.statusCode;
          err.response = parsed;
          reject(err);
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

export function httpStreamRequest(
  targetUrl: string,
  options: { method?: string; headers?: Record<string, string> } = {},
  body: any = null,
  onChunk: (rawText: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const bodyData = body
      ? (typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(JSON.stringify(body), 'utf8'))
      : null;

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };
    if (bodyData) {
      reqHeaders['Content-Length'] = bodyData.length.toString();
    }

    const reqOptions: http.RequestOptions = {
      method: options.method || 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: reqHeaders
    };

    const req = client.request(reqOptions, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        let errData = '';
        res.on('data', c => errData += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errData}`)));
        return;
      }

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        onChunk(chunk);
      });
      res.on('end', () => resolve());
      res.on('error', reject);
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

export interface CallLLMOptions {
  provider: Provider;
  model: { modelName: string; defaultParams?: Record<string, any> };
  endpointType?: 'chat' | 'embedding';
  payload?: CallPayload;
  customParams?: Record<string, any>;
}

export async function callLLM({ provider, model, endpointType = 'chat', payload = {}, customParams = {} }: CallLLMOptions): Promise<CallResult> {
  const protocol = provider.protocol;
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const apiKey = provider.apiKey || '';
  const mergedParams = { ...customParams };

  if (protocol === 'openai') {
    let url: string;
    let requestBody: any;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(provider.customHeaders || {})
    };

    if (endpointType === 'chat') {
      url = `${baseUrl}/chat/completions`;
      requestBody = {
        model: model.modelName,
        messages: payload.messages || [{ role: 'user', content: payload.prompt || '' }],
        ...(model.defaultParams || {}),
        ...mergedParams
      };
    } else if (endpointType === 'embedding') {
      url = `${baseUrl}/embeddings`;
      requestBody = {
        model: model.modelName,
        input: payload.input || payload.text || '',
        ...(model.defaultParams || {}),
        ...mergedParams
      };
    } else {
      throw new Error(`Unsupported endpointType for OpenAI: ${endpointType}`);
    }

    const res = await httpRequest(url, { method: 'POST', headers }, requestBody);
    return {
      raw: res.data,
      content: res.data.choices?.[0]?.message?.content || null,
      embedding: res.data.data?.[0]?.embedding || null,
      usage: res.data.usage || null
    };
  }

  if (protocol === 'anthropic') {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(provider.customHeaders || {})
    };

    if (endpointType === 'chat') {
      const url = `${baseUrl}/messages`;
      const messages: ChatMessage[] = payload.messages ? [...payload.messages] : [{ role: 'user', content: payload.prompt || '' }];
      let systemPrompt = payload.system || undefined;
      const filteredMessages: ChatMessage[] = [];

      for (const m of messages) {
        if (m.role === 'system') {
          systemPrompt = m.content;
        } else {
          filteredMessages.push(m);
        }
      }

      const requestBody = {
        model: model.modelName,
        max_tokens: mergedParams.max_tokens || (model.defaultParams && model.defaultParams.max_tokens) || 1024,
        messages: filteredMessages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        ...(model.defaultParams || {}),
        ...mergedParams
      };

      const res = await httpRequest(url, { method: 'POST', headers }, requestBody);
      return {
        raw: res.data,
        content: res.data.content?.[0]?.text || null,
        usage: res.data.usage || null
      };
    }

    throw new Error(`Anthropic does not have a native embeddings endpoint`);
  }

  throw new Error(`Unsupported protocol: ${protocol}`);
}

export async function streamLLM(
  { provider, model, payload = {}, customParams = {} }: CallLLMOptions,
  onToken: (token: string) => void
): Promise<void> {
  const protocol = provider.protocol;
  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  const apiKey = provider.apiKey || '';
  const mergedParams = { ...customParams };

  if (protocol === 'openai') {
    const url = `${baseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(provider.customHeaders || {})
    };
    const requestBody = {
      model: model.modelName,
      messages: payload.messages || [{ role: 'user', content: payload.prompt || '' }],
      stream: true,
      ...(model.defaultParams || {}),
      ...mergedParams
    };

    let buffer = '';
    await httpStreamRequest(url, { method: 'POST', headers }, requestBody, (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '').trim();
        if (dataStr === '[DONE]') continue;
        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onToken(delta);
        } catch (_) {}
      }
    });
    return;
  }

  if (protocol === 'anthropic') {
    const url = `${baseUrl}/messages`;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      ...(provider.customHeaders || {})
    };

    const messages: ChatMessage[] = payload.messages ? [...payload.messages] : [{ role: 'user', content: payload.prompt || '' }];
    let systemPrompt = payload.system || undefined;
    const filteredMessages: ChatMessage[] = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemPrompt = m.content;
      } else {
        filteredMessages.push(m);
      }
    }

    const requestBody = {
      model: model.modelName,
      max_tokens: mergedParams.max_tokens || (model.defaultParams && model.defaultParams.max_tokens) || 1024,
      messages: filteredMessages,
      stream: true,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      ...(model.defaultParams || {}),
      ...mergedParams
    };

    let buffer = '';
    await httpStreamRequest(url, { method: 'POST', headers }, requestBody, (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.replace(/^data:\s*/, '').trim();
        try {
          const json = JSON.parse(dataStr);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            onToken(json.delta.text || '');
          }
        } catch (_) {}
      }
    });
    return;
  }

  throw new Error(`Unsupported protocol for stream: ${protocol}`);
}
