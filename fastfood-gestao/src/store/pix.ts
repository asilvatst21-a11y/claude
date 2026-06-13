// PIX BRCode (EMV Merchant Presented Mode) com CRC16-CCITT

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// PIX spec (BCB) exige ASCII puro nos campos nome e cidade — remove acentos
function toAscii(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').trim()
}

export function buildPixPayload(pixKey: string, amount: number, merchantName: string, city: string): string {
  const f = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`
  const name = (toAscii(merchantName) || 'Estabelecimento').slice(0, 25)
  const cty  = (toAscii(city) || 'Brasil').slice(0, 15)
  const key  = pixKey.trim()
  const mai = f('00', 'BR.GOV.BCB.PIX') + f('01', key)
  let p = f('00', '01') + f('26', mai) + f('52', '0000') + f('53', '986')
  if (amount > 0) p += f('54', amount.toFixed(2))
  p += f('58', 'BR') + f('59', name) + f('60', cty)
  p += f('62', f('05', '***')) + '6304'
  return p + crc16(p)
}
