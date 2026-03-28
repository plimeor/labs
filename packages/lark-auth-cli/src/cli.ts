import { Cli, z } from 'incur'

import { getUserToken } from './index'

const cli = Cli.create('lark-auth', {
  description: 'Lark/Feishu authentication tools'
})

cli.command('get-user-token', {
  description: 'Obtain a user_access_token via OAuth2 authorization code flow',
  env: z.object({
    LARK_APP_ID: z.string().describe('Lark app ID'),
    LARK_APP_SECRET: z.string().describe('Lark app secret')
  }),
  options: z.object({
    port: z.coerce.number().default(19823).describe('Local callback server port'),
    save: z.boolean().optional().describe('Save token to .lark-token.json')
  }),
  output: z.object({
    access_token: z.string().describe('User access token'),
    expires_in: z.number().describe('Token expiry in seconds'),
    refresh_expires_in: z.number().describe('Refresh token expiry in seconds'),
    refresh_token: z.string().describe('Refresh token')
  }),
  async run(c) {
    const result = await getUserToken({
      appId: c.env.LARK_APP_ID,
      appSecret: c.env.LARK_APP_SECRET,
      port: c.options.port,
      save: c.options.save ? '.lark-token.json' : undefined
    })
    return result
  }
})

cli.serve()

export default cli
