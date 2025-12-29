import { Controller, Post, Get, Put, Body, Param, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, RegisterDto, LoginDto } from './auth.service';
import { AuthGuard, AdminGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user', description: 'Create a new user account' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        fullName: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'sales'] },
      },
      required: ['email', 'password', 'fullName'],
    },
  })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login', description: 'Authenticate user and get access token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
      required: ['email', 'password'],
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user', description: 'Get the current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: any) {
    return user;
  }

  @Put('profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile', description: 'Update current user profile' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        avatar_url: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser() user: any,
    @Body() updates: { full_name?: string; avatar_url?: string }
  ) {
    return this.authService.updateProfile(user.id, updates);
  }

  // Admin endpoints
  @Get('users')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users', description: 'Admin only: Get all user profiles' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async getAllUsers() {
    return this.authService.getAllUsers();
  }

  @Put('users/:userId/role')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user role', description: 'Admin only: Update a user role' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() body: { role: 'admin' | 'sales' }
  ) {
    return this.authService.updateUserRole(userId, body.role);
  }

  @Put('users/:userId/toggle-active')
  @UseGuards(AuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle user active', description: 'Admin only: Activate or deactivate a user' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  async toggleUserActive(
    @Param('userId') userId: string,
    @Body() body: { is_active: boolean }
  ) {
    return this.authService.toggleUserActive(userId, body.is_active);
  }
}

