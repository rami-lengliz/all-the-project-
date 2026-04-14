import * as crypto from 'crypto';

export class ChatbotActionTokenUtil {
  public static generateToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  public static hashPayload(payload: any): string {
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
}
