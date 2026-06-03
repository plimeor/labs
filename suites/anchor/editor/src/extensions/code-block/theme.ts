import { EditorView } from '@codemirror/view'

const codeBlockBorderColor = 'var(--editor-code-block-border)'
const codeBlockBorderStyle = 'solid'
const codeBlockBorderWidth = '1px'

export const codeBlockTheme = EditorView.theme({
  '.cm-line[data-editor-role="code-block-close"]': {
    background: 'var(--editor-code-block-background)',
    borderBottomColor: codeBlockBorderColor,
    borderBottomStyle: codeBlockBorderStyle,
    borderBottomWidth: codeBlockBorderWidth,
    borderLeftColor: codeBlockBorderColor,
    borderLeftStyle: codeBlockBorderStyle,
    borderLeftWidth: codeBlockBorderWidth,
    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
    borderRightColor: codeBlockBorderColor,
    borderRightStyle: codeBlockBorderStyle,
    borderRightWidth: codeBlockBorderWidth,
    fontFamily: 'var(--editor-code-font, var(--font-mono))',
    fontSize: '0.8em',
    lineHeight: '1',
    marginBottom: '0.6em',
    minHeight: '12px',
    padding: '4px 12px 8px',
    textIndent: '0'
  },
  '.cm-line[data-editor-role="code-block-content"]': {
    background: 'var(--editor-code-block-background)',
    borderLeftColor: codeBlockBorderColor,
    borderLeftStyle: codeBlockBorderStyle,
    borderLeftWidth: codeBlockBorderWidth,
    borderRightColor: codeBlockBorderColor,
    borderRightStyle: codeBlockBorderStyle,
    borderRightWidth: codeBlockBorderWidth,
    color: 'var(--editor-code-block-text)',
    fontFamily: 'var(--editor-code-font, var(--font-mono))',
    fontSize: '0.875em',
    lineHeight: '1.55',
    marginBottom: '0',
    overflowWrap: 'anywhere',
    padding: '0 12px 0 64px',
    position: 'relative',
    textIndent: '0',
    whiteSpace: 'pre-wrap'
  },
  '.cm-line[data-editor-role="code-block-content"]::before': {
    color: 'var(--text-muted)',
    content: 'attr(data-editor-line-num)',
    display: 'inline-block',
    fontSize: '0.8em',
    left: '16px',
    minWidth: '32px',
    position: 'absolute',
    textAlign: 'right',
    textIndent: '0',
    userSelect: 'none'
  },
  '.cm-line[data-editor-role="code-block-open"]': {
    alignItems: 'center',
    background: 'var(--editor-code-block-background)',
    borderLeftColor: codeBlockBorderColor,
    borderLeftStyle: codeBlockBorderStyle,
    borderLeftWidth: codeBlockBorderWidth,
    borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
    borderRightColor: codeBlockBorderColor,
    borderRightStyle: codeBlockBorderStyle,
    borderRightWidth: codeBlockBorderWidth,
    borderTopColor: codeBlockBorderColor,
    borderTopStyle: codeBlockBorderStyle,
    borderTopWidth: codeBlockBorderWidth,
    color: 'var(--editor-code-block-language)',
    display: 'flex',
    fontFamily: 'var(--editor-code-font, var(--font-mono))',
    fontSize: '0.8em',
    gap: '8px',
    lineHeight: '1.4',
    marginBottom: '0',
    marginTop: '0.6em',
    minHeight: '32px',
    padding: '6px 12px',
    position: 'relative',
    textIndent: '0'
  },
  '[data-editor-role="code-copy"]': {
    background: 'transparent',
    border: '1px solid var(--editor-code-block-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--editor-code-block-language)',
    fontFamily: 'inherit',
    fontSize: '0.75em',
    lineHeight: '1.4',
    marginLeft: 'auto',
    padding: '2px 8px'
  },
  '[data-editor-role="code-copy"]:hover': {
    color: 'var(--editor-code-block-text)'
  },
  '[data-editor-role="code-language-control"]': {
    display: 'inline-flex',
    position: 'relative'
  },
  '[data-editor-role="code-language-menu"]': {
    background: 'var(--surface-popover, var(--editor-code-block-background))',
    border: '1px solid var(--border-elevated, var(--editor-code-block-border))',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--elevation-popover, 0 12px 28px rgb(0 0 0 / 0.2))',
    display: 'grid',
    gap: '2px',
    left: '0',
    minWidth: '144px',
    overflowY: 'visible',
    padding: '4px',
    position: 'absolute',
    top: 'calc(100% + 4px)',
    zIndex: '20'
  },
  '[data-editor-role="code-language-option"]': {
    background: 'transparent',
    border: '0',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary, var(--editor-code-block-text))',
    fontFamily: 'inherit',
    fontSize: '0.75em',
    lineHeight: '1.4',
    minHeight: '28px',
    padding: '4px 8px',
    textAlign: 'left'
  },
  '[data-editor-role="code-language-option"]:hover': {
    background: 'var(--state-hover, rgb(127 127 127 / 0.12))'
  },
  '[data-editor-role="code-language-option"][aria-selected="true"]': {
    background: 'var(--state-selected, rgb(127 127 127 / 0.16))',
    fontWeight: '600'
  },
  '[data-editor-role="code-language-options"]': {
    display: 'grid',
    gap: '2px',
    maxHeight: '176px',
    overflowY: 'auto',
    overscrollBehavior: 'contain'
  },
  '[data-editor-role="code-language-search"]': {
    background: 'var(--surface-input, var(--editor-code-block-background))',
    border: '1px solid var(--border-input, var(--editor-code-block-border))',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary, var(--editor-code-block-text))',
    fontFamily: 'inherit',
    fontSize: '0.75em',
    lineHeight: '1.4',
    marginBottom: '4px',
    minHeight: '28px',
    outline: 'none',
    padding: '4px 8px'
  },
  '[data-editor-role="code-language-search"]:focus': {
    borderColor: 'var(--border-strong, var(--editor-code-block-border))'
  },
  '[data-editor-role="code-language"]': {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--editor-code-block-language)',
    fontFamily: 'inherit',
    fontSize: '0.75em',
    fontWeight: '600',
    lineHeight: '1.4',
    padding: '2px 6px',
    textTransform: 'uppercase'
  },
  '[data-editor-role="code-language"]:hover': {
    borderColor: 'var(--editor-code-block-border)',
    color: 'var(--editor-code-block-text)'
  }
})
