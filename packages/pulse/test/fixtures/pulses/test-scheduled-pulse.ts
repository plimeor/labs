export const name = 'test-scheduled-pulse'
export const schedule = '0 0 1 1 *'

export async function run() {
  const marker = process.env.PULSE_TEST_MARKER
  if (!marker) {
    throw new Error('PULSE_TEST_MARKER is required')
  }

  await Bun.write(marker, 'scheduled')
}
