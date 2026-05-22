import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Scope } from './scope'

export type AgentId = (typeof agentRegistry)[number]['id']

export type AgentDefinition = {
  detectInstalled: (context: AgentDetectionContext) => Promise<boolean>
  detectPath: (context: AgentPathContext) => string
  displayName: string
  globalSkillsDir: (context: AgentPathContext) => string
  id: string
  projectSkillsDir: string
  readsCanonicalGlobalSkills: boolean
  readsCanonicalProjectSkills: boolean
  showInUniversalList?: boolean
}

export type AgentDetectionContext = AgentPathContext & {
  pathExists: (path: string) => Promise<boolean>
}

export type AgentPathContext = {
  configHome: string
  cwd: string
  home: string
}

export type AgentLinkMode = 'blocked' | 'directory-symlink' | 'native' | 'undetected'

type RegistryInput = {
  detectInstalled?: (context: AgentDetectionContext) => Promise<boolean>
  detectPath: (context: AgentPathContext) => string
  displayName: string
  globalSkillsDir: (context: AgentPathContext) => string
  id: string
  projectSkillsDir: string
  showInUniversalList?: boolean
}

export function resolveAgentTarget(agent: AgentDefinition, scope: Scope): string {
  if (usesCanonicalTarget(agent, scope)) {
    return scope.installDir
  }

  if (scope.scope === 'global') {
    return agent.globalSkillsDir(createPathContext())
  }

  return join(process.cwd(), agent.projectSkillsDir)
}

export function resolveAgentMarker(agent: AgentDefinition, scope: Scope): string | undefined {
  const context = createPathContext()
  if (scope.scope === 'global') {
    return agent.detectPath(context)
  }

  if (usesCanonicalTarget(agent, scope)) {
    return scope.installDir
  }

  return resolveProjectAgentMarker(agent, context)
}

export async function detectAgentInstalled(agent: AgentDefinition, scope: Scope): Promise<boolean> {
  const context = createAgentDetectionContext()
  if (scope.scope === 'global') {
    return agent.detectInstalled(context)
  }

  if (usesCanonicalTarget(agent, scope)) {
    return context.pathExists(scope.installDir)
  }

  const projectMarker = resolveProjectAgentMarker(agent, context)
  return projectMarker ? context.pathExists(projectMarker) : false
}

export function usesCanonicalTarget(agent: AgentDefinition, scope: Scope): boolean {
  return scope.scope === 'global' ? agent.readsCanonicalGlobalSkills : agent.readsCanonicalProjectSkills
}

