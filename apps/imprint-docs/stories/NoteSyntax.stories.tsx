import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties, ReactNode } from 'react'

import '@plimeor/imprint-tokens/note-syntax.css'

// note-syntax.css ships inside @plimeor/imprint-tokens (pure CSS, no component), so
// these stories render raw markup that exercises every ns-* class against the
// imprint-tokens variables (tokens.css + fonts.css are loaded globally in
// preview.ts). The toolbar Theme global drives data-theme on <html>, so light
// and dark are both covered by the existing decorator.

const prose: CSSProperties = {
  color: 'var(--fg-body)',
  fontFamily: 'var(--font-read)',
  fontSize: 17,
  lineHeight: 1.7,
  margin: 0
}

const Section = ({ label, children }: { label: string; children: ReactNode }) => (
  <section style={{ marginBottom: 28 }}>
    <div
      style={{
        color: 'var(--fg-tertiary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.02em',
        marginBottom: 9
      }}
    >
      {label}
    </div>
    {children}
  </section>
)

const Frame = ({ children }: { children: ReactNode }) => (
  <div style={{ maxWidth: 600, padding: '12px 4px' }}>{children}</div>
)

const meta = {
  title: 'Note Syntax/Overview',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Links and wikilinks. External links leave the app (globe glyph + underline);
 * wikilinks point inward (bracket glyph, underline on hover only); unresolved
 * wikilinks render dashed and muted.
 */
export const Links: Story = {
  render: () => (
    <Frame>
      <Section label="link &amp; wikilink · external + internal references">
        <p style={{ ...prose, marginBottom: 14 }}>
          An{' '}
          <a className="ns-link" data-external href="#external">
            external link
          </a>{' '}
          sits inline in prose, led by a small globe glyph and a permanent underline — it leaves the app. A{' '}
          <a className="ns-wikilink" href="#wikilink">
            wikilink
          </a>{' '}
          points inward to another note: same link color, but led by a bracket glyph and <em>no</em> underline at rest.
        </p>
        <p style={prose}>
          Wikilinks to notes that don&rsquo;t exist yet render as{' '}
          <a className="ns-wikilink" data-unresolved href="#unresolved">
            unresolved
          </a>{' '}
          — dashed and muted, so you can see what&rsquo;s still missing.
        </p>
      </Section>
    </Frame>
  )
}

/**
 * Embedded document block: a head row with a title and meta, plus a preview body.
 */
export const Embed: Story = {
  render: () => (
    <Frame>
      <Section label="embed · transcluded document">
        <div className="ns-embed">
          <div className="ns-embed-head">
            <span className="ns-embed-title">soil-survey-2026.pdf</span>
            <span className="ns-embed-meta">2.4 MB · 12 pp</span>
          </div>
          <div className="ns-embed-body">
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                gap: 8
              }}
            >
              Preview embedded document
            </div>
          </div>
        </div>
      </Section>
    </Frame>
  )
}

/**
 * Figure with caption, plus the image loading shimmer state.
 */
export const Image: Story = {
  render: () => (
    <Frame>
      <Section label="image · figure + caption + loading">
        <figure className="ns-figure" style={{ margin: '0 0 16px' }}>
          <div
            className="ns-image"
            style={{
              alignItems: 'center',
              background: 'var(--bg-sunken)',
              color: 'var(--fg-tertiary)',
              display: 'flex',
              height: 120,
              justifyContent: 'center'
            }}
          >
            image
          </div>
          <figcaption className="ns-figcaption">Fig. 1 — North plot drainage after the cold snap.</figcaption>
        </figure>
        <div className="ns-image-loading" style={{ height: 54 }} />
        <div className="ns-figcaption" style={{ fontFamily: 'var(--font-mono)', marginTop: 8, textAlign: 'left' }}>
          loading state · shimmer
        </div>
      </Section>
    </Frame>
  )
}

/**
 * Table with header alignment hints (right / center).
 */
export const Table: Story = {
  render: () => (
    <Frame>
      <Section label="table · aligned columns">
        <table className="ns-table">
          <thead>
            <tr>
              <th>Note</th>
              <th>Links</th>
              <th data-align="right">Words</th>
              <th data-align="center">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Field notes — March</td>
              <td>2</td>
              <td data-align="right">612</td>
              <td data-align="center">Indexed</td>
            </tr>
            <tr>
              <td>Index architecture</td>
              <td>1</td>
              <td data-align="right">1,180</td>
              <td data-align="center">Indexed</td>
            </tr>
            <tr>
              <td>Reading queue</td>
              <td>0</td>
              <td data-align="right">240</td>
              <td data-align="center">Draft</td>
            </tr>
          </tbody>
        </table>
      </Section>
    </Frame>
  )
}

