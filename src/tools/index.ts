import { VueDocumentRepository } from '../vue3-documents';
import { PresetStore, callByModelId } from '../llm-caller';

export interface ToolDefinition {
  name: string;
  description: string;
  enabled: boolean;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface CompactedQueryPlan {
  compactQuery: string;
  category: string;
  mode: 'fuzzy' | 'semantic' | 'hybrid';
  hybridWeight: number;
  reasoning: string;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(
    private vueRepo: VueDocumentRepository,
    private store: PresetStore
  ) {
    this.registerDefaults();
  }

  private registerDefaults() {
    this.tools.set('search_vue3_knowledge_base', {
      name: 'search_vue3_knowledge_base',
      description: 'Search Vue 3 API, Composables, Components, Reactivity, and Lifecycle documentation with fuzzy, semantic or hybrid modes.',
      enabled: true,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query or practical problem description (e.g. "pass data without props", "teleport modal")'
          },
          category: {
            type: 'string',
            enum: ['ALL', 'reactivity', 'composition-api', 'components', 'lifecycle', 'options-api'],
            description: 'Optional category filter'
          },
          mode: {
            type: 'string',
            enum: ['fuzzy', 'semantic', 'hybrid'],
            description: 'Search strategy mode: "fuzzy" for exact terms, "semantic" for intent/problem match, "hybrid" for balanced'
          },
          hybridWeight: {
            type: 'number',
            description: 'Ratio between 0.0 (100% fuzzy) and 1.0 (100% semantic). Default 0.5'
          }
        },
        required: ['query']
      }
    });

    this.tools.set('get_vue3_syntax_comparison', {
      name: 'get_vue3_syntax_comparison',
      description: 'Retrieve exact Composition API (<script setup>) and Options API code comparison for a Vue 3 feature.',
      enabled: true,
      parameters: {
        type: 'object',
        properties: {
          slug: {
            type: 'string',
            description: 'The unique slug of the feature (e.g. "provide-inject", "teleport", "ref", "computed")'
          }
        },
        required: ['slug']
      }
    });
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getEnabledTools(): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.enabled);
  }

  setToolStatus(name: string, enabled: boolean): void {
    const t = this.tools.get(name);
    if (t) {
      t.enabled = enabled;
    }
  }

  /**
   * Turning & Compact step: Analyzes user raw prompt and converts into a compacted technical query plan
   */
  async compactUserIntent(userPrompt: string, activeModelId?: string): Promise<CompactedQueryPlan> {
    // 1. If an active LLM is available, use it for intelligent intent condensation
    if (activeModelId) {
      try {
        const planPrompt = `You are a Vue 3 architecture search planner.
Analyze this user query:
"""${userPrompt}"""

Extract the underlying core technical problem and emit ONLY a raw JSON object with:
{
  "compactQuery": "short 3-5 English technical search keywords (e.g. 'render outside root teleport', 'prop drilling provide inject', 'slot portal')",
  "category": "ALL | reactivity | composition-api | components | lifecycle | options-api",
  "mode": "fuzzy | semantic | hybrid",
  "hybridWeight": 0.2 to 0.8,
  "reasoning": "1 short sentence explaining why this search strategy was chosen"
}`;

        const res = await callByModelId(this.store, activeModelId, {
          payload: { prompt: planPrompt },
          customParams: { temperature: 0.1, max_tokens: 250 }
        });

        if (res.content) {
          const jsonMatch = res.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              compactQuery: parsed.compactQuery || userPrompt.slice(0, 50),
              category: parsed.category || 'ALL',
              mode: parsed.mode || 'hybrid',
              hybridWeight: typeof parsed.hybridWeight === 'number' ? parsed.hybridWeight : 0.6,
              reasoning: parsed.reasoning || 'Extracted core Vue 3 architectural keywords.'
            };
          }
        }
      } catch (_) {
        // Fallback to rule-based heuristic extraction if model call fails
      }
    }

    // 2. Heuristic extraction fallback
    const lower = userPrompt.toLowerCase();
    let compact = userPrompt;
    let category = 'ALL';
    let mode: 'fuzzy' | 'semantic' | 'hybrid' = 'hybrid';
    let reasoning = 'Rule-based intent mapping';

    if (lower.includes('navbar') || lower.includes('render') || lower.includes('dom') || lower.includes('ngoài') || lower.includes('outside')) {
      compact = 'render outside root teleport portal';
      category = 'components';
      mode = 'hybrid';
      reasoning = 'Detected layout displacement intent (rendering outside parent DOM tree).';
    } else if (lower.includes('truyền') || lower.includes('pass') || lower.includes('prop') || lower.includes('drill')) {
      compact = 'prop drilling provide inject pass data without props';
      category = 'composition-api';
      mode = 'hybrid';
      reasoning = 'Detected deep data passing / dependency injection intent.';
    } else if (lower.includes('cache') || lower.includes('tab') || lower.includes('giữ')) {
      compact = 'cache component state keep alive dynamic tabs';
      category = 'components';
      mode = 'hybrid';
      reasoning = 'Detected component state caching / KeepAlive intent.';
    }

    return {
      compactQuery: compact,
      category,
      mode,
      hybridWeight: 0.6,
      reasoning
    };
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool || !tool.enabled) {
      throw new Error(`Tool "${name}" is either disabled or not registered.`);
    }

    if (name === 'search_vue3_knowledge_base') {
      const res = await this.vueRepo.searchDocuments({
        query: args.query,
        category: args.category || 'ALL',
        mode: args.mode || 'hybrid',
        hybridWeight: args.hybridWeight !== undefined ? args.hybridWeight : 0.5,
        limit: 5
      });

      return {
        query: args.query,
        mode: res.debug.mode,
        weight: res.debug.weight,
        matchesFound: res.total,
        topMatches: res.results.map(r => ({
          title: r.doc.title,
          category: r.doc.category,
          vueVersion: r.doc.vueVersion,
          summary: r.doc.summary,
          useCases: r.doc.useCases,
          relevanceScore: r.score,
          scoreBreakdown: r.scores
        }))
      };
    }

    if (name === 'get_vue3_syntax_comparison') {
      const doc = await this.vueRepo.getDocumentBySlug(args.slug);
      if (!doc) {
        return { error: `Document for slug "${args.slug}" not found.` };
      }
      return {
        title: doc.title,
        vueVersion: doc.vueVersion,
        compositionCode: doc.compositionCode,
        optionsCode: doc.optionsCode,
        summary: doc.summary
      };
    }

    throw new Error(`Execution logic for tool "${name}" not found.`);
  }
}
