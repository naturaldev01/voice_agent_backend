import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { VoiceService, ConversationContext } from './voice.service';

export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

@Injectable()
export class OpenAIRealtimeService {
  private readonly OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
  private connections: Map<string, WebSocket> = new Map();
  private apiKey: string;

  constructor(
    private configService: ConfigService,
    private voiceService: VoiceService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  // Map language codes to Whisper language codes (ISO 639-1 codes)
  private getWhisperLanguage(language: string): string {
    // OpenAI Realtime API uses ISO 639-1 codes, not full language names
    const languageMap: Record<string, string> = {
      'tr': 'tr',
      'en': 'en',
      'de': 'de',
      'ar': 'ar',
      'fr': 'fr',
      'ru': 'ru',
    };
    return languageMap[language] || 'en';
  }

  // Select appropriate voice based on gender
  // OpenAI Realtime voices: alloy (neutral), echo (male), fable (male), onyx (male deep), nova (female), shimmer (female warm)
  private getVoiceForGender(gender: 'male' | 'female'): string {
    if (gender === 'male') {
      // echo is a clear male voice, good for professional conversations
      return 'echo';
    } else {
      // shimmer is a warm female voice, good for friendly conversations
      return 'shimmer';
    }
  }

  async createSession(
    conversationId: string,
    context: ConversationContext,
    onEvent: (event: RealtimeEvent) => void,
  ): Promise<WebSocket> {
    const url = `${this.OPENAI_REALTIME_URL}?model=gpt-4o-realtime-preview-2024-12-17`;
    
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    this.connections.set(conversationId, ws);

    ws.on('open', () => {
      console.log(`OpenAI Realtime session opened for conversation: ${conversationId}`);
      
      const whisperLanguage = this.getWhisperLanguage(context.language);
      const voice = this.getVoiceForGender(context.agentGender);
      
      const systemPrompt = this.voiceService.getSystemPrompt(context);
      console.log(`Session config - Language: ${context.language}, Whisper: ${whisperLanguage}, Voice: ${voice}, Agent: ${context.agentName} (${context.agentGender})`);
      console.log(`System prompt length: ${systemPrompt.length} chars`);
      console.log(`System prompt preview: ${systemPrompt.substring(0, 200)}...`);
      
      // Configure the session
      this.sendEvent(conversationId, {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: systemPrompt,
          voice: voice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
            language: whisperLanguage,
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 700,
          },
          tools: [
            {
              type: 'function',
              name: 'update_patient_info',
              description: 'Update patient information when they provide details like name, phone, email, etc.',
              parameters: {
                type: 'object',
                properties: {
                  fullName: { type: 'string', description: 'Patient full name' },
                  phone: { type: 'string', description: 'Patient phone number' },
                  email: { type: 'string', description: 'Patient email address' },
                  country: { type: 'string', description: 'Patient country' },
                  city: { type: 'string', description: 'Patient city' },
                  age: { type: 'number', description: 'Patient age' },
                  gender: { type: 'string', description: 'Patient gender' },
                  interestedTreatments: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Treatments patient is interested in' 
                  },
                  notes: { type: 'string', description: 'Additional notes about the patient' },
                },
              },
            },
            {
              type: 'function',
              name: 'detect_language',
              description: 'IMPORTANT: Call this function IMMEDIATELY when you detect that the patient is speaking in a different language than the current session language. This updates the transcription and voice settings for better accuracy.',
              parameters: {
                type: 'object',
                properties: {
                  language: { 
                    type: 'string', 
                    enum: ['tr', 'en', 'de', 'ar', 'fr', 'ru'],
                    description: 'The language code detected from patient speech: tr=Turkish, en=English, de=German, ar=Arabic, fr=French, ru=Russian' 
                  },
                },
                required: ['language'],
              },
            },
          ],
          tool_choice: 'auto',
        },
      });
    });

    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const event: RealtimeEvent = JSON.parse(data.toString());
        
        // Debug: Log important events
        if (event.type === 'session.created' || event.type === 'session.updated') {
          console.log(`[OpenAI] ${event.type}:`, JSON.stringify(event, null, 2).substring(0, 500));
        }
        if (event.type === 'error') {
          console.error(`[OpenAI Error]:`, JSON.stringify(event, null, 2));
        }
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          console.log(`[User said]: ${event.transcript}`);
        }
        if (event.type === 'response.audio_transcript.done') {
          console.log(`[AI said]: ${event.transcript}`);
        }
        
        // Handle tool calls
        if (event.type === 'response.function_call_arguments.done') {
          await this.handleFunctionCall(conversationId, event);
        }
        
        // Handle transcriptions for memory
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          await this.voiceService.addMessage(conversationId, 'user', event.transcript);
        }
        
        if (event.type === 'response.audio_transcript.done') {
          await this.voiceService.addMessage(conversationId, 'assistant', event.transcript);
        }
        
        // Forward event to client
        onEvent(event);
      } catch (error) {
        console.error('Error parsing OpenAI event:', error);
      }
    });

    ws.on('error', (error) => {
      console.error(`OpenAI WebSocket error for ${conversationId}:`, error);
      onEvent({ type: 'error', error: error.message });
    });

    ws.on('close', () => {
      console.log(`OpenAI Realtime session closed for conversation: ${conversationId}`);
      this.connections.delete(conversationId);
      onEvent({ type: 'session.closed' });
    });

    return ws;
  }

  private async handleFunctionCall(conversationId: string, event: RealtimeEvent): Promise<void> {
    const { name, arguments: args, call_id } = event;
    const context = this.voiceService.getConversation(conversationId);
    
    if (!context) return;

    let result: any = { success: true };

    try {
      const parsedArgs = JSON.parse(args);

      switch (name) {
        case 'update_patient_info':
          await this.voiceService.updatePatientInfo(conversationId, parsedArgs);
          result = { success: true, message: 'Patient information updated' };
          break;
          
        case 'detect_language':
          await this.voiceService.updateConversationLanguage(conversationId, parsedArgs.language);
          // Get updated context with new agent name
          const updatedContext = this.voiceService.getConversation(conversationId);
          if (updatedContext) {
            // Update session with new language settings
            this.updateSessionLanguage(conversationId, updatedContext);
          }
          result = { 
            success: true, 
            message: `Language updated to ${parsedArgs.language}. Please continue the conversation in ${parsedArgs.language}.`,
            newAgentName: updatedContext?.agentName || context.agentName,
          };
          console.log(`Language detected and updated to: ${parsedArgs.language}`);
          break;
          
        default:
          result = { success: false, error: 'Unknown function' };
      }
    } catch (error) {
      console.error('Error handling function call:', error);
      result = { success: false, error: error.message };
    }

    // Send function result back to OpenAI
    this.sendEvent(conversationId, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: JSON.stringify(result),
      },
    });

    // Continue the conversation
    this.sendEvent(conversationId, {
      type: 'response.create',
    });
  }

  sendEvent(conversationId: string, event: RealtimeEvent): void {
    const ws = this.connections.get(conversationId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (event.type === 'session.update') {
        console.log(`[Sending] session.update to OpenAI`);
      }
      ws.send(JSON.stringify(event));
    } else {
      console.error(`[Error] WebSocket not ready for ${conversationId}, state: ${ws?.readyState}`);
    }
  }

  sendAudio(conversationId: string, audioData: string): void {
    this.sendEvent(conversationId, {
      type: 'input_audio_buffer.append',
      audio: audioData,
    });
  }

  commitAudio(conversationId: string): void {
    this.sendEvent(conversationId, {
      type: 'input_audio_buffer.commit',
    });
  }

  cancelResponse(conversationId: string): void {
    this.sendEvent(conversationId, {
      type: 'response.cancel',
    });
  }

  updateSessionLanguage(conversationId: string, context: ConversationContext): void {
    const whisperLanguage = this.getWhisperLanguage(context.language);
    const voice = this.getVoiceForGender(context.agentGender);
    
    console.log(`Updating session - Language: ${context.language}, Whisper: ${whisperLanguage}, Voice: ${voice}, Agent: ${context.agentName} (${context.agentGender})`);
    
    this.sendEvent(conversationId, {
      type: 'session.update',
      session: {
        instructions: this.voiceService.getSystemPrompt(context),
        voice: voice,
        input_audio_transcription: {
          model: 'whisper-1',
          language: whisperLanguage,
        },
      },
    });
  }

  closeSession(conversationId: string): void {
    const ws = this.connections.get(conversationId);
    if (ws) {
      ws.close();
      this.connections.delete(conversationId);
    }
  }

  isConnected(conversationId: string): boolean {
    const ws = this.connections.get(conversationId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}

