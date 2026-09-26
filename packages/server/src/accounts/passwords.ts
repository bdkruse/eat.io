import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_COST_PARAMETER = 16384; // N
const SCRYPT_BLOCK_SIZE_PARAMETER = 8; // r
const SCRYPT_PARALLELIZATION_PARAMETER = 1; // p
const SCRYPT_KEY_LENGTH = 64;
const SALT_LENGTH_BYTES = 16;
const STORED_VALUE_PREFIX = "scrypt";
const STORED_VALUE_PART_COUNT = 6;

/** Hashes `password` with scrypt and a fresh random salt, returning a self-describing string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST_PARAMETER,
    r: SCRYPT_BLOCK_SIZE_PARAMETER,
    p: SCRYPT_PARALLELIZATION_PARAMETER,
  });
  return [
    STORED_VALUE_PREFIX,
    SCRYPT_COST_PARAMETER,
    SCRYPT_BLOCK_SIZE_PARAMETER,
    SCRYPT_PARALLELIZATION_PARAMETER,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

/** Verifies `password` against a value produced by {@link hashPassword}, false on any malformed input. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== STORED_VALUE_PART_COUNT || parts[0] !== STORED_VALUE_PREFIX) return false;

  const [, costText, blockSizeText, parallelizationText, saltBase64, expectedHashBase64] = parts;
  const costParameter = Number(costText);
  const blockSizeParameter = Number(blockSizeText);
  const parallelizationParameter = Number(parallelizationText);
  if (
    !Number.isInteger(costParameter) ||
    !Number.isInteger(blockSizeParameter) ||
    !Number.isInteger(parallelizationParameter)
  ) {
    return false;
  }

  const salt = Buffer.from(saltBase64 ?? "", "base64");
  const expectedHash = Buffer.from(expectedHashBase64 ?? "", "base64");
  if (salt.length === 0 || expectedHash.length === 0) return false;

  let actualHash: Buffer;
  try {
    actualHash = scryptSync(password, salt, expectedHash.length, {
      N: costParameter,
      r: blockSizeParameter,
      p: parallelizationParameter,
    });
  } catch {
    return false;
  }

  return timingSafeEqual(actualHash, expectedHash);
}
