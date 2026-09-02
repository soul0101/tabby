/**
 * A stand-in for an agent client, injected before the page loads.
 *
 * Implements just enough of `document.modelContext` to register, discover and
 * call tools — which is all that's needed to exercise Tabby's surface in CI,
 * without a ChatGPT build or a Chrome origin trial.
 */
(() => {
  const tools = new Map()

  const modelContext = {
    registerTool(tool, options = {}) {
      tools.set(tool.name, tool)
      options.signal?.addEventListener('abort', () => tools.delete(tool.name))
      return Promise.resolve()
    },
    getTools() {
      return Promise.resolve([...tools.values()].map((t) => ({
        name: t.name, description: t.description,
        inputSchema: t.inputSchema, annotations: t.annotations,
      })))
    },
  }

  Object.defineProperty(document, 'modelContext', { value: modelContext, configurable: true })

  window.__agent = {
    list: () => [...tools.keys()].sort(),
    schema: (name) => tools.get(name)?.inputSchema,
    annotations: (name) => tools.get(name)?.annotations,
    /** Returns the parsed tool result, exactly as a client would receive it. */
    call: async (name, args) => {
      const t = tools.get(name)
      if (!t) throw new Error(`No such tool: ${name}. Registered: ${[...tools.keys()].join(', ')}`)
      const res = await t.execute(args ?? {})
      const text = res?.content?.[0]?.text
      try { return JSON.parse(text) } catch { return text }
    },
    /** Start a call without awaiting it — for tools that block on a human. */
    begin: (name, args) => {
      const t = tools.get(name)
      window.__pending = t.execute(args ?? {}).then((res) => {
        const text = res?.content?.[0]?.text
        try { return JSON.parse(text) } catch { return text }
      })
      return 'started'
    },
    settle: () => window.__pending,
  }
})()
