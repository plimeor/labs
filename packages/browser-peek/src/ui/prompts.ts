import { cancel, isCancel, select } from '@clack/prompts'

import { BrowserPeekError, type Profile, type StoreRecord, type StoreType } from '../types'

export async function selectProfile(profiles: Profile[], defaultId?: string): Promise<Profile> {
  if (profiles.length === 1) {
    return profiles[0] as Profile
  }

  const choice = await select({
    initialValue: defaultId,
    message: 'Select a profile',
    options: profiles.map(profile => ({
      hint: profile.isDefault ? 'current' : undefined,
      label: profile.name,
      value: profile.id
    }))
  })

  if (isCancel(choice)) {
    cancel('Cancelled.')
    process.exit(130)
  }

  const profile = profiles.find(candidate => candidate.id === choice)
  if (!profile) {
    throw new BrowserPeekError('Selected profile not found.')
  }
  return profile
}

const STORE_TAG: Record<StoreType, string> = {
  cookie: 'cookie',
  'local-storage': 'local'
}

export async function selectRecord(records: StoreRecord[], message: string): Promise<StoreRecord> {
  const choice = await select({
    message,
    options: records.map((record, index) => ({
      hint: `${STORE_TAG[record.store]} · ${record.origin}`,
      label: record.name === '' ? '(empty)' : record.name,
      value: index
    }))
  })

  if (isCancel(choice)) {
    cancel('Cancelled.')
    process.exit(130)
  }

  return records[choice as number] as StoreRecord
}