/**
 * Task list: checked, unchecked, and disabled (blocked) states.
 */
export const TaskList: Story = {
  render: () => (
    <Frame>
      <Section label="tasklist · checkbox states">
        <ul className="ns-tasklist">
          <li className="ns-task" data-checked>
            <span className="ns-task-box">✓</span>
            <span className="ns-task-label">Recalibrate the reading rig</span>
          </li>
          <li className="ns-task">
            <span className="ns-task-box" />
            <span className="ns-task-label">Cross-reference the indexing notes</span>
          </li>
          <li className="ns-task">
            <span className="ns-task-box" />
            <span className="ns-task-label">Resolve the unresolved reference</span>
          </li>
          <li className="ns-task" data-disabled>
            <span className="ns-task-box" />
            <span className="ns-task-label">Archive last season (blocked)</span>
          </li>
        </ul>
      </Section>
    </Frame>
  )
}

/**
 * Callouts: neutral note, tip, warning, and danger — tinted fill + icon slot.
 */
export const Callouts: Story = {
  render: () => (
    <Frame>
      <Section label="callout · note / tip / warning / danger">
        <div className="ns-callout">
          <span className="ns-callout-icon" aria-hidden>
            i
          </span>
          <div>
            <div className="ns-callout-title">Note</div>
            <div className="ns-callout-body">
              A neutral callout for context. Tinted fill and an icon carry the meaning — no left-rail.
            </div>
          </div>
        </div>
        <div className="ns-callout" data-kind="tip">
          <span className="ns-callout-icon" aria-hidden>
            ☼
          </span>
          <div>
            <div className="ns-callout-title">Tip</div>
            <div className="ns-callout-body">Cross-reference readings block-by-block to keep the index current.</div>
          </div>
        </div>
        <div className="ns-callout" data-kind="warning">
          <span className="ns-callout-icon" aria-hidden>
            !
          </span>
          <div>
            <div className="ns-callout-title">Warning</div>
            <div className="ns-callout-body">One unresolved reference remains. Resolve it before applying.</div>
          </div>
        </div>
        <div className="ns-callout" data-kind="danger" style={{ marginBottom: 0 }}>
          <span className="ns-callout-icon" aria-hidden>
            ✕
          </span>
          <div>
            <div className="ns-callout-title">Danger</div>
            <div className="ns-callout-body">This operation rewrites history and cannot be undone after sync.</div>
          </div>
        </div>
      </Section>
    </Frame>
  )
}

/**
 * Inline code and a syntax-highlighted code block (tok-* token classes).
 */
export const Code: Story = {
  render: () => (
    <Frame>
      <Section label="code · inline + fenced block">
        <p style={{ ...prose, marginBottom: 14 }}>
          Call <code className="ns-code-inline">index.propose()</code> to stage an edit.
        </p>
        <pre className="ns-codeblock">
          <span className="tok-com">{'// stage a reviewed change'}</span>
          {'\n'}
          <span className="tok-kw">const</span> change <span className="tok-punc">=</span> index.
          <span className="tok-fn">propose</span>
          <span className="tok-punc">(</span>
          <span className="tok-punc">{'{'}</span>
          {'\n  '}note<span className="tok-punc">:</span> <span className="tok-str">&quot;field-notes-march&quot;</span>
          <span className="tok-punc">,</span>
          {'\n  '}edits<span className="tok-punc">:</span> <span className="tok-num">2</span>
          <span className="tok-punc">,</span>
          {'\n  '}status<span className="tok-punc">:</span> <span className="tok-str">&quot;pending&quot;</span>
          <span className="tok-punc">,</span>
          {'\n'}
          <span className="tok-punc">{'}'}</span>
          <span className="tok-punc">)</span>
          <span className="tok-punc">;</span>
        </pre>
      </Section>
    </Frame>
  )
}

/**
 * Math: inline expression and a numbered display block.
 */
export const MathExpressions: Story = {
  render: () => (
    <Frame>
      <Section label="math · inline + display block">
        <p style={{ ...prose, marginBottom: 12 }}>
          The mean held within <span className="ns-math-inline">σ &lt; 1°</span> of the seasonal baseline.
        </p>
        <div className="ns-math-block">
          ∇·E = ρ / ε₀ <span className="ns-math-num">(3)</span>
        </div>
      </Section>
    </Frame>
  )
}

/**
 * Tags and mentions: quiet inline weak links (#) and person references (@),
 * including agent and unresolved variants.
 */
