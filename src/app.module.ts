import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VoiceModule } from './voice/voice.module';
import { PatientModule } from './patient/patient.module';
import { ConversationModule } from './conversation/conversation.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    VoiceModule,
    PatientModule,
    ConversationModule,
  ],
})
export class AppModule {}

