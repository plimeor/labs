# @plimeor-labs/logger

Lightweight wrapper around [LogTape](https://github.com/dahlia/logtape) for structured logging.

## Installation

```bash
bun add @plimeor-labs/logger
```

## Usage

### Direct Logging

Log immediately without setup - messages are queued and flushed after `setup()`:

```typescript
import { logger } from '@plimeor-labs/logger'

logger.info('Application starting')
logger.debug('Loading config', { path: './config.json' })
```

### Setup

Configure the logger at application startup:

```typescript
await logger.setup({
  name: 'my-app',
  level: 'info',
  pretty: true,
})
```

| Option   | Type                                        | Default                              | Description        |
| -------- | ------------------------------------------- | ------------------------------------ | ------------------ |
| `name`   | `string`                                    | required                             | Root category name |
| `level`  | `'debug' \| 'info' \| 'warning' \| 'error'` | `'debug'`                            | Minimum log level  |
| `pretty` | `boolean`                                   | `true` in dev, `false` in production | Enable ANSI colors |

### Log Methods

```typescript
logger.debug('Debug message')
logger.info('Info message')
logger.warn('Warning message')
logger.error('Error message')

// With properties
logger.info('User logged in', { userId: 123, ip: '192.168.1.1' })
```

### Child Loggers

Create child loggers for module isolation (requires `setup()` first):

```typescript
const httpLog = logger.child('http')
const dbLog = logger.child('db', 'postgres')

httpLog.info('Request received')
dbLog.debug('Query executed', { sql: 'SELECT ...' })
```

## Queue Behavior

Logs before `setup()` are queued and automatically flushed when `setup()` is called:

```typescript
logger.info('This is queued')
logger.warn('This too')

await logger.setup({ name: 'app' })
// Both logs are now output with proper formatting
```

## Type Export

```typescript
import { type Logger } from '@plimeor-labs/logger'

function doSomething(log: Logger) {
  log.info('Doing something')
}
```
