import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "default_secret_key_change_me";

/**
 * Generate a JWT for a user
 */
export function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email 
    }, 
    SECRET, 
    { expiresIn: "7d" } // Token valid for 7 days
  );
}

/**
 * Verify a JWT from request headers
 */
export function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No token provided");
  }

  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    throw new Error("Invalid or expired token");
  }
}
