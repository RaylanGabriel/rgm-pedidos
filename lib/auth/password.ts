import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto"

/**
 * Hash de senha com scrypt (nativo do Node, sem dependências).
 * Formato armazenado: scrypt$N$r$p$<salt base64>$<hash base64>
 */
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

function scryptAsync(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    )
  })
}

/** Senha provisória fácil de ditar/digitar (sem 0/o, 1/l/i): ex. "k7mq-x3vt-9pbe" (~62 bits). */
export function generateTempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
  const chars = Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)])
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join("")).join("-")
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, N, R, P)
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$")
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, "base64")
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails são válidos. */
let dummyHash: Promise<string> | undefined
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"))
  return dummyHash
}
