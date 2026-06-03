import { plugin } from 'bun'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

// Intercept CSS / CSS-module imports in tests. Returns a proxy whose property
// access yields the property name as a string, so CSS-module class lookups
// (styles.foo) resolve to a stable className without a CSS bundler.
plugin({
  name: 'css-modules',
  setup(build) {
    build.onLoad({ filter: /\.(css|module\.css)$/ }, () => ({
      contents: 'export default new Proxy({}, { get: (_, p) => (typeof p === "string" ? p : "") })',
      loader: 'js'
    }))
  }
})
