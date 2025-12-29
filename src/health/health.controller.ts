import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, HealthStatus } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check', description: 'Get overall application health status' })
  @ApiResponse({ status: 200, description: 'Application health status' })
  async healthCheck(): Promise<HealthStatus> {
    return this.healthService.getHealthStatus();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check', description: 'Check if application is ready to accept traffic' })
  @ApiResponse({ status: 200, description: 'Readiness status' })
  async readinessCheck() {
    return this.healthService.getReadinessStatus();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness check', description: 'Check if application is alive' })
  @ApiResponse({ status: 200, description: 'Liveness status' })
  async livenessCheck() {
    return this.healthService.getLivenessStatus();
  }
}

