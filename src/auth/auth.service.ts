import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface RegisterDto {
  email: string;
  password: string;
  fullName: string;
  role?: 'admin' | 'sales';
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'sales';
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
}

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async register(dto: RegisterDto) {
    const client = this.supabaseService.getClient();

    // Create auth user
    const { data: authData, error: authError } = await client.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
    });

    if (authError) {
      throw new BadRequestException(authError.message);
    }

    // Create user profile
    const { data: profile, error: profileError } = await client
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: dto.email,
        full_name: dto.fullName,
        role: dto.role || 'sales',
      })
      .select()
      .single();

    if (profileError) {
      // Rollback: delete auth user if profile creation fails
      await client.auth.admin.deleteUser(authData.user.id);
      throw new BadRequestException(profileError.message);
    }

    return {
      user: profile,
      message: 'User registered successfully',
    };
  }

  async login(dto: LoginDto) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Get user profile
    const { data: profile, error: profileError } = await client
      .from('user_profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found');
    }

    if (!profile.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return {
      user: profile,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    };
  }

  async verifyToken(token: string): Promise<UserProfile> {
    const client = this.supabaseService.getClient();

    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { data: profile, error: profileError } = await client
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('User profile not found');
    }

    return profile;
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new UnauthorizedException('User not found');
    }

    return data;
  }

  async updateProfile(userId: string, updates: Partial<{ full_name: string; avatar_url: string }>) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('user_profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async getAllUsers(): Promise<UserProfile[]> {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data || [];
  }

  async updateUserRole(userId: string, role: 'admin' | 'sales') {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }

  async toggleUserActive(userId: string, isActive: boolean) {
    const client = this.supabaseService.getClient();

    const { data, error } = await client
      .from('user_profiles')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data;
  }
}

