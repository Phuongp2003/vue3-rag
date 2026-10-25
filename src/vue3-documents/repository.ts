import { PrismaClient, VueDocument } from '../db';
import { PresetStore, callLLM } from '../llm-caller';
import { generateTextEmbedding, cosineSimilarity } from './embedding-engine';

export interface VueSearchOptions {
  query: string;
  category?: string;
  mode?: 'fuzzy' | 'semantic' | 'hybrid';
  hybridWeight?: number; // 0 = 100% fuzzy, 1 = 100% semantic, default = 0.5
  page?: number;
  limit?: number;
  queryEmbedding?: number[];
  topKDebug?: number;
}

export interface SearchDebugEntry {
  docId: string;
  slug: string;
  title: string;
  category: string;
  fuzzyScore: number;
  semanticScore: number;
  hybridScore: number;
}

export interface VueSearchResult {
  doc: VueDocument;
  score: number;
  matchType: 'fuzzy' | 'semantic' | 'hybrid';
  scores: {
    fuzzy: number;
    semantic: number;
    hybrid: number;
  };
}

function calculateFuzzyScore(query: string, doc: { title: string; useCases: string; summary: string }): number {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return 0;

  const titleLower = doc.title.toLowerCase();
  const useCasesLower = doc.useCases.toLowerCase();
  const summaryLower = doc.summary.toLowerCase();

  let score = 0;
  for (const t of terms) {
    const wordRegex = new RegExp(`\\b${t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (wordRegex.test(titleLower)) {
      score += 6.0;
    } else if (titleLower.includes(t)) {
      score += 4.0;
    }

    if (wordRegex.test(useCasesLower)) {
      score += 4.0;
    } else if (useCasesLower.includes(t)) {
      score += 2.0;
    }

    if (summaryLower.includes(t)) {
      score += 1.0;
    }
  }

  return Math.min(1.0, score / (terms.length * 6.0));
}

export class VueDocumentRepository {
  constructor(
    private prisma: PrismaClient,
    private presetStore: PresetStore
  ) {}

  /**
   * Helper to fetch real embeddings from active LLM provider if configured
   */
  async computeEmbeddingWithProvider(text: string): Promise<number[] | null> {
    const embeddingModels = this.presetStore.getAllEmbeddingModels();
    if (embeddingModels.length === 0) return null;

    // Check if user set an explicit active embedding model in settings
    const activeSetting = this.presetStore.getSetting('active_model', 'embedding');
    let chosenModel = embeddingModels[0];
    if (activeSetting && activeSetting.value) {
      const match = embeddingModels.find(m => m.id === activeSetting.value);
      if (match) chosenModel = match;
    }

    try {
      const res = await callLLM({
        provider: chosenModel.provider,
        model: chosenModel,
        endpointType: 'embedding',
        payload: { input: text }
      });
      if (res.embedding && Array.isArray(res.embedding) && res.embedding.length > 0) {
        return res.embedding;
      }
    } catch (_) {
      // Fallback to local neural-like feature embedding
    }
    return null;
  }

  async upsertDocument(data: {
    slug: string;
    title: string;
    category: string;
    vueVersion?: string;
    summary: string;
    rawMarkdown: string;
    compositionCode?: string;
    optionsCode?: string;
    useCases: string[];
    sourceUrl?: string;
    embedding?: number[];
  }): Promise<VueDocument> {
    const version = data.vueVersion || '3.5.0';

    const doc = await this.prisma.vueDocument.upsert({
      where: { slug: data.slug },
      update: {
        title: data.title,
        category: data.category,
        vueVersion: version,
        summary: data.summary,
        rawMarkdown: data.rawMarkdown,
        compositionCode: data.compositionCode || null,
        optionsCode: data.optionsCode || null,
        useCases: data.useCases,
        sourceUrl: data.sourceUrl || null
      },
      create: {
        slug: data.slug,
        title: data.title,
        category: data.category,
        vueVersion: version,
        summary: data.summary,
        rawMarkdown: data.rawMarkdown,
        compositionCode: data.compositionCode || null,
        optionsCode: data.optionsCode || null,
        useCases: data.useCases,
        sourceUrl: data.sourceUrl || null
      }
    });

    const docText = `${data.title} ${data.summary} ${data.useCases.join(' ')}`;
    let embedding = data.embedding && data.embedding.length > 0 ? data.embedding : null;

    if (!embedding) {
      embedding = await this.computeEmbeddingWithProvider(docText);
    }
    if (!embedding) {
      embedding = generateTextEmbedding(docText);
    }

    this.presetStore.upsertVueSearchIndex({
      docId: doc.id,
      slug: doc.slug,
      title: doc.title,
      category: doc.category,
      vueVersion: version,
      useCases: doc.useCases,
      summary: doc.summary,
      embedding
    });

    return doc;
  }

  async getDocumentById(id: string): Promise<VueDocument | null> {
    return this.prisma.vueDocument.findUnique({ where: { id } });
  }

  async getDocumentBySlug(slug: string): Promise<VueDocument | null> {
    return this.prisma.vueDocument.findUnique({ where: { slug } });
  }

  async reindexAllEmbeddings(): Promise<number> {
    const indices = this.presetStore.getAllVueSearchIndices();
    let count = 0;
    for (const item of indices) {
      const docText = `${item.title} ${item.summary} ${item.useCases}`;
      let embedding = await this.computeEmbeddingWithProvider(docText);
      if (!embedding) {
        embedding = generateTextEmbedding(docText);
      }

      this.presetStore.upsertVueSearchIndex({
        docId: item.docId,
        slug: item.slug,
        title: item.title,
        category: item.category,
        vueVersion: item.vueVersion,
        useCases: item.useCases.split(' '),
        summary: item.summary,
        embedding
      });
      count++;
    }
    return count;
  }

  async searchDocuments(options: VueSearchOptions): Promise<{
    results: VueSearchResult[];
    total: number;
    pagination: { page: number; limit: number; totalPages: number };
    debug: {
      mode: string;
      weight: number;
      topKFuzzy: SearchDebugEntry[];
      topKSemantic: SearchDebugEntry[];
      topKHybrid: SearchDebugEntry[];
    };
  }> {
    const mode = options.mode || 'hybrid';
    const weight = options.hybridWeight !== undefined ? options.hybridWeight : 0.5;
    const page = options.page || 1;
    const limit = options.limit || 20;
    const topK = options.topKDebug || 5;

    let indices = this.presetStore.getAllVueSearchIndices();
    if (options.category && options.category !== 'ALL') {
      indices = indices.filter(i => i.category.toLowerCase() === options.category!.toLowerCase());
    }

    let queryVector = options.queryEmbedding || [];
    if (options.query && queryVector.length === 0) {
      const remoteVector = await this.computeEmbeddingWithProvider(options.query);
      queryVector = remoteVector || generateTextEmbedding(options.query);
    }

    const scoredPool: SearchDebugEntry[] = [];

    for (const item of indices) {
      const fuzzyScore = options.query ? calculateFuzzyScore(options.query, item) : 1.0;
      let semanticScore = 0;

      if (queryVector.length > 0 && item.embedding && item.embedding.length > 0) {
        semanticScore = cosineSimilarity(queryVector, item.embedding);
      }

      const hybridScore = (1 - weight) * fuzzyScore + weight * semanticScore;

      scoredPool.push({
        docId: item.docId,
        slug: item.slug,
        title: item.title,
        category: item.category,
        fuzzyScore: Math.round(fuzzyScore * 100) / 100,
        semanticScore: Math.round(semanticScore * 100) / 100,
        hybridScore: Math.round(hybridScore * 100) / 100
      });
    }

    const topKFuzzy = [...scoredPool].sort((a, b) => b.fuzzyScore - a.fuzzyScore).slice(0, topK);
    const topKSemantic = [...scoredPool].sort((a, b) => b.semanticScore - a.semanticScore).slice(0, topK);
    const topKHybrid = [...scoredPool].sort((a, b) => b.hybridScore - a.hybridScore).slice(0, topK);

    let sortedList: SearchDebugEntry[];
    if (mode === 'fuzzy') {
      sortedList = [...scoredPool].sort((a, b) => b.fuzzyScore - a.fuzzyScore);
    } else if (mode === 'semantic') {
      sortedList = [...scoredPool].sort((a, b) => b.semanticScore - a.semanticScore);
    } else {
      sortedList = [...scoredPool].sort((a, b) => b.hybridScore - a.hybridScore);
    }

    if (options.query) {
      sortedList = sortedList.filter(s => {
        const score = mode === 'fuzzy' ? s.fuzzyScore : (mode === 'semantic' ? s.semanticScore : s.hybridScore);
        return score > 0.05;
      });
    }

    const total = sortedList.length;
    const skip = (page - 1) * limit;
    const paginatedSlice = sortedList.slice(skip, skip + limit);

    const docIds = paginatedSlice.map(s => s.docId);
    const docs = await this.prisma.vueDocument.findMany({
      where: { id: { in: docIds } }
    });
    const docMap = new Map(docs.map(d => [d.id, d]));

    const results: VueSearchResult[] = paginatedSlice
      .map(s => {
        const doc = docMap.get(s.docId);
        if (!doc) return null;
        const score = mode === 'fuzzy' ? s.fuzzyScore : (mode === 'semantic' ? s.semanticScore : s.hybridScore);
        return {
          doc,
          score,
          matchType: mode,
          scores: {
            fuzzy: s.fuzzyScore,
            semantic: s.semanticScore,
            hybrid: s.hybridScore
          }
        };
      })
      .filter(Boolean) as VueSearchResult[];

    return {
      results,
      total,
      pagination: {
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit))
      },
      debug: {
        mode,
        weight,
        topKFuzzy,
        topKSemantic,
        topKHybrid
      }
    };
  }
}
