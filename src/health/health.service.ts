import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  latency?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: ServiceStatus[];
}

@Injectable()
export class HealthService {
  private readonly startTime: Date;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.startTime = new Date();
  }

  async getHealthStatus(): Promise<HealthStatus> {
    const services = await Promise.all([
      this.checkSupabase(),
      this.checkOpenAI(),
    ]);

    const overallStatus = this.determineOverallStatus(services);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      version: process.env.npm_package_version || '1.0.0',
      services,
    };
  }

  async getReadinessStatus(): Promise<{ ready: boolean; message: string }> {
    try {
      const supabaseStatus = await this.checkSupabase();
      const openaiStatus = await this.checkOpenAI();

      const isReady =
        supabaseStatus.status === 'healthy' &&
        openaiStatus.status === 'healthy';

      return {
        ready: isReady,
        message: isReady
          ? 'Application is ready to accept traffic'
          : 'Application is not ready',
      };
    } catch (error) {
      return {
        ready: false,
        message: `Readiness check failed: ${error.message}`,
      };
    }
  }

  getLivenessStatus(): { alive: boolean; uptime: number } {
    return {
      alive: true,
      uptime: this.getUptime(),
    };
  }

  private async checkSupabase(): Promise<ServiceStatus> {
    const startTime = Date.now();
    try {
      const client = this.supabaseService.getClient();
      // Simple query to check connection
      const { error } = await client.from('agent_names').select('id').limit(1);

      const latency = Date.now() - startTime;

      if (error) {
        return {
          name: 'supabase',
          status: 'unhealthy',
          message: error.message,
          latency,
        };
      }

      return {
        name: 'supabase',
        status: 'healthy',
        latency,
      };
    } catch (error) {
      return {
        name: 'supabase',
        status: 'unhealthy',
        message: error.message,
        latency: Date.now() - startTime,
      };
    }
  }

  private async checkOpenAI(): Promise<ServiceStatus> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      return {
        name: 'openai',
        status: 'unhealthy',
        message: 'API key not configured',
      };
    }

    // Just check if API key is configured (actual connection happens at runtime)
    return {
      name: 'openai',
      status: 'healthy',
      message: 'API key configured',
    };
  }

  private determineOverallStatus(
    services: ServiceStatus[],
  ): 'healthy' | 'unhealthy' | 'degraded' {
    const hasUnhealthy = services.some((s) => s.status === 'unhealthy');
    const hasDegraded = services.some((s) => s.status === 'degraded');

    if (hasUnhealthy) return 'unhealthy';
    if (hasDegraded) return 'degraded';
    return 'healthy';
  }

  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}

