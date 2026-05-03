import nodemailer from "nodemailer";

/**
 * Configure Nodemailer for Gmail
 */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send Verification OTP
 */
export async function sendOTP(email, code, purpose) {
  const mailOptions = {
    from: `"CV Generator API" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Verification Code: ${code}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #2563eb;">Verification Code</h2>
        <p>Anda telah meminta verifikasi untuk melakukan <strong>${purpose}</strong>.</p>
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #0f172a;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 0.9rem;">Kode ini akan kadaluarsa dalam 10 menit. Jika Anda tidak merasa melakukan permintaan ini, silakan abaikan email ini.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;">
        <p style="font-size: 0.8rem; color: #94a3b8;">&copy; 2026 CV Generator API. All rights reserved.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

/**
 * Send Deletion Confirmation
 */
export async function sendDeletionNotice(email, message) {
  const mailOptions = {
    from: `"CV Generator API" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Deletion Confirmed`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #ef4444;">Data Deleted Successfully</h2>
        <p>Informasi konfirmasi:</p>
        <p style="color: #1e293b; font-weight: 600;">${message}</p>
        <p>Data Anda telah di-backup ke sistem audit kami sebelum dihapus dari sistem aktif.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;">
        <p style="font-size: 0.8rem; color: #94a3b8;">&copy; 2026 CV Generator API. All rights reserved.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

/**
 * Send Login OTP
 */
export async function sendLoginOTP(email, code) {
  const mailOptions = {
    from: `"CV Generator API" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `Login Code: ${code}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #2563eb;">Login Verification</h2>
        <p>Gunakan kode di bawah ini untuk masuk ke akun <strong>CV Generator</strong> Anda.</p>
        <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #0f172a;">${code}</span>
        </div>
        <p style="color: #64748b; font-size: 0.9rem;">Kode ini rahasia dan hanya berlaku selama 10 menit.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin-top: 20px;">
        <p style="font-size: 0.8rem; color: #94a3b8;">&copy; 2026 CV Generator API. All rights reserved.</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}
