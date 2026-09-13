/** Minimal SNMP trap decode (v1/v2c) — enough for logging and UI. */

function readLength(buf, offset) {
  const first = buf[offset];
  if (first === undefined) return null;
  if ((first & 0x80) === 0) return { length: first, next: offset + 1 };
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 1; i <= numBytes; i += 1) {
    length = (length << 8) + buf[offset + i];
  }
  return { length, next: offset + 1 + numBytes };
}

function readOid(buf, offset) {
  const lenInfo = readLength(buf, offset + 1);
  if (!lenInfo) return null;
  const start = lenInfo.next;
  const end = start + lenInfo.length;
  if (end > buf.length) return null;
  const parts = [];
  const first = buf[start];
  parts.push(Math.floor(first / 40));
  parts.push(first % 40);
  let val = 0;
  for (let i = start + 1; i < end; i += 1) {
    const b = buf[i];
    val = (val << 7) + (b & 0x7f);
    if ((b & 0x80) === 0) {
      parts.push(val);
      val = 0;
    }
  }
  return { oid: parts.join('.'), next: end };
}

function parseSnmpTrap(buffer) {
  if (!buffer || buffer.length < 12) {
    return { version: null, summary: 'empty packet' };
  }

  try {
    // SNMP message starts with SEQUENCE (0x30)
    let offset = 0;
    if (buffer[offset] !== 0x30) {
      return { version: null, summary: 'not SNMP', rawSize: buffer.length };
    }
    offset += 1;
    const seqLen = readLength(buffer, offset);
    if (!seqLen) return { version: null, summary: 'truncated', rawSize: buffer.length };
    offset = seqLen.next;

    // version INTEGER
    if (buffer[offset] !== 0x02) return { version: null, summary: 'no version', rawSize: buffer.length };
    const version = buffer[offset + 2];
    offset += 3;

    // community OCTET STRING — skip
    if (buffer[offset] === 0x04) {
      const commLen = readLength(buffer, offset + 1);
      if (commLen) offset = commLen.next + commLen.length;
    }

    const pduTag = buffer[offset];
    const pduNames = {
      0xa4: 'trap-v2',
      0xa6: 'inform',
      0xa7: 'trap-v1',
    };
    const pduType = pduNames[pduTag] || `pdu-0x${pduTag?.toString(16)}`;

    // Try to read first OID inside PDU for context
    let trapOid = null;
    const oidIdx = buffer.indexOf(0x06, offset);
    if (oidIdx > -1 && oidIdx < offset + 120) {
      const oidInfo = readOid(buffer, oidIdx);
      if (oidInfo) trapOid = oidInfo.oid;
    }

    return {
      version: version === 0 ? 'v1' : version === 1 ? 'v2c' : `v${version}`,
      pduType,
      trapOid,
      summary: trapOid ? `${pduType} ${trapOid}` : pduType,
      rawSize: buffer.length,
    };
  } catch (_) {
    return { version: null, summary: 'parse error', rawSize: buffer.length };
  }
}

module.exports = { parseSnmpTrap };
