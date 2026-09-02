import { z } from 'zod';

const phoneRegex = /^\+[1-9]\d{1,14}$/;

export const requestOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(phoneRegex, 'Invalid phone number format. Must include country code, e.g. +8801XXXXXXXXX'),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(phoneRegex, 'Invalid phone number format.'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits').regex(/^\d{6}$/, 'OTP must contain only numbers'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const adminLoginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Email or Phone is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

export const verifyTotpSchema = z.object({
  body: z.object({
    tempToken: z.string().min(1, 'Temporary token is required'),
    totpCode: z.string().length(6, 'TOTP must be exactly 6 digits').regex(/^\d{6}$/, 'TOTP must contain only numbers'),
  }),
});

export const verifySetupTotpSchema = z.object({
  body: z.object({
    totpCode: z.string().length(6, 'TOTP must be exactly 6 digits').regex(/^\d{6}$/, 'TOTP must contain only numbers'),
  }),
});
