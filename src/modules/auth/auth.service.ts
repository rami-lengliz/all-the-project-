import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException('Either email or phone must be provided');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = await this.usersService.create({
      ...registerDto,
      passwordHash: hashedPassword,
    });

    const tokens = await this.generateTokens(user.id, user.email || user.phone);
    const { passwordHash, ...result } = user;

    return {
      user: result,
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmailOrPhone(loginDto.emailOrPhone);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.email || user.phone);
    const { passwordHash, ...userResult } = user;

    return {
      user: userResult,
      ...tokens,
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('refreshToken.secret'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const accessToken = this.jwtService.sign(
        { sub: user.id, email: user.email || user.phone },
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

    await this.usersService.update(user.id, {
      verifiedEmail: user.verifiedEmail,
      verifiedPhone: user.verifiedPhone,
    });

    return { message: 'Verification successful' };
  }

  private async generateTokens(userId: string, identifier: string) {
    const payload = { sub: userId, email: identifier };

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
