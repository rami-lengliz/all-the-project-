import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if email or phone already exists
    if (createUserDto.email) {
      const existingEmail = await this.usersRepository.findOne({
        where: { email: createUserDto.email },
      });
      if (existingEmail) {
        throw new BadRequestException('Email already exists');
      }
    }

    if (createUserDto.phone) {
      const existingPhone = await this.usersRepository.findOne({
        where: { phone: createUserDto.phone },
      });
      if (existingPhone) {
        throw new BadRequestException('Phone already exists');
      }
    }

    const user = this.usersRepository.create({
      ...createUserDto,
      roles: createUserDto.roles || ['user'],
    });
    return this.usersRepository.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      select: [
        'id',
        'name',
        'email',
        'phone',
        'avatarUrl',
        'isHost',
        'ratingAvg',
        'ratingCount',
        'createdAt',
      ],
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: [{ email: identifier }, { phone: identifier }],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: Partial<UpdateUserDto>): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async becomeHost(userId: string, acceptTerms: boolean): Promise<User> {
    if (!acceptTerms) {
      throw new BadRequestException('You must accept the terms to become a host');
    }

    const user = await this.findOne(userId);

    // Lightweight check: require email OR phone verification
    if (!user.verifiedEmail && !user.verifiedPhone) {
      throw new BadRequestException(
        'You must verify your email or phone before becoming a host',
      );
    }

    user.isHost = true;
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }
}
