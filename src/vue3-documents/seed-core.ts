import { getDbClient } from '../db';
import { PresetStore } from '../llm-caller';
import { VueDocumentRepository } from './repository';

export async function seedCoreVue3Docs(): Promise<void> {
  const prisma = getDbClient();
  const store = await PresetStore.init();
  const repo = new VueDocumentRepository(prisma, store);

  console.log('Seeding baseline Core Vue 3 Documentation...');

  const coreDocs = [
    // 1. Dependency Injection: Provide / Inject
    {
      slug: 'provide-inject',
      title: 'provide() and inject()',
      category: 'composition-api',
      vueVersion: '3.5.0',
      summary: 'Pass data and functions deeply across component trees without prop drilling or intermediate layer forwarding.',
      useCases: [
        'prop drilling',
        'pass data without props',
        'dependency injection',
        'global context in subtree',
        'deep child access parent state'
      ],
      sourceUrl: 'https://vuejs.org/guide/components/provide-inject.html',
      compositionCode: `<!-- Parent.vue -->
<script setup>
import { ref, provide } from 'vue'

const theme = ref('dark')
const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

provide('theme-context', { theme, toggleTheme })
</script>

<!-- DeepChild.vue -->
<script setup>
import { inject } from 'vue'

const { theme, toggleTheme } = inject('theme-context')
</script>`,
      optionsCode: `// ParentComponent
export default {
  data() {
    return { theme: 'dark' }
  },
  provide() {
    return {
      themeContext: {
        theme: this.theme,
        toggleTheme: this.toggleTheme
      }
    }
  }
}

// DeepChild
export default {
  inject: ['themeContext']
}`,
      rawMarkdown: `### Overview
When passing data through deeply nested component trees, passing props from parent to child through every intermediate component is known as "prop drilling".
\`provide\` and \`inject\` solve this by allowing an ancestor component to act as a dependency provider for all its descendants, regardless of how deep the component hierarchy is.

### Reactivity
To maintain reactivity between the provided value and injecting descendants, provide a \`ref\` or \`reactive\` object rather than a raw primitive.

### Mutation Best Practice
Whenever injecting a ref, recommend providing an updater function alongside it (e.g. \`toggleTheme\`) so mutations originate where the state is declared.`
    },

    // 2. Built-in Component: Teleport
    {
      slug: 'teleport',
      title: '<Teleport>',
      category: 'components',
      vueVersion: '3.5.0',
      summary: 'Render a component template segment into another DOM node outside the component root hierarchy (e.g. Modals, Toasts, Tooltips, Fullscreen overlays).',
      useCases: [
        'render outside root',
        'modal dialog z-index issue',
        'toast notifications at body root',
        'portal to external dom element',
        'escape parent css transform overflow'
      ],
      sourceUrl: 'https://vuejs.org/guide/built-ins/teleport.html',
      compositionCode: `<script setup>
import { ref } from 'vue'

const isOpen = ref(false)
</script>

<template>
  <button @click="isOpen = true">Open Modal</button>

  <Teleport to="body">
    <div v-if="isOpen" class="modal-overlay">
      <div class="modal-box">
        <h3>Teleported Modal</h3>
        <p>Rendered directly under &lt;body&gt; without CSS clipping.</p>
        <button @click="isOpen = false">Close</button>
      </div>
    </div>
  </Teleport>
</template>`,
      optionsCode: `export default {
  data() {
    return { isOpen: false }
  }
}`,
      rawMarkdown: `### Overview
\`<Teleport>\` is a built-in component that allows us to "teleport" a part of a component's template into a DOM node that exists outside the DOM hierarchy of that component.

### Common Use Cases
1. **Modals and Dialogs:** When placed inside a parent component with \`overflow: hidden\` or \`transform\`, standard fixed positioning breaks. Teleporting to \`body\` bypasses parent styling constraints.
2. **Global Notification Bars:** Easily mounted to arbitrary targets like \`to="#notification-area"\`.`
    },

    // 3. Reactivity: ref vs reactive
    {
      slug: 'ref-vs-reactive',
      title: 'ref() and reactive()',
      category: 'reactivity',
      vueVersion: '3.5.0',
      summary: 'Declare reactive state in Vue 3. ref() handles both primitives and objects (.value in script), while reactive() proxies object references directly.',
      useCases: [
        'declare state',
        'primitive reactivity',
        'object reactivity',
        'destructure losing reactivity',
        'toRefs when destructuring'
      ],
      sourceUrl: 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html',
      compositionCode: `<script setup>
import { ref, reactive, toRefs } from 'vue'

// Primitives or any value (accessed with .value in script)
const count = ref(0)

// Object-only state proxy
const user = reactive({
  name: 'Alice',
  age: 25
})

// Safe destructure with toRefs
const { name, age } = toRefs(user)
</script>`,
      optionsCode: `export default {
  data() {
    return {
      count: 0,
      user: {
        name: 'Alice',
        age: 25
      }
    }
  }
}`,
      rawMarkdown: `### Differences
- \`ref()\`: Accepts any value type (string, number, boolean, array, object). In JavaScript, values are accessed via \`.value\`. In templates, top-level refs auto-unwrap without \`.value\`.
- \`reactive()\`: Only takes objects (Objects, Arrays, Maps, Sets). It returns a reactive Proxy of the object. **Gotcha:** Destructuring a reactive object disconnects reactivity unless wrapped in \`toRefs()\`.`
    },

    // 4. Component: Dynamic Component & <KeepAlive>
    {
      slug: 'dynamic-component-keep-alive',
      title: '<component :is="..."> and <KeepAlive>',
      category: 'components',
      vueVersion: '3.5.0',
      summary: 'Render different UI components dynamically based on state, and cache inactive component instances without unmounting.',
      useCases: [
        'dynamic tabs',
        'render component by string name',
        'cache component state on tab switch',
        'prevent component destroy re-render',
        'stepper wizard state persistence'
      ],
      sourceUrl: 'https://vuejs.org/guide/built-ins/keep-alive.html',
      compositionCode: `<script setup>
import { shallowRef } from 'vue'
import TabA from './TabA.vue'
import TabB from './TabB.vue'

const currentTab = shallowRef(TabA)
</script>

<template>
  <button @click="currentTab = TabA">Tab A</button>
  <button @click="currentTab = TabB">Tab B</button>

  <KeepAlive>
    <component :is="currentTab" />
  </KeepAlive>
</template>`,
      optionsCode: `export default {
  data() {
    return { currentTab: 'TabA' }
  }
}`,
      rawMarkdown: `### Purpose
\`<component :is="activeComponent">\` dynamically mounts different components without multiple \`v-if / v-else-if\` branches.
Wrapping with \`<KeepAlive>\` preserves internal component state, form input values, and scroll position when components are toggled away instead of destroying them.`
    },

    // 5. Reactivity: watch vs watchEffect
    {
      slug: 'watch-and-watcheffect',
      title: 'watch() and watchEffect()',
      category: 'reactivity',
      vueVersion: '3.5.0',
      summary: 'Perform side effects on reactive changes. watch() is explicit and lazily triggered, whereas watchEffect() automatically tracks dependencies synchronously.',
      useCases: [
        'listen to prop change',
        'side effect on state update',
        'fetch data on query change',
        'auto track reactive dependencies',
        'access previous and new value'
      ],
      sourceUrl: 'https://vuejs.org/guide/essentials/watchers.html',
      compositionCode: `<script setup>
import { ref, watch, watchEffect } from 'vue'

const search = ref('')

// Explicit, lazy, provides oldValue
watch(search, (newVal, oldVal) => {
  console.log('Search changed:', oldVal, '->', newVal)
})

// Immediate, automatic dependency tracking
watchEffect(() => {
  console.log('Current search query is:', search.value)
})
</script>`,
      optionsCode: `export default {
  data() {
    return { search: '' }
  },
  watch: {
    search(newVal, oldVal) {
      console.log(newVal)
    }
  }
}`,
      rawMarkdown: `### Key Rule
- Use \`watch()\` when you need both the **new** and **old** value, or when you want the callback to run only after an explicit source changes.
- Use \`watchEffect()\` when you want the effect to run immediately on setup and automatically recalculate whenever any reactive property accessed inside it changes.`
    }
  ];

  for (const doc of coreDocs) {
    await repo.upsertDocument(doc);
  }

  console.log(`Core Vue 3 Docs seeded: ${coreDocs.length} records.`);
}
