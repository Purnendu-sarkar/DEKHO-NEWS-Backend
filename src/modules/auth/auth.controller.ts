import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendSms } from '../../utils/sms.util';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-dekho-news';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'refresh-super-secret';
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;

// Generate 6 digit crypto random OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;

    // Check rate limiting / cooldown for this phone in the DB
    const recentOtp = await prisma.otp.findFirst({
      where: { phone, isUsed: false },
      orderBy: { createdAt: 'desc' }
    });

    if (recentOtp) {
      const secondsSinceLastOtp = (new Date().getTime() - recentOtp.createdAt.getTime()) / 1000;
      if (secondsSinceLastOtp < 60) {
        res.status(429).json({ success: false, message: `Please wait ${Math.ceil(60 - secondsSinceLastOtp)} seconds before requesting a new OTP.` });
        return;
      }
    }

    const otp = generateOTP();
    const hash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await prisma.otp.create({
      data: {
        phone,
        hash,
        expiresAt,
      }
    });

    // Send real SMS
    console.log(`[DEV] Generated OTP for ${phone}: ${otp}`);
    try {
      await sendSms(phone, `Your DEKHO NEWS verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes.`);
    } catch (smsError: any) {
      console.warn(`[WARNING] Could not send SMS (Twilio restriction):`, smsError.message);
    }

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    console.error('Send OTP Error:', error);
    if (error.message && error.message.includes('Twilio SMS provider is not configured')) {
      res.status(500).json({ success: false, message: 'SMS Provider Configuration Error. Contact Administrator.' });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone, otp } = req.body;

    const otpRecord = await prisma.otp.findFirst({
      where: { phone, isUsed: false },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      res.status(400).json({ success: false, message: 'No OTP requested for this number.' });
      return;
    }

    if (otpRecord.expiresAt < new Date()) {
      res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
      return;
    }

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      res.status(400).json({ success: false, message: 'Maximum attempts reached. Please request a new OTP.' });
      return;
    }

    const isValid = await bcrypt.compare(otp, otpRecord.hash);

    if (!isValid) {
      await prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: otpRecord.attempts + 1 }
      });
      res.status(400).json({ success: false, message: 'Invalid OTP' });
      return;
    }

    // Mark OTP as used
    await prisma.otp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true }
    });

    // Find or create user
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          phone,
          profile: {
            create: { name: 'New User' }
          }
        },
      });
    }

    // Session creation
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: sessionExpiresAt,
        ip: req.ip,
        device: req.headers['user-agent']
      }
    });

    res.status(200).json({
      success: true,
      message: 'Verified successfully',
      data: { 
        user: {
          id: user.id,
          phone: user.phone,
          role: user.role,
        }, 
        tokens: {
          accessToken,
          refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const refreshSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch (e) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    // Verify token exists and is valid in DB
    const activeSessions = await prisma.session.findMany({
      where: { userId: user.id, isRevoked: false, expiresAt: { gt: new Date() } }
    });

    let validSession = null;
    for (const session of activeSessions) {
      if (await bcrypt.compare(refreshToken, session.refreshTokenHash)) {
        validSession = session;
        break;
      }
    }

    if (!validSession) {
      res.status(401).json({ success: false, message: 'Invalid session' });
      return;
    }

    const newAccessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    
    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken
      }
    });
  } catch (error) {
    console.error('Refresh Token Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    const decoded = jwt.decode(refreshToken) as { userId: string } | null;
    if (decoded?.userId) {
      // Find the specific session and revoke it
      const sessions = await prisma.session.findMany({
        where: { userId: decoded.userId, isRevoked: false }
      });
      
      for (const session of sessions) {
        if (await bcrypt.compare(refreshToken, session.refreshTokenHash)) {
          await prisma.session.update({
            where: { id: session.id },
            data: { isRevoked: true }
          });
          break;
        }
      }
    }

    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, password } = req.body;
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier }
        ]
      }
    });

    if (!user || !user.password) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (user.role === 'SUPER_ADMIN') {
      // 2FA is mandatory
      if (user.twoFactorSecret) {
        const tempToken = jwt.sign({ userId: user.id, isTemp: true }, JWT_SECRET, { expiresIn: '5m' });
        res.status(200).json({
          success: true,
          requires2fa: true,
          method: user.twoFactorMethod || 'AUTHENTICATOR',
          tempToken
        });
        return;
      } else {
        // Force setup
        const tempToken = jwt.sign({ userId: user.id, isTemp: true, requireSetup: true }, JWT_SECRET, { expiresIn: '15m' });
        res.status(200).json({
          success: true,
          requiresSetup: true,
          tempToken
        });
        return;
      }
    }

    // Normal login (non-admin or non-superadmin without 2fa)
    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash, expiresAt: sessionExpiresAt, ip: req.ip, device: req.headers['user-agent'] }
    });

    res.status(200).json({
      success: true,
      data: { user: { id: user.id, phone: user.phone, email: user.email, role: user.role }, tokens: { accessToken, refreshToken } }
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const verifyTotp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tempToken, totpCode } = req.body;
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (e) {
      res.status(401).json({ success: false, message: 'Invalid or expired temporary token' });
      return;
    }

    if (!decoded.isTemp) {
      res.status(401).json({ success: false, message: 'Invalid token type' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.twoFactorSecret) {
      res.status(401).json({ success: false, message: '2FA not configured' });
      return;
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1 // Allow 1 step before/after
    });

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid 2FA code' });
      return;
    }

    const accessToken = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await prisma.session.create({
      data: { userId: user.id, refreshTokenHash, expiresAt: sessionExpiresAt, ip: req.ip, device: req.headers['user-agent'] }
    });

    res.status(200).json({
      success: true,
      data: { user: { id: user.id, phone: user.phone, email: user.email, role: user.role }, tokens: { accessToken, refreshToken } }
    });
  } catch (error) {
    console.error('Verify TOTP Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const setup2fa = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch(e) {
      res.status(401).json({ success: false, message: 'Invalid token' }); return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

    const secret = speakeasy.generateSecret({ name: `DEKHO NEWS (${user.email || user.phone})` });
    
    // Temporarily save it so verify can check it, but we can also just send it to client to verify first.
    // For simplicity, we just send it to the client. The client will verify it before it gets saved.
    
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    res.status(200).json({
      success: true,
      data: {
        secret: secret.base32,
        qrCodeUrl
      }
    });
  } catch (error) {
    console.error('Setup 2FA Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const verifySetup2fa = async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch(e) {
      res.status(401).json({ success: false, message: 'Invalid token' }); return;
    }

    const { secret, totpCode } = req.body; // Secret passed from client after setup

    const isValid = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: totpCode,
      window: 1
    });

    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid 2FA code' });
      return;
    }

    await prisma.user.update({
      where: { id: decoded.userId },
      data: {
        twoFactorSecret: secret,
        twoFactorMethod: 'AUTHENTICATOR'
      }
    });

    res.status(200).json({ success: true, message: '2FA successfully enabled' });
  } catch (error) {
    console.error('Verify Setup 2FA Error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
