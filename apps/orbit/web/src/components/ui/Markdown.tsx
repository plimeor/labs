import { Check, Clipboard } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'

// Singleton highlighter + LRU cache
let highlighterPromise: Promise<unknown> | null = null
const highlightCache = new Map<string, string>()
const MAX_CACHE = 50

async function highlightCode(code: string, lang: string): Promise<string> {
  const key = `${lang}:${code.slice(0, 100)}`
  const cached = highlightCache.get(key)
  if (cached) return cached

  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({ themes: ['github-light'], langs: [lang] })
    )
  }

  const highlighter = (await highlighterPromise) as {
    getLoadedLanguages: () => string[]
    loadLanguage: (lang: string) => Promise<void>
    codeToHtml: (code: string, opts: { lang: string; theme: string }) => string
  }

  // Load language if not already loaded
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    try {
      await highlighter.loadLanguage(lang)
    } catch {
      // Language not supported, fall back to plaintext
      return ''
    }
  }

  const html = highlighter.codeToHtml(code, { lang, theme: 'github-light' })

  // LRU eviction
  if (highlightCache.size >= MAX_CACHE) {
    const firstKey = highlightCache.keys().next().value
    if (firstKey !== undefined) highlightCache.delete(firstKey)
  }
  highlightCache.set(key, html)

  return html
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (lang) {
      highlightCode(code, lang).then(result => {
        if (!cancelled) setHtml(result)
      })
    }
    return () => {
      cancelled = true
    }
  }, [code, lang])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="group relative my-3">
      <div className="flex items-center justify-between rounded-t-xl bg-surface-secondary px-4 py-2 text-[12px] text-text-tertiary">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-text-tertiary opacity-0 transition-opacity hover:text-text-primary group-hover:opacity-100"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
        </button>
      </div>
      {html ? (
        <div
          className="[&>pre]:!bg-surface-secondary/50 overflow-x-auto rounded-b-xl text-[13px] [&>pre]:p-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto rounded-b-xl bg-surface-secondary/50 p-4 text-[13px]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}

const components: Components = {
  pre({ children }) {
    // Extract code element from pre
    const child = children as React.ReactElement<{
      className?: string
      children?: string
    }>
    if (child?.props) {
      const className = child.props.className || ''
      const lang = className.replace('language-', '')
      const code = typeof child.props.children === 'string' ? child.props.children : ''
      return <CodeBlock code={code.replace(/\n$/, '')} lang={lang} />
    }
    return <pre>{children}</pre>
  },
  code({ children, className }) {
    // Inline code only (block code is handled by pre)
    if (className) return <code className={className}>{children}</code>
    return <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[13px]">{children}</code>
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-orbit text-[14px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
