import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Natural Clinic Voice Agent API')
    .setDescription(
      `
## Natural Clinic AI Voice Agent Backend API

This API provides endpoints for managing:
- **Health checks** - Monitor application and service health
- **Patients** - Create and manage patient records
- **Conversations** - Track voice conversation history and transcripts

### Authentication
Currently, the API uses Supabase for authentication. WebSocket connections require a valid session.

### WebSocket Events
The voice agent uses Socket.IO for real-time communication:
- \`start_conversation\` - Initialize a new voice conversation
- \`audio_data\` - Stream audio data to the server
- \`end_conversation\` - End the current conversation
- \`update_language\` - Change the conversation language

### Rate Limiting
API endpoints are rate-limited to prevent abuse:
- Default: 100 requests per minute
- Health endpoints: 300 requests per minute
    `,
    )
    .setVersion('1.0.0')
    .setContact(
      'Natural Clinic Tech Team',
      'https://naturalclinic.com',
      'tech@naturalclinic.com',
    )
    .addTag('health', 'Health check endpoints')
    .addTag('patients', 'Patient management endpoints')
    .addTag('conversations', 'Conversation history endpoints')
    .addServer('http://localhost:3001', 'Development server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Natural Clinic API Docs',
    customfavIcon: '/favicon.ico',
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #10b981 }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
    },
  });
}

