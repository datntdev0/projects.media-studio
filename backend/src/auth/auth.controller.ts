import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { AUTH_PATH } from '../core/api.constants';
import { AuthManager } from './auth.manager';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserDto } from './dto/user.dto';
import { FirebaseAuthGuard } from './firebase-auth.guard';

/**
 * `/api/v1/auth/…` — versioned, because anything to do with an access token is
 * exactly the kind of payload that changes shape when the scheme does.
 *
 * There is no sign-in here: the browser exchanges credentials with Firebase
 * Authentication directly, so no password reaches this service and every route
 * below is behind a verified ID token.
 */
@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller(AUTH_PATH)
export class AuthController {
  constructor(private readonly auth: AuthManager) {}

  @Get('me')
  @ApiOperation({ summary: 'The account the ID token belongs to' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  me(@CurrentUser() token: DecodedIdToken): Promise<UserDto> {
    return this.auth.me(token.uid);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Change the signed-in account's password" })
  @ApiNoContentResponse({ description: 'Changed. Firebase revokes the account\'s refresh tokens, so a client should sign in again rather than trust the session it holds.' })
  @ApiBadRequestResponse({ description: 'The new password is unusable, or the same as the current one.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token, or the wrong current password.' })
  changePassword(@CurrentUser() token: DecodedIdToken, @Body() passwords: ChangePasswordDto): Promise<void> {
    return this.auth.changePassword(token.uid, token.email, passwords);
  }
}