export const TagsAndMentions: Story = {
  render: () => (
    <Frame>
      <Section label="tag · # · inline weak link">
        <p style={{ ...prose, marginBottom: 12 }}>
          Filed under{' '}
          <a className="ns-tag" href="#field">
            field
          </a>{' '}
          <a className="ns-tag" href="#soil">
            soil
          </a>{' '}
          <a className="ns-tag" href="#local-first">
            local-first
          </a>{' '}
          — tags read as quiet inline links the eye can skim past.
        </p>
        <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          <a className="ns-tag" href="#inbox">
            inbox
          </a>
          <a className="ns-tag" href="#reading">
            reading
          </a>
          <a className="ns-tag" href="#2026-q2">
            2026-q2
          </a>
          <a className="ns-tag" href="#design-system">
            design-system
          </a>
        </div>
      </Section>
      <Section label="mention · @ · inline person reference">
        <p style={prose}>
          Reviewed with{' '}
          <a className="ns-mention" href="#plimeor">
            Plimeor
          </a>{' '}
          and{' '}
          <a className="ns-mention" href="#mara">
            Mara Vance
          </a>
          , then handed to{' '}
          <a className="ns-mention" data-agent href="#agent">
            Agent
          </a>{' '}
          for a final pass. An unresolved mention reads as{' '}
          <a className="ns-mention" data-unresolved href="#jess">
            Jess Kerr
          </a>
          .
        </p>
      </Section>
    </Frame>
  )
}

/**
 * Footnote references and citations, with the footnotes list.
 */
export const FootnotesAndCitations: Story = {
  render: () => (
    <Frame>
      <Section label="footnote &amp; citation · references">
        <p style={{ ...prose, marginBottom: 8 }}>
          Local-first sync resolves conflicts at the block level
          <a className="ns-footnote-ref" href="#fn1">
            1
          </a>
          , a pattern drawn from the CRDT survey{' '}
          <a className="ns-citation" data-style="numeric" href="#cite2">
            [2]
          </a>
          .
        </p>
        <div className="ns-footnotes" style={{ marginTop: 14 }}>
          <div className="ns-footnote-item">
            <span className="ns-footnote-no">1.</span>
            <span>Each block carries a stable id and a logical clock.</span>
          </div>
          <div className="ns-footnote-item">
            <span className="ns-footnote-no">2.</span>
            <span>Kleppmann et al., &ldquo;Local-first software,&rdquo; 2019.</span>
          </div>
        </div>
      </Section>
    </Frame>
  )
}

/**
 * Frontmatter metadata block rendered above the document body.
 */
export const Frontmatter: Story = {
  render: () => (
    <Frame>
      <Section label="frontmatter · metadata block">
        <div className="ns-frontmatter" style={{ marginBottom: 14 }}>
          <div className="ns-fm-key">title</div>
          <div className="ns-fm-val">Field notes — March</div>
          <div className="ns-fm-key">created</div>
          <div className="ns-fm-val">2026-03-04</div>
          <div className="ns-fm-key">tags</div>
          <div className="ns-fm-val">field, soil, weather</div>
          <div className="ns-fm-key">status</div>
          <div className="ns-fm-val">indexed</div>
        </div>
        <p style={prose}>Document body begins after the metadata block.</p>
      </Section>
    </Frame>
  )
}

/**
 * Inline marks: highlight (with color variants), strikethrough, underline, and
 * editorial comment.
 */
export const InlineMarks: Story = {
  render: () => (
    <Frame>
      <Section label="inline marks · highlight / strike / underline / comment">
        <p style={{ ...prose, marginBottom: 12 }}>
          <span className="ns-highlight">Highlighted text</span> draws the eye; also{' '}
          <span className="ns-highlight" data-color="blue">
            blue
          </span>
          ,{' '}
          <span className="ns-highlight" data-color="green">
            green
          </span>
          , and{' '}
          <span className="ns-highlight" data-color="red">
            red
          </span>{' '}
          variants.
        </p>
        <p style={{ ...prose, marginBottom: 12 }}>
          <span className="ns-strike">Struck-through</span> text is muted with a line;{' '}
          <span className="ns-underline">underlined text</span> uses a neutral rule and offset so it never reads as a
          link.
        </p>
        <p style={prose}>
          An editorial <span className="ns-comment">comment: tighten this paragraph</span> shows faded and italic.
        </p>
      </Section>
    </Frame>
  )
}

/**
 * A full note bringing the pieces together: frontmatter, prose with links, tags
 * and highlights, a callout, a task list, a table, code, and math.
 */
