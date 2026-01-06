import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserService } from './userService';

export interface JWTPayload {
  phoneNumber: string;
  email?: string;
}

export interface RegisterData {
  phoneNumber: string;
  password: string;
  email?: string;
}

export interface LoginData {
  phoneNumber: string;
  password: string;
}

export class AuthService {
  private userService: UserService;
  private jwtSecret: string;
  private saltRounds = 10;

  constructor() {
    this.userService = new UserService();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-this';
    
    if (!process.env.JWT_SECRET) {
      console.warn('[AUTH] WARNING: JWT_SECRET not set in environment. Using default (insecure).');
    }
  }

  /**
   * Register new user with phone number and password
   */
  async register(data: RegisterData): Promise<{ token: string; user: any }> {
    const { phoneNumber, password, email } = data;

    // Check if user already exists
    const existingUser = await this.userService.getUser(phoneNumber);
    if (existingUser && existingUser.password_hash) {
      throw new Error('User already registered. Please login.');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.saltRounds);

    // Create or update user
    if (existingUser) {
      // User exists (from SMS purchase) - add password
      await this.userService.updateUser(phoneNumber, {
        password_hash: passwordHash,
        email: email,
      });
    } else {
      // New user - create with pending status
      await this.userService.createUser(phoneNumber, {
        password_hash: passwordHash,
        email: email,
        status: 'pending',
      });
    }

    // Get updated user
    const user = await this.userService.getUser(phoneNumber);
    
    // Generate JWT token
    const token = this.generateToken(phoneNumber, email);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Login with phone number OR email and password
   */
  async login(data: LoginData): Promise<{ token: string; user: any }> {
    const { phoneNumber, password } = data;

    // Try to get user by phone number OR email
    let user = await this.userService.getUser(phoneNumber);
    
    // If not found by phone, try email
    if (!user) {
      user = await this.userService.getUserByEmail(phoneNumber); // phoneNumber field can contain email
    }

    if (!user || !user.password_hash) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token
    const token = this.generateToken(user.phone_number, user.email);

    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Login or register with Google OAuth
   */
  async googleAuth(googleId: string, email: string, phoneNumber?: string): Promise<{ token: string; user: any; isNew: boolean }> {
    // Try to find existing user by google_id
    let existingUser = await this.userService.getUserByGoogleId(googleId);
    
    if (existingUser) {
      // User exists - login
      const token = this.generateToken(existingUser.phone_number, existingUser.email);
      return {
        token,
        user: this.sanitizeUser(existingUser),
        isNew: false,
      };
    }

    // Check if user exists with this email (but no google_id yet)
    const userByEmail = await this.userService.getUserByEmail(email);
    if (userByEmail) {
      // Link Google account to existing user
      await this.userService.updateUser(userByEmail.phone_number, {
        google_id: googleId,
      });

      const updatedUser = await this.userService.getUser(userByEmail.phone_number);
      if (!updatedUser) {
        throw new Error('Failed to retrieve updated user');
      }

      const token = this.generateToken(updatedUser.phone_number, updatedUser.email);
      
      return {
        token,
        user: this.sanitizeUser(updatedUser),
        isNew: false,
      };
    }

    // New user - need phone number
    if (!phoneNumber) {
      throw new Error('Phone number required for new users');
    }

    // Create new user with Google ID
    await this.userService.createUser(phoneNumber, {
      google_id: googleId,
      email: email,
      status: 'pending',
    });

    const user = await this.userService.getUser(phoneNumber);
    const token = this.generateToken(phoneNumber, email);

    return {
      token,
      user: this.sanitizeUser(user),
      isNew: true,
    };
  }

  /**
   * Verify JWT token and return user
   */
  async verifyToken(token: string): Promise<any> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
      const user = await this.userService.getUser(decoded.phoneNumber);
      
      if (!user) {
        throw new Error('User not found');
      }

      return this.sanitizeUser(user);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(phoneNumber: string, email?: string): string {
    const payload: JWTPayload = {
      phoneNumber,
      email,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '30d', // Token valid for 30 days
    });
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: any): any {
    if (!user) return null;
    
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }
}
