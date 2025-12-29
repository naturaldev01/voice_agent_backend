import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT?: number = 3001;

  @IsString()
  @IsNotEmpty()
  SUPABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_ANON_KEY: string;

  @IsString()
  @IsOptional()
  SUPABASE_SERVICE_ROLE_KEY?: string;

  @IsString()
  @IsNotEmpty()
  OPENAI_API_KEY: string;

  @IsString()
  @IsOptional()
  NODE_ENV?: string = 'development';

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string = 'info';
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = Object.values(error.constraints || {}).join(', ');
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(
      `\n❌ Environment validation failed:\n${errorMessages}\n\n` +
        `Please check your .env file and ensure all required variables are set.\n` +
        `Refer to .env.example for the required configuration.\n`,
    );
  }

  console.log('✅ Environment variables validated successfully');
  return validatedConfig;
}

