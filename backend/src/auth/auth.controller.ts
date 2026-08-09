import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AUTH_PATH } from '../core/api.constants';
import { AuthManager } from './auth.manager';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionDto, UserDto } from './dto/session.dto';

/**
 * `/api/v1/auth/…` — versioned, because a credential exchange is exactly the
 * kind of payload that changes shape when the scheme does.
 *
 * ⚠️ Backed by a mock manager: see AuthManager before relying on any of it.
 */
@ApiTags('Auth')
@Controller(AUTH_PATH)
export class AuthController {
  constructor(private readonly auth: AuthManager) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access token' })
  @ApiOkResponse({ type: SessionDto })
  @ApiUnauthorizedResponse({ description: 'Unknown email, or wrong password.' })
  login(@Body() credentials: LoginDto): Promise<SessionDto> {
    return this.auth.login(credentials);
  }

  @Post('register')
  @ApiOperation({ summary: 'Create an account and sign in' })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiConflictResponse({ description: 'That email is already registered.' })
  register(@Body() details: RegisterDto): Promise<SessionDto> {
    return this.auth.register(details);
  }

  @Get('me')
  @ApiOperation({ summary: 'The user the access token belongs to' })
  @ApiHeader({ name: 'authorization', example: 'Bearer mock.<user id>' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  me(@Headers('authorization') authorization?: string): Promise<UserDto> {
    return this.auth.me(authorization);
  }
}