export const agentRegistry: AgentDefinition[] = [
  defineAgent('aider-desk', 'AiderDesk', '.aider-desk/skills', homePath('.aider-desk/skills'), homePath('.aider-desk')),
  defineAgent('amp', 'Amp', '.agents/skills', configPath('agents/skills'), configPath('amp')),
  defineAgent(
    'antigravity',
    'Antigravity',
    '.agents/skills',
    homePath('.gemini/antigravity/skills'),
    homePath('.gemini/antigravity')
  ),
  defineAgent('augment', 'Augment', '.augment/skills', homePath('.augment/skills'), homePath('.augment')),
  defineAgent('bob', 'IBM Bob', '.bob/skills', homePath('.bob/skills'), homePath('.bob')),
  defineAgent('claude-code', 'Claude Code', '.claude/skills', claudePath('skills'), claudeHome),
  defineAgent('openclaw', 'OpenClaw', 'skills', openClawSkillsPath, openClawDetectPath, {
    detectInstalled: detectOpenClaw
  }),
  defineAgent('cline', 'Cline', '.agents/skills', homePath('.agents/skills'), homePath('.cline')),
  defineAgent(
    'codearts-agent',
    'CodeArts Agent',
    '.codeartsdoer/skills',
    homePath('.codeartsdoer/skills'),
    homePath('.codeartsdoer')
  ),
  defineAgent('codebuddy', 'CodeBuddy', '.codebuddy/skills', homePath('.codebuddy/skills'), homePath('.codebuddy')),
  defineAgent('codemaker', 'Codemaker', '.codemaker/skills', homePath('.codemaker/skills'), homePath('.codemaker')),
  defineAgent(
    'codestudio',
    'Code Studio',
    '.codestudio/skills',
    homePath('.codestudio/skills'),
    homePath('.codestudio')
  ),
  defineAgent('codex', 'Codex', '.agents/skills', codexPath('skills'), codexDetectPath, {
    detectInstalled: detectCodex
  }),
  defineAgent(
    'command-code',
    'Command Code',
    '.commandcode/skills',
    homePath('.commandcode/skills'),
    homePath('.commandcode')
  ),
  defineAgent('continue', 'Continue', '.continue/skills', homePath('.continue/skills'), homePath('.continue')),
  defineAgent(
    'cortex',
    'Cortex Code',
    '.cortex/skills',
    homePath('.snowflake/cortex/skills'),
    homePath('.snowflake/cortex')
  ),
  defineAgent('crush', 'Crush', '.crush/skills', configPath('crush/skills'), configPath('crush')),
  defineAgent('cursor', 'Cursor', '.agents/skills', homePath('.cursor/skills'), homePath('.cursor')),
  defineAgent(
    'deepagents',
    'Deep Agents',
    '.agents/skills',
    homePath('.deepagents/agent/skills'),
    homePath('.deepagents')
  ),
  defineAgent('devin', 'Devin for Terminal', '.devin/skills', configPath('devin/skills'), configPath('devin')),
  defineAgent('dexto', 'Dexto', '.agents/skills', homePath('.agents/skills'), homePath('.dexto')),
  defineAgent('droid', 'Droid', '.factory/skills', homePath('.factory/skills'), homePath('.factory')),
  defineAgent('firebender', 'Firebender', '.agents/skills', homePath('.firebender/skills'), homePath('.firebender')),
  defineAgent('forgecode', 'ForgeCode', '.forge/skills', homePath('.forge/skills'), homePath('.forge')),
  defineAgent('gemini-cli', 'Gemini CLI', '.agents/skills', homePath('.gemini/skills'), homePath('.gemini')),
  defineAgent('github-copilot', 'GitHub Copilot', '.agents/skills', homePath('.copilot/skills'), homePath('.copilot')),
  defineAgent('goose', 'Goose', '.goose/skills', configPath('goose/skills'), configPath('goose')),
  defineAgent('hermes-agent', 'Hermes Agent', '.hermes/skills', homePath('.hermes/skills'), homePath('.hermes')),
  defineAgent('junie', 'Junie', '.junie/skills', homePath('.junie/skills'), homePath('.junie')),
  defineAgent('iflow-cli', 'iFlow CLI', '.iflow/skills', homePath('.iflow/skills'), homePath('.iflow')),
  defineAgent('kilo', 'Kilo Code', '.kilocode/skills', homePath('.kilocode/skills'), homePath('.kilocode')),
  defineAgent('kimi-cli', 'Kimi Code CLI', '.agents/skills', configPath('agents/skills'), homePath('.kimi')),
  defineAgent('kiro-cli', 'Kiro CLI', '.kiro/skills', homePath('.kiro/skills'), homePath('.kiro')),
  defineAgent('kode', 'Kode', '.kode/skills', homePath('.kode/skills'), homePath('.kode')),
  defineAgent('mcpjam', 'MCPJam', '.mcpjam/skills', homePath('.mcpjam/skills'), homePath('.mcpjam')),
  defineAgent('mistral-vibe', 'Mistral Vibe', '.vibe/skills', vibePath('skills'), vibeHome),
  defineAgent('mux', 'Mux', '.mux/skills', homePath('.mux/skills'), homePath('.mux')),
  defineAgent('opencode', 'OpenCode', '.agents/skills', configPath('opencode/skills'), configPath('opencode')),
  defineAgent('openhands', 'OpenHands', '.openhands/skills', homePath('.openhands/skills'), homePath('.openhands')),
  defineAgent('pi', 'Pi', '.pi/skills', homePath('.pi/agent/skills'), homePath('.pi/agent')),
  defineAgent('qoder', 'Qoder', '.qoder/skills', homePath('.qoder/skills'), homePath('.qoder')),
  defineAgent('qwen-code', 'Qwen Code', '.qwen/skills', homePath('.qwen/skills'), homePath('.qwen')),
  defineAgent('replit', 'Replit', '.agents/skills', configPath('agents/skills'), projectPath('.replit'), {
    showInUniversalList: false
  }),
  defineAgent('rovodev', 'Rovo Dev', '.rovodev/skills', homePath('.rovodev/skills'), homePath('.rovodev')),
  defineAgent('roo', 'Roo Code', '.roo/skills', homePath('.roo/skills'), homePath('.roo')),
  defineAgent(
    'tabnine-cli',
    'Tabnine CLI',
    '.tabnine/agent/skills',
    homePath('.tabnine/agent/skills'),
    homePath('.tabnine')
  ),
  defineAgent('trae', 'Trae', '.trae/skills', homePath('.trae/skills'), homePath('.trae')),
  defineAgent('trae-cn', 'Trae CN', '.trae/skills', homePath('.trae-cn/skills'), homePath('.trae-cn')),
  defineAgent('warp', 'Warp', '.agents/skills', homePath('.agents/skills'), homePath('.warp')),
  defineAgent(
    'windsurf',
    'Windsurf',
    '.windsurf/skills',
    homePath('.codeium/windsurf/skills'),
    homePath('.codeium/windsurf')
  ),
  defineAgent('zencoder', 'Zencoder', '.zencoder/skills', homePath('.zencoder/skills'), homePath('.zencoder')),
  defineAgent('neovate', 'Neovate', '.neovate/skills', homePath('.neovate/skills'), homePath('.neovate')),
  defineAgent('pochi', 'Pochi', '.pochi/skills', homePath('.pochi/skills'), homePath('.pochi')),
  defineAgent('adal', 'AdaL', '.adal/skills', homePath('.adal/skills'), homePath('.adal')),
  defineAgent('universal', 'Universal', '.agents/skills', configPath('agents/skills'), () => '', {
    showInUniversalList: false
  })
]

