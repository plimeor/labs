export interface CodeLanguageOption {
  label: string
  value: string
}

const languageDisplayNames: Record<string, string> = {
  bash: 'Shell',
  c: 'C',
  'c++': 'C++',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  css: 'CSS',
  docker: 'Dockerfile',
  dockerfile: 'Dockerfile',
  fish: 'Shell',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  markdown: 'Markdown',
  md: 'Markdown',
  php: 'PHP',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  ruby: 'Ruby',
  rust: 'Rust',
  sh: 'Shell',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  zsh: 'Shell'
}

const languageOptionAliases: Record<string, string> = {
  bash: 'sh',
  fish: 'sh',
  javascript: 'js',
  markdown: 'md',
  py: 'python',
  rs: 'rust',
  shell: 'sh',
  typescript: 'ts',
  yml: 'yaml',
  zsh: 'sh'
}

export const codeLanguageOptions: CodeLanguageOption[] = [
  { label: 'Plain Text', value: '' },
  { label: 'TypeScript', value: 'ts' },
  { label: 'JavaScript', value: 'js' },
  { label: 'Python', value: 'python' },
  { label: 'Rust', value: 'rust' },
  { label: 'Shell', value: 'sh' },
  { label: 'JSON', value: 'json' },
  { label: 'Go', value: 'go' },
  { label: 'SQL', value: 'sql' },
  { label: 'Markdown', value: 'md' },
  { label: 'CSS', value: 'css' },
  { label: 'HTML', value: 'html' },
  { label: 'YAML', value: 'yaml' }
]

export function languageDisplayName(info: string): string {
  const lower = info.trim().toLowerCase()
  const mapped = languageDisplayNames[lower] ?? info.trim().toUpperCase()
  return mapped.length > 0 ? mapped : 'CODE'
}

export function languageOptionValue(info: string): string {
  const lower = info.trim().toLowerCase()
  return languageOptionAliases[lower] ?? lower
}
