import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setupSwagger } from './config/swagger.config';
import { ThrottleGuard } from './common/guards/throttle.guard';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3001;
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
  
  // Enable CORS for frontend
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3007',
      'http://localhost:3008',
      // Production URLs
      'https://voice-agent-frontend-w97n.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  
  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable rate limiting
  app.useGlobalGuards(new ThrottleGuard(app.get('Reflector')));

  // Setup Swagger documentation
  if (nodeEnv !== 'production') {
    setupSwagger(app);
    logger.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  }

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  
  logger.log(`🚀 Voice Agent Backend running on port ${port}`);
  logger.log(`📍 Environment: ${nodeEnv}`);
  logger.log(`❤️  Health check: http://localhost:${port}/health`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

