import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { VoiceService, ConversationContext } from './voice.service';

export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

@Injectable()
export class OpenAIRealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(OpenAIRealtimeService.name);
  private readonly OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime';
  private connections: Map<string, WebSocket> = new Map();
  private apiKey: string;

  constructor(
    private configService: ConfigService,
    private voiceService: VoiceService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
  }

  async onModuleDestroy() {
    this.logger.log('Gracefully shutting down OpenAI connections...');
    
    const closePromises: Promise<void>[] = [];
    
    for (const [conversationId, ws] of this.connections) {
      closePromises.push(
        new Promise<void>((resolve) => {
          try {
            this.voiceService.endConversation(conversationId, 'Server shutdown');
            ws.close(1000, 'Server shutdown');
            this.logger.log(`Closed connection for conversation: ${conversationId}`);
          } catch (error) {
            this.logger.error(`Error closing connection ${conversationId}:`, error);
          }
          resolve();
        }),
      );
    }
    
    await Promise.all(closePromises);
    this.connections.clear();
    this.logger.log('All OpenAI connections closed');
  }

  getActiveConnectionCount(): number {
    return this.connections.size;
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
//4o-realtime-preview-2024-12-17
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
              description: `CRITICAL PRIORITY FUNCTION - MUST BE CALLED FIRST: 
              Call this function IMMEDIATELY and BEFORE responding when the patient speaks in a DIFFERENT language than the current session language (${context.language}). 
              This function updates your voice, transcription settings, and system instructions to match the patient's language.
              Examples:
              - If session is 'en' but patient says "Merhaba" → call with 'tr'
              - If session is 'en' but patient says "Bonjour" → call with 'fr'  
              - If session is 'tr' but patient says "Hello" → call with 'en'
              You MUST call this before generating any response in a mismatched language.`,
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

    let hasGreeted = false;
    
    ws.on('message', async (data: WebSocket.Data) => {
      try {
        const event: RealtimeEvent = JSON.parse(data.toString());
        
        // Debug: Log ALL events for debugging
        console.log(`[OpenAI Event] ${event.type}`);
        
        // Debug: Log important events with details
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
        if (event.type === 'response.audio.delta') {
          console.log(`[OpenAI] Audio delta received, length: ${event.delta?.length || 0}`);
        }
        if (event.type === 'input_audio_buffer.speech_started') {
          console.log(`[OpenAI] User started speaking`);
        }
        if (event.type === 'input_audio_buffer.speech_stopped') {
          console.log(`[OpenAI] User stopped speaking`);
        }
        if (event.type === 'conversation.item.input_audio_transcription.failed') {
          console.error(`[OpenAI] Transcription FAILED:`, JSON.stringify(event, null, 2));
        }
        if (event.type === 'response.done') {
          console.log(`[OpenAI] Response done - Full event:`, JSON.stringify(event, null, 2).substring(0, 1500));
        }
        
        // When session is updated successfully, trigger initial greeting (only once)
        if (event.type === 'session.updated' && !hasGreeted) {
          hasGreeted = true;
          console.log(`[OpenAI] Session updated, will trigger greeting in 1s for ${conversationId}`);
          // Wait a moment then trigger the AI to start speaking
          setTimeout(() => {
            if (this.isConnected(conversationId)) {
              console.log(`[OpenAI] Triggering greeting now for ${conversationId}`);
              this.triggerInitialGreeting(conversationId, context);
            } else {
              console.log(`[OpenAI] Cannot trigger greeting - connection closed for ${conversationId}`);
            }
          }, 1000);
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
          const newLanguage = parsedArgs.language;
          const oldLanguage = context.language;
          
          // Only update if language actually changed
          if (newLanguage !== oldLanguage) {
            await this.voiceService.updateConversationLanguage(conversationId, newLanguage);
            // Get updated context with new agent name
            const updatedContext = this.voiceService.getConversation(conversationId);
            if (updatedContext) {
              // Update session with new language settings
              this.updateSessionLanguage(conversationId, updatedContext);
              
              // Log the language switch
              this.logger.log(`Language switched from ${oldLanguage} to ${newLanguage} for conversation ${conversationId}`);
            }
            result = { 
              success: true, 
              message: `Language switched from ${oldLanguage} to ${newLanguage}. You MUST now speak ONLY in ${this.getLanguageName(newLanguage)}. Your new name is ${updatedContext?.agentName}. Acknowledge this change by greeting the patient again in ${this.getLanguageName(newLanguage)}.`,
              newAgentName: updatedContext?.agentName || context.agentName,
              newLanguage: newLanguage,
            };
          } else {
            result = { 
              success: true, 
              message: `Language is already set to ${newLanguage}. Continue in ${this.getLanguageName(newLanguage)}.`,
            };
          }
          console.log(`Language detected: ${newLanguage} (was: ${oldLanguage})`);
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

  // Trigger AI to greet the patient when call connects
  triggerInitialGreeting(conversationId: string, context: ConversationContext): void {
    console.log(`Triggering initial greeting for ${conversationId} in ${context.language}`);
    
    // Get greeting instruction
    const greetingInstruction = this.getGreetingPrompt(context.language, context.agentName);
    
    // Trigger a response with specific instructions to greet
    this.sendEvent(conversationId, {
      type: 'response.create',
      response: {
        modalities: ['text', 'audio'],
        instructions: greetingInstruction,
      },
    });
  }

  // Get greeting prompt based on language
  private getGreetingPrompt(language: string, agentName: string): string {
    const prompts: Record<string, string> = {
      'tr': `Hastayı selamla. Kendini ${agentName} olarak tanıt ve Natural Clinic'ten aradığını söyle. Kısa ve samimi ol.`,
      'en': `Greet the patient. Introduce yourself as ${agentName} from Natural Clinic. Be brief and friendly.`,
      'de': `Begrüßen Sie den Patienten. Stellen Sie sich als ${agentName} von Natural Clinic vor. Kurz und freundlich.`,
      'ar': `رحب بالمريض. قدم نفسك باسم ${agentName} من Natural Clinic. كن موجزاً وودوداً.`,
      'fr': `Saluez le patient. Présentez-vous comme ${agentName} de Natural Clinic. Soyez bref et amical.`,
      'ru': `Поприветствуйте пациента. Представьтесь как ${agentName} из Natural Clinic. Будьте кратки и дружелюбны.`,
    };
    
    return prompts[language] || prompts['en'];
  }

  // Get full language name from code
  private getLanguageName(code: string): string {
    const names: Record<string, string> = {
      'tr': 'Turkish',
      'en': 'English',
      'de': 'German',
      'ar': 'Arabic',
      'fr': 'French',
      'ru': 'Russian',
    };
    return names[code] || 'English';
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

