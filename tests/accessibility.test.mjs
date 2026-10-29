import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../assets/css/main.css', import.meta.url), 'utf8')
const color = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('interface text palette meets 4.5:1 contrast on its opaque panel', () => {
  for (const name of ['text', 'muted', 'danger', 'warning']) {
    assert.ok(contrast(color(name), color('panel')) >= 4.5, `${name} contrast`)
  }
  assert.ok(contrast('#ffffff', color('primary')) >= 4.5)
})

test('form boundaries and keyboard focus exceed 3:1 contrast', () => {
  assert.ok(contrast(color('control-line'), color('panel')) >= 3)
  assert.ok(contrast(color('primary'), color('panel')) >= 3)
})

test('native select pickers have an explicit WebKit appearance and a visible affordance', () => {
  assert.match(css, /\.field select\s*\{[^}]*-webkit-appearance:\s*none/)
  assert.match(css, /\.field select\s*\{[^}]*background-image:/)
  assert.match(css, /\.field select\s*\{[^}]*padding-right:/)
})
