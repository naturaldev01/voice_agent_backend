import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { VoiceService } from './voice.service';
import { OpenAIRealtimeService, RealtimeEvent } from './openai-realtime.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3007', 'http://localhost:3008'],
    credentials: true,
  },
  namespace: '/voice',
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clientConversations: Map<string, string> = new Map();

  constructor(
    private voiceService: VoiceService,
    private openaiRealtimeService: OpenAIRealtimeService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId) {
      await this.voiceService.endConversation(conversationId);
      this.openaiRealtimeService.closeSession(conversationId);
      this.clientConversations.delete(client.id);
    }
  }

  @SubscribeMessage('start_conversation')
  async handleStartConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { language?: string },
  ) {
    try {
      const language = data.language || 'en';
      const context = await this.voiceService.initializeConversation(language);
      
      this.clientConversations.set(client.id, context.conversationId);
      
      // Create OpenAI Realtime session
      await this.openaiRealtimeService.createSession(
        context.conversationId,
        context,
        (event: RealtimeEvent) => {
          // Forward OpenAI events to client
          this.forwardEventToClient(client, event);
        },
      );
      
      client.emit('conversation_started', {
        conversationId: context.conversationId,
        agentName: context.agentName,
        language: context.language,
      });
      
      // Trigger initial greeting
      setTimeout(() => {
        this.openaiRealtimeService.sendEvent(context.conversationId, {
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
          },
        });
      }, 500);
      
    } catch (error) {
      console.error('Error starting conversation:', error);
      client.emit('error', { message: 'Failed to start conversation' });
    }
  }

  @SubscribeMessage('audio_data')
  handleAudioData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { audio: string },
  ) {
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId && this.openaiRealtimeService.isConnected(conversationId)) {
      this.openaiRealtimeService.sendAudio(conversationId, data.audio);
    }
  }

  @SubscribeMessage('audio_commit')
  handleAudioCommit(@ConnectedSocket() client: Socket) {
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId) {
      this.openaiRealtimeService.commitAudio(conversationId);
    }
  }

  @SubscribeMessage('interrupt')
  handleInterrupt(@ConnectedSocket() client: Socket) {
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId) {
      this.openaiRealtimeService.cancelResponse(conversationId);
    }
  }

  @SubscribeMessage('end_conversation')
  async handleEndConversation(@ConnectedSocket() client: Socket) {
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId) {
      await this.voiceService.endConversation(conversationId);
      this.openaiRealtimeService.closeSession(conversationId);
      this.clientConversations.delete(client.id);
      
      client.emit('conversation_ended', { conversationId });
    }
  }

  @SubscribeMessage('update_language')
  async handleUpdateLanguage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { language: string },
  ) {
    const conversationId = this.clientConversations.get(client.id);
    if (conversationId) {
      await this.voiceService.updateConversationLanguage(conversationId, data.language);
      const context = this.voiceService.getConversation(conversationId);
      
      if (context) {
        // Update OpenAI session with new language settings
        this.openaiRealtimeService.updateSessionLanguage(conversationId, context);
        
        client.emit('language_updated', {
          language: data.language,
          agentName: context.agentName,
        });
      }
    }
  }

  private forwardEventToClient(client: Socket, event: RealtimeEvent) {
    // Map OpenAI events to client events
    switch (event.type) {
      case 'response.audio.delta':
        client.emit('audio_delta', { audio: event.delta });
        break;
        
      case 'response.audio.done':
        client.emit('audio_done');
        break;
        
      case 'response.audio_transcript.delta':
        client.emit('transcript_delta', { 
          role: 'assistant',
          delta: event.delta 
        });
        break;
        
      case 'response.audio_transcript.done':
        client.emit('transcript_done', { 
          role: 'assistant',
          transcript: event.transcript 
        });
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        client.emit('user_transcript', { 
          role: 'user',
          transcript: event.transcript 
        });
        break;
        
      case 'input_audio_buffer.speech_started':
        client.emit('speech_started');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        client.emit('speech_stopped');
        break;
        
      case 'response.done':
        client.emit('response_done', event.response);
        break;
        
      case 'error':
        client.emit('error', { message: event.error?.message || 'Unknown error' });
        break;
        
      case 'session.closed':
        client.emit('session_closed');
        break;
        
      case 'rate_limits.updated':
        // Optionally forward rate limit info
        break;
        
      default:
        // Forward other events as-is for debugging
        if (process.env.NODE_ENV === 'development') {
          client.emit('debug_event', event);
        }
    }
  }
}

