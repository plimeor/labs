export enum CommandErrorCode {
  CommandFailed = 'COMMAND_FAILED',
  CommandNotFound = 'COMMAND_NOT_FOUND',
  InvalidArguments = 'INVALID_ARGUMENTS',
  InvalidOptions = 'INVALID_OPTIONS',
  MissingArgument = 'MISSING_ARGUMENT',
  UnknownArgument = 'UNKNOWN_ARGUMENT',
  UnknownOption = 'UNKNOWN_OPTION'
}

export type CommandError = {
  code: CommandErrorCode
  details?: unknown
  message: string
}

export class CommandRuntimeError extends Error {
  code: CommandErrorCode
  details?: unknown

  constructor(code: CommandErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'CommandRuntimeError'
    this.code = code
    this.details = details
  }
}

export function normalizeError(error: unknown): CommandError {
  if (error instanceof CommandRuntimeError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message
    }
  }

  return {
    code: CommandErrorCode.CommandFailed,
    message: error instanceof Error ? error.message : String(error)
  }
}
