import { EncryptJWT, jwtDecrypt } from 'jose';
import { sign, verify } from 'jsonwebtoken';

/**
 * Sign and encrypt data as a JWT token
 * @param secret secret for signing and encrypting
 * @param timeout how long before the JWT expires. This is intentionally required
 * @param data data to encoode and encrypt
 * @returns encrypted JWT token
 */
export const encode = async (secret: string, timeout: string, payload: any) => {
  return sign(payload, secret, {
    expiresIn: timeout,
    algorithm: 'RS512',
  });
};

/**
 * Decrypts and decodes tokens signed using `encode`.
 * @param secret secret used to `encode`
 * @param token token to be verified
 * @returns the claims
 */
export const decode = async <T>(secret: string, token: string): Promise<T> => {
  return verify(token, secret) as T;
};

/**
 * Sign and encrypt data as a JWT token
 * @param secret secret for signing and encrypting
 * @param timeout how long before the JWT expires. This is intentionally required
 * @param data data to encoode and encrypt
 * @returns encrypted JWT token
 */
export function encodeJose(
  secret: Uint8Array,
  timeout: string,
  data: any
): Promise<string> {
  return new EncryptJWT({ 'urn:custom:claim': data })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(timeout)
    .encrypt(secret);
}

/**
 * Decrypts and decodes tokens signed using `encode`.
 * @param secret secret used to `encode`
 * @param token token to be verified
 * @returns the claims
 */
export async function decodeJose<T = any>(
  secret: Uint8Array,
  token: string
): Promise<T> {
  const { payload } = await jwtDecrypt(token, secret);
  return payload['urn:custom:claim'] as T;
}
