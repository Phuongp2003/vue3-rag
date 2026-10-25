import { PresetStore } from './llm-caller';
import { createServer } from './server';

async function main() {
  const store = await PresetStore.init();
  const PORT = Number(process.env.PORT) || 3000;
  await createServer(store, PORT);
  console.log(`Vue 3 RAG Demo Server running at http://localhost:${PORT}`);
}

main().catch(console.error);
