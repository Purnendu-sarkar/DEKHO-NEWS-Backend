import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

// We initialize the client if credentials exist, otherwise it will throw an error when used,
// fulfilling the requirement of not using fake fallbacks.
let client: twilio.Twilio | null = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

export const sendSms = async (to: string, message: string): Promise<void> => {
  if (!client || !fromPhone) {
    throw new Error('Twilio SMS provider is not configured. Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER in .env');
  }

  try {
    await client.messages.create({
      body: message,
      from: fromPhone,
      to,
    });
    console.log(`SMS dispatched to ${to}`);
    } catch (error: any) {
      // Throw the error so the controller can handle it (we catch it there to avoid crashing)
      throw new Error(`Failed to send SMS via Twilio: ${error.message}`);
    }
};
