import { memo, useMemo, useRef } from 'react'

import { Markdown } from './Markdown'

const MemoizedBlock = memo(function MemoizedBlock({ content }: { content: string }) {
  return <Markdown content={content} />
})

export function StreamingMarkdown({ content }: { content: string }) {
  const lastRenderRef = useRef(0)
  const cachedBlocksRef = useRef<string[]>([])
  const cachedContentRef = useRef('')

  const throttledContent = useMemo(() => {
    const now = Date.now()
    if (now - lastRenderRef.current < 300 && cachedContentRef.current) {
      return cachedContentRef.current
    }
    lastRenderRef.current = now
    cachedContentRef.current = content
    return content
  }, [content])

  const blocks = throttledContent.split('\n\n')
  const completedBlocks = blocks.slice(0, -1)
  const lastBlock = blocks[blocks.length - 1] || ''

  // Cache completed blocks so they don't re-render
  if (completedBlocks.length > cachedBlocksRef.current.length) {
    cachedBlocksRef.current = completedBlocks
  }

  return (
    <div>
      {cachedBlocksRef.current.map((block, i) => (
        <MemoizedBlock key={`block-${i}`} content={block} />
      ))}
      {lastBlock && <Markdown content={lastBlock} />}
    </div>
  )
}
