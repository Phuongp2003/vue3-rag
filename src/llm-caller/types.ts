export type Protocol = 'openai' | 'anthropic';
export type ModelType = 'chat' | 'embedding';

export interface Provider {
  id: string;
  name: string;
  protocol: Protocol;
  baseUrl: string;
  apiKey?: string;
  customHeaders?: Record<string, string>;
}

export interface Model {
  id: string;
  providerId: string;
  modelName: string;
  type: ModelType;
  contextWindow?: number;
  defaultParams?: Record<string, any>;
}

export interface ModelWithProvider extends Omit<Model, 'providerId'> {
  provider: Provider;
}

export interface Setting {
  key: string;
  group: string;
  value: string;
  title?: string;
  description?: string;
  extraContent?: any;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallPayload {
  prompt?: string;
  messages?: ChatMessage[];
  system?: string;
  input?: string | string[];
  text?: string;
}

export interface CallResult {
  raw: any;
  content: string | null;
  embedding?: number[] | null;
  usage?: any;
}
