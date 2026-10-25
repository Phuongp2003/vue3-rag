import { PresetStore } from './db';
import { callLLM, streamLLM } from './caller';
import { CallPayload, CallResult } from './types';

export * from './types';
export * from './db';
export * from './caller';

export async function callByModelId(
  store: PresetStore,
  modelId: string,
  options: { payload?: CallPayload; customParams?: Record<string, any> } = {}
): Promise<CallResult> {
  const modelConfig = store.getModelWithProvider(modelId);
  if (!modelConfig) {
    throw new Error(`Model not found in SQLite: ${modelId}`);
  }

  return callLLM({
    provider: modelConfig.provider,
    model: modelConfig,
    endpointType: modelConfig.type,
    payload: options.payload || {},
    customParams: options.customParams || {}
  });
}

export async function streamByModelId(
  store: PresetStore,
  modelId: string,
  options: { payload?: CallPayload; customParams?: Record<string, any> } = {},
  onToken: (token: string) => void
): Promise<void> {
  const modelConfig = store.getModelWithProvider(modelId);
  if (!modelConfig) {
    throw new Error(`Model not found in SQLite: ${modelId}`);
  }
  if (modelConfig.type !== 'chat') {
    throw new Error(`Model ${modelId} is not a chat model (type: ${modelConfig.type})`);
  }

  return streamLLM(
    {
      provider: modelConfig.provider,
      model: modelConfig,
      endpointType: 'chat',
      payload: options.payload || {},
      customParams: options.customParams || {}
    },
    onToken
  );
}