function defineAgent(
  id: string,
  displayName: string,
  projectSkillsDir: string,
  globalSkillsDir: RegistryInput['globalSkillsDir'],
  detectPath: RegistryInput['detectPath'],
  options: Pick<RegistryInput, 'detectInstalled' | 'showInUniversalList'> = {}
): AgentDefinition {
  // Native agents read the current scope canonical store in both project and global mode.
  // Their registry globalSkillsDir is not used as a separate target in this CLI.
  const universal = projectSkillsDir === '.agents/skills'
  return {
    detectInstalled:
      options.detectInstalled ??
      (async context => {
        const path = detectPath(context)
        return path ? context.pathExists(path) : false
      }),
    displayName,
    detectPath,
    globalSkillsDir,
    id,
    projectSkillsDir,
    readsCanonicalGlobalSkills: universal,
    readsCanonicalProjectSkills: universal,
    showInUniversalList: options.showInUniversalList
  }
}

export function createAgentDetectionContext(): AgentDetectionContext {
  return {
    ...createPathContext(),
    pathExists
  }
}

function createPathContext(): AgentPathContext {
  const home = process.env.HOME ?? homedir()
  return {
    configHome: process.env.XDG_CONFIG_HOME ?? join(home, '.config'),
    cwd: process.cwd(),
    home
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function homePath(path: string): (context: AgentPathContext) => string {
  return context => join(context.home, path)
}

function configPath(path: string): (context: AgentPathContext) => string {
  return context => join(context.configHome, path)
}

function projectPath(path: string): (context: AgentPathContext) => string {
  return context => join(context.cwd, path)
}

function resolveProjectAgentMarker(agent: AgentDefinition, context: AgentPathContext): string | undefined {
  const parent = dirname(agent.projectSkillsDir)
  return parent === '.' ? undefined : join(context.cwd, parent)
}

function claudePath(path: string): (context: AgentPathContext & { claudeHome?: string }) => string {
  return context => join(context.claudeHome ?? claudeHome(context), path)
}

function codexPath(path: string): (context: AgentPathContext & { codexHome?: string }) => string {
  return context => join(context.codexHome ?? process.env.CODEX_HOME?.trim() ?? join(context.home, '.codex'), path)
}

function vibePath(path: string): (context: AgentPathContext & { vibeHome?: string }) => string {
  return context => join(context.vibeHome ?? vibeHome(context), path)
}

function claudeHome(context: AgentPathContext): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() ?? join(context.home, '.claude')
}

function vibeHome(context: AgentPathContext): string {
  return process.env.VIBE_HOME?.trim() ?? join(context.home, '.vibe')
}

function codexDetectPath(context: AgentPathContext): string {
  return process.env.CODEX_HOME?.trim() ?? join(context.home, '.codex')
}

async function detectCodex(context: AgentDetectionContext): Promise<boolean> {
  return (await context.pathExists(codexDetectPath(context))) || (await context.pathExists('/etc/codex'))
}

async function detectOpenClaw(context: AgentDetectionContext): Promise<boolean> {
  for (const dirname of ['.openclaw', '.clawdbot', '.moltbot']) {
    if (await context.pathExists(join(context.home, dirname))) {
      return true
    }
  }

  return false
}

function openClawDetectPath(context: AgentPathContext): string {
  for (const dirname of ['.openclaw', '.clawdbot', '.moltbot']) {
    return join(context.home, dirname)
  }

  return join(context.home, '.openclaw')
}

function openClawSkillsPath(context: AgentPathContext): string {
  for (const dirname of ['.openclaw', '.clawdbot', '.moltbot']) {
    if (existsSync(join(context.home, dirname))) {
      return join(context.home, dirname, 'skills')
    }
  }

  return join(context.home, '.openclaw/skills')
}