export const FullNote: Story = {
  render: () => (
    <article style={{ margin: '0 auto', maxWidth: '62ch', padding: '34px 32px 56px' }}>
      <div className="ns-frontmatter">
        <div className="ns-fm-key">title</div>
        <div className="ns-fm-val">Field notes — March</div>
        <div className="ns-fm-key">created</div>
        <div className="ns-fm-val">2026-03-04</div>
        <div className="ns-fm-key">tags</div>
        <div className="ns-fm-val">field, soil, weather</div>
      </div>

      <h1
        style={{
          color: 'var(--fg-primary)',
          fontFamily: 'var(--font-read)',
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: '-0.012em',
          lineHeight: 1.2,
          margin: '16px 0'
        }}
      >
        Field notes — March
      </h1>

      <p style={{ ...prose, fontSize: 18, lineHeight: 1.8, marginBottom: 20 }}>
        Soil temperature held <span className="ns-highlight">steady through the cold snap</span>. The north plot drained
        slower than expected — see{' '}
        <a className="ns-wikilink" href="#index-architecture">
          index-architecture
        </a>{' '}
        and{' '}
        <a className="ns-wikilink" href="#drainage-model">
          drainage-model
        </a>{' '}
        for how readings are <span className="ns-highlight">stored block-by-block</span>, cross-checked against the
        external{' '}
        <a className="ns-link" data-external href="#survey">
          drainage survey
        </a>
        . Filed under{' '}
        <a className="ns-tag" href="#soil">
          soil
        </a>{' '}
        <a className="ns-tag" href="#weather">
          weather
        </a>
        .
      </p>

      <div className="ns-callout" data-kind="warning">
        <span className="ns-callout-icon" aria-hidden>
          !
        </span>
        <div>
          <div className="ns-callout-title">Warning</div>
          <div className="ns-callout-body">
            One unresolved reference remains
            <a className="ns-footnote-ref" href="#fn1">
              1
            </a>
            . Resolve it before applying.
          </div>
        </div>
      </div>

      <h2
        style={{
          color: 'var(--fg-primary)',
          fontFamily: 'var(--font-read)',
          fontSize: 21,
          fontWeight: 600,
          margin: '32px 0 10px'
        }}
      >
        Observations
      </h2>
      <p style={{ ...prose, fontSize: 18, lineHeight: 1.8, marginBottom: 20 }}>
        Three measurements this week, all within <span className="ns-math-inline">σ &lt; 1°</span> of the seasonal mean.
        Reviewed with{' '}
        <a className="ns-mention" data-agent href="#agent">
          Agent
        </a>
        .
      </p>

      <ul className="ns-tasklist">
        <li className="ns-task" data-checked>
          <span className="ns-task-box">✓</span>
          <span className="ns-task-label">Recalibrate the reading rig</span>
        </li>
        <li className="ns-task">
          <span className="ns-task-box" />
          <span className="ns-task-label">Cross-reference the indexing notes</span>
        </li>
      </ul>

      <table className="ns-table">
        <thead>
          <tr>
            <th>Plot</th>
            <th data-align="right">Temp °C</th>
            <th data-align="center">Drainage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>North</td>
            <td data-align="right">4.2</td>
            <td data-align="center">Slow</td>
          </tr>
          <tr>
            <td>South</td>
            <td data-align="right">5.1</td>
            <td data-align="center">Normal</td>
          </tr>
        </tbody>
      </table>

      <p style={{ ...prose, fontSize: 18, lineHeight: 1.8, margin: '20px 0' }}>
        Staging the fix programmatically with <code className="ns-code-inline">index.propose()</code>:
      </p>
      <pre className="ns-codeblock">
        <span className="tok-kw">const</span> change <span className="tok-punc">=</span> index.
        <span className="tok-fn">propose</span>
        <span className="tok-punc">({'{'}</span> note<span className="tok-punc">:</span>{' '}
        <span className="tok-str">&quot;field-notes-march&quot;</span>
        <span className="tok-punc">,</span> edits<span className="tok-punc">:</span> <span className="tok-num">2</span>{' '}
        <span className="tok-punc">{'}'})</span>
        <span className="tok-punc">;</span>
      </pre>

      <div className="ns-math-block">
        ∇·E = ρ / ε₀ <span className="ns-math-num">(3)</span>
      </div>

      <div className="ns-footnotes">
        <div className="ns-footnote-item">
          <span className="ns-footnote-no">1.</span>
          <span>The plain-text mention of the indexing notes isn&rsquo;t yet a real link.</span>
        </div>
      </div>
    </article>
  )
}
