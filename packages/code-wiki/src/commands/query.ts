import * as v from 'valibot'

import { answerQuery } from '../query.js'
import { TextSchema } from '../types.js'

export const queryArgsSchema = v.object({
  question: v.array(TextSchema)
})

export const queryOptionsSchema = v.object({
  commits: v.optional(TextSchema),
  project: v.optional(TextSchema)
})

export type QueryCommandContext = {
  args: v.InferOutput<typeof queryArgsSchema>
  options: v.InferOutput<typeof queryOptionsSchema>
}

export async function queryCommand(context: QueryCommandContext) {
  const question = context.args.question.join(' ').trim()
  if (!question) {
    throw new Error('Missing question')
  }

  const answer = await answerQuery({
    commits: splitCommits(context.options.commits),
    projectId: context.options.project,
    question
  })
  process.stdout.write(answer.endsWith('\n') ? answer : `${answer}\n`)
}

function splitCommits(input: string | undefined): string[] | undefined {
  if (!input) {
    return undefined
  }

  const commits = input
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return commits.length > 0 ? commits : undefined
}
