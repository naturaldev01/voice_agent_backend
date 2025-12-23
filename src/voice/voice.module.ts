import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';
import { VoiceService } from './voice.service';
import { OpenAIRealtimeService } from './openai-realtime.service';

@Module({
  providers: [VoiceGateway, VoiceService, OpenAIRealtimeService],
  exports: [VoiceService],
})
export class VoiceModule {}

