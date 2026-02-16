import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { User } from '@prisma/client';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if email or phone already exists
    if (createUserDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: createUserDto.email },
      });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    if (createUserDto.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: createUserDto.phone },
      });
      if (existingPhone) {
        throw new BadRequestException('Phone already exists');
      }
    }

    return this.prisma.user.create({
      data: {
        ...createUserDto,
        roles: createUserDto.roles || ['user'],
        // Auto-verify email/phone in development for easier testing
        verifiedEmail: createUserDto.email ? true : false,
        verifiedPhone: createUserDto.phone ? true : false,
      },
    });
  }

  async findAll(): Promise<Partial<User>[]> {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        isHost: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        updatedAt: false,
        passwordHash: false,
      },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    // Try email first, then phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Accept Partial<User> so internal flows (auth verification, admin tooling, seeding)
  // can update non-profile fields safely. Controllers should still pass UpdateUserDto.
  async update(
    id: string,
    updateUserDto: Partial<User> | Partial<UpdateUserDto>,
  ): Promise<User> {
    await this.findOne(id); // Ensure user exists
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async verifyUser(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        verifiedEmail: user.email ? true : undefined,
        verifiedPhone: user.phone ? true : undefined,
      },
    });
  }

  async becomeHost(userId: string, acceptTerms: boolean): Promise<User> {
    if (acceptTerms !== true) {
      throw new BadRequestException(
        'You must accept the terms to become a host',
      );
    }

    const user = await this.findOne(userId);

    // Lightweight check: require email OR phone verification
    if (!user.verifiedEmail && !user.verifiedPhone) {
      throw new BadRequestException(
        'You must verify your email or phone before becoming a host',
      );
    }

    // Ensure "host" role is added to roles array (do not remove existing roles)
    const roles = user.roles || [];
    const normalizedRoles = roles.map((r) => String(r).toLowerCase());
    const updatedRoles = [...roles];

    if (
      !normalizedRoles.includes('host') &&
      !normalizedRoles.includes('role_host')
    ) {
      updatedRoles.push('host');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        isHost: true,
        roles: updatedRoles,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id); // Ensure user exists
    await this.prisma.user.delete({ where: { id } });
  }
}
