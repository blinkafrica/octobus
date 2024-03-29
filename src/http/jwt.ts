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
export const decode = async (secret: string, token: string) => {
  return verify(token, secret);
};
