import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AUTH_PATH } from '../core/api.constants';
import { AuthManager } from './auth.manager';
import { UserDto } from './dto/user.dto';

/**
 * `/api/v1/auth/…` — versioned, because anything to do with an access token is
 * exactly the kind of payload that changes shape when the scheme does.
 *
 * Sign-in and sign-up are not here: the browser exchanges credentials with
 * Firebase Authentication directly, so no password ever reaches this service and
 * the only question left for it to answer is who a token belongs to.
 *
 * ⚠️ Still reading the mock token: see AuthManager before relying on it.
 */
@ApiTags('Auth')
@Controller(AUTH_PATH)
export class AuthController {
  constructor(private readonly auth: AuthManager) {}

  @Get('me')
  @ApiOperation({ summary: 'The user the access token belongs to' })
  @ApiHeader({ name: 'authorization', example: 'Bearer mock.<user id>' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token.' })
  me(@Headers('authorization') authorization?: string): Promise<UserDto> {
    return this.auth.me(authorization);
  }
}
