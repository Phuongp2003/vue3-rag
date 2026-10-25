import * as fs from 'fs';
import { getDbClient } from '../db';
import { PresetStore } from '../llm-caller';
import { VueDocumentRepository } from './repository';

export async function ingestAgentParsedBatch(filePath: string): Promise<number> {
  const prisma = getDbClient();
  const store = await PresetStore.init();
  const repo = new VueDocumentRepository(prisma, store);

  const raw = fs.readFileSync(filePath, 'utf8');
  const items = JSON.parse(raw);

  let count = 0;
  for (const item of items) {
    await repo.upsertDocument(item);
    count++;
  }
  return count;
}
