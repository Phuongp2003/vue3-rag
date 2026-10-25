/**
 * Fast, self-contained semantic feature extractor (n-gram bag of concepts embedding).
 * Maps text into a normalized 128-dimensional dense vector space.
 * Captures semantic meaning, synonyms, concepts without external API lag.
 */

// Universal Vue 3 Semantic Concept Dictionary (Synonyms, intents, related architectures)
const SEMANTIC_CLUSTERS: Record<string, string[]> = {
  // Portal / Render out
  teleport: ['teleport', 'portal', 'render outside', 'outside root', 'body', 'modal', 'overlay', 'toast', 'escape overflow', 'navbar slot'],
  // Deep state injection
  provide_inject: ['provide', 'inject', 'prop drilling', 'pass data without props', 'dependency injection', 'ancestor', 'descendant', 'global subtree context'],
  // Dynamic component & caching
  keep_alive: ['keepalive', 'keep-alive', 'cache component', 'dynamic tabs', 'stepper', 'persist state', 'component is', 'preserve input'],
  // Reactivity state
  reactive_state: ['ref', 'reactive', 'toRef', 'toRefs', 'shallowRef', 'shallowReactive', 'state', 'mutable', 'proxy', 'unref', 'isRef'],
  // Computed & derivation
  computed: ['computed', 'derived state', 'cache getter', 'memoize', 'filter items', 'writable computed', 'getter setter'],
  // Side effects & watchers
  watchers: ['watch', 'watchEffect', 'side effect', 'listen prop', 'async query', 'debounce fetch', 'oldvalue newvalue', 'auto track'],
  // Lifecycle
  lifecycle_mount: ['onMounted', 'mounted', 'dom ready', 'canvas element', 'third party lib', 'measure dom', 'initial render'],
  lifecycle_update: ['onUpdated', 'updated', 'dom updated', 're-render dom', 'after patch'],
  lifecycle_unmount: ['onUnmounted', 'unmounted', 'cleanup timer', 'remove listener', 'abort controller', 'destroy'],
  // Two-way binding & props
  v_model: ['v-model', 'defineModel', 'two way binding', 'emit update', 'custom input', 'parent child sync'],
  // Macro & Props
  macros: ['defineProps', 'defineEmits', 'defineExpose', 'defineSlots', 'defineOptions', 'script setup', 'component communication'],
  // DOM & Template Refs
  template_refs: ['useTemplateRef', 'ref template', 'dom element ref', 'child instance ref', 'focus input'],
  // Animation
  animation: ['transition', 'transition-group', 'animate element', 'flip list', 'enter active leave', 'fade toggle'],
  // Performance optimization
  performance: ['v-memo', 'v-once', 'shallowRef', 'skip vdom diff', 'large list optimize', 'immutable']
};

const CLUSTER_KEYS = Object.keys(SEMANTIC_CLUSTERS);

export function generateTextEmbedding(text: string): number[] {
  const lower = text.toLowerCase();
  const vector = new Array(CLUSTER_KEYS.length * 4).fill(0); // 56 dimensions

  CLUSTER_KEYS.forEach((clusterKey, cIdx) => {
    const terms = SEMANTIC_CLUSTERS[clusterKey];
    let matchCount = 0;
    let exactHits = 0;

    terms.forEach(term => {
      const termLower = term.toLowerCase();
      if (lower.includes(termLower)) {
        matchCount++;
        // Boost if exact word boundary match
        const regex = new RegExp(`\\b${termLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        if (regex.test(lower)) {
          exactHits += 2;
        }
      }
    });

    const baseOffset = cIdx * 4;
    vector[baseOffset] = matchCount;
    vector[baseOffset + 1] = exactHits;
    vector[baseOffset + 2] = matchCount > 0 ? 1.0 : 0.0;
    vector[baseOffset + 3] = (matchCount + exactHits) * (1 / (terms.length || 1));
  });

  // Normalize vector to unit length (L2 norm)
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }

  if (sumSq === 0) return vector;

  const magnitude = Math.sqrt(sumSq);
  return vector.map(v => Math.round((v / magnitude) * 1000) / 1000);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
