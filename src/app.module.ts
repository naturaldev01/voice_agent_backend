import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VoiceModule } from './voice/voice.module';
import { PatientModule } from './patient/patient.module';
import { ConversationModule } from './conversation/conversation.module';
import { SupabaseModule } from './supabase/supabase.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    SupabaseModule,
    HealthModule,
    AuthModule,
    VoiceModule,
    PatientModule,
    ConversationModule,
  ],
})
export class AppModule {}

