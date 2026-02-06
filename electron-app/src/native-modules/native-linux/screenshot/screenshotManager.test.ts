/**
 * Tests for resolveTessdataEnv (tessdata_fast detection) and OCR timeout.
 * Uses bun:test. Mock fs to avoid filesystem dependency.
 */
import { expect, jest, mock, test } from 'bun:test'
import fs from 'fs/promises'

// Mock electron so screenshotManager can be loaded
mock.module('electron', () => ({
  app: { getPath: () => '/tmp' }
}))

test('resolveTessdataEnv returns TESSDATA_PREFIX when tessdata_fast/eng.traineddata exists', async () => {
  const accessSpy = jest.spyOn(fs, 'access').mockResolvedValue(undefined)
  const { resolveTessdataEnv } = await import('./screenshotManager')
  const { env, label } = await resolveTessdataEnv()
  expect(label).toBe('tessdata_fast')
  expect(env?.TESSDATA_PREFIX).toMatch(/tessdata_fast/)
  accessSpy.mockRestore()
})

test('resolveTessdataEnv returns no env when tessdata_fast/eng.traineddata missing', async () => {
  const accessSpy = jest.spyOn(fs, 'access').mockRejectedValue(new Error('missing'))
  const { resolveTessdataEnv } = await import('./screenshotManager')
  const { env, label } = await resolveTessdataEnv()
  expect(label).toContain('tessdata_best')
  expect(env).toBeUndefined()
  accessSpy.mockRestore()
})
