import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { BecomeHostDto } from './dto/become-host.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Post('me/become-host')
  @ApiOperation({ summary: 'Become a host' })
  becomeHost(@Request() req, @Body() becomeHostDto: BecomeHostDto) {
    return this.usersService.becomeHost(req.user.id, becomeHostDto.acceptTerms);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user public profile' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
