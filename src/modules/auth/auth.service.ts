import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import * as bcrypt from 'bcrypt';
import type { JwtPayload, Role } from '../../common/auth/jwt-payload';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    try {
      this.logger.log(
        `Registration attempt: ${registerDto.email ?? registerDto.phone}`,
      );

      if (!registerDto.email && !registerDto.phone) {
        throw new BadRequestException('Either email or phone must be provided');
      }

      const hashedPassword = await bcrypt.hash(registerDto.password, 10);
      this.logger.debug('Password hashed successfully');

      // Exclude password field, only send passwordHash
      const { password, ...userDataWithoutPassword } = registerDto;
      const user = await this.usersService.create({
        ...userDataWithoutPassword,
        passwordHash: hashedPassword,
      });
      this.logger.log(`User created: ${user.id}`);

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;

      return {
        user: result,
        ...tokens,
      };
    } catch (error) {
      this.logger.error(`Registration error: ${error.message}`);
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    try {
      this.logger.log(`Login attempt for: ${loginDto.emailOrPhone}`);

      const user = await this.usersService.findByEmailOrPhone(
        loginDto.emailOrPhone,
      );

      if (!user) {
        this.logger.warn(
          `Login failed — user not found: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      const isPasswordValid = await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );
      this.logger.debug(`Password valid: ${isPasswordValid}`);

      if (!isPasswordValid) {
        this.logger.warn(
          `Login failed — invalid password: ${loginDto.emailOrPhone}`,
        );
        throw new UnauthorizedException('Invalid credentials');
      }

      const tokens = await this.generateTokens(
        user.id,
        user.email || user.phone,
        this.getRoleForUser(user),
      );
      this.logger.log(`Login successful: ${user.id}`);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return {
        user: result,
        ...tokens,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error(`Login error: ${error.message}`);
      throw error;
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('refreshToken.secret'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email || user.phone,
          role: this.getRoleForUser(user),
        } satisfies JwtPayload,
        {
          secret: this.configService.get<string>('jwt.secret'),
          expiresIn: this.configService.get<string>('jwt.expiresIn'),
        },
      );

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async verify(verifyDto: VerifyDto) {
    const user = await this.usersService.findOne(verifyDto.userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // TODO: Implement actual verification code check
    // For now, just set verified based on what was provided
    if (verifyDto.type === 'email') {
      user.verifiedEmail = true;
    } else if (verifyDto.type === 'phone') {
      user.verifiedPhone = true;
    }

    // Note: verifiedEmail/verifiedPhone aren't part of the public UpdateUserDto (profile update).
    // We still persist them here explicitly.
    await this.usersService.update(user.id, {
      verifiedEmail: user.verifiedEmail as any,
      verifiedPhone: user.verifiedPhone as any,
    });

    return { message: 'Verification successful' };
  }

  private getRoleForUser(user: { roles?: string[]; isHost?: boolean }): Role {
    const roles = (user.roles ?? []).map((r) => String(r).toUpperCase());
    if (roles.includes('ADMIN')) return 'ADMIN';
    if (user.isHost) return 'HOST';
    return 'USER';
  }

  private async generateTokens(userId: string, identifier: string, role: Role) {
    const payload: JwtPayload = { sub: userId, email: identifier, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('refreshToken.secret'),
      expiresIn: this.configService.get<string>('refreshToken.expiresIn'),
    });

    return { accessToken, refreshToken };
  }
}
