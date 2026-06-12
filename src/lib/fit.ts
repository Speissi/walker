import { haversineMeters } from './geo'
import { downloadBlob, safeFilename } from './download'
import type { RouteResult } from './brouter'

// Minimal FIT encoder for course files (Garmin's native course format,
// which unlocks proper course behavior on watches: virtual partner,
// ClimbPro, off-course alerts). The official @garmin/fitsdk only decodes,
// so the binary format is written by hand per the FIT Protocol spec:
// a 14-byte header, definition + data messages, and a trailing CRC-16.

const FIT_EPOCH_OFFSET = 631065600 // FIT timestamps count from 1989-12-31T00:00:00Z
const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180
const WALKING_SPEED_MPS = 4.8 / 3.6 // for the synthetic course timeline

// FIT base type codes
const ENUM = 0x00
const UINT8 = 0x02
const UINT16 = 0x84
const SINT32 = 0x85
const UINT32 = 0x86
const UINT32Z = 0x8c
const STRING = 0x07

// Global message numbers
const MSG_FILE_ID = 0
const MSG_LAP = 19
const MSG_RECORD = 20
const MSG_EVENT = 21
const MSG_COURSE = 31

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800,
  0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
]

function crc16(bytes: Uint8Array, crc = 0): number {
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf]
    tmp = CRC_TABLE[crc & 0xf]
    crc = (crc >> 4) & 0x0fff
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf]
  }
  return crc
}

class ByteWriter {
  private buf: number[] = []

  u8(v: number) {
    this.buf.push(v & 0xff)
  }
  u16(v: number) {
    this.u8(v)
    this.u8(v >>> 8)
  }
  u32(v: number) {
    this.u16(v)
    this.u16(v >>> 16)
  }
  s32(v: number) {
    this.u32(v >>> 0) // two's complement
  }
  bytes(arr: ArrayLike<number>) {
    for (let i = 0; i < arr.length; i++) this.u8(arr[i])
  }
  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.buf)
  }
}

type FieldDef = [fieldNum: number, size: number, baseType: number]

function writeDefinition(w: ByteWriter, localType: number, globalNum: number, fields: FieldDef[]) {
  w.u8(0x40 | localType) // definition message header
  w.u8(0) // reserved
  w.u8(0) // little-endian
  w.u16(globalNum)
  w.u8(fields.length)
  for (const [num, size, base] of fields) {
    w.u8(num)
    w.u8(size)
    w.u8(base)
  }
}

const toSemicircles = (deg: number) => Math.round(deg * SEMICIRCLES_PER_DEGREE)

export function routeToFitCourse(route: RouteResult, name: string): Uint8Array {
  const coords = route.coordinates
  const startTime = Math.floor(Date.now() / 1000) - FIT_EPOCH_OFFSET

  // Cumulative distance and a synthetic walking-pace timeline for each
  // point (courses require record timestamps; they drive virtual partner).
  const cumDist: number[] = [0]
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(
      cumDist[i - 1] +
        haversineMeters(
          { lat: coords[i - 1][1], lng: coords[i - 1][0] },
          { lat: coords[i][1], lng: coords[i][0] },
        ),
    )
  }
  const totalDist = cumDist[cumDist.length - 1]
  const timeAt = (i: number) => startTime + Math.round(cumDist[i] / WALKING_SPEED_MPS)
  const endTime = timeAt(coords.length - 1)
  const totalMillis = (endTime - startTime) * 1000

  const body = new ByteWriter()

  // file_id: local 0
  writeDefinition(body, 0, MSG_FILE_ID, [
    [0, 1, ENUM], // type
    [1, 2, UINT16], // manufacturer
    [2, 2, UINT16], // product
    [3, 4, UINT32Z], // serial_number
    [4, 4, UINT32], // time_created
  ])
  body.u8(0)
  body.u8(6) // file type: course
  body.u16(255) // manufacturer: development
  body.u16(1)
  body.u32((Date.now() % 0xfffffffe) + 1) // any non-zero serial
  body.u32(startTime)

  // course: local 1
  const nameBytes = new TextEncoder().encode(name).slice(0, 31)
  writeDefinition(body, 1, MSG_COURSE, [
    [4, 1, ENUM], // sport
    [5, nameBytes.length + 1, STRING], // name (null-terminated)
  ])
  body.u8(1)
  body.u8(11) // sport: walking
  body.bytes(nameBytes)
  body.u8(0)

  // lap: local 2
  writeDefinition(body, 2, MSG_LAP, [
    [253, 4, UINT32], // timestamp
    [2, 4, UINT32], // start_time
    [3, 4, SINT32], // start_position_lat
    [4, 4, SINT32], // start_position_long
    [5, 4, SINT32], // end_position_lat
    [6, 4, SINT32], // end_position_long
    [7, 4, UINT32], // total_elapsed_time (ms)
    [8, 4, UINT32], // total_timer_time (ms)
    [9, 4, UINT32], // total_distance (cm)
  ])
  const first = coords[0]
  const last = coords[coords.length - 1]
  body.u8(2)
  body.u32(endTime)
  body.u32(startTime)
  body.s32(toSemicircles(first[1]))
  body.s32(toSemicircles(first[0]))
  body.s32(toSemicircles(last[1]))
  body.s32(toSemicircles(last[0]))
  body.u32(totalMillis)
  body.u32(totalMillis)
  body.u32(Math.round(totalDist * 100))

  // event: local 3 (timer start, reused for stop below)
  writeDefinition(body, 3, MSG_EVENT, [
    [253, 4, UINT32], // timestamp
    [0, 1, ENUM], // event
    [1, 1, ENUM], // event_type
    [4, 1, UINT8], // event_group
  ])
  body.u8(3)
  body.u32(startTime)
  body.u8(0) // event: timer
  body.u8(0) // event_type: start
  body.u8(0)

  // record: local 4
  writeDefinition(body, 4, MSG_RECORD, [
    [253, 4, UINT32], // timestamp
    [0, 4, SINT32], // position_lat
    [1, 4, SINT32], // position_long
    [5, 4, UINT32], // distance (cm)
    [2, 2, UINT16], // altitude ((m + 500) * 5)
  ])
  coords.forEach(([lon, lat, ele], i) => {
    body.u8(4)
    body.u32(timeAt(i))
    body.s32(toSemicircles(lat))
    body.s32(toSemicircles(lon))
    body.u32(Math.round(cumDist[i] * 100))
    body.u16(ele === undefined ? 0xffff : Math.round((ele + 500) * 5)) // 0xffff = invalid/absent
  })

  // event: timer stop_all
  body.u8(3)
  body.u32(endTime)
  body.u8(0)
  body.u8(4) // event_type: stop_all
  body.u8(0)

  const data = body.toUint8Array()

  const header = new ByteWriter()
  header.u8(14) // header size
  header.u8(0x10) // protocol version 1.0
  header.u16(2132) // profile version 21.32
  header.u32(data.length)
  header.bytes(new TextEncoder().encode('.FIT'))
  const headerStart = header.toUint8Array()
  header.u16(crc16(headerStart)) // header CRC over the first 12 bytes

  const file = new ByteWriter()
  file.bytes(header.toUint8Array())
  file.bytes(data)
  file.u16(crc16(file.toUint8Array())) // file CRC over header + data

  return file.toUint8Array()
}

export function downloadFitCourse(route: RouteResult, name: string): void {
  downloadBlob(routeToFitCourse(route, name), 'application/octet-stream', `${safeFilename(name)}.fit`)
}
