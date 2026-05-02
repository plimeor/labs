import * as v from 'valibot'

import { answerQuery } from '../query.js'
import { splitCommaList } from '../strings.js'
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
    commits: splitCommaList(context.options.commits),
    projectId: context.options.project,
    question
  })
  process.stdout.write(answer.endsWith('\n') ? answer : `${answer}\n`)
}
