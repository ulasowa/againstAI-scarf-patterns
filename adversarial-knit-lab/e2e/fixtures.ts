/**
 * Test images, generated rather than committed.
 *
 * A minimal PNG encoder keeps binary blobs out of the repository and lets each
 * test describe exactly what it needs.
 */
import { deflateSync } from 'node:zlib'

function crc32(buffer: Buffer): number {
  let c = ~0
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i] as number
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

/** Encode RGBA pixels as a PNG. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    )
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A colourful gradient with blocks, so palette extraction has something to do. */
export function gradientPng(width = 96, height = 96): Buffer {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const block = (Math.floor(x / 16) + Math.floor(y / 16)) % 2
      rgba[i] = Math.round((x / width) * 255)
      rgba[i + 1] = Math.round((y / height) * 255)
      rgba[i + 2] = block ? 200 : 40
      rgba[i + 3] = 255
    }
  }
  return encodePng(width, height, rgba)
}

/**
 * A synthetic "scene": a plain background with a tall dark rectangle where a
 * person would stand. It is a placeholder for annotation and UI tests, and is
 * deliberately NOT used to claim anything about detection.
 */
export function scenePng(width = 320, height = 480): Buffer {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const inFigure =
        x > width * 0.32 && x < width * 0.68 && y > height * 0.12 && y < height * 0.92
      rgba[i] = inFigure ? 70 : 190
      rgba[i + 1] = inFigure ? 74 : 196
      rgba[i + 2] = inFigure ? 82 : 205
      rgba[i + 3] = 255
    }
  }
  return encodePng(width, height, rgba)
}
